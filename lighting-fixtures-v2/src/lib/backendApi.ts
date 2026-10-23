type AnyObject = Record<string, any>;
const MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2048;
const GEMINI_MAX_ATTEMPTS = 3;
const GEMINI_RETRY_BASE_DELAY_MS = 1200;
const SEEDANCE_MODEL = 'doubao-seedance-2-0-fast-260128';
const APP_ID = 'lighting-fixtures-v2';
const DEFAULT_LLM_EXECUTE_ENDPOINT = '/api_manager/api/v1/execute/llm-generate';
const SEEDANCE_COS_APP_ID = 'lighting-fixtures-v2';
const SEEDANCE_TIMEOUT_MS = 11 * 60 * 1000;
const LEGACY_VEO_CREATE_ENDPOINTS = [
  '/manager/execute/veo-create',
  '/api/v1/manager/execute/veo-create',
  '/api/v1/gemini/generateVeoVideo',
];
const LEGACY_VEO_STATUS_ENDPOINTS = [
  '/manager/execute/veo-status',
  '/api/v1/manager/execute/veo-status',
  '/api/v1/gemini/veoVideo',
];
const LEGACY_STATUS_POLL_INTERVAL_MS = 10000;
const LEGACY_STATUS_TIMEOUT_MS = 60 * 60 * 1000;
const LEGACY_STATUS_MAX_TRANSIENT_FAILURES = 3;

const AUTH_TOKEN_KEYS = [
  'unityshop-main-frontend-token',
  'user_manager_token',
  'auth_token',
  'admin_token',
] as const;

type AuthTokenKey = (typeof AUTH_TOKEN_KEYS)[number];
const blockedTokenKeys = new Set<AuthTokenKey>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getLLMExecuteEndpoint(): string {
  if (typeof window === 'undefined') {
    return DEFAULT_LLM_EXECUTE_ENDPOINT;
  }

  const standalonePrefix = `/standalone/${APP_ID}`;
  const pathname = window.location.pathname || '';
  if (pathname === standalonePrefix || pathname.startsWith(`${standalonePrefix}/`)) {
    return `${standalonePrefix}/api/execute/llm-generate`;
  }

  return DEFAULT_LLM_EXECUTE_ENDPOINT;
}

function isRetryableGeminiError(error: unknown): boolean {
  const message = String((error as any)?.message || '').toLowerCase();
  if (!message) {
    return false;
  }

  // n1n explicit task failures are typically deterministic for the current payload.
  // Let higher-level Veo strategy switch variant/model instead of retrying same request.
  if (message.includes('n1n video task failed')) {
    return false;
  }

  // Deterministic request-shape/model errors should not be retried.
  if (
    message.includes('not a valid gemini model') ||
    message.includes('invalid model') ||
    message.includes('cannot unmarshal') ||
    message.includes('model input cannot be empty') ||
    message.includes('invalid token') ||
    message.includes('不是 gemini 原生 api 格式的有效 gemini 模型') ||
    message.includes('模型') && message.includes('有效 gemini 模型')
  ) {
    return false;
  }

  if (/(?:http\s*|status\s*[=:]\s*)(400|401|403|422)\b/.test(message)) {
    return false;
  }

  if (/(?:http\s*|status\s*[=:]\s*)(502|503|504|524)\b/.test(message)) {
    return true;
  }

  return (
    message.includes('llm upstream request failed') ||
    message.includes('all mapped keys failed') ||
    message.includes('service unavailable') ||
    message.includes('temporarily unavailable') ||
    message.includes('bad gateway') ||
    message.includes('gateway time-out') ||
    message.includes('upstream timed out') ||
    message.includes('timeout')
  );
}

function stripBase64Payload(value: any): any {
  if (Array.isArray(value)) {
    return value.map(stripBase64Payload);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const output: AnyObject = {};
  for (const [key, val] of Object.entries(value)) {
    if ((key === 'data' || key === 'imageBytes') && typeof val === 'string') {
      output[key] = '[base64 omitted]';
      continue;
    }
    output[key] = stripBase64Payload(val);
  }
  return output;
}

function shouldRemoveTokenKeyOnUnauthorized(key: AuthTokenKey): boolean {
  // Only remove legacy bridge keys automatically.
  return key === 'auth_token' || key === 'admin_token';
}

function listAuthTokens(): Array<{key: AuthTokenKey; token: string}> {
  const result: Array<{key: AuthTokenKey; token: string}> = [];
  const seen = new Set<string>();

  for (const key of AUTH_TOKEN_KEYS) {
    if (blockedTokenKeys.has(key)) {
      continue;
    }

    const value = localStorage.getItem(key);
    const token = value?.trim();
    if (!token || seen.has(token)) {
      continue;
    }

    seen.add(token);
    result.push({key, token});
  }

  return result;
}

function bridgeAuthToken(token: string) {
  const current = (localStorage.getItem('auth_token') || '').trim();
  if (token && current !== token) {
    localStorage.setItem('auth_token', token);
  }
}

async function fetchWithAuth(url: string, init: RequestInit): Promise<Response | null> {
  const candidates = listAuthTokens();
  if (candidates.length === 0) {
    return null;
  }

  for (const {key, token} of candidates) {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);

    const resp = await fetch(url, {
      ...init,
      credentials: 'same-origin',
      headers,
    });

    if (resp.status === 401) {
      blockedTokenKeys.add(key);
      if (shouldRemoveTokenKeyOnUnauthorized(key)) {
        localStorage.removeItem(key);
      }
      continue;
    }

    bridgeAuthToken(token);
    return resp;
  }

  return null;
}

function parseJSONSafe(text: string): AnyObject {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function extractTextFromCandidates(payload: AnyObject): string {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  const texts = parts
    .map((part: AnyObject) => (typeof part?.text === 'string' ? part.text : ''))
    .filter(Boolean);
  return texts.join('\n').trim();
}

function estimateBase64Bytes(base64Data: string): number {
  const padding = (base64Data.match(/=+$/)?.[0]?.length || 0);
  return Math.floor((base64Data.length * 3) / 4) - padding;
}

function isPayloadTooLargeMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('413') || lower.includes('request entity too large') || lower.includes('payload too large');
}

function payloadTooLargeErrorMessage(): string {
  return '图片请求体过大（HTTP 413）。系统已尝试压缩图片，请进一步降低原图分辨率或裁剪后重试。';
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片解析失败'));
    img.src = dataUrl;
  });
}

