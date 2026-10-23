import {
  generateContent,
  extractImageFromResponse,
  extractJsonTextFromResponse,
  uploadAssetToCOSWithPresignedURL,
} from '../../../shared_services/geminiProxyService';
import { Type } from '@google/genai';

const PRODUCT_VIDEO_POLL_INTERVAL_MS = 10000;
const PRODUCT_VIDEO_TIMEOUT_MS = 60 * 60 * 1000;
const PRODUCT_VIDEO_TASK_NOT_FOUND_GRACE_MS = 120000;
const RETRYABLE_IMAGE_ERROR_PATTERN = /(\b408\b|\b429\b|\b500\b|\b502\b|\b503\b|\b504\b|\b524\b|timeout|timed out|etimedout|econnreset|network)/i;

const SEEDANCE_VIDEO_MODEL = 'doubao-seedance-2-0-fast-260128';
const SEEDANCE_RESOLUTION = '720p';
const SEEDANCE_REQUEST_TIMEOUT_MS = 11 * 60 * 1000;
const COS_APP_ID = 's_product-display';

const PRODUCT_VIDEO_MODEL_BY_ENGINE = {
  seedance2: SEEDANCE_VIDEO_MODEL,
} as const;

export type ProductVideoEngine = keyof typeof PRODUCT_VIDEO_MODEL_BY_ENGINE;
export const DEFAULT_PRODUCT_VIDEO_ENGINE: ProductVideoEngine = 'seedance2';

export const PRODUCT_VIDEO_DURATION_MIN_SECONDS = 4;
export const PRODUCT_VIDEO_DURATION_MAX_SECONDS = 15;
export const PRODUCT_VIDEO_DEFAULT_DURATION_SECONDS = 5;

export interface ProductVideoTaskResult {
  taskId: string | null;
  status: string;
  videoUrl: string | null;
}

export interface ProductVideoTaskQueryResult {
  taskId: string;
  status: string;
  videoUrl: string | null;
  error?: string | null;
}

export function getProductVideoModel(engine: ProductVideoEngine = DEFAULT_PRODUCT_VIDEO_ENGINE): string {
  return PRODUCT_VIDEO_MODEL_BY_ENGINE[engine] || PRODUCT_VIDEO_MODEL_BY_ENGINE[DEFAULT_PRODUCT_VIDEO_ENGINE];
}

export function normalizeProductVideoDurationSeconds(durationSeconds?: number): number {
  const value = Number(durationSeconds ?? PRODUCT_VIDEO_DEFAULT_DURATION_SECONDS);
  const effective = Number.isFinite(value) && value > 0 ? value : PRODUCT_VIDEO_DEFAULT_DURATION_SECONDS;
  return Math.min(
    PRODUCT_VIDEO_DURATION_MAX_SECONDS,
    Math.max(PRODUCT_VIDEO_DURATION_MIN_SECONDS, Math.round(effective))
  );
}

/**
 * Returns the normalized seedance2 video duration. The signature is kept compatible
 * with the previous (engine-only) call site by allowing an optional explicit duration.
 */
export function getProductVideoDurationSeconds(
  _engine: ProductVideoEngine = DEFAULT_PRODUCT_VIDEO_ENGINE,
  durationSeconds?: number
): number {
  return normalizeProductVideoDurationSeconds(durationSeconds);
}

export function resolveProductVideoBillingTask(durationSeconds?: number): string {
  return `seedance_video_${normalizeProductVideoDurationSeconds(durationSeconds)}s`;
}

