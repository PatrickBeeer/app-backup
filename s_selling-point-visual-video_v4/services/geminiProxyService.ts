export type GeminiGenerateRequest = {
  model: string;
  task: string;
  billing_task?: string;
  contents?: unknown;
  config?: Record<string, unknown>;
  systemInstruction?: unknown;
};

const TEXT_MODELS = new Set(['gemini-3-flash-preview', 'gemini-3.1-pro-preview']);
const IMAGE_MODELS = new Set(['gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview']);

type RuntimeConfig = {
  baseUrl: string;
  apiKey: string;
};

function getRuntimeConfig(model: string, task: string): RuntimeConfig {
  const env = (import.meta as any).env || {};
  const isImageRequest = IMAGE_MODELS.has(model) || task === 'image_gen';
  const baseUrl = String(
    isImageRequest ? env.VITE_LLM_IMAGE_BASE_URL : env.VITE_LLM_TEXT_BASE_URL,
  ).replace(/\/+$/, '');
  const apiKey = String(isImageRequest ? env.VITE_LLM_IMAGE_API_KEY : env.VITE_LLM_TEXT_API_KEY);

  if (!baseUrl || baseUrl === 'undefined' || !apiKey || apiKey === 'undefined') {
    throw new Error(`${isImageRequest ? 'Image' : 'Text'} model API config is missing.`);
  }

  return { baseUrl, apiKey };
}

function normalizeContents(contents: unknown): Array<Record<string, unknown>> {
  const value = contents as any;
  if (Array.isArray(value)) {
    return value;
  }
  if (Array.isArray(value?.contents)) {
    return value.contents;
  }
  if (Array.isArray(value?.parts)) {
    return [{ role: 'user', parts: value.parts }];
  }
  if (value?.text) {
    return [{ role: 'user', parts: [{ text: String(value.text) }] }];
  }
  return [{ role: 'user', parts: [{ text: String(contents ?? '') }] }];
}

function buildGeminiBody(request: GeminiGenerateRequest): Record<string, unknown> {
  const isImageRequest = IMAGE_MODELS.has(request.model) || request.task === 'image_gen';
  const generationConfig = { ...(request.config || {}) };
  const imageConfig = (generationConfig as any).imageConfig;
  delete (generationConfig as any).timeoutMs;
  delete (generationConfig as any).submitOnly;
  delete (generationConfig as any).imageConfig;

  if (isImageRequest) {
    (generationConfig as any).responseModalities = (generationConfig as any).responseModalities || ['TEXT', 'IMAGE'];
    if (imageConfig?.aspectRatio) {
      (generationConfig as any).aspectRatio = imageConfig.aspectRatio;
    }
  }

  return {
    contents: normalizeContents(request.contents),
    ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
    ...(request.systemInstruction ? { systemInstruction: request.systemInstruction } : {}),
  };
}

async function postGenerateContent(url: string, apiKey: string, body: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const parsed = text ? tryParseJson(text) : {};
  if (!response.ok) {
    const message =
      (parsed as any)?.error?.message ||
      (parsed as any)?.message ||
      text ||
      `HTTP ${response.status}`;
    throw new Error(`LLM API request failed: ${message}`);
  }
  return parsed;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function generateContent(request: GeminiGenerateRequest): Promise<unknown> {
  const { baseUrl, apiKey } = getRuntimeConfig(request.model, request.task);
  const encodedModel = encodeURIComponent(request.model);
  const body = buildGeminiBody(request);
  const urls = [
    `${baseUrl}/v1beta/models/${encodedModel}:generateContent?key=${encodeURIComponent(apiKey)}`,
    `${baseUrl}/v1/models/${encodedModel}:generateContent?key=${encodeURIComponent(apiKey)}`,
  ];

  let lastError: unknown;
  for (const url of urls) {
    try {
      return await postGenerateContent(url, apiKey, body);
    } catch (error) {
      lastError = error;
      const message = String((error as any)?.message || '');
      if (!message.includes('404') && !message.toLowerCase().includes('not found')) {
        break;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('LLM API request failed.');
}

export function extractImageFromResponse(response: unknown): string | null {
  const data = response as any;
  const direct = data?.imageUrl || data?.image_url || data?.url || data?.data?.imageUrl;
  if (direct) {
    return direct;
  }

  const parts = data?.candidates?.[0]?.content?.parts || data?.content?.parts || data?.parts || [];
  for (const part of parts) {
    const inlineData = part?.inlineData || part?.inline_data;
    const rawData = inlineData?.data;
    if (rawData) {
      const mimeType = inlineData?.mimeType || inlineData?.mime_type || 'image/png';
      return String(rawData).startsWith('data:')
        ? String(rawData)
        : `data:${mimeType};base64,${rawData}`;
    }

    const fileData = part?.fileData || part?.file_data;
    if (fileData?.fileUri || fileData?.file_uri) {
      return fileData.fileUri || fileData.file_uri;
    }
  }

  return null;
}

export function extractJsonTextFromResponse(response: unknown): string {
  const text = extractTextFromResponse(response).trim();
  if (!text) {
    return JSON.stringify(response ?? {});
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) {
    return fenced;
  }
  const start = text.search(/[\[{]/);
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }
  return text;
}

export function extractTextFromResponse(response: unknown): string {
  if (typeof response === 'string') {
    return response;
  }
  const data = response as any;
  const direct = data?.text || data?.content || data?.data?.text;
  if (direct) {
    return String(direct);
  }

  const parts = data?.candidates?.[0]?.content?.parts || data?.content?.parts || data?.parts || [];
  return parts
    .map((part: any) => part?.text || '')
    .filter(Boolean)
    .join('\n');
}

export async function uploadAssetToCOSWithPresignedURL(
  blob: Blob,
  options: { fileName?: string; objectPath?: string; appID?: string; camAppID?: string },
): Promise<Record<string, string>> {
  const url = URL.createObjectURL(blob);
  return {
    url,
    public_url: url,
    signed_url: url,
    object_key: `${options.objectPath || 'standalone-preview'}/${options.fileName || 'asset'}`,
    bucket_name: 'standalone-preview',
    region: 'local',
  };
}
