// CPRT master-video provider（从 video-clone-seedance-v2/server/cprt.ts 移植）。
// master-video-s2-* 走 Ark 协议：参考图/视频先送审（POST /master/asset/submit，
// 轮询 /master/asset/status 直到 Active），再以 asset://<asset_id> 写入 content 分片，
// 通过 POST /v1/chat/asyncTask 创建任务，GET /v1/chat/asyncTask/{id} 轮询。
//
// 与 tokendance.ts 的 submitOrQueryTokendance 接口对齐：taskId 存在时查询，否则提交；
// data: URL 素材通过 assetTunnel.publishDataUrl 发布成公网 URL。

import type { KlingAssetTunnel } from './klingAssetTunnel';
import {
  DEFAULT_CPRT_MODEL,
  buildConversionSlots,
  isCprtModel,
  isCprtResolution,
  normalizeCprtResolution,
  toCprtProviderResolution,
  type CprtConversionSlot,
  type CprtMultimodalVideoModel,
} from '../shared/cprtContract';

export type CprtGenerateResult = { status: number; payload: any };

class CprtRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CprtRequestError';
  }
}

type CprtTaskCreateResult = {
  /** Ark 网关创建任务返回 id；旧 free-video wrapper 返回 taskId。 */
  id?: string;
  taskId?: string;
  status?: string;
  errorCode?: string;
  errorMessage?: string;
};

type CprtTaskQueryResult = {
  id?: string;
  taskId?: string;
  status?: string;
  errorCode?: string;
  errorMessage?: string;
  /** Ark 网关的失败信息体。 */
  error?: { code?: string; message?: string } | null;
  /** Ark 网关的成片：content.video_url。 */
  content?: { video_url?: string | null } | null;
  results?: Array<{ url?: string | null; name?: string | null }> | null;
  failedReason?: Record<string, unknown> | null;
};

async function requestCprt<T>(baseUrl: string, bearerToken: string, path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init?.headers || {}),
      },
    });
  } catch (error) {
    throw new Error(`CPRT 请求失败：${error instanceof Error ? error.message : 'network error'}`);
  }

  const text = await response.text();
  let payload: any = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    const nestedError = payload?.error;
    const nestedMessage = typeof nestedError === 'object' && nestedError ? nestedError.message : nestedError;
    const nestedCode = typeof nestedError === 'object' && nestedError ? nestedError.code : '';
    const message = String(
      payload?.errorMessage
        || payload?.message
        || nestedMessage
        || `HTTP ${response.status}`,
    ).trim();
    const code = String(payload?.errorCode || nestedCode || '').trim();
    throw new CprtRequestError(
      response.status,
      code,
      message || `CPRT request failed (${response.status})`,
    );
  }

  return payload as T;
}

export type MasterAssetType = 'Image' | 'Video' | 'Audio';

// master-video 素材送审：先拿 asset_id，通过后以 asset://<asset_id> 传入 content 分片。
const masterAssetIdCache = new Map<string, string>();

export async function submitMasterAssetForReview(
  baseUrl: string,
  bearerToken: string,
  assetType: MasterAssetType,
  url: string,
): Promise<string> {
  const cached = masterAssetIdCache.get(url);
  if (cached) {
    return cached;
  }
  const payload = await requestCprt<{ asset_id?: string; errorMessage?: string }>(
    baseUrl,
    bearerToken,
    '/master/asset/submit',
    { method: 'POST', body: JSON.stringify({ asset_type: assetType, url }) },
  );
  const assetId = String(payload?.asset_id || '').trim();
  if (!assetId) {
    throw new Error(String(payload?.errorMessage || `素材送审未返回 asset_id：${url}`));
  }
  masterAssetIdCache.set(url, assetId);
  return assetId;
}

export async function getMasterAssetStatus(baseUrl: string, bearerToken: string, assetId: string): Promise<string> {
  const payload = await requestCprt<{ status?: string }>(baseUrl, bearerToken, '/master/asset/status', {
    method: 'POST',
    body: JSON.stringify({ id: assetId }),
  });
  return String(payload?.status || '').trim();
}