function isTransientVideoTaskNotFoundError(error: unknown): boolean {
  const message = String((error as any)?.message || '').trim().toLowerCase();
  if (!message) {
    return false;
  }

  return (
    message.includes('task_not_exist') ||
    message.includes('task not exist') ||
    message.includes('task_not_ex')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isRetryableImageError(error: unknown): boolean {
  return RETRYABLE_IMAGE_ERROR_PATTERN.test(normalizeErrorMessage(error));
}

function toUserFriendlyImageError(error: unknown): Error {
  const message = normalizeErrorMessage(error);
  if (/\b524\b|timeout|timed out/i.test(message)) {
    return new Error('图片生成超时（524），已自动重试，请稍后再试。');
  }

  return new Error(message || '图片生成失败，请稍后再试。');
}

async function executeWithRetry<T>(action: () => Promise<T>, maxAttempts: number, actionLabel: string): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (!isRetryableImageError(error) || attempt === maxAttempts) {
        console.error(`[s_product-display] ${actionLabel} failed after ${attempt} attempt(s).`, error);
        throw toUserFriendlyImageError(error);
      }

      const backoffMs = Math.min(1200 * 2 ** (attempt - 1), 5000);
      const jitterMs = Math.floor(Math.random() * 300);
      await sleep(backoffMs + jitterMs);
    }
  }

  throw toUserFriendlyImageError(lastError);
}

function cleanBase64(input: string): string {
  return (input || '').replace(/^data:[^;]+;base64,/, '');
}

function inferMimeType(input: string, fallback = 'image/png'): string {
  const match = String(input || '').match(/^data:([^;]+);base64,/i);
  return match?.[1] || fallback;
}

async function uploadReferenceFrame(
  input: string | undefined,
  fallbackName: string
): Promise<string | null> {
  const trimmed = String(input || '').trim();
  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (!/^data:/i.test(trimmed)) {
    return null;
  }

  const mimeMatch = trimmed.match(/^data:([^;]+);base64,/i);
  const mimeType = mimeMatch?.[1] || 'application/octet-stream';
  const raw = cleanBase64(trimmed);
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  const extension = mimeType.includes('video') ? 'mp4' : 'png';
  const upload = await uploadAssetToCOSWithPresignedURL(new Blob([bytes], { type: mimeType }), {
    fileName: `${fallbackName}.${extension}`,
    appID: COS_APP_ID,
    objectPath: `standalone/${COS_APP_ID}/seedance_refs`,
    contentType: mimeType,
  });

  return upload.url || upload.signed_url || upload.public_url || null;
}