async function compressInlineImageData(base64Data: string, mimeType: string): Promise<{ data: string; mimeType: string }> {
  if (!base64Data || estimateBase64Bytes(base64Data) <= MAX_INLINE_IMAGE_BYTES) {
    return { data: base64Data, mimeType };
  }

  const dataUrl = `data:${mimeType || 'image/jpeg'};base64,${base64Data}`;
  const img = await loadImageFromDataUrl(dataUrl);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(img.width, img.height));
  const targetW = Math.max(1, Math.round(img.width * scale));
  const targetH = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { data: base64Data, mimeType };
  }

  ctx.drawImage(img, 0, 0, targetW, targetH);
  const qualitySteps = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5];
  let bestData = base64Data;

  for (const quality of qualitySteps) {
    const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
    const compressedBase64 = compressedDataUrl.split(',')[1] || '';
    if (!compressedBase64) continue;
    bestData = compressedBase64;
    if (estimateBase64Bytes(compressedBase64) <= MAX_INLINE_IMAGE_BYTES) {
      return { data: compressedBase64, mimeType: 'image/jpeg' };
    }
  }

  return { data: bestData, mimeType: 'image/jpeg' };
}

async function optimizeRequestInlineImages(request: AnyObject): Promise<AnyObject> {
  const parts = request?.contents?.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    return request;
  }

  const optimizedParts: AnyObject[] = [];
  for (const part of parts) {
    const inlineData = part?.inlineData;
    if (!inlineData?.data || typeof inlineData.data !== 'string') {
      optimizedParts.push(part);
      continue;
    }

    const optimized = await compressInlineImageData(inlineData.data, inlineData.mimeType || 'image/jpeg');
    optimizedParts.push({
      ...part,
      inlineData: {
        ...inlineData,
        data: optimized.data,
        mimeType: optimized.mimeType,
      },
    });
  }

  return {
    ...request,
    contents: {
      ...request.contents,
      parts: optimizedParts,
    },
  };
}

export async function generateGeminiContent(request: AnyObject): Promise<AnyObject> {
  const optimizedRequest = await optimizeRequestInlineImages(request);
  const requestBody = {
    ...optimizedRequest,
    billing_task: String(optimizedRequest?.billing_task || '').trim() || 'text_gen',
  };
  console.log('[lighting-fixtures-v2] Gemini request:', stripBase64Payload(requestBody));

  let lastError: unknown;

  for (let attempt = 0; attempt < GEMINI_MAX_ATTEMPTS; attempt += 1) {
    const attemptRequest =
      attempt === 0
        ? optimizedRequest
        : {
            ...optimizedRequest,
            retry_attempt: Number(optimizedRequest?.retry_attempt || 0) + attempt,
          };

    try {
      const resp = await fetchWithAuth(getLLMExecuteEndpoint(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...attemptRequest,
          billing_task: String(attemptRequest?.billing_task || '').trim() || 'text_gen',
        }),
      });

      if (!resp) {
        throw new Error('未检测到可用登录态，请先登录后重试');
      }

      const text = await resp.text();
      const parsed = parseJSONSafe(text);
      if (!text || Object.keys(parsed).length === 0) {
        if (resp.status === 413 || isPayloadTooLargeMessage(text)) {
          throw new Error(payloadTooLargeErrorMessage());
        }
        throw new Error(`Gemini API 返回不可解析响应 (HTTP ${resp.status})`);
      }

      console.log('[lighting-fixtures-v2] Gemini response:', stripBase64Payload(parsed));

      if (!resp.ok || parsed?.success === false) {
        const errorMessage = String(parsed?.message || `Gemini API 调用失败 (HTTP ${resp.status})`);
        if (resp.status === 413 || isPayloadTooLargeMessage(errorMessage)) {
          throw new Error(payloadTooLargeErrorMessage());
        }
        throw new Error(errorMessage);
      }

      const data = parsed?.data ?? parsed;
      if (typeof data?.text !== 'string' || !data.text.trim()) {
        data.text = extractTextFromCandidates(data);
      }
      return data;
    } catch (error) {
      lastError = error;
      const shouldRetry = attempt < GEMINI_MAX_ATTEMPTS - 1 && isRetryableGeminiError(error);
      if (!shouldRetry) {
        throw error;
      }

      const waitMs = GEMINI_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(
        `[lighting-fixtures-v2] Gemini transient failure, retrying in ${waitMs}ms (attempt ${attempt + 1}/${GEMINI_MAX_ATTEMPTS})`,
        error,
      );
      await sleep(waitMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Gemini API 调用失败');
}

function parseVideoUrlFromText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('data:video/') || /^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return extractVideoUrlFromResponsePayload(parsed);
    } catch {
      return null;
    }
  }

  return null;
}

function toImageDataUrl(value: unknown, mimeType?: string): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('data:image/')) {
    return trimmed;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const compact = trimmed.replace(/\s+/g, '');
  if (!compact || compact.length < 64) {
    return null;
  }

  if (!/^[A-Za-z0-9+/=]+$/.test(compact)) {
    return null;
  }

  return `data:${mimeType || 'image/png'};base64,${compact}`;
}

function parseImageUrlFromText(text: string): string | null {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return null;
  }

  const direct = toImageDataUrl(trimmed);
  if (direct) {
    return direct;
  }

  const markdownUrlMatch = trimmed.match(/\((https?:\/\/[^)\s]+)\)/i);
  if (markdownUrlMatch?.[1]) {
    const markdownUrl = toImageDataUrl(markdownUrlMatch[1]);
    if (markdownUrl) {
      return markdownUrl;
    }
  }

  const embeddedUrlMatch = trimmed.match(/https?:\/\/[^\s"'<>]+/i);
  if (embeddedUrlMatch?.[0]) {
    const embeddedUrl = toImageDataUrl(embeddedUrlMatch[0]);
    if (embeddedUrl) {
      return embeddedUrl;
    }
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return extractImageDataUrlFromResponsePayload(parsed);
    } catch {
      return null;
    }
  }

  return null;
}

