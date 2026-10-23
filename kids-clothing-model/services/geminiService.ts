import { generateContent, extractImageFromResponse } from "../../../shared_services/geminiProxyService";
import type { GeminiGenerateRequest } from "../../../shared_services/geminiProxyService";

const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 1200;
const MAX_RETRY_DELAY_MS = 6000;

export type ImageResult = {
  success: boolean;
  imageUrl?: string;
  error?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isRetryableGenerationError(error: unknown): boolean {
  const message = String((error as { message?: string } | null)?.message || '').toLowerCase();
  const name = String((error as { name?: string } | null)?.name || '').toLowerCase();

  if (name === 'aborterror') {
    return true;
  }

  return [
    'abort',
    '408',
    '429',
    '500',
    '502',
    '503',
    '504',
    '520',
    '522',
    '523',
    '524',
    'timeout',
    'gateway',
    'bad gateway',
    'upstream',
    'cloudflare',
    'network',
    'fetch',
    'temporarily',
    'service unavailable',
  ].some((needle) => message.includes(needle));
}

function normalizeGenerationError(error: unknown): string {
  const name = String((error as { name?: string } | null)?.name || '').toLowerCase();
  const message = String((error as { message?: string } | null)?.message || '').trim();

  if (name === 'aborterror' || message.toLowerCase().includes('aborted')) {
    return '请求超时，已中止。本次生成耗时过长，请稍后重试。';
  }

  return message || '未知错误';
}

async function withRetry<T>(factory: () => Promise<T>): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < MAX_RETRY_ATTEMPTS) {
    try {
      return await factory();
    } catch (error) {
      lastError = error;
      attempt += 1;

      if (attempt >= MAX_RETRY_ATTEMPTS || !isRetryableGenerationError(error)) {
        break;
      }

      const delayMs = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * (2 ** (attempt - 1)));
      await sleep(delayMs);
    }
  }

  throw lastError;
}

export async function generateModelImages(
  images: { base64: string; mimeType: string }[],
  prompt: string,
  aspectRatio: string,
  seed?: number,
  onImageUpdate?: (index: number, result: ImageResult) => void
): Promise<ImageResult[]> {
  // 在提示词中明确强调宽高比要求
  const aspectRatioEmphasisStart = `【⚠️ 强制要求 - 最高优先级】图片的宽高比必须严格为 ${aspectRatio}。这是最关键的约束条件，必须严格遵守。生成的图片必须是 ${aspectRatio} 比例，不允许有任何偏差。`;
  const aspectRatioEmphasisMiddle = `【重要提醒】请确保生成的图片宽高比严格为 ${aspectRatio}。构图、布局、画面裁剪都必须完全符合 ${aspectRatio} 的比例要求。`;
  const aspectRatioEmphasisEnd = `【最终确认 - 必须遵守】生成的图片宽高比必须严格为 ${aspectRatio}，不允许有任何偏差。如果比例不正确，图片将被视为失败。请确保构图、布局和画面裁剪完全符合 ${aspectRatio} 比例要求。`;
  const enhancedPrompt = `${aspectRatioEmphasisStart}\n\n${prompt}\n\n${aspectRatioEmphasisMiddle}\n\n${aspectRatioEmphasisEnd}`;

  // 生成4张图片，使用不同的 seed
  const baseSeed = seed || Math.floor(Math.random() * 1000000);
  const seeds = [baseSeed, baseSeed + 1, baseSeed + 2, baseSeed + 3];

  const createRequest = (seedValue: number): GeminiGenerateRequest => {
    const imageParts = images.map(image => ({
      inlineData: {
        data: image.base64,
        mimeType: image.mimeType,
      },
    }));

    return {
      model: "gemini-3.1-flash-image-preview",
      task: "image_gen",
      contents: {
        parts: [
          ...imageParts,
          { text: enhancedPrompt },
        ],
      },
      config: {
        seed: seedValue,
        imageConfig: {
          aspectRatio: aspectRatio,
        },
      },
    };
  };

  // 并行生成4张图片，每个请求独立处理错误
  const imagePromises = seeds.map(async (seedValue, index) => {
    try {
      const response = await withRetry(() => generateContent(createRequest(seedValue)));
      const imageUrl = extractImageFromResponse(response);
      
      if (!imageUrl) {
        const result = {
          success: false,
          error: `图片 ${index + 1} 生成失败：未能从响应中提取图片`,
        } as ImageResult;
        onImageUpdate?.(index, result);
        return result;
      }

      const result = {
        success: true,
        imageUrl,
      } as ImageResult;
      onImageUpdate?.(index, result);
      return result;
    } catch (error) {
      console.error(`Error generating image ${index + 1}:`, error);
      const result = {
        success: false,
        error: `图片 ${index + 1} 生成失败：${normalizeGenerationError(error)}`,
      } as ImageResult;
      onImageUpdate?.(index, result);
      return result;
    }
  });

  const results = await Promise.all(imagePromises);
  return results;
}
