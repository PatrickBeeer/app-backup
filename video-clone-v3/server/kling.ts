// Kling provider (multi-elements / image-to-video / lip-sync / media proxy).
// 直接使用原生 fetch 调用可灵 API；不再走本地网络桥接 / PowerShell / curl.exe。
// 多元素替换流程（init-selection → add-selection → create）从 vite.config.ts 移植而来。

import { randomUUID } from 'node:crypto';

import type { KlingAssetTunnel } from './klingAssetTunnel';

type KlingHttpResult = { ok: boolean; status: number; text: string };

export class KlingApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: any,
  ) {
    super(message);
    this.name = 'KlingApiRequestError';
  }
}

function parseKlingPayload(upstream: KlingHttpResult): any {
  try {
    return upstream.text ? JSON.parse(upstream.text) : {};
  } catch {
    return { message: upstream.text };
  }
}

async function requestKling(
  url: string,
  method: 'GET' | 'POST',
  bearerToken: string,
  body?: string,
): Promise<KlingHttpResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body,
      signal: controller.signal,
    });
    return { ok: response.ok, status: response.status, text: await response.text() };
  } catch (error) {
    const cause = error instanceof Error
      ? (error as Error & { cause?: { code?: string; message?: string } }).cause
      : undefined;
    const detail = cause?.code || cause?.message || (error instanceof Error ? error.message : 'unknown');
    throw new Error(detail, { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

async function requestKlingJson(
  url: string,
  method: 'GET' | 'POST',
  bearerToken: string,
  body: Record<string, unknown> | undefined,
  stageLabel: string,
): Promise<{ upstream: KlingHttpResult; payload: any }> {
  const upstream = await requestKling(url, method, bearerToken, body ? JSON.stringify(body) : undefined);
  const payload = parseKlingPayload(upstream);
  if (!upstream.ok || (typeof payload?.code !== 'undefined' && Number(payload.code) !== 0)) {
    throw new KlingApiRequestError(
      `${stageLabel}失败：${String(payload?.message || payload?.task_status_msg || `HTTP ${upstream.status}`)}`,
      upstream.status || 502,
      payload,
    );
  }
  return { upstream, payload };
}

function writeKlingDiagnostic(event: Record<string, unknown>): void {
  // 用 console.log 取代 .logs/kling-network.jsonl，避免磁盘 IO 与权限问题。
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...event }));
}

function getInlineData(payload: any): string | null {
  const parts = payload?.contents?.parts || [];
  const imagePart = parts.find((part: any) => part?.inlineData?.data);
  if (!imagePart?.inlineData?.data) return null;
  const mimeType = imagePart.inlineData.mimeType || 'image/jpeg';
  return `data:${mimeType};base64,${imagePart.inlineData.data}`;
}

export type KlingGenerateResult = { status: number; payload: any };

/**
 * 处理 POST /api/gemini/generate 且 provider='kling' 的请求。
 * 包含三个分支：taskId 查询（3 个端点回退）、multi-elements 替换、image-to-video 直出。
 * 返回 { status, payload }，由 server.ts 直接转发给前端。
 */