function resolveImageMimeType(payload: any, inheritedFallback = 'image/png'): string {
  const mimeTypeCandidates = [
    payload?.mimeType,
    payload?.mime_type,
    payload?.imageMimeType,
    payload?.image_mime_type,
    payload?.data?.mimeType,
    payload?.data?.mime_type,
    payload?.data?.imageMimeType,
    payload?.data?.image_mime_type,
    payload?.result?.mimeType,
    payload?.result?.mime_type,
    payload?.result?.imageMimeType,
    payload?.result?.image_mime_type,
    payload?.image?.mimeType,
    payload?.image?.mime_type,
    payload?.images?.[0]?.mimeType,
    payload?.images?.[0]?.mime_type,
    payload?.images?.[0]?.image?.mimeType,
    payload?.images?.[0]?.image?.mime_type,
    payload?.generatedImages?.[0]?.mimeType,
    payload?.generatedImages?.[0]?.mime_type,
    payload?.generatedImages?.[0]?.image?.mimeType,
    payload?.generatedImages?.[0]?.image?.mime_type,
    payload?.inlineData?.mimeType,
    payload?.inline_data?.mimeType,
    payload?.fileData?.mimeType,
    payload?.file_data?.mimeType,
  ];

  return mimeTypeCandidates.find((value) => typeof value === 'string' && value.trim()) || inheritedFallback;
}

function extractImageDataUrlFromPart(part: any, fallbackMimeType: string): string | null {
  const inlineData = part?.inlineData || part?.inline_data;
  if (inlineData?.data) {
    const imageUrl = toImageDataUrl(inlineData.data, inlineData?.mimeType || fallbackMimeType);
    if (imageUrl) {
      return imageUrl;
    }
  }

  const fileData = part?.fileData || part?.file_data;
  const uriCandidate = fileData?.fileUri || fileData?.file_uri || fileData?.uri || fileData?.url;
  const fileImageUrl = toImageDataUrl(uriCandidate, fileData?.mimeType || fallbackMimeType);
  if (fileImageUrl) {
    return fileImageUrl;
  }

  const base64Candidate = part?.b64_json || part?.imageBase64 || part?.image_base64 || part?.imageBytes || part?.image_bytes || part?.result;
  const base64ImageUrl = toImageDataUrl(base64Candidate, fallbackMimeType);
  if (base64ImageUrl) {
    return base64ImageUrl;
  }

  const nestedBase64Candidates = [
    part?.image?.imageBytes,
    part?.image?.image_bytes,
    part?.image?.imageBase64,
    part?.image?.image_base64,
    part?.image?.b64_json,
    part?.generatedImage?.imageBytes,
    part?.generatedImage?.image_bytes,
    part?.generatedImage?.imageBase64,
    part?.generatedImage?.image_base64,
    part?.generated_image?.imageBytes,
    part?.generated_image?.image_bytes,
    part?.generated_image?.imageBase64,
    part?.generated_image?.image_base64,
    part?.data?.imageBytes,
    part?.data?.image_bytes,
    part?.data?.imageBase64,
    part?.data?.image_base64,
  ];

  for (const candidate of nestedBase64Candidates) {
    const nestedImageUrl = toImageDataUrl(candidate, fallbackMimeType);
    if (nestedImageUrl) {
      return nestedImageUrl;
    }
  }

  const nestedUrlCandidates = [
    part?.image?.url,
    part?.image?.uri,
    part?.image?.fileUri,
    part?.image?.file_uri,
    part?.generatedImage?.url,
    part?.generatedImage?.uri,
    part?.generated_image?.url,
    part?.generated_image?.uri,
    part?.data?.url,
    part?.data?.uri,
  ];

  for (const candidate of nestedUrlCandidates) {
    const nestedImageUrl = toImageDataUrl(candidate, fallbackMimeType);
    if (nestedImageUrl) {
      return nestedImageUrl;
    }
  }

  if (typeof part?.text === 'string') {
    const textImageUrl = parseImageUrlFromText(part.text);
    if (textImageUrl) {
      return textImageUrl;
    }
  }

  return null;
}

