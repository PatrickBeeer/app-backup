
import { generateContent, extractImageFromResponse, extractJsonTextFromResponse, GeminiGenerateRequest } from '../../../shared_services/geminiProxyService';

const IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const MAX_ATTEMPTS = 4;
const BASE_RETRY_DELAY_MS = 1500;
const MAX_RETRY_DELAY_MS = 12000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
  return String((error as any)?.message || '');
}

function normalizeMimeType(mimeType: string | undefined): string {
  const value = String(mimeType || '').toLowerCase().trim();
  if (!value) {
    return 'image/jpeg';
  }

  if (value === 'image/jpg') {
    return 'image/jpeg';
  }

  if (value.startsWith('image/')) {
    return value;
  }

  return 'image/jpeg';
}

function withDataUrlPrefix(value: string, mimeType = 'image/png'): string {
  if (!value) {
    return value;
  }

  if (value.startsWith('data:image/')) {
    return value;
  }

  if (/^[a-zA-Z0-9+/=\s]+$/.test(value) && value.length > 128) {
    return `data:${mimeType};base64,${value.replace(/\s+/g, '')}`;
  }

  return value;
}

function extractFromObjectLike(value: any): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const directStringCandidates = [
    value.imageUrl,
    value.image_url,
    value.url,
    value.uri,
    value.fileUri,
    value.file_uri,
    value.base64,
    value.imageBase64,
    value.image_base64,
    value.data,
    value.bytes,
    value.imageBytes,
  ];

  for (const candidate of directStringCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return withDataUrlPrefix(candidate.trim());
    }
  }

  return null;
}

function extractImageUrlFromAnyShape(response: any): string | null {
  const inline = extractImageFromResponse(response);
  if (inline) {
    return inline;
  }

  const directCandidates = [
    response?.imageUrl,
    response?.image_url,
    response?.url,
    response?.uri,
    response?.data?.imageUrl,
    response?.data?.image_url,
    response?.data?.url,
    response?.data?.uri,
    response?.generatedImages?.[0]?.image?.imageBytes,
    response?.generatedImages?.[0]?.image?.bytes,
    response?.images?.[0]?.base64,
    response?.images?.[0]?.data,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return withDataUrlPrefix(candidate.trim());
    }
  }

  const parts: any[] = [];
  for (const candidate of response?.candidates || []) {
    for (const part of candidate?.content?.parts || []) {
      parts.push(part);
    }
  }

  for (const part of parts) {
    const fileUri = part?.fileData?.fileUri || part?.fileData?.uri || part?.fileData?.url;
    if (typeof fileUri === 'string' && fileUri.trim()) {
      return fileUri.trim();
    }

    const snakeFileUri = part?.file_data?.file_uri || part?.file_data?.uri || part?.file_data?.url;
    if (typeof snakeFileUri === 'string' && snakeFileUri.trim()) {
      return snakeFileUri.trim();
    }

    const snakeInline = part?.inline_data;
    if (snakeInline?.data) {
      return withDataUrlPrefix(String(snakeInline.data), snakeInline?.mimeType || snakeInline?.mime_type || 'image/png');
    }

    const functionCallArgs = part?.functionCall?.args || part?.function_call?.args;
    const fromFunctionArgs = extractFromObjectLike(functionCallArgs);
    if (fromFunctionArgs) {
      return fromFunctionArgs;
    }

    if (typeof part?.text === 'string') {
      const rawText = part.text.trim();

      if (rawText.startsWith('{') || rawText.startsWith('[')) {
        try {
          const parsedText = extractJsonTextFromResponse({
            candidates: [
              {
                content: {
                  parts: [{ text: rawText }],
                },
              },
            ],
          } as any);
          const parsed = JSON.parse(parsedText);
          const fromParsed = extractFromObjectLike(parsed);
          if (fromParsed) {
            return fromParsed;
          }
        } catch {
          // Ignore and continue to regex extraction.
        }
      }

      const dataUrlMatch = part.text.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=\s]+/);
      if (dataUrlMatch?.[0]) {
        return dataUrlMatch[0].replace(/\s+/g, '');
      }

      const markdownImageMatch = part.text.match(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/);
      if (markdownImageMatch?.[1]) {
        return markdownImageMatch[1];
      }

      const plainUrlMatch = part.text.match(/https?:\/\/\S+\.(png|jpg|jpeg|webp)(\?\S*)?/i);
      if (plainUrlMatch?.[0]) {
        return plainUrlMatch[0];
      }
    }
  }

  return null;
}