export async function createKlingTask(input: {
  bearerToken: string;
  baseUrl: string;
  assetTunnel: KlingAssetTunnel;
  body: any;
}): Promise<KlingGenerateResult> {
  const { bearerToken, baseUrl, assetTunnel, body } = input;
  const taskId = body?.config?.taskId;
  let referenceVideo = String(body?.config?.referenceVideo || '');
  const inlineReferenceVideo = referenceVideo.startsWith('data:') ? referenceVideo : '';
  let image = getInlineData(body);
  const prompt = body.contents?.parts?.find((part: any) => typeof part?.text === 'string')?.text || '';

  // 1) taskId 查询分支：3 个端点回退
  if (taskId) {
    const encodedTaskId = encodeURIComponent(String(taskId));
    const queryEndpoints = [
      `${baseUrl}/v1/videos/multi-elements/${encodedTaskId}`,
      `${baseUrl}/v1/videos/motion-control/${encodedTaskId}`,
      `${baseUrl}/tasks?task_ids=${encodedTaskId}`,
    ];
    let lastResult: { upstream: KlingHttpResult; payload: any } | null = null;
    for (const queryEndpoint of queryEndpoints) {
      try {
        const upstream = await requestKling(queryEndpoint, 'GET', bearerToken);
        let payload: any;
        try {
          payload = upstream.text ? JSON.parse(upstream.text) : {};
        } catch {
          payload = { message: upstream.text };
        }
        lastResult = { upstream, payload };
        const task = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;
        const status = task?.task_status || task?.status;
        const taskResultVideo = task?.task_result?.videos?.[0];
        const outputVideo = task?.outputs?.find?.((item: any) => item?.type === 'video');
        if (upstream.ok && Number(payload?.code ?? 0) === 0 && (task?.task_id || task?.id || status)) {
          return {
            status: 200,
            payload: {
              taskId: task?.task_id || task?.id || taskId,
              status: status || 'unknown',
              videoUrl: taskResultVideo?.url || outputVideo?.url || null,
              data: task,
            },
          };
        }
      } catch {
        // Try the other Kling task-query protocol.
      }
    }
    if (lastResult?.upstream.ok && Number(lastResult.payload?.code ?? 0) === 0) {
      return {
        status: 404,
        payload: {
          code: 'TASK_NOT_EXIST',
          message: 'TASK_NOT_EXIST: 可灵未找到该任务，请核对任务ID或稍后重试。',
          taskId,
        },
      };
    }
    return {
      status: lastResult?.upstream.status || 502,
      payload: lastResult?.payload || { message: '可灵任务查询失败' },
    };
  }

  // 2) 创建分支
  const endpoint = referenceVideo
    ? `${baseUrl}/v1/videos/multi-elements`
    : `${baseUrl}/image-to-video/kling-3.0`;
  const diagnosticId = randomUUID().slice(0, 8);

  if (referenceVideo.startsWith('data:')) {
    writeKlingDiagnostic({ diagnosticId, stage: 'publishing-reference-video' });
    referenceVideo = await assetTunnel.publishDataUrl(referenceVideo);
    writeKlingDiagnostic({ diagnosticId, stage: 'reference-video-published', videoUrl: referenceVideo });
  }
  if (!referenceVideo && image?.startsWith('data:')) {
    image = await assetTunnel.publishDataUrl(image);
  }

  const replacementMode = body?.config?.replacementMode === 'product' ? 'product' : 'face';
  let upstream: KlingHttpResult;
  try {
    let requestBody: string;
    if (referenceVideo) {
      if (!image) {
        throw new KlingApiRequestError('请先上传包含完整人脸与发型的目标图片。', 400, {});
      }
      const imageBase64 = image.replace(/^data:[^;]+;base64,/i, '');
      if (!imageBase64 || imageBase64 === image) {
        throw new KlingApiRequestError('目标人脸与发型图片格式无效。', 400, {});
      }
      if (replacementMode === 'product' && !body?.config?.referenceVideoProductSelection) {
        throw new KlingApiRequestError('请先在参考视频中定位需要替换的原产品。', 400, {});
      }

      writeKlingDiagnostic({ diagnosticId, stage: 'initializing-video', mode: `multi-elements-${replacementMode}-swap` });
      let initialized: Awaited<ReturnType<typeof requestKlingJson>> | null = null;
      let initializeError: unknown = null;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const initializationVideoUrl = new URL(referenceVideo);
          initializationVideoUrl.searchParams.set('kling_fetch', `${Date.now()}-${attempt}`);
          initialized = await requestKlingJson(
            `${baseUrl}/v1/videos/multi-elements/init-selection`,
            'POST',
            bearerToken,
            { video_url: initializationVideoUrl.toString() },
            '初始化参考视频',
          );
          break;
        } catch (error) {
          initializeError = error;
          writeKlingDiagnostic({
            diagnosticId,
            stage: 'video-initialize-retry',
            attempt,
            detail: error instanceof Error ? error.message : 'unknown',
          });
          if (attempt < 3) {
            if (inlineReferenceVideo) {
              try {
                referenceVideo = await assetTunnel.publishDataUrl(inlineReferenceVideo);
                writeKlingDiagnostic({ diagnosticId, stage: 'reference-video-republished', attempt, videoUrl: referenceVideo });
              } catch {
                // Keep the existing public URL and retry with a cache-busting query.
              }
            }
            await new Promise((resolve) => setTimeout(resolve, attempt * 3_000));
          }
        }
      }
      if (!initialized) throw initializeError;
      const initializedData = initialized.payload?.data;
      if (!initializedData?.session_id || Number(initializedData?.status ?? 0) !== 0) {
        throw new KlingApiRequestError(
          `初始化参考视频失败：${String(initialized.payload?.message || '可灵未返回有效会话')}`,
          502,
          initialized.payload,
        );
      }
      writeKlingDiagnostic({ diagnosticId, stage: 'video-initialized' });

      const configuredSelection = replacementMode === 'product'
        ? body?.config?.referenceVideoProductSelection || {}
        : body?.config?.referenceVideoFaceSelection || {};
      const configuredHeadPoints = replacementMode === 'face' && Array.isArray(body?.config?.referenceVideoHeadSelectionPoints)
        ? body.config.referenceVideoHeadSelectionPoints.slice(0, 40)
        : [];
      const clampPoint = (value: unknown, fallback: number) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? Math.min(1, Math.max(0, numeric)) : fallback;
      };
      const fps = Number(initializedData?.fps) || 30;
      const totalFrame = Math.max(1, Number(initializedData?.total_frame) || 1);
      const requestedDuration = Math.min(15, Math.max(5, Math.round(Number(body.config?.durationSeconds) || 5))) - 0.3;
      const pointsByFrame = new Map<number, Array<{ x: number; y: number }>>();
      const productAnchorPoints = replacementMode === 'product'
        ? [
            configuredSelection,
            { ...configuredSelection, x: clampPoint(Number(configuredSelection?.x) - 0.012, 0.488) },
            { ...configuredSelection, x: clampPoint(Number(configuredSelection?.x) + 0.012, 0.512) },
            { ...configuredSelection, y: clampPoint(Number(configuredSelection?.y) - 0.012, 0.638) },
            { ...configuredSelection, y: clampPoint(Number(configuredSelection?.y) + 0.012, 0.662) },
          ]
        : [];
      const allSelectionPoints = replacementMode === 'product'
        ? productAnchorPoints
        : configuredHeadPoints.length
          ? configuredHeadPoints
          : [configuredSelection];
      const inRangeSelectionPoints = allSelectionPoints.filter((point: any) => (Number(point?.timeSec) || 0) <= requestedDuration);
      for (const point of (inRangeSelectionPoints.length ? inRangeSelectionPoints : [allSelectionPoints[0]])) {
        const timeSec = Math.max(0, Number(point?.timeSec) || 0);
        const frameIndex = Math.min(totalFrame - 1, Math.round(timeSec * fps));
        const framePoints = pointsByFrame.get(frameIndex) || [];
        if (framePoints.length < 10) {
          framePoints.push({
            x: clampPoint(point?.x, 0.5),
            y: clampPoint(point?.y, replacementMode === 'product' ? 0.65 : 0.32),
          });
        }
        pointsByFrame.set(frameIndex, framePoints);
      }

      let selectedFrameCount = 0;
      let lastSelectionError: unknown = null;
      for (const [frameIndex, headPoints] of [...pointsByFrame.entries()].sort((a, b) => a[0] - b[0]).slice(0, 10)) {
        try {
          const selected = await requestKlingJson(
            `${baseUrl}/v1/videos/multi-elements/add-selection`,
            'POST',
            bearerToken,
            {
              session_id: initializedData.session_id,
              frame_index: frameIndex,
              points: headPoints,
            },
            replacementMode === 'product' ? '定位参考视频产品' : '定位参考视频人脸',
          );
          if (Number(selected.payload?.data?.status ?? 0) !== 0) {
            throw new KlingApiRequestError(
              `定位参考视频${replacementMode === 'product' ? '产品' : '人脸'}失败：${String(selected.payload?.message || `可灵未识别${replacementMode === 'product' ? '产品' : '人脸'}区域`)}`,
              422,
              selected.payload,
            );
          }
          selectedFrameCount += 1;
          writeKlingDiagnostic({
            diagnosticId,
            stage: `${replacementMode}-frame-selected`,
            frameIndex,
            pointCount: headPoints.length,
          });
        } catch (error) {
          lastSelectionError = error;
          writeKlingDiagnostic({
            diagnosticId,
            stage: 'head-frame-skipped',
            frameIndex,
            detail: error instanceof Error ? error.message : 'unknown',
          });
        }
      }
      if (selectedFrameCount === 0) {
        throw lastSelectionError || new KlingApiRequestError(`定位参考视频${replacementMode === 'product' ? '产品' : '人脸'}失败：没有可用的关键帧`, 422, {});
      }
      writeKlingDiagnostic({ diagnosticId, stage: `${replacementMode}-tracking-complete`, selectedFrameCount });

      const duration = String(Math.min(15, Math.max(5, Math.round(Number(body.config?.durationSeconds) || 5))));
      const resolution = body.config?.resolution === '720p' ? '720p' : '1080p';
      const isProductReplacement = replacementMode === 'product';
      const productCreative = isProductReplacement && Boolean(body.config?.productCreative);
      const creativeCorePrompt = '以<<<video_1>>>作为爆款叙事母版，以<<<image_1>>>中的目标产品作为唯一主角。先识别产品类别、用途、结构、材质、卖点、适用人群与合理场景，所有动作和环境必须符合真实用途。复用参考视频的开场钩子、镜头职能顺序、动作因果、产品揭示节点、展示节拍、卖点特写、转场、情绪递进和收尾回报；每个新镜头承担相同传播职能，但具体内容应适配目标产品。场景、天气、服装、美术和色彩允许创新。产品必须作为同一个刚性实体逐帧锁定，轮廓、长宽高比例、结构、部件数量、材质、颜色、包装、Logo、标签布局和文字与<<<image_1>>>完全一致；禁止拉伸、压缩、弯曲、融化、膨胀、缩小、拆分、合并、增减部件或重新设计。人物、手部、握持、遮挡、反射、阴影与运动模糊必须真实。保留原声音，不生成字幕、水印或额外品牌。';
      const replacementPrompt = '这是严格的真人实拍产品替换。使用<<<image_1>>>中的目标产品替换<<<video_1>>>中已选中的原产品。目标产品图是产品外观的唯一标准，产品必须作为同一个刚性实体逐帧锁定：轮廓、长宽高比例、结构、部件数量、材质、颜色、包装结构、Logo、标签布局和可见文字完全一致，严禁拉伸、压缩、弯曲、融化、膨胀、缩小、拆分、合并、增减部件或重新设计。沿用原产品的位置、大小、朝向、手持方式、运动轨迹、透视、光照、反射、阴影、景深和运动模糊。手和手指不得重绘或变形，保持原有握持关系与前后遮挡。除选中的产品区域外，其余像素全部锁定，保持人物、身体、服装、背景、镜头运动、剪辑和声音不变。';
      const faceReplacementPrompt = '这是严格的真人摄影头部替换，不是重新创造、磨皮或美化人物。使用<<<image_1>>>中的完整人物头部（人脸、发际线和完整发型），替换<<<video_1>>>中已选中的人物头部。目标人物图是人物身份、骨相、五官比例、真实皮肤纹理和发型的唯一标准，不能保留原人物身份。逐帧保留人物毛孔、细纹、轻微瑕疵、不对称性、面部绒毛和真实发丝；保持自然牙齿结构、口腔深度和唇纹。视频中的产品、包装、商标、标签和文字保持原样。除选中的头部区域外，其余原视频像素全部锁定。';
      const analysisSuffix = String(prompt || '').trim();
      const fullTaskPrompt = isProductReplacement
        ? productCreative
          ? `${creativeCorePrompt} 产品与爆款逻辑分析：${analysisSuffix}`
          : replacementPrompt
        : faceReplacementPrompt;
      // Kling's prompt field has a strict 2500-character ceiling. Keep a
      // safety margin and preserve the high-priority constraints at the front.
      const boundedTaskPrompt = Array.from(fullTaskPrompt).slice(0, 2400).join('');
      const createBody = {
        model_name: 'kling-v1-6',
        session_id: initializedData.session_id,
        edit_mode: 'swap',
        image_list: [{ image: imageBase64 }],
        prompt: boundedTaskPrompt,
        negative_prompt: isProductReplacement
          ? productCreative
            ? 'lost opening hook, reordered story beats, missing product reveal, missing demonstration beat, broken action causality, product misuse, scene unrelated to product purpose, random unrelated shot, weak payoff, wrong product, source product retained, mixed products, stretched product, squashed product, bent rigid product, melted product, inflated product, shrinking product, changing proportions, changing component count, redesigned package, unstable logo, unreadable label, product morphing, product identity drift, floating product, impossible grip, product-hand intersection, deformed hands, extra fingers, missing fingers, fused fingers, broken anatomy, AI look, CGI, flicker, abrupt transition, copied captions, watermark'
            : 'wrong target product, source product retained, mixed products, changed target product geometry, wrong package, wrong label, wrong logo, unreadable product text, floating product, deformed grip, product-hand intersection, product flicker, product melting, altered hands, altered fingers, extra fingers, missing fingers, fused fingers, changed face, changed identity, changed hairstyle, face flicker, wrong foreground-background occlusion, changed background, changed camera movement'
          : 'blurry face, low-resolution face, AI-generated look, CGI, doll face, waxy skin, beauty filter, skin smoothing, face flicker, identity drift, morphing, warping, wig-like hair, plastic hair, blurry hairline, hair flicker, changed held object, changed product, changed package, changed label, changed logo, changed product text, altered hands, altered fingers, wrong foreground-background occlusion, changed background, changed camera movement',
        mode: resolution === '720p' ? 'std' : 'pro',
        duration,
        watermark_info: { enabled: false },
      };
      requestBody = JSON.stringify(createBody);
      const created = await requestKlingJson(
        endpoint,
        'POST',
        bearerToken,
        createBody,
        isProductReplacement ? '创建产品替换任务' : '创建人脸替换任务',
      );
      upstream = created.upstream;
      writeKlingDiagnostic({
        diagnosticId,
        stage: 'task-created',
        taskId: created.payload?.data?.task_id || null,
        status: created.payload?.data?.task_status || null,
      });
    } else {
      const createBody = {
        contents: [
          { type: 'prompt', text: Array.from(String(prompt || '')).slice(0, 2400).join('') },
          { type: 'first_frame', url: image },
        ],
        settings: {
          resolution: body.config?.resolution === '720p' ? '720p' : '1080p',
          duration: Math.min(15, Math.max(3, Number(body.config?.durationSeconds) || 5)),
          audio: 'off',
          multi_shot: false,
        },
        options: { watermark_info: { enabled: false } },
      };
      requestBody = JSON.stringify(createBody);
      const created = await requestKlingJson(endpoint, 'POST', bearerToken, createBody, '创建视频任务');
      upstream = created.upstream;
    }
    writeKlingDiagnostic({
      diagnosticId,
      stage: 'prepared',
      method: 'POST',
      endpoint,
      endpointHostname: new URL(endpoint).hostname,
      requestBytes: Buffer.byteLength(requestBody, 'utf8'),
      promptCharacters: prompt.length,
      mode: referenceVideo ? `multi-elements-${replacementMode}-swap` : 'image-to-video',
      imageUrl: image?.startsWith('data:') ? 'inline-base64' : image || null,
      videoUrl: referenceVideo || null,
      requestedDurationSeconds: body.config?.durationSeconds ?? null,
      requestedResolution: body.config?.resolution ?? '1080p',
      referenceVideoDurationSeconds: body.config?.referenceVideoDurationSec ?? null,
    });
    writeKlingDiagnostic({
      diagnosticId,
      stage: 'response',
      status: upstream.status,
      ok: upstream.ok,
      responseBytes: Buffer.byteLength(upstream.text, 'utf8'),
    });
  } catch (error) {
    if (error instanceof KlingApiRequestError) {
      writeKlingDiagnostic({ diagnosticId, stage: 'api-failed', detail: error.message, status: error.status });
      return {
        status: error.status >= 400 && error.status < 600 ? error.status : 502,
        payload: { ...error.payload, message: error.message },
      };
    }
    const cause = error instanceof Error ? (error as Error & { cause?: { code?: string; message?: string } }).cause : undefined;
    const baseDetail = cause?.code || cause?.message || (error instanceof Error ? error.message : 'unknown');
    const detail = `${baseDetail}；诊断编号：${diagnosticId}`;
    writeKlingDiagnostic({ diagnosticId, stage: 'transport-failed', detail: baseDetail });
    return { status: 502, payload: { message: `连接可灵 API 失败（${detail}），请检查网络后重试。` } };
  }

  const payload = parseKlingPayload(upstream);
  return { status: upstream.status, payload };
}