export function extractImageDataUrlFromResponsePayload(payload: any): string | null {
  const visited = new Set<any>();
  const queue: any[] = [payload];
  const rootFallbackMimeType = resolveImageMimeType(payload, 'image/png');
  const queued = new Set<any>();
  queued.add(payload);

  const enqueueObject = (value: any) => {
    if (!value || typeof value !== 'object') {
      return;
    }
    if (visited.has(value) || queued.has(value)) {
      return;
    }
    queued.add(value);
    queue.push(value);
  };

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') {
      continue;
    }

    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    const fallbackMimeType = resolveImageMimeType(current, rootFallbackMimeType);

    const textFields = [current?.text, current?.message, current?.error, current?.resultText, current?.outputText];
    for (const textField of textFields) {
      if (typeof textField !== 'string' || !textField.trim()) {
        continue;
      }
      const textImageUrl = parseImageUrlFromText(textField);
      if (textImageUrl) {
        return textImageUrl;
      }
    }

    const directCandidates = [
      current?.imageUrl,
      current?.image_url,
      current?.url,
      current?.uri,
      current?.image,
      current?.imageUri,
      current?.image_uri,
      current?.result,
      current?.data,
      current?.image?.url,
      current?.image?.uri,
      current?.images?.[0]?.url,
      current?.images?.[0]?.uri,
      current?.images?.[0]?.image_url,
      current?.images?.[0]?.image_uri,
      current?.generatedImages?.[0]?.url,
      current?.generatedImages?.[0]?.uri,
      current?.generatedImages?.[0]?.image?.url,
      current?.generatedImages?.[0]?.image?.uri,
      current?.generated_images?.[0]?.url,
      current?.generated_images?.[0]?.uri,
      current?.generated_images?.[0]?.image?.url,
      current?.generated_images?.[0]?.image?.uri,
      current?.content?.[0]?.image_url,
      current?.content?.[0]?.url,
      current?.content?.[0]?.uri,
    ];

    for (const candidate of directCandidates) {
      const imageUrl = toImageDataUrl(candidate, fallbackMimeType);
      if (imageUrl) {
        return imageUrl;
      }
    }

    const base64Candidates = [
      current?.imageBytes,
      current?.image_bytes,
      current?.imageBase64,
      current?.image_base64,
      current?.b64_json,
      current?.content?.[0]?.b64_json,
      current?.images?.[0]?.imageBytes,
      current?.images?.[0]?.imageBase64,
      current?.images?.[0]?.image_base64,
      current?.images?.[0]?.image?.imageBytes,
      current?.images?.[0]?.image?.imageBase64,
      current?.images?.[0]?.image?.image_base64,
      current?.generatedImages?.[0]?.imageBytes,
      current?.generatedImages?.[0]?.imageBase64,
      current?.generatedImages?.[0]?.image_base64,
      current?.generatedImages?.[0]?.image?.imageBytes,
      current?.generatedImages?.[0]?.image?.imageBase64,
      current?.generatedImages?.[0]?.image?.image_base64,
      current?.generated_images?.[0]?.imageBytes,
      current?.generated_images?.[0]?.imageBase64,
      current?.generated_images?.[0]?.image_base64,
      current?.generated_images?.[0]?.image?.imageBytes,
      current?.generated_images?.[0]?.image?.imageBase64,
      current?.generated_images?.[0]?.image?.image_base64,
      current?.output_image,
      current?.outputImage,
    ];

    for (const candidate of base64Candidates) {
      const imageUrl = toImageDataUrl(candidate, fallbackMimeType);
      if (imageUrl) {
        return imageUrl;
      }
    }

    const candidates = Array.isArray(current?.candidates) ? current.candidates : [];
    for (const candidate of candidates) {
      const parts = candidate?.content?.parts;
      if (!Array.isArray(parts)) {
        continue;
      }

      for (const part of parts) {
        const imageUrl = extractImageDataUrlFromPart(part, fallbackMimeType);
        if (imageUrl) {
          return imageUrl;
        }
      }
    }

    const outputItems = [
      ...(Array.isArray(current?.output) ? current.output : []),
      ...(Array.isArray(current?.outputs) ? current.outputs : []),
    ];

    for (const outputItem of outputItems) {
      const imageUrl = extractImageDataUrlFromPart(outputItem, fallbackMimeType);
      if (imageUrl) {
        return imageUrl;
      }

      const outputContents = Array.isArray(outputItem?.content) ? outputItem.content : [];
      for (const contentItem of outputContents) {
        const contentImageUrl = extractImageDataUrlFromPart(contentItem, fallbackMimeType);
        if (contentImageUrl) {
          return contentImageUrl;
        }
      }
    }

    const partItems = Array.isArray(current?.parts) ? current.parts : [];
    for (const part of partItems) {
      const imageUrl = extractImageDataUrlFromPart(part, fallbackMimeType);
      if (imageUrl) {
        return imageUrl;
      }
    }

    const nextPayloads = [
      current?.data,
      current?.result,
      current?.response,
      current?.payload,
      current?.body,
      current?.raw,
      current?.message,
      current?.error,
      current?.image,
      current?.images?.[0],
      current?.generatedImages?.[0],
      current?.generated_images?.[0],
    ];

    for (const nextPayload of nextPayloads) {
      enqueueObject(nextPayload);
    }

    if (Array.isArray(current)) {
      for (const item of current) {
        enqueueObject(item);
      }
    } else {
      for (const value of Object.values(current)) {
        enqueueObject(value);
      }
    }
  }

  return null;
}

function extractVideoUrlFromResponsePayload(payload: any): string | null {
  const directCandidates = [
    payload?.videoUrl,
    payload?.video_url,
    payload?.url,
    payload?.uri,
    payload?.data?.videoUrl,
    payload?.data?.video_url,
    payload?.data?.url,
    payload?.data?.uri,
    payload?.video?.url,
    payload?.video?.uri,
    payload?.result?.videoUrl,
    payload?.result?.video_url,
    payload?.result?.url,
    payload?.result?.uri,
    payload?.generatedVideos?.[0]?.video?.uri,
    payload?.generatedVideos?.[0]?.video?.url,
    payload?.videos?.[0]?.uri,
    payload?.videos?.[0]?.url,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  const candidates = payload?.candidates;
  if (!Array.isArray(candidates)) {
    return null;
  }

  for (const candidate of candidates) {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) {
      continue;
    }

    for (const part of parts) {
      const inlineData = part?.inlineData;
      if (inlineData?.data) {
        const mimeType = inlineData?.mimeType || 'video/mp4';
        return `data:${mimeType};base64,${inlineData.data}`;
      }

      const fileData = part?.fileData;
      const uriCandidate = fileData?.fileUri || fileData?.uri || fileData?.url;
      if (typeof uriCandidate === 'string' && uriCandidate.trim()) {
        return uriCandidate.trim();
      }

      if (typeof part?.text === 'string') {
        const textUrl = parseVideoUrlFromText(part.text);
        if (textUrl) {
          return textUrl;
        }
      }
    }
  }

  return null;
}

export interface VideoGenerateRequest {
  prompt: string;
  model?: string;
  task?: string;
  billingTask?: string;
  tier?: 'lite' | 'normal' | 'pro';
  image?: {
    imageBytes: string;
    mimeType?: string;
  };
  config?: {
    aspectRatio?: '16:9' | '9:16';
    durationSeconds?: number;
    resolution?: '720p' | '1080p';
    size?: '1080x720' | '720x1080';
    seed?: number;
  };
}

export interface VEOCreateTaskResult {
  taskId: string;
  status: string;
  videoUrl: string | null;
}

export interface VEOQueryTaskResult {
  taskId: string;
  status: string;
  videoUrl: string | null;
  error?: string;
}

export interface TaskQueueItem {
  id: number;
  status: string;
  payload?: Record<string, unknown>;
  completed_at?: string;
  last_error?: string;
}

export interface CreateTaskQueueItemRequest {
  source_app_id: string;
  item_type: string;
  status?: string;
  payload?: Record<string, unknown>;
  payload_version?: number;
}

export interface UpdateTaskQueueItemRequest {
  status?: string;
  payload?: Record<string, unknown>;
  last_error?: string;
  completed_at?: string;
}

export interface QueryTaskQueueVideoResult {
  task: TaskQueueItem;
  query: {
    taskId: string;
    status: string;
    videoUrl: string | null;
    error?: string | null;
  };
}

export interface SeedanceVideoGenerateRequest {
  prompt: string;
  firstFrameDataUrl: string;
  billingTask?: string;
  aspectRatio?: '16:9' | '9:16';
  durationSeconds?: number;
  referenceVideoUrl?: string;
  lastFrameDataUrl?: string;
}

export interface SeedanceVideoGenerationResult {
  taskId: string | null;
  status: string;
  videoUrl: string | null;
}

export interface SeedanceVideoTaskQueryResult {
  taskId: string;
  status: string;
  videoUrl: string | null;
}

