
import { generateContent, extractImageFromResponse } from '../../../shared_services/geminiProxyService';
import { ResolutionType, AspectRatioType } from "../types";

const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 1200;
const MAX_RETRY_DELAY_MS = 7000;
const REQUEST_IMAGE_MAX_BYTES = 1_500_000;
const REQUEST_IMAGE_MAX_EDGE = 1600;
const REQUEST_IMAGE_QUALITY = 0.84;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isRetryableGenerationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return [
    '429',
    '500',
    '502',
    '503',
    '504',
    '524',
    'bad gateway',
    'timeout',
    'network',
    'all mapped keys failed',
    'temporarily',
    'fetch',
  ].some((needle) => message.includes(needle));
}

async function withRetry<T>(factory: () => Promise<T>, label: string): Promise<T> {
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
      const jitterMs = Math.floor(Math.random() * 300);
      console.warn(`[john-wig] ${label} retry ${attempt}/${MAX_RETRY_ATTEMPTS}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(exponentialMs + jitterMs);
    }
  }

  throw lastError;
}

function decodeDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
  if (!match) {
    throw new Error('invalid image data url');
  }

  return {
    mimeType: match[1] || 'image/jpeg',
    data: match[2] || '',
  };
}

function estimateBase64Bytes(base64: string): number {
  const sanitized = base64.replace(/=+$/, '');
  return Math.floor((sanitized.length * 3) / 4);
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image decode failed'));
    image.src = dataUrl;
  });
}

async function prepareImageForRequest(dataUrl: string): Promise<{ data: string; mimeType: string }> {
  const decoded = decodeDataUrl(dataUrl);
  const sourceMimeType = decoded.mimeType || 'image/jpeg';

  if (!decoded.data || estimateBase64Bytes(decoded.data) <= REQUEST_IMAGE_MAX_BYTES) {
    return {
      data: decoded.data,
      mimeType: sourceMimeType,
    };
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
      return {
        data: decoded.data,
        mimeType: sourceMimeType,
      };
    }

    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
    const compressedDataUrl = canvas.toDataURL('image/jpeg', REQUEST_IMAGE_QUALITY);
    const compressed = decodeDataUrl(compressedDataUrl);
    if (!compressed.data) {
      return {
        data: decoded.data,
        mimeType: sourceMimeType,
      };
    }

    return {
      data: compressed.data,
      mimeType: compressed.mimeType || 'image/jpeg',
    };
  } catch {
    return {
      data: decoded.data,
      mimeType: sourceMimeType,
    };
  }
}

export async function generateWigRealPerson(
  base64Image: string,
  stylePrompt: string,
  age: number,
  ethnicity: string,
  outfitPrompt: string,
  resolution: ResolutionType,
  aspectRatio: AspectRatioType,
  mimeType: string = 'image/png',
  seed?: number,
  negativePrompt: string = ''
): Promise<string | null> {
  const preparedImage = await prepareImageForRequest(base64Image);

  const prompt = `
    TASK: Image Transformation.
    INPUT: An image of a wig on a plastic mannequin head.
    MODEL CHARACTERISTICS: The model should be a ${ethnicity} woman approximately ${age} years old.
    OUTFIT: ${outfitPrompt}
    STYLE REQUIREMENTS: ${stylePrompt}
    NEGATIVE PROMPT (THINGS TO AVOID): ${negativePrompt}
    WIG PRESERVATION: You MUST keep the EXACT hair texture, volume, color, and style from the source image.
    REALISM CRITICAL: Ensure visible skin texture, pores, fine lines, and natural facial shadows. ABSOLUTELY NO heavy AI-smooth filters. The skin should look like a real person under natural light.
  `;

  try {
    const response = await withRetry(
      () => generateContent({
        model: 'gemini-3.1-flash-image-preview',
        task: 'image_gen',
        tier: 'lite',
        retry_attempt: MAX_RETRY_ATTEMPTS,
        contents: {
          parts: [
            {
              inlineData: {
                data: preparedImage.data,
                mimeType: preparedImage.mimeType || mimeType,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          seed: seed,
          imageConfig: {
            aspectRatio: aspectRatio,
            imageSize: resolution
          }
        }
      }),
      'generate-wig-real-person'
    );

    return extractImageFromResponse(response);
  } catch (error) {
    console.error("AI Generation failed:", error);
    throw error;
  }
}
