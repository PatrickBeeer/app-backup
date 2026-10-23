import { config } from './config';

export const DEFAULT_SEEDREAM_REPLACE_PROMPT = '将图1中的人物替换成图2中的人物。场景、光线、人物动作、表情、眼神、拿着的物品与图1一致；人物长相、服饰穿着、体型和与图2一致；人物相貌必须与图2高度一致';

type SeedreamResponse = {
  created?: number;
  data?: Array<{
    url?: string;
    b64_json?: string;
  }>;
  error?: {
    message?: string;
  };
};

function authHeaders(): HeadersInit {
  if (!config.tokendanceApiKey) {
    throw new Error('TOKENDANCE_KEY is not configured for the video-clone BFF.');
  }

  return {
    Authorization: `Bearer ${config.tokendanceApiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function requestSeedream<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${config.tokendanceBaseUrl}${path}`, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(init?.headers || {}),
    },
  });

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const text = await response.text();
  let payload: any = {};
  if (text) {
    if (contentType.includes('application/json')) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { error: { message: text } };
      }
    } else {
      payload = { error: { message: text } };
    }
  }

  if (!response.ok) {
    const message = String(payload?.error?.message || payload?.message || `HTTP ${response.status}`).trim();
    throw new Error(message || `Seedream request failed (${response.status})`);
  }

  return payload as T;
}

function toDataUriFromB64(base64: string): string {
  return `data:image/png;base64,${String(base64 || '').trim()}`;
}

export async function generateSubjectReplacedFrame(input: {
  frameImage: string;
  referenceImage: string;
  prompt?: string;
  size?: string;
}): Promise<string> {
  const payload = await requestSeedream<SeedreamResponse>('/gateway/ark/v3/images/generations', {
    method: 'POST',
    body: JSON.stringify({
      model: config.tokendanceModel,
      prompt: String(input.prompt || DEFAULT_SEEDREAM_REPLACE_PROMPT).trim() || DEFAULT_SEEDREAM_REPLACE_PROMPT,
      image: [input.frameImage, input.referenceImage],
      size: String(input.size || '1.5K').trim() || '1.5K',
      output_format: 'png',
      response_format: 'url',
      watermark: false,
    }),
  });

  const firstImage = Array.isArray(payload?.data) ? payload.data[0] : null;
  const imageUrl = String(firstImage?.url || '').trim();
  if (imageUrl) {
    return imageUrl;
  }

  const b64 = String(firstImage?.b64_json || '').trim();
  if (b64) {
    return toDataUriFromB64(b64);
  }

  throw new Error(String(payload?.error?.message || 'Seedream did not return an image.').trim() || 'Seedream did not return an image.');
}