async function prepareVeoReferenceImage(
  imageBytes: string,
  mimeType: string,
  aspectRatio: '16:9' | '9:16' = '16:9',
): Promise<{ imageBytes: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const srcW = img.naturalWidth || img.width;
      const srcH = img.naturalHeight || img.height;
      if (!srcW || !srcH) {
        reject(new Error('参考图尺寸无效'));
        return;
      }

      const targetW = aspectRatio === '16:9' ? 1280 : 720;
      const targetH = aspectRatio === '16:9' ? 720 : 1280;
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('无法处理参考图'));
        return;
      }

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, targetW, targetH);

      const scale = Math.min(targetW / srcW, targetH / srcH);
      const drawW = Math.max(1, Math.round(srcW * scale));
      const drawH = Math.max(1, Math.round(srcH * scale));
      const offsetX = Math.floor((targetW - drawW) / 2);
      const offsetY = Math.floor((targetH - drawH) / 2);
      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      const commaIdx = dataUrl.indexOf(',');
      if (commaIdx === -1) {
        reject(new Error('参考图处理失败'));
        return;
      }

      resolve({
        imageBytes: dataUrl.slice(commaIdx + 1),
        mimeType: 'image/jpeg',
      });
    };
    img.onerror = () => reject(new Error('参考图加载失败'));
    img.src = `data:${mimeType || 'image/jpeg'};base64,${imageBytes}`;
  });
}

function isModelKeyUnavailableError(error: unknown): boolean {
  const message = String((error as any)?.message || '').toLowerCase();
  if (!message) {
    return false;
  }
  return message.includes('llm key unavailable') || message.includes('no enabled key mapped to model');
}

function isInvalidModelError(error: unknown): boolean {
  const message = String((error as any)?.message || '').toLowerCase();
  if (!message) {
    return false;
  }

  return (
    message.includes('not a valid gemini model') ||
    message.includes('invalid model') ||
    message.includes('不是 gemini 原生 api 格式的有效 gemini 模型') ||
    (message.includes('模型') && message.includes('有效 gemini 模型'))
  );
}

function isN1NTaskFailedError(error: unknown): boolean {
  const message = String((error as any)?.message || '').toLowerCase();
  return message.includes('n1n video task failed') || message.includes('video task failed');
}

function isTransientVideoTaskNotFoundError(error: unknown): boolean {
  const message = String((error as any)?.message || '').toLowerCase();
  if (!message) {
    return false;
  }

  return (
    message.includes('task_not_exist') ||
    message.includes('task not exist') ||
    message.includes('task_not_ex')
  );
}