/** POST /v1/videos/lip-sync — 创建多语言口型同步任务。 */
export async function createKlingLipSync(input: {
  bearerToken: string;
  baseUrl: string;
  videoUrl: string;
  audioUrl: string;
}): Promise<{ taskId: string | null; status: string }> {
  const { bearerToken, baseUrl, videoUrl, audioUrl } = input;
  const created = await requestKlingJson(
    `${baseUrl}/v1/videos/lip-sync`,
    'POST',
    bearerToken,
    {
      input: {
        video_url: videoUrl,
        mode: 'audio2video',
        audio_type: 'url',
        audio_url: audioUrl,
      },
    },
    '创建多语言口型同步任务',
  );
  return {
    taskId: created.payload?.data?.task_id || null,
    status: created.payload?.data?.task_status || 'submitted',
  };
}

/** GET /v1/videos/lip-sync/:id — 查询多语言口型同步任务。 */
export async function queryKlingLipSync(input: {
  bearerToken: string;
  baseUrl: string;
  taskId: string;
}): Promise<{ taskId: string; status: string; statusMessage: string; videoUrl: string | null }> {
  const { bearerToken, baseUrl, taskId } = input;
  const queried = await requestKlingJson(
    `${baseUrl}/v1/videos/lip-sync/${encodeURIComponent(taskId)}`,
    'GET',
    bearerToken,
    undefined,
    '查询多语言口型同步任务',
  );
  const task = queried.payload?.data || {};
  return {
    taskId: task?.task_id || taskId,
    status: task?.task_status || 'unknown',
    statusMessage: task?.task_status_msg || '',
    videoUrl: task?.task_result?.videos?.[0]?.url || null,
  };
}

/** 代理下载可灵媒体（仅允许 kechuangai.com / klingai.com）。 */
export async function proxyKlingMedia(videoUrl: string): Promise<{ bytes: Buffer; contentType: string }> {
  const target = new URL(videoUrl);
  const hostname = target.hostname.toLowerCase();
  const isAllowedMediaHost = target.protocol === 'https:' && (
    hostname === 'kechuangai.com'
    || hostname.endsWith('.kechuangai.com')
    || hostname === 'klingai.com'
    || hostname.endsWith('.klingai.com')
  );
  if (!isAllowedMediaHost) {
    throw new KlingApiRequestError('视频地址不在可灵媒体白名单内。', 400, {});
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const upstream = await fetch(target, { signal: controller.signal });
    if (!upstream.ok) {
      throw new KlingApiRequestError(`读取可灵视频失败（HTTP ${upstream.status}）。`, upstream.status, {});
    }
    const bytes = Buffer.from(await upstream.arrayBuffer());
    return {
      bytes,
      contentType: upstream.headers.get('content-type') || 'video/mp4',
    };
  } finally {
    clearTimeout(timeout);
  }
}
