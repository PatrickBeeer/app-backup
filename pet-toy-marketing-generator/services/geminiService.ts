import { generateContent } from '../../../shared_services/geminiProxyService';
import { cacheGeneratedAsset } from '../../../shared_services/localGeneratedAssetCache';
import { AspectRatio } from '../types';

function normalizeBase64(data: string): string {
  let clean = String(data || '').trim();
  clean = clean.replace(/^data:[^,]+,/, '');
  clean = clean.replace(/\s+/g, '');
  clean = clean.replace(/-/g, '+').replace(/_/g, '/');

  const mod = clean.length % 4;
  if (mod > 0) {
    clean += '='.repeat(4 - mod);
  }

  return clean;
}

function detectImageMimeType(base64: string): string {
  const head = base64.slice(0, 16);
  if (head.startsWith('iVBORw0KGgo')) return 'image/png';
  if (head.startsWith('/9j/')) return 'image/jpeg';
  if (head.startsWith('R0lGOD')) return 'image/gif';
  if (head.startsWith('UklGR')) return 'image/webp';
  return 'image/png';
}

function looksLikeBase64Image(raw: string): boolean {
  const normalized = normalizeBase64(raw);
  const head = normalized.slice(0, 16);
  if (
    head.startsWith('iVBORw0KGgo') ||
    head.startsWith('/9j/') ||
    head.startsWith('R0lGOD') ||
    head.startsWith('UklGR')
  ) {
    return true;
  }

  if (normalized.length < 256) {
    return false;
  }

  return /^[A-Za-z0-9+/=]+$/.test(normalized);
}

function toImageSrc(raw: string, mimeType?: string): string {
  const value = String(raw || '').trim();

  if (!value) {
    return '';
  }

  if (/^data:image\//i.test(value) || /^https?:\/\//i.test(value)) {
    return value;
  }

  const normalized = normalizeBase64(value);
  const isBase64Image = looksLikeBase64Image(value);
  if (!isBase64Image && value.startsWith('/')) {
    return value;
  }
  const finalMimeType = /^image\//.test(String(mimeType || '').trim())
    ? String(mimeType).trim()
    : detectImageMimeType(normalized);

  return `data:${finalMimeType};base64,${normalized}`;
}

function extractBestImageSrc(response: any): string | null {
  if (!response?.candidates?.length) {
    return null;
  }

  let best: { src: string; score: number } | null = null;

  for (const candidate of response.candidates) {
    for (const part of candidate?.content?.parts || []) {
      const inlineData = part?.inlineData;
      if (inlineData?.data) {
        const src = toImageSrc(inlineData.data, inlineData.mimeType);
        const score = String(inlineData.data).length;
        if (src && (!best || score > best.score)) {
          best = { src, score };
        }
        continue;
      }

      if (typeof part?.text === 'string') {
        const src = toImageSrc(part.text);
        if (/^data:image\//i.test(src) || /^https?:\/\//i.test(src)) {
          const score = part.text.length;
          if (!best || score > best.score) {
            best = { src, score };
          }
        }
      }
    }
  }

  return best?.src || null;
}

export async function generateImage(
  base64ImageData: string,
  mimeType: string,
  prompt: string,
  aspectRatio: AspectRatio,
  seed?: number
): Promise<string> {
  try {
    const config: any = {
      imageConfig: {
        aspectRatio: aspectRatio,
      },
    };

    if (seed !== undefined) {
      config.seed = seed;
    }

    const response = await generateContent({
      model: 'gemini-3.1-flash-image-preview',
      task: 'image_gen',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64ImageData,
              mimeType: mimeType,
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: config,
    });

    const imageSrc = extractBestImageSrc(response);
    if (!imageSrc) {
      throw new Error("No image data found in the response");
    }

    cacheGeneratedAsset({ appId: 'pet-toy-marketing-generator', source: imageSrc, provider: 'gemini-3.1-flash-image-preview' });
    return imageSrc;
  } catch (error) {
    console.error("Gemini API call failed:", error);
    throw new Error("Failed to generate image with Gemini API.");
  }
}