function normalizeVeoPrompt(prompt: string): string {
  return String(prompt || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildVeoPromptVariants(prompt: string): string[] {
  const normalized = normalizeVeoPrompt(prompt);
  if (!normalized) {
    return ['Professional cinematic product video. Smooth camera movement. No text, no logos, no captions.'];
  }

  const concise = normalized.length > 560 ? `${normalized.slice(0, 560)}...` : normalized;
  const minimal = `Cinematic product video of the same lamp and scene. ${concise.slice(0, 260)} No text, no logos, no captions.`;

  if (minimal === concise) {
    return [concise];
  }
  return [concise, minimal];
}

function isRouteMismatchError(error: unknown): boolean {
  const message = String((error as any)?.message || '').toLowerCase();
  if (!message) {
    return false;
  }

  return (
    message.includes('http 404') ||
    message.includes('http 401') ||
    message.includes('http 403') ||
    message.includes('non-json response') ||
    message.includes('not found')
  );
}

function isMissingPlayableVideoUrlError(error: unknown): boolean {
  const message = String((error as any)?.message || '').toLowerCase();
  if (!message) {
    return false;
  }

  return message.includes('playable video url') || message.includes('视频生成响应未返回可播放地址');
}

function shouldFallbackToLegacyVeo(error: unknown): boolean {
  const message = String((error as any)?.message || '').toLowerCase();
  const isTransientUpstreamError =
    message.includes('bad gateway') ||
    message.includes('gateway time-out') ||
    message.includes('gateway timeout') ||
    message.includes('service unavailable') ||
    message.includes('status=502') ||
    message.includes('status=503') ||
    message.includes('status=504') ||
    message.includes('http 504') ||
    message.includes('http504') ||
    message.includes('llm upstream request failed') ||
    message.includes('video task failed') ||
    message.includes('n1n video task failed') ||
    message.includes('upstream timed out') ||
    message.includes('timeout');

  return (
    isRouteMismatchError(error) ||
    isMissingPlayableVideoUrlError(error) ||
    isInvalidModelError(error) ||
    isModelKeyUnavailableError(error) ||
    isTransientUpstreamError
  );
}

async function requestJsonWithAuth(url: string, init: RequestInit): Promise<AnyObject> {
  const response = await fetchWithAuth(url, init);
  if (!response) {
    throw new Error('未检测到可用登录态，请先登录后重试');
  }

  const text = await response.text();
  const parsed = parseJSONSafe(text);
  if (!text || Object.keys(parsed).length === 0) {
    throw new Error(`non-JSON response from ${url} (HTTP ${response.status})`);
  }

  if (!response.ok || parsed?.success === false) {
    const message = parsed?.error || parsed?.message || `HTTP ${response.status}`;
    throw new Error(String(message));
  }

  return parsed?.data ?? parsed;
}

async function requestJsonWithEndpointFallback(endpoints: string[], init: RequestInit): Promise<AnyObject> {
  let lastError: unknown;

  for (const endpoint of endpoints) {
    try {
      return await requestJsonWithAuth(endpoint, init);
    } catch (error) {
      lastError = error;
      if (!isRouteMismatchError(error)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('request failed');
}

async function createVeoVideoTask(request: VideoGenerateRequest): Promise<string> {
  const payload = await requestJsonWithEndpointFallback(LEGACY_VEO_CREATE_ENDPOINTS, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  const taskId = payload?.taskId || payload?.task_id || payload?.id;
  if (!taskId) {
    throw new Error('video task id is missing');
  }
  return String(taskId);
}

async function getVeoVideoStatus(taskId: string): Promise<AnyObject> {
  const endpoints = LEGACY_VEO_STATUS_ENDPOINTS.map((base) => `${base}?taskId=${encodeURIComponent(taskId)}`);
  return requestJsonWithEndpointFallback(endpoints, {
    method: 'GET',
  });
}

async function generateVeoVideoViaLegacyEndpoints(request: VideoGenerateRequest): Promise<string> {
  const taskId = await createVeoVideoTask(request);
  const timeoutAt = Date.now() + LEGACY_STATUS_TIMEOUT_MS;
  let transientStatusFailures = 0;

  while (Date.now() < timeoutAt) {
    try {
      const result = await getVeoVideoStatus(taskId);
      transientStatusFailures = 0;

      const playableVideoUrl = extractVideoUrlFromResponsePayload(result);
      if (playableVideoUrl) {
        return playableVideoUrl;
      }

      const status = String(result?.status || '').toLowerCase();
      if (status === 'failed' || status === 'error' || status === 'cancelled' || status === 'canceled') {
        throw new Error(String(result?.error || result?.message || 'video generation failed'));
      }
    } catch (error) {
      transientStatusFailures += 1;
      if (transientStatusFailures >= LEGACY_STATUS_MAX_TRANSIENT_FAILURES) {
        const message = String((error as any)?.message || 'status polling failed');
        throw new Error(`VEO status polling failed repeatedly (taskId:${taskId}): ${message}`);
      }
    }

    await sleep(LEGACY_STATUS_POLL_INTERVAL_MS);
  }

  throw new Error('video generation timed out');
}

function buildVeoModelCandidates(requestedModel?: string): string[] {
  const preferred = String(requestedModel || '').trim();
  const base = preferred || 'veo_3_1';
  const commonCandidates = ['veo_3_1', 'veo3.1', 'veo-3.1-fast-generate-preview', 'veo-3.1-generate-preview'];

  if (commonCandidates.includes(base)) {
    return [base, ...commonCandidates.filter((candidate) => candidate !== base)];
  }

  return [base, ...commonCandidates];
}

function buildVeoContents(request: VideoGenerateRequest): { parts: AnyObject[] } {
  const parts: AnyObject[] = [{ text: request.prompt }];

  if (request.image?.imageBytes) {
    parts.push({
      inlineData: {
        mimeType: request.image.mimeType || 'image/png',
        data: request.image.imageBytes,
      },
    });
  }

  return { parts };
}

function extractTaskIdFromResponsePayload(payload: any): string | null {
  const candidates = [
    payload?.taskId,
    payload?.task_id,
    payload?.id,
    payload?.data?.taskId,
    payload?.data?.task_id,
    payload?.data?.id,
    payload?.result?.taskId,
    payload?.result?.task_id,
    payload?.result?.id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function extractTaskStatusFromResponsePayload(payload: any): string {
  return String(payload?.status ?? payload?.data?.status ?? payload?.result?.status ?? 'unknown').trim();
}

function extractVideoTaskErrorMessage(payload: any): string {
  const directCandidates = [
    payload?.error,
    payload?.message,
    payload?.msg,
    payload?.data?.error,
    payload?.data?.message,
    payload?.data?.msg,
    payload?.result?.error,
    payload?.result?.message,
    payload?.result?.msg,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return '';
}

function normalizeVideoTaskQueryStatus(status: string, videoUrl: string | null, error: string): string {
  const normalized = String(status || '').trim();
  if (videoUrl) {
    return normalized || 'completed';
  }
  if (!error) {
    return normalized || 'unknown';
  }

  switch (normalized.toLowerCase()) {
    case 'queued':
    case 'pending':
    case 'running':
    case 'processing':
    case 'in_progress':
      return normalized;
    default:
      return 'failed';
  }
}

export async function generateVeoVideo(request: VideoGenerateRequest): Promise<string> {
  const modelCandidates = buildVeoModelCandidates(request.model);
  const task = request.task || 'video_gen';
  const tier = request.tier || 'normal';
  const promptVariants = buildVeoPromptVariants(request.prompt);

  let normalizedImage = request.image;
  if (normalizedImage?.imageBytes) {
    try {
      normalizedImage = await prepareVeoReferenceImage(
        normalizedImage.imageBytes,
        normalizedImage.mimeType || 'image/jpeg',
        request.config?.aspectRatio || '16:9',
      );
    } catch (error) {
      console.warn('[lighting-fixtures-v2] Veo reference image normalization failed, using original image', error);
    }
  }

  const requestVariants: Array<{ includeImage: boolean; buildParts: (prompt: string) => any[] }> = [
    {
      includeImage: false,
      buildParts: (prompt: string) => [{ text: prompt }],
    },
  ];

  let lastError: unknown;

  for (const prompt of promptVariants) {
    for (const variant of requestVariants) {
      for (let i = 0; i < modelCandidates.length; i += 1) {
        const model = modelCandidates[i];
        try {
          const response = await generateGeminiContent({
            model,
            task,
            billing_task: request.billingTask || 'video_gen',
            tier,
            contents: { parts: variant.buildParts(prompt) },
            config: {
              aspectRatio: request.config?.aspectRatio,
              durationSeconds: request.config?.durationSeconds,
              resolution: request.config?.resolution,
            },
          });

          const videoUrl = extractVideoUrlFromResponsePayload(response);
          if (videoUrl) {
            return videoUrl;
          }

          const textUrl = parseVideoUrlFromText(String(response?.text || ''));
          if (textUrl) {
            return textUrl;
          }

          throw new Error('视频生成响应未返回可播放地址');
        } catch (error) {
          lastError = error;
          const canTryNextModel = i < modelCandidates.length - 1 && (
            isModelKeyUnavailableError(error) ||
            isInvalidModelError(error) ||
            isN1NTaskFailedError(error)
          );
          if (canTryNextModel) {
            continue;
          }

          if (!shouldFallbackToLegacyVeo(error)) {
            throw error;
          }

          break;
        }
      }
    }
  }

  if (isN1NTaskFailedError(lastError)) {
    throw lastError instanceof Error ? lastError : new Error('llm upstream request failed: n1n video task failed');
  }

  try {
    return await generateVeoVideoViaLegacyEndpoints({
      ...request,
      model: modelCandidates[0] || request.model || 'veo_3_1',
      task,
      tier,
    });
  } catch (legacyError) {
    const executeMessage = String((lastError as any)?.message || 'unknown execute-path error');
    const legacyMessage = String((legacyError as any)?.message || 'unknown legacy-path error');
    throw new Error(`VEO video generation failed. execute path: ${executeMessage}; legacy path: ${legacyMessage}`);
  }

}

export async function submitVeoVideoTask(request: VideoGenerateRequest): Promise<VEOCreateTaskResult> {
  const model = String(request.model || '').trim() || 'veo_3_1';
  const task = request.task === 'video_gen' ? 'video_gen_submit' : (request.task || 'video_gen_submit');
  const tier = request.tier || 'normal';

  let lastError: unknown;
  const modelCandidates = buildVeoModelCandidates(model);

  for (let i = 0; i < modelCandidates.length; i += 1) {
    try {
      const payload = await generateGeminiContent({
        model: modelCandidates[i],
        task,
        billing_task: request.billingTask || 'video_gen',
        tier,
        contents: buildVeoContents(request),
        config: {
          ...request.config,
          submitOnly: true,
        },
      });

      const taskId = extractTaskIdFromResponsePayload(payload);
      const status = extractTaskStatusFromResponsePayload(payload) || 'queued';
      const videoUrl = extractVideoUrlFromResponsePayload(payload);
      if (taskId) {
        return { taskId, status, videoUrl };
      }

      if (videoUrl) {
        return { taskId: '', status, videoUrl };
      }

      throw new Error('veo submit response did not include task id or playable video url');
    } catch (error) {
      lastError = error;
      const canTryNextModel = i < modelCandidates.length - 1 && (
        isInvalidModelError(error) ||
        isModelKeyUnavailableError(error) ||
        isN1NTaskFailedError(error)
      );
      if (canTryNextModel) {
        continue;
      }

      if (!shouldFallbackToLegacyVeo(error)) {
        throw error;
      }

      break;
    }
  }

  try {
    const videoUrl = await generateVeoVideoViaLegacyEndpoints({
      ...request,
      model,
      task: 'video_gen',
      tier,
    });
    return {
      taskId: '',
      status: 'completed',
      videoUrl,
    };
  } catch (legacyError) {
    const executeMessage = String((lastError as any)?.message || 'unknown execute-path error');
    const legacyMessage = String((legacyError as any)?.message || 'unknown legacy-path error');
    throw new Error(`VEO video submit failed. execute path: ${executeMessage}; legacy path: ${legacyMessage}`);
  }
}

export async function queryVeoVideoTask(taskId: string, model?: string): Promise<VEOQueryTaskResult> {
  const trimmedTaskId = String(taskId || '').trim();
  if (!trimmedTaskId) {
    throw new Error('任务ID不能为空');
  }

  const normalizedModel = String(model || '').trim() || 'veo_3_1';
  let payload: AnyObject;
  try {
    payload = await generateGeminiContent({
      model: normalizedModel,
      task: 'video_task_query',
      billing_task: 'text_gen',
      contents: {},
      config: {
        taskId: trimmedTaskId,
      },
    });
  } catch (error) {
    if (isTransientVideoTaskNotFoundError(error)) {
      return {
        taskId: trimmedTaskId,
        status: 'queued',
        videoUrl: null,
        error: 'task_not_ready',
      };
    }
    throw error;
  }

  const videoUrl = extractVideoUrlFromResponsePayload(payload);
  const error = extractVideoTaskErrorMessage(payload);
  const status = normalizeVideoTaskQueryStatus(extractTaskStatusFromResponsePayload(payload), videoUrl, error);

  return {
    taskId: extractTaskIdFromResponsePayload(payload) || trimmedTaskId,
    status,
    videoUrl,
    error,
  };
}

function cleanBase64(dataUrlOrBase64: string): string {
  return String(dataUrlOrBase64 || '').replace(/^data:[^;]+;base64,/, '');
}

function inferMimeType(dataUrlOrBase64: string, fallback = 'image/jpeg'): string {
  const match = String(dataUrlOrBase64 || '').match(/^data:([^;]+);base64,/i);
  return match?.[1] || fallback;
}

export async function uploadAssetToCOSDataUrl(input: string | undefined, fallbackName: string): Promise<string | null> {
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

  const mimeType = inferMimeType(trimmed, 'application/octet-stream');
  const binary = atob(cleanBase64(trimmed));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  const extension = mimeType.includes('video') ? 'mp4' : 'png';
  const formData = new FormData();
  formData.append('file', new Blob([bytes], { type: mimeType }), `${fallbackName}.${extension}`);
  formData.append('app_id', SEEDANCE_COS_APP_ID);
  formData.append('object_path', `standalone/${SEEDANCE_COS_APP_ID}/seedance_refs`);

  const resp = await fetchWithAuth('/api_manager/api/v1/execute/cos/upload', {
    method: 'POST',
    body: formData,
  });

  if (!resp) {
    throw new Error('未检测到可用登录态，请先登录后重试');
  }

  const text = await resp.text();
  const parsed = parseJSONSafe(text);
  if (!text || Object.keys(parsed).length === 0) {
    throw new Error(`COS 上传响应不可解析 (HTTP ${resp.status})`);
  }

  if (!resp.ok || parsed?.success === false) {
    throw new Error(String(parsed?.message || `COS 上传失败 (HTTP ${resp.status})`));
  }

  const data = parsed?.data ?? parsed;
  return data?.url || data?.signed_url || data?.public_url || null;
}

export async function generateSeedanceVideo(request: SeedanceVideoGenerateRequest): Promise<SeedanceVideoGenerationResult> {
  const durationSeconds = request.durationSeconds ?? 4;
  const aspectRatio = request.aspectRatio ?? '16:9';

  const enhancedPrompt = `${request.prompt}. STRICT CONSTRAINTS: THE VIDEO MUST BE EXACTLY ${durationSeconds} SECONDS LONG. NO TEXT, NO LOGOS, NO CAPTIONS. THE VIDEO MUST FULLY FILL THE ENTIRE ${aspectRatio} FRAME. ABSOLUTELY NO BLACK BARS. Professional cinematic quality.`;

  const content: Array<Record<string, unknown>> = [];
  const referenceVideoURL = await uploadAssetToCOSDataUrl(request.referenceVideoUrl, 'reference_video');
  const hasReferenceMedia = Boolean(referenceVideoURL);

  content.push({
    type: 'text',
    text: hasReferenceMedia
      ? `${enhancedPrompt} Use the uploaded image and video as multimodal reference guidance when possible.`
      : enhancedPrompt,
  });

  const firstFrameURL = await uploadAssetToCOSDataUrl(request.firstFrameDataUrl, 'first_frame');
  if (firstFrameURL) {
    content.push({
      type: 'image_url',
      image_url: { url: firstFrameURL },
      role: hasReferenceMedia ? 'reference_image' : 'first_frame',
    });
  }

  const lastFrameURL = await uploadAssetToCOSDataUrl(request.lastFrameDataUrl, 'last_frame');
  if (lastFrameURL) {
    content.push({
      type: 'image_url',
      image_url: { url: lastFrameURL },
      role: hasReferenceMedia ? 'reference_image' : 'last_frame',
    });
  }

  if (referenceVideoURL) {
    content.push({ type: 'video_url', video_url: { url: referenceVideoURL }, role: 'reference_video' });
  }

  const payload = await generateGeminiContent({
    model: SEEDANCE_MODEL,
    task: 'video_gen_submit',
    billing_task: request.billingTask || 'seedance_video_gen',
    contents: { content },
    config: {
      aspectRatio,
      durationSeconds,
      submitOnly: true,
      timeoutMs: SEEDANCE_TIMEOUT_MS,
    },
  });

  const taskId =
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

  const status = String(payload?.status || payload?.data?.status || payload?.result?.status || 'unknown').trim();

  const possibleUrl =
    payload?.video_url ||
    payload?.videoUrl ||
    payload?.url ||
    payload?.uri ||
    payload?.content?.video_url ||
    payload?.content?.videoUrl ||
    payload?.data?.video_url ||
    payload?.data?.videoUrl ||
    payload?.result?.video_url ||
    payload?.result?.videoUrl ||
    payload?.result?.url ||
    payload?.result?.uri ||
    payload?.videos?.[0]?.url ||
    payload?.videos?.[0]?.uri;

  return {
    taskId: typeof taskId === 'string' && taskId.trim() ? taskId.trim() : null,
    status,
    videoUrl: typeof possibleUrl === 'string' && possibleUrl.trim() ? possibleUrl.trim() : null,
  };
}

export async function querySeedanceVideoTask(taskId: string): Promise<SeedanceVideoTaskQueryResult> {
  const trimmedTaskId = String(taskId || '').trim();
  if (!trimmedTaskId) {
    throw new Error('任务ID不能为空');
  }

  const payload = await generateGeminiContent({
    model: SEEDANCE_MODEL,
    task: 'video_task_query',
    billing_task: 'text_gen',
    contents: {},
    config: {
      taskId: trimmedTaskId,
      timeoutMs: SEEDANCE_TIMEOUT_MS,
    },
  });

  const status = String(payload?.status || payload?.data?.status || payload?.result?.status || 'unknown').trim();

  const possibleUrl =
    payload?.content?.video_url ||
    payload?.content?.videoUrl ||
    payload?.video_url ||
    payload?.videoUrl ||
    payload?.data?.content?.video_url ||
    payload?.data?.video_url ||
    payload?.result?.content?.video_url ||
    payload?.result?.video_url ||
    payload?.videos?.[0]?.url ||
    payload?.videos?.[0]?.uri ||
    null;

  return {
    taskId: trimmedTaskId,
    status,
    videoUrl: typeof possibleUrl === 'string' && possibleUrl.trim() ? possibleUrl.trim() : null,
  };
}

async function requestTaskManagerData<T>(url: string, init: RequestInit, fallbackError: string): Promise<T> {
  const response = await fetchWithAuth(url, {
    ...init,
    credentials: 'same-origin',
  });

  if (!response) {
    throw new Error('未检测到可用登录态，请先登录后重试');
  }

  const text = await response.text();
  const parsed = parseJSONSafe(text);
  if (!response.ok || parsed?.success === false) {
    throw new Error(String(parsed?.message || parsed?.error || `${fallbackError} (HTTP ${response.status})`));
  }

  return (parsed?.data ?? parsed) as T;
}

function isInlineAssetUrl(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith('data:') || trimmed.startsWith('blob:');
}

function sanitizeTaskPayload(payload?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!payload) {
    return payload;
  }

  const sanitized: Record<string, unknown> = { ...payload };
  const keys = ['image_url', 'imageUrl', 'video_url', 'videoUrl', 'url', 'preview_url', 'previewUrl'];
  for (const key of keys) {
    const raw = sanitized[key];
    if (typeof raw === 'string' && isInlineAssetUrl(raw)) {
      delete sanitized[key];
    }
  }

  return sanitized;
}

export async function createTaskQueueItem(request: CreateTaskQueueItemRequest): Promise<TaskQueueItem> {
  const payload = sanitizeTaskPayload(request.payload);
  const data = await requestTaskManagerData<{ task?: TaskQueueItem }>(
    '/api/v1/task-manager/tasks',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...request,
        payload,
      }),
    },
    '创建任务队列项失败'
  );

  if (!data?.task || typeof data.task.id !== 'number') {
    throw new Error('创建任务队列项返回无效数据');
  }

  return data.task;
}

export async function updateTaskQueueItem(taskID: number, request: UpdateTaskQueueItemRequest): Promise<TaskQueueItem> {
  const payload = sanitizeTaskPayload(request.payload);
  const data = await requestTaskManagerData<{ task?: TaskQueueItem }>(
    `/api/v1/task-manager/tasks/${taskID}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...request,
        payload,
      }),
    },
    '更新任务队列项失败'
  );

  if (!data?.task || typeof data.task.id !== 'number') {
    throw new Error('更新任务队列项返回无效数据');
  }

  return data.task;
}

export async function queryTaskQueueVideo(taskID: number): Promise<QueryTaskQueueVideoResult> {
  const data = await requestTaskManagerData<{ task?: TaskQueueItem; query?: AnyObject }>(
    `/api/v1/task-manager/tasks/${taskID}/query-video`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    },
    '查询任务队列视频失败'
  );

  if (!data?.task || typeof data.task.id !== 'number') {
    throw new Error('查询任务队列视频返回无效任务数据');
  }

  const payload = (data.task.payload || {}) as AnyObject;
  const query = data.query || {};
  const videoUrlFromQuery = extractVideoUrlFromResponsePayload(query);
  const videoUrlFromPayload = extractVideoUrlFromResponsePayload(payload);
  const queryError = String(query?.error || payload?.query_error || '').trim() || null;

  return {
    task: data.task,
    query: {
      taskId: String(query?.taskId || query?.task_id || payload?.task_id || payload?.taskId || '').trim(),
      status: String(query?.status || payload?.query_status || 'unknown').trim(),
      videoUrl: videoUrlFromQuery || videoUrlFromPayload || null,
      error: queryError,
    },
  };
}
