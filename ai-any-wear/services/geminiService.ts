
import { generateContent } from '../../../shared_services/geminiProxyService';
import { AspectRatio, GeneratedImage, ProductImageInfo, Gender } from '../types';
import { DEFAULT_WEARING_PROMPT } from '../constants';

const TASK_MODEL_MAP = {
  text_gen: 'gemini-3-flash-preview',
  image_gen: 'gemini-3.1-flash-image-preview',
  video_gen: 'veo_3_1',
} as const;

const MAX_RETRY_ATTEMPTS = 5;
const BASE_RETRY_DELAY_MS = 1500;
const MAX_RETRY_DELAY_MS = 12000;
const REQUEST_IMAGE_MAX_EDGE = 1400;
const REQUEST_IMAGE_QUALITY = 0.8;
const REQUEST_IMAGE_MAX_BYTES = 1_000_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function estimateBase64Bytes(base64: string): number {
  const sanitized = base64.replace(/=+$/, '');
  return Math.floor((sanitized.length * 3) / 4);
}

function decodeDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
  if (!match) {
    throw new Error('invalid image data url');
  }

  return {
    mimeType: match[1] || 'image/png',
    data: match[2] || '',
  };
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image decode failed'));
    image.src = dataUrl;
  });
}

async function compressImageDataUrl(dataUrl: string): Promise<{ mimeType: string; data: string }> {
  const original = decodeDataUrl(dataUrl);
  if (!original.data) {
    return original;
  }

  if (estimateBase64Bytes(original.data) <= REQUEST_IMAGE_MAX_BYTES) {
    return original;
  }

  try {
    const image = await loadImage(dataUrl);
    const maxEdge = Math.max(image.width, image.height);
    const scale = maxEdge > REQUEST_IMAGE_MAX_EDGE ? REQUEST_IMAGE_MAX_EDGE / maxEdge : 1;
    const targetWidth = Math.max(1, Math.round(image.width * scale));
    const targetHeight = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return original;
    }

    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    const compressedDataUrl = canvas.toDataURL('image/jpeg', REQUEST_IMAGE_QUALITY);
    const compressed = decodeDataUrl(compressedDataUrl);
    if (!compressed.data) {
      return original;
    }

    return compressed;
  } catch {
    return original;
  }
}

function isRetryableGenerationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return [
    '408',
    '429',
    '500',
    '520',
    '522',
    '523',
    '524',
    '502',
    '503',
    '504',
    'timeout',
    'gateway',
    'upstream',
    'cloudflare',
    'all mapped keys failed',
    'network',
    'fetch',
    'temporarily',
  ].some((needle) => message.includes(needle));
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

      const exponentialMs = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * (2 ** (attempt - 1)));
      const jitterFactor = 0.85 + Math.random() * 0.3;
      const waitMs = Math.round(exponentialMs * jitterFactor);
      await sleep(waitMs);
    }
  }

  throw lastError;
}

interface GenerateCombinedWearingImageOptions {
  prompt?: string;
  productImageInfos: ProductImageInfo[];
  aspectRatio: AspectRatio;
  gender: Gender;
}

export async function generateCombinedWearingImage(
  options: GenerateCombinedWearingImageOptions
): Promise<GeneratedImage[]> {
  const { prompt, productImageInfos, aspectRatio, gender } = options;

  const contentParts: any[] = [];

  // Downscale oversized images before request to reduce upstream timeout risk.
  const preparedImages = await Promise.all(
    productImageInfos.map(async (imgInfo) => compressImageDataUrl(imgInfo.base64))
  );

  preparedImages.forEach((prepared) => {
    contentParts.push({
      inlineData: {
        mimeType: prepared.mimeType,
        data: prepared.data,
      },
    });
  });

  // Craft the prompt
  let dynamicPrompt = `根据提供的所有商品图片，生成一张真人穿戴图。请确保模特同时穿戴并展示所有这些商品。`;

  if (gender !== Gender.UNSPECIFIED) {
    dynamicPrompt += `模特是一位${gender}。`;
  }

  if (prompt && prompt.trim()) {
    dynamicPrompt += `具体要求：${prompt}`;
  } else {
    dynamicPrompt += DEFAULT_WEARING_PROMPT;
  }

  contentParts.push({ text: dynamicPrompt });

  try {
    const response = await withRetry(() => generateContent({
      model: TASK_MODEL_MAP.image_gen,
      task: 'image_gen',
      contents: {
        parts: contentParts,
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio,
          imageSize: '1K',
        },
      },
      retry_attempt: MAX_RETRY_ATTEMPTS,
    }));

    const generatedImages: GeneratedImage[] = [];

    // The Gemini-3-pro-image-preview model can return multiple image parts
    // within a single candidate's content. Iterate through all to collect.
    if (response.candidates && response.candidates.length > 0) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          const base64EncodedString: string = part.inlineData.data;
          generatedImages.push({
            url: `data:${part.inlineData.mimeType};base64,${base64EncodedString}`,
            alt: `生成的穿戴图 - ${prompt || DEFAULT_WEARING_PROMPT}`,
          });
        }
      }
    }
    
    if (generatedImages.length === 0) {
      throw new Error("模型未能生成图片。请尝试更改提示词或稍后再试。");
    }

    return generatedImages;
  } catch (error: any) {
    console.error('Gemini API 调用失败:', error);
    throw new Error(`生成图片失败（已自动重试 ${MAX_RETRY_ATTEMPTS} 次）: ${error.message || '未知错误'}`);
  }
}

// Function to convert Blob to base64 for video streaming (if needed in the future)
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}