function extractVideoUrlFromPayload(payload: any): string | null {
  const directCandidates = [
    payload?.video_url,
    payload?.videoUrl,
    payload?.url,
    payload?.uri,
    payload?.content?.video_url,
    payload?.content?.videoUrl,
    payload?.data?.video_url,
    payload?.data?.videoUrl,
    payload?.data?.content?.video_url,
    payload?.data?.content?.videoUrl,
    payload?.result?.video_url,
    payload?.result?.videoUrl,
    payload?.result?.url,
    payload?.result?.uri,
    payload?.result?.content?.video_url,
    payload?.result?.content?.videoUrl,
    payload?.videos?.[0]?.url,
    payload?.videos?.[0]?.uri,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function extractTaskIdFromPayload(payload: any): string | null {
  const candidate =
    payload?.id ||
    payload?.task_id ||
    payload?.taskId ||
    payload?.data?.id ||
    payload?.data?.task_id ||
    payload?.data?.taskId ||
    payload?.result?.id ||
    payload?.result?.task_id ||
    payload?.result?.taskId ||
    null;

  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
}

function extractStatusFromPayload(payload: any, fallback = 'unknown'): string {
  const status = String(
    payload?.status ||
    payload?.data?.status ||
    payload?.result?.status ||
    fallback
  ).trim();
  return status || fallback;
}

/**
 * 深度分析产品卖点与人群（中文增强版）
 * 通过后端代理调用 Gemini，避免前端暴露 Key
 */
export const analyzeProduct = async (
  base64: string,
  mimeType: string
): Promise<any> => {
  const response = await generateContent({
    model: 'gemini-3.1-flash-image-preview',
    task: 'text_gen',
    billing_task: 'text_gen',
    contents: {
      parts: [
        { text: '你是一位资深的电商营销专家和商业摄影师。请深度审计此产品图片。请务必使用【中文】返回以下内容的 JSON 格式：1.产品类型；2.五个核心卖点（每个卖点不超过15个字）；3.四个精准目标人群；4.三个具体的商业摄影拍摄场景方案描述（包含灯光和氛围建议）。' },
        { inlineData: { mimeType, data: base64 } }
      ]
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          productType: { type: Type.STRING },
          sellingPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
          targetAudience: { type: Type.ARRAY, items: { type: Type.STRING } },
          suggestedScenarios: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ['productType', 'sellingPoints', 'targetAudience', 'suggestedScenarios']
      }
    }
  });

  let parsedData: any;
  try {
    parsedData = JSON.parse(extractJsonTextFromResponse(response as any));
  } catch (parseError) {
    console.error('JSON 解析失败:', parseError);
    console.error('原始响应:', response);
    throw new Error('AI 返回的 JSON 格式错误');
  }
  
  // 转换字段名和数据结构以匹配前端期望
  // 支持多种字段名格式：
  // 英文：product_type, core_selling_points, selling_points, target_audiences, target_audience, photography_scenarios
  // 中文：产品类型, 五个核心卖点, 四个精准目标人群, 三个具体的商业摄影拍摄场景方案描述
  // 前端期望：productType, sellingPoints, targetAudience, suggestedScenarios
  const result: any = {
    productType: parsedData.product_type || parsedData.productType || parsedData['产品类型'] || '',
    sellingPoints: parsedData.selling_points || 
                   parsedData.core_selling_points || 
                   parsedData.sellingPoints || 
                   parsedData['五个核心卖点'] || 
                   [],
    targetAudience: parsedData.target_audience || 
                    parsedData.target_audiences || 
                    parsedData.targetAudience || 
                    parsedData['四个精准目标人群'] || 
                    [],
    suggestedScenarios: []
  };
  
  // 转换场景数据为 suggestedScenarios（字符串数组）
  // 支持多种字段名和格式
  const scenarios = parsedData.photography_scenarios || 
                    parsedData.suggestedScenarios || 
                    parsedData['三个具体的商业摄影拍摄场景方案描述'] || 
                    [];
  
  if (Array.isArray(scenarios)) {
    result.suggestedScenarios = scenarios.map((scenario: any) => {
      // 如果是对象，提取信息并组合
      if (typeof scenario === 'object' && scenario !== null) {
        // 支持多种字段名格式
        const name = scenario.title || 
                     scenario.scenario_name || 
                     scenario.name || 
                     scenario['场景主题'] || 
                     scenario['场景名称'] || 
                     '';
        const desc = scenario.description || 
                     scenario['场景描述'] || 
                     scenario.desc || 
                     '';
        const lighting = scenario.lighting_and_atmosphere || 
                        scenario.lighting || 
                        scenario['灯光与氛围建议'] || 
                        scenario['灯光建议'] || 
                        '';
        
        // 组合成字符串
        let scenarioText = '';
        if (name) scenarioText += name;
        if (desc) scenarioText += (scenarioText ? '：' : '') + desc;
        if (lighting) scenarioText += (scenarioText ? ' ' : '') + `灯光建议：${lighting}`;
        
        return scenarioText.trim() || JSON.stringify(scenario);
      }
      // 如果是字符串，直接返回
      return String(scenario);
    });
  }
  
  // 确保数组不为空（如果解析失败，至少返回空数组）
  if (!Array.isArray(result.sellingPoints)) {
    result.sellingPoints = [];
  }
  if (!Array.isArray(result.targetAudience)) {
    result.targetAudience = [];
  }
  if (!Array.isArray(result.suggestedScenarios)) {
    result.suggestedScenarios = [];
  }
  
  return result;
};

/**
 * 合成产品展示图（支持参考背景或AI生成背景）
 */
export const generateCompositeImage = async (
  productBase64: string,
  productMimeType: string,
  bgBase64?: string | null,
  bgMimeType?: string | null,
  targetRatio: '16:9' | '9:16' = '16:9',
  customVibe?: string,
  analysisData?: any,
  seed?: number
): Promise<string> => {
  const analysisContext = analysisData ? `
    产品背景信息：
    - 产品类型：${analysisData.productType}
    - 核心卖点：${analysisData.sellingPoints?.slice(0, 3)?.join('、')}
    - 目标人群：${analysisData.targetAudience?.slice(0, 3)?.join('、')}
  ` : '';

  const promptVariants = bgBase64 && bgMimeType
    ? [
        `你是一名商业CG合成专家。${analysisContext}
        任务：将提供的产品图精准合成到提供的背景图中，保证真实光影与空间融合。
        要求：
        - 光照与阴影需与背景一致，突出产品卖点
        - 画面风格统一，高端商业摄影质感
        - 输出宽高比为 ${targetRatio}
        ${customVibe ? `场景氛围补充：${customVibe}` : ''}`,
        `将产品自然融合到参考背景中，制作高端商业产品海报。保持真实光影、统一风格、突出产品主体。输出宽高比 ${targetRatio}。${customVibe ? `场景氛围：${customVibe}` : ''}`,
      ]
    : [
        `你是一名商业产品摄影师。${analysisContext}
        任务：基于产品图构建高端商业场景图。
        场景：${customVibe || analysisData?.suggestedScenarios?.[0] || '专业影棚'}
        风格：突出产品质感与卖点，真实光影。
        输出：宽高比 ${targetRatio}`,
        `为该产品生成高端商业海报。突出产品质感、真实光影和清晰主体。场景：${customVibe || analysisData?.suggestedScenarios?.[0] || '专业影棚'}。宽高比 ${targetRatio}。`,
      ];

  let lastError: unknown;
  for (let index = 0; index < promptVariants.length; index += 1) {
    const prompt = promptVariants[index];
    const parts = [
      { text: prompt },
      { inlineData: { mimeType: productMimeType, data: productBase64 } },
      ...(bgBase64 && bgMimeType ? [{ inlineData: { mimeType: bgMimeType, data: bgBase64 } }] : []),
    ];

    try {
      const response = await executeWithRetry(
        () => generateContent({
          model: 'gemini-3.1-flash-image-preview',
          task: 'image_gen',
          billing_task: 'image_gen',
          contents: { parts },
          config: {
            imageConfig: { aspectRatio: targetRatio },
            seed,
          },
        }),
        3,
        `image generation variant ${index + 1}`
      );

      const imageUrl = extractImageFromResponse(response);
      if (!imageUrl) {
        throw new Error('AI未返回图片数据。');
      }
      return imageUrl;
    } catch (error) {
      lastError = error;
      if (index < promptVariants.length - 1) {
        console.warn('[s_product-display] image generation fallback to shorter prompt', { variant: index + 1, error });
      }
    }
  }

  throw toUserFriendlyImageError(lastError);
};

export type CameraStyle = 'detail_focus' | 'hero_360' | 'impact_dolly' | 'elegant_slide' | 'reveal_lift' | 'custom';

function buildProductVideoPrompt(
  cameraStyle: CameraStyle,
  durationSeconds: number,
  aspectRatio: '16:9' | '9:16',
  analysisData?: any,
  customMovementPrompt?: string
): string {
  const mainFeature = analysisData?.sellingPoints?.[0] || '产品细节';
  let cameraPrompt = '';

  switch (cameraStyle) {
    case 'detail_focus':
      cameraPrompt = `慢速环绕 + 平滑推进，突出 ${mainFeature}`;
      break;
    case 'hero_360':
      cameraPrompt = `电影级 360° 环绕，展示 ${analysisData?.productType || '产品'} 的空间存在感`;
      break;
    case 'impact_dolly':
      cameraPrompt = '强烈动态推近，营造现代高能广告风格';
      break;
    case 'elegant_slide':
      cameraPrompt = '丝滑横移，光线轻抚产品边缘，强调高级质感';
      break;
    case 'reveal_lift':
      cameraPrompt = '低机位仰拍升降，隆重揭示产品全貌';
      break;
    case 'custom':
      cameraPrompt = customMovementPrompt || '平滑电影感运镜，突出产品美学';
      break;
  }

  return `High-end commercial video rendering. ${cameraPrompt}. Product as the main focus. Professional studio lighting. Cinematic quality, 8k resolution, highly detailed textures, slow motion camera movement, photorealistic renderer style.
STRICT CONSTRAINTS:
- THE VIDEO MUST BE EXACTLY ${durationSeconds} SECONDS LONG.
- NO TEXT, NO LOGOS OVERLAY, NO CAPTIONS.
- THE VIDEO MUST FULLY FILL THE ENTIRE ${aspectRatio} FRAME.
- ABSOLUTELY NO BLACK BARS.
- EDGE-TO-EDGE FULLSCREEN COVERAGE.`;
}

async function resolvePlayableVideoURL(videoURL: string): Promise<string> {
  const trimmedURL = String(videoURL || '').trim();
  if (!trimmedURL) {
    throw new Error('视频地址为空');
  }

  if (trimmedURL.startsWith('data:video/')) {
    return trimmedURL;
  }

  try {
    const response = await fetch(trimmedURL);
    if (response.ok) {
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    }
  } catch (error) {
    console.warn('无法直接获取视频，尝试回退到原始 URL:', error);
  }

  return trimmedURL;
}

export async function submitProductVideoTask(
  sourceImageBase64: string,
  mimeType: string = 'image/png',
  aspectRatio: '16:9' | '9:16' = '16:9',
  cameraStyle: CameraStyle = 'detail_focus',
  engine: ProductVideoEngine = DEFAULT_PRODUCT_VIDEO_ENGINE,
  analysisData?: any,
  seed?: number,
  customMovementPrompt?: string,
  durationSeconds?: number,
  billingTask?: string
): Promise<ProductVideoTaskResult> {
  const effectiveDuration = normalizeProductVideoDurationSeconds(durationSeconds);
  const effectiveBillingTask = billingTask || resolveProductVideoBillingTask(effectiveDuration);
  const prompt = buildProductVideoPrompt(
    cameraStyle,
    effectiveDuration,
    aspectRatio,
    analysisData,
    customMovementPrompt
  );

  const isAlreadyDataURL = sourceImageBase64.startsWith('data:');
  const sourceDataURL = isAlreadyDataURL
    ? sourceImageBase64
    : `data:${mimeType || inferMimeType(sourceImageBase64)};base64,${cleanBase64(sourceImageBase64)}`;

  const firstFrameURL = await uploadReferenceFrame(sourceDataURL, 'first_frame');

  const content: Array<Record<string, unknown>> = [
    { type: 'text', text: prompt },
  ];
  if (firstFrameURL) {
    content.push({
      type: 'image_url',
      image_url: { url: firstFrameURL },
      role: 'first_frame',
    });
  }

  const payload: any = await generateContent({
    model: getProductVideoModel(engine),
    task: 'video_gen_submit' as any,
    billing_task: effectiveBillingTask,
    tier: 'normal',
    contents: { content } as any,
    config: {
      resolution: SEEDANCE_RESOLUTION,
      aspectRatio,
      durationSeconds: effectiveDuration,
      seed,
      submitOnly: true,
      timeoutMs: SEEDANCE_REQUEST_TIMEOUT_MS,
    } as any,
  } as any);

  const taskId = extractTaskIdFromPayload(payload);
  const status = extractStatusFromPayload(payload);
  const videoUrlRaw = extractVideoUrlFromPayload(payload);

  if (videoUrlRaw) {
    return {
      taskId,
      status,
      videoUrl: await resolvePlayableVideoURL(videoUrlRaw),
    };
  }

  if (taskId) {
    return {
      taskId,
      status: status || 'queued',
      videoUrl: null,
    };
  }

  throw new Error('视频生成失败：未返回可播放地址或任务ID');
}

export async function waitForProductVideoCompletion(
  submitted: ProductVideoTaskResult,
  engine: ProductVideoEngine = DEFAULT_PRODUCT_VIDEO_ENGINE
): Promise<{ status: string; videoUrl: string }> {
  if (submitted.videoUrl) {
    return {
      status: submitted.status || 'completed',
      videoUrl: submitted.videoUrl,
    };
  }

  if (!submitted.taskId) {
    throw new Error('视频任务缺少 task id');
  }

  const startedAt = Date.now();
  const timeoutAt = Date.now() + PRODUCT_VIDEO_TIMEOUT_MS;
  while (Date.now() < timeoutAt) {
    let result: ProductVideoTaskQueryResult;
    try {
      result = await queryProductVideoTaskProgress(submitted.taskId, engine);
    } catch (error) {
      if (isTransientVideoTaskNotFoundError(error) && Date.now() - startedAt < PRODUCT_VIDEO_TASK_NOT_FOUND_GRACE_MS) {
        console.warn('[s_product-display] video task not ready yet, will retry', {
          taskId: submitted.taskId,
          error,
        });
        await sleep(PRODUCT_VIDEO_POLL_INTERVAL_MS);
        continue;
      }
      throw error;
    }

    if (result.videoUrl) {
      return {
        status: result.status || 'completed',
        videoUrl: result.videoUrl,
      };
    }

    const status = String(result.status || '').toLowerCase();
    if (status === 'failed' || status === 'error' || status === 'cancelled') {
      throw new Error(String(result.error || '').trim() || `视频生成失败 (${result.status || 'unknown'})`);
    }

    await sleep(PRODUCT_VIDEO_POLL_INTERVAL_MS);
  }

  throw new Error(`video generation timed out (taskId:${submitted.taskId})`);
}

export async function queryProductVideoTaskProgress(
  taskId: string,
  engine: ProductVideoEngine = DEFAULT_PRODUCT_VIDEO_ENGINE
): Promise<ProductVideoTaskQueryResult> {
  const trimmedTaskID = String(taskId || '').trim();
  if (!trimmedTaskID) {
    throw new Error('视频任务缺少 task id');
  }

  let payload: any;
  try {
    payload = await generateContent({
      model: getProductVideoModel(engine),
      task: 'video_task_query' as any,
      contents: {} as any,
      config: {
        taskId: trimmedTaskID,
        timeoutMs: SEEDANCE_REQUEST_TIMEOUT_MS,
      } as any,
    } as any);
  } catch (error) {
    if (isTransientVideoTaskNotFoundError(error)) {
      return {
        taskId: trimmedTaskID,
        status: 'queued',
        videoUrl: null,
        error: null,
      };
    }
    throw error;
  }

  const status = extractStatusFromPayload(payload);
  const videoUrlRaw = extractVideoUrlFromPayload(payload);
  const videoUrl = videoUrlRaw ? await resolvePlayableVideoURL(videoUrlRaw) : null;

  return {
    taskId: trimmedTaskID,
    status,
    videoUrl,
    error:
      typeof payload?.error === 'string' && payload.error.trim()
        ? payload.error.trim()
        : null,
  };
}

/**
 * 生成产品展示视频（使用 Seedance 2.0）
 */
export const generateProductVideo = async (
  sourceImageBase64: string,
  mimeType: string = 'image/png',
  aspectRatio: '16:9' | '9:16' = '16:9',
  cameraStyle: CameraStyle = 'detail_focus',
  engine: ProductVideoEngine = DEFAULT_PRODUCT_VIDEO_ENGINE,
  analysisData?: any,
  seed?: number,
  customMovementPrompt?: string,
  durationSeconds?: number
): Promise<string> => {
  const submitted = await submitProductVideoTask(
    sourceImageBase64,
    mimeType,
    aspectRatio,
    cameraStyle,
    engine,
    analysisData,
    seed,
    customMovementPrompt,
    durationSeconds
  );
  const completed = await waitForProductVideoCompletion(submitted, engine);
  return completed.videoUrl;
};