export async function waitForMasterAssetActive(
  baseUrl: string,
  bearerToken: string,
  assetId: string,
  timeoutMs = 180_000,
): Promise<void> {
  const startedAt = Date.now();
  for (;;) {
    const status = await getMasterAssetStatus(baseUrl, bearerToken, assetId);
    if (status === 'Active') {
      return;
    }
    if (/(reject|fail|block|deny|violation)/i.test(status)) {
      throw new Error(`素材审核未通过（${status}）：${assetId}`);
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`素材审核超时（${status || '未知状态'}）：${assetId}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

async function ensureMasterAssetRef(
  baseUrl: string,
  bearerToken: string,
  assetType: MasterAssetType,
  url: string,
): Promise<string> {
  const assetId = await submitMasterAssetForReview(baseUrl, bearerToken, assetType, url);
  try {
    await waitForMasterAssetActive(baseUrl, bearerToken, assetId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const assetLabel = assetType === 'Image' ? '参考图' : assetType === 'Video' ? '参考视频' : '参考音频';
    throw new Error(`${assetLabel}未通过平台内容审核（${url}）：${reason}`);
  }
  return `asset://${assetId}`;
}

export async function createMultimodalVideoTask(input: {
  baseUrl: string;
  bearerToken: string;
  model: string;
  prompt: string;
  resolution: string;
  durationSeconds: number;
  ratio?: string;
  imageUrls?: string[];
  videoUrls?: string[];
  /** 与 v2 保持一致：master-video Ark 路径不下发真人素材槽位，仅保留入参语义。 */
  realPersonMode?: boolean;
  conversionSlots?: CprtConversionSlot[];
}): Promise<{ taskId: string; status: string }> {
  const [imageAssetUrls, videoAssetUrls] = await Promise.all([
    Promise.all((input.imageUrls?.length ? input.imageUrls : []).map((url) => ensureMasterAssetRef(input.baseUrl, input.bearerToken, 'Image', url))),
    Promise.all((input.videoUrls?.length ? input.videoUrls : []).map((url) => ensureMasterAssetRef(input.baseUrl, input.bearerToken, 'Video', url))),
  ]);

  const content: Array<Record<string, unknown>> = [
    { type: 'text', text: input.prompt },
  ];
  for (const url of imageAssetUrls) {
    content.push({ type: 'image_url', image_url: { url }, role: 'reference_image' });
  }
  for (const url of videoAssetUrls) {
    content.push({ type: 'video_url', video_url: { url }, role: 'reference_video' });
  }

  const payload = await requestCprt<CprtTaskCreateResult>(input.baseUrl, input.bearerToken, '/v1/chat/asyncTask', {
    method: 'POST',
    body: JSON.stringify({
      model: input.model,
      content,
      resolution: toCprtProviderResolution(input.resolution),
      duration: input.durationSeconds,
      ratio: input.ratio || undefined,
      watermark: false,
      returnOriginData: true,
    }),
  });

  const taskId = String(payload?.id || payload?.taskId || '').trim();
  if (!taskId) {
    throw new Error(String(payload?.errorMessage || 'CPRT 未返回任务ID。'));
  }
  return { taskId, status: String(payload?.status || 'QUEUED') };
}

export type CprtVideoTask = {
  taskId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  videoUrl: string | null;
  errorMessage: string | null;
};

function normalizeStatus(status: string): CprtVideoTask['status'] {
  const normalized = String(status || '').trim().toUpperCase();
  if (['SUCCESS', 'SUCCEEDED', 'COMPLETED'].includes(normalized)) {
    return 'completed';
  }
  if (['FAILED', 'ERROR', 'CANCELLED', 'CANCELED'].includes(normalized)) {
    return 'failed';
  }
  if (['QUEUED', 'SUBMITTED', 'PENDING'].includes(normalized)) {
    return 'queued';
  }
  return 'running';
}

export async function getMultimodalVideoTask(baseUrl: string, bearerToken: string, taskId: string): Promise<CprtVideoTask> {
  let payload: CprtTaskQueryResult;
  try {
    payload = await requestCprt<CprtTaskQueryResult>(
      baseUrl,
      bearerToken,
      `/v1/chat/asyncTask/${encodeURIComponent(taskId)}`,
    );
  } catch (error) {
    const isPublicTaskId = /^\d{14}_[A-Za-z0-9_-]+$/.test(taskId);
    const isRecoverablePollError = error instanceof CprtRequestError
      && (error.status === 429 || error.status >= 500);
    if (isPublicTaskId && isRecoverablePollError) {
      return {
        taskId,
        status: 'running',
        videoUrl: null,
        errorMessage: null,
      };
    }
    throw error;
  }

  let status = normalizeStatus(String(payload?.status || ''));
  const arkVideoUrl = String(payload?.content?.video_url || '').trim();
  const videoResult = Array.isArray(payload?.results)
    ? payload.results.find((item) => String(item?.name || '') === 'videoUrl' && String(item?.url || '').trim())
    : null;

  let failedMessage = String(
    payload?.errorMessage
      || payload?.error?.message
      || payload?.errorCode
      || (payload?.failedReason && Object.keys(payload.failedReason).length ? JSON.stringify(payload.failedReason) : '')
      || '',
  ).trim();

  const videoUrl = arkVideoUrl || String(videoResult?.url || '').trim() || null;
  if (status === 'completed' && !videoUrl) {
    status = 'failed';
    failedMessage = failedMessage || 'CPRT 任务已完成，但未返回视频地址。';
  }

  return {
    // CPRT 可能返回内部数字 ID；后续 /asyncTask/{id} 查询只认创建时返回的公开 ID。
    taskId,
    status,
    videoUrl: status === 'completed' ? videoUrl : null,
    errorMessage: status === 'failed' ? failedMessage || '视频生成失败。' : null,
  };
}

/**
 * 处理 POST /api/gemini/generate（provider='cprt'）的请求。
 * body.config.taskId 存在时查询任务，否则创建任务。
 * 返回 { status, payload }，由 server.ts 转发。
 */
export async function submitOrQueryCprt(input: {
  bearerToken: string;
  baseUrl: string;
  body: any;
  assetTunnel: KlingAssetTunnel;
}): Promise<CprtGenerateResult> {
  const { bearerToken, baseUrl, body, assetTunnel } = input;
  const taskId = String(body?.config?.taskId || '').trim();

  // 查询分支
  if (taskId) {
    try {
      const task = await getMultimodalVideoTask(baseUrl, bearerToken, taskId);
      return {
        status: 200,
        payload: {
          taskId: task.taskId,
          status: task.status,
          videoUrl: task.videoUrl,
          errorMessage: task.errorMessage,
        },
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unknown';
      return {
        status: 502,
        payload: { taskId, message: `查询 CPRT 任务失败：${detail}` },
      };
    }
  }

  // 创建分支
  const rawModel = String(body?.config?.model || '').trim() || DEFAULT_CPRT_MODEL;
  if (!isCprtModel(rawModel)) {
    return {
      status: 400,
      payload: { message: `不支持的 CPRT 模型：${rawModel}` },
    };
  }
  const model = rawModel as CprtMultimodalVideoModel;
  const resolution = normalizeCprtResolution(String(body?.config?.resolution || '').trim());
  if (!isCprtResolution(model, resolution)) {
    return {
      status: 400,
      payload: { message: `模型 ${model} 不支持分辨率 ${resolution || '(空)'}` },
    };
  }
  const durationSeconds = Math.min(15, Math.max(4, Math.round(Number(body?.config?.durationSeconds) || 5)));
  const ratio = String(body?.config?.aspectRatio || '').trim() || undefined;
  const realPersonMode = Boolean(body?.config?.realPersonMode);

  // 把 content[] 里的 data: URL 素材发布成公网 URL。
  const content = Array.isArray(body?.contents?.content)
    ? await Promise.all(body.contents.content.map(async (item: any) => {
        if (item?.type === 'image_url' && item?.image_url?.url) {
          const imageUrl = String(item.image_url.url).trim();
          if (!imageUrl.startsWith('data:')) return item;
          return { ...item, image_url: { ...item.image_url, url: await assetTunnel.publishDataUrl(imageUrl) } };
        }
        if (item?.type === 'video_url' && item?.video_url?.url) {
          const videoUrl = String(item.video_url.url).trim();
          if (!videoUrl.startsWith('data:')) return item;
          return { ...item, video_url: { ...item.video_url, url: await assetTunnel.publishDataUrl(videoUrl) } };
        }
        return item;
      }))
    : [];

  const imageUrls = content
    .filter((item: any) => item?.type === 'image_url' && item?.image_url?.url)
    .map((item: any) => String(item.image_url.url));
  const videoUrls = content
    .filter((item: any) => item?.type === 'video_url' && item?.video_url?.url)
    .map((item: any) => String(item.video_url.url));
  const textPrompt = content
    .filter((item: any) => item?.type === 'text')
    .map((item: any) => String(item?.text || ''))
    .join('\n')
    .trim();
  if (!textPrompt) {
    return { status: 400, payload: { message: '缺少提示词。' } };
  }

  // 真人模式：参考「图」与参考「视频」都资产化进真人槽位（image1..N + video1）。
  // 与 v2 一致：仅在请求中携带 conversionSlots 语义；master-video Ark 路径不下发。
  const conversionSlots = realPersonMode && (imageUrls.length > 0 || videoUrls.length > 0)
    ? buildConversionSlots(imageUrls.length, Math.min(1, videoUrls.length))
    : undefined;
  void conversionSlots;

  console.log(`[cprt] start_clone_job -> model=${model} resolution=${resolution} duration=${durationSeconds} ratio=${ratio || '(adaptive)'} realPersonMode=${realPersonMode} images=${imageUrls.length} videos=${videoUrls.length} slots=${conversionSlots ? conversionSlots.join('|') : '(none)'}`);

  try {
    const task = await createMultimodalVideoTask({
      baseUrl,
      bearerToken,
      model,
      prompt: textPrompt,
      resolution,
      durationSeconds,
      ratio,
      imageUrls,
      videoUrls,
      realPersonMode,
      conversionSlots,
    });
    return {
      status: 200,
      payload: { taskId: task.taskId, status: task.status, videoUrl: null },
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown';
    return {
      status: 502,
      payload: { message: `创建 CPRT 任务失败：${detail}` },
    };
  }
}