function isRetryableError(error: unknown): boolean {
  const msg = getErrorMessage(error).toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('status=429') ||
    msg.includes('bad gateway') ||
    msg.includes('status=500') ||
    msg.includes('all mapped keys failed') ||
    msg.includes('malformed_function_call') ||
    msg.includes('未能生成处理后的图片') ||
    msg.includes('no extractable image payload')
  );
}

function buildRequest(
  base64Image: string,
  mimeType: string,
  prompt: string,
  maskBase64?: string,
  options?: {
    includeImageConfig?: boolean;
    tier?: 'lite' | 'normal' | 'pro';
  }
): GeminiGenerateRequest {
  const normalizedMimeType = normalizeMimeType(mimeType);
  const parts: any[] = [
    {
      inlineData: {
        data: base64Image.split(',')[1] || base64Image,
        mimeType: normalizedMimeType,
      },
    },
  ];

  if (maskBase64) {
    parts.push({
      inlineData: {
        data: maskBase64.split(',')[1] || maskBase64,
        mimeType: 'image/png',
      },
    });
  }

  return {
    model: IMAGE_MODEL,
    task: 'image_gen',
    tier: options?.tier || 'normal',
    retry_attempt: MAX_ATTEMPTS,
    // Image-generation endpoints are more stable with parts-only content shape.
    contents: {
      parts: [{ text: prompt }, ...parts],
    },
    config:
      options?.includeImageConfig === false
        ? {}
        : {
            imageConfig: {
              aspectRatio: '1:1',
            },
          },
  };
}

class GeminiService {
  /**
   * Identifies and removes watermarks.
   * If maskBase64 is provided, it guides the model to specific regions.
   * Uses backend proxy to call Gemini, avoiding client-side API keys.
   */
  async processWatermarkRemoval(
    base64Image: string,
    mimeType: string,
    maskBase64?: string
  ): Promise<string> {
    const detailedPrompt =
      'Clean intrusive overlay artifacts in this image and reconstruct the background naturally while preserving scene geometry and texture continuity.';
    const maskedPrompt =
      'The first image is the source image and the second image is a binary mask. Edit only white masked regions to remove marked artifacts, then inpaint these regions to blend naturally with surrounding pixels.';
    const concisePrompt =
      'Edit marked overlay artifacts and inpaint background naturally.';

    const variants: Array<{
      prompt: string;
      includeMask: boolean;
      includeImageConfig: boolean;
      tier?: 'lite' | 'normal' | 'pro';
    }> = maskBase64
      ? [
          { prompt: maskedPrompt, includeMask: true, includeImageConfig: true, tier: 'normal' },
          { prompt: concisePrompt, includeMask: true, includeImageConfig: true, tier: 'normal' },
          { prompt: concisePrompt, includeMask: false, includeImageConfig: true, tier: 'normal' },
          { prompt: concisePrompt, includeMask: false, includeImageConfig: false, tier: 'lite' },
        ]
      : [
          { prompt: detailedPrompt, includeMask: false, includeImageConfig: true, tier: 'normal' },
          { prompt: concisePrompt, includeMask: false, includeImageConfig: true, tier: 'normal' },
          { prompt: concisePrompt, includeMask: false, includeImageConfig: false, tier: 'lite' },
        ];

    let lastError: unknown = null;

    for (let attempt = 0; attempt < Math.min(MAX_ATTEMPTS, variants.length); attempt++) {
      const variant = variants[attempt];
      const request = buildRequest(
        base64Image,
        mimeType,
        variant.prompt,
        variant.includeMask ? maskBase64 : undefined,
        {
          includeImageConfig: variant.includeImageConfig,
          tier: variant.tier,
        }
      );

      try {
        const response = await generateContent(request);
        const imageUrl = extractImageUrlFromAnyShape(response);
        if (imageUrl) {
          return imageUrl;
        }

        console.warn('[ai-watermark-removal] image response had no extractable image payload', {
          attempt: attempt + 1,
          topLevelKeys: Object.keys(response || {}),
          firstCandidatePartKeys: Object.keys(response?.candidates?.[0]?.content?.parts?.[0] || {}),
        });
        throw new Error('AI 未能生成处理后的图片。no extractable image payload');
      } catch (error) {
        lastError = error;
        if (!isRetryableError(error) || attempt === Math.min(MAX_ATTEMPTS, variants.length) - 1) {
          break;
        }

        const exponentialMs = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * (2 ** attempt));
        const jitterMs = Math.floor(Math.random() * 500);
        await sleep(exponentialMs + jitterMs);
      }
    }

    throw new Error(`去水印失败：${getErrorMessage(lastError) || '上游服务暂不可用，请稍后重试'}`);
  }
}

export const geminiService = new GeminiService();
