import { generateContent, extractJsonTextFromResponse, extractImageFromResponse } from '../../../shared_services/geminiProxyService';
import { ToyAnalysis, Language, ModelAge, AspectRatio } from '../types';
import { PROMPTS } from '../constants';

const MAX_RETRY_ATTEMPTS = 4;
const BASE_RETRY_DELAY_MS = 1200;
const MAX_RETRY_DELAY_MS = 10000;
const REQUEST_IMAGE_MAX_EDGE = 1400;
const REQUEST_IMAGE_MAX_BYTES = 1_500_000;
const REQUEST_IMAGE_QUALITY = 0.82;

function toSystemInstruction(text: string) {
  return {
    parts: [{ text }],
  };
}

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
    mimeType: match[1] || 'image/jpeg',
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

async function prepareImageForRequest(base64Image: string, mimeType: string): Promise<{ data: string; mimeType: string }> {
  const safeMimeType = mimeType || 'image/jpeg';
  if (!base64Image || estimateBase64Bytes(base64Image) <= REQUEST_IMAGE_MAX_BYTES) {
    return { data: base64Image, mimeType: safeMimeType };
  }

  try {
    const image = await loadImage(`data:${safeMimeType};base64,${base64Image}`);
    const maxEdge = Math.max(image.width, image.height);
    const scale = maxEdge > REQUEST_IMAGE_MAX_EDGE ? REQUEST_IMAGE_MAX_EDGE / maxEdge : 1;
    const targetWidth = Math.max(1, Math.round(image.width * scale));
    const targetHeight = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { data: base64Image, mimeType: safeMimeType };
    }

    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
    const compressedDataUrl = canvas.toDataURL('image/jpeg', REQUEST_IMAGE_QUALITY);
    const compressed = decodeDataUrl(compressedDataUrl);
    if (!compressed.data) {
      return { data: base64Image, mimeType: safeMimeType };
    }

    return { data: compressed.data, mimeType: compressed.mimeType || 'image/jpeg' };
  } catch {
    return { data: base64Image, mimeType: safeMimeType };
  }
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
    'timeout',
    'bad gateway',
    'network',
    'fetch',
    'temporarily',
    'all mapped keys failed',
    'malformed_function_call',
    '未找到图片数据',
    '未找到图片',
    'no image data',
    'response has no candidates',
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
      const jitterMs = Math.floor(Math.random() * 400);
      console.warn(`[bc-style-mother-baby] ${label} retry ${attempt}/${MAX_RETRY_ATTEMPTS}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(exponentialMs + jitterMs);
    }
  }

  throw lastError;
}

/**
 * 分析玩具图片，提取产品信息
 */
export const analyzeToyImage = async (
  base64Image: string,
  mimeType: string,
  language: Language
): Promise<ToyAnalysis> => {
  try {
    const prepared = await prepareImageForRequest(base64Image, mimeType);

    const response = await withRetry(() =>
      generateContent({
        model: 'gemini-3-flash-preview', // 图像分析（图→JSON）：原 gemini-2.0-flash-exp 在 v1beta 已不可用
        task: 'text_gen',
        contents: {
          parts: [
            {
              inlineData: {
                data: prepared.data,
                mimeType: prepared.mimeType,
              },
            },
          ],
        },
        systemInstruction: toSystemInstruction(PROMPTS[language].analysisSystemInstruction),
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              features: {
                type: 'array',
                items: { type: 'string' },
              },
              ageRange: { type: 'string' },
              category: { type: 'string' },
            },
            required: ['name', 'description', 'features', 'ageRange', 'category'],
          },
        },
        retry_attempt: MAX_RETRY_ATTEMPTS,
      }),
      'analyze-toy-image',
    );

    try {
      const parsedJson = JSON.parse(extractJsonTextFromResponse(response));
      return parsedJson as ToyAnalysis;
    } catch (e) {
      console.error('解析 JSON 响应失败:', response);
      throw new Error('分析失败：API 返回了无效的 JSON 响应。');
    }
  } catch (error: any) {
    console.error('分析玩具图片时出错:', error);
    const message = error instanceof Error ? error.message : '分析图片失败，请稍后重试。';
    throw new Error(message);
  }
};

/**
 * 生成场景图片（4张）
 */
export const generateSceneImages = async (
  analysis: ToyAnalysis,
  language: Language,
  modelAge: ModelAge,
  aspectRatio: AspectRatio,
  base64Image: string,
  mimeType: string,
  onImageGenerated?: (payload: { index: number; total: number; imageUrl: string }) => void
): Promise<string[]> => {
  try {
    const prompts = PROMPTS[language].scenePrompts(analysis, modelAge);
    const prepared = await prepareImageForRequest(base64Image, mimeType);

    const generatedImages: string[] = [];

    // Sequential generation is slower but significantly reduces upstream 524/502 under load.
    for (let index = 0; index < prompts.length; index++) {
      const prompt = prompts[index];
      const seed = Math.floor(Math.random() * 2147483647) + index;

      const strictPrompt = `【强制要求】图片宽高比必须严格为 ${aspectRatio}。\n\n${prompt}\n\n【最终确认】输出比例必须为 ${aspectRatio}。`;
      const concisePrompt = `${prompt}\n\n输出比例：${aspectRatio}。`;
      const promptVariants = [strictPrompt, concisePrompt];

      const imageUrl = await withRetry(async () => {
        let variantError: unknown;

        for (const variant of promptVariants) {
          try {
            const response = await generateContent({
              model: 'gemini-3.1-flash-image-preview',
              task: 'image_gen',
              contents: {
                parts: [
                  {
                    inlineData: {
                      data: prepared.data,
                      mimeType: prepared.mimeType,
                    },
                  },
                  {
                    text: variant,
                  },
                ],
              },
              config: {
                seed,
                imageConfig: {
                  aspectRatio,
                },
              },
              retry_attempt: MAX_RETRY_ATTEMPTS,
            });

            const extracted = extractImageFromResponse(response);
            if (extracted) {
              return extracted;
            }

            throw new Error(`生成第 ${index + 1} 张图片失败：未找到图片数据。`);
          } catch (error) {
            variantError = error;
            if (!isRetryableGenerationError(error)) {
              throw error;
            }
          }
        }

        throw variantError instanceof Error ? variantError : new Error(`生成第 ${index + 1} 张图片失败`);
      }, `image-${index + 1}`);

      generatedImages.push(imageUrl);
      onImageGenerated?.({ index, total: prompts.length, imageUrl });
    }

    return generatedImages;
  } catch (error: any) {
    console.error('生成场景图片时出错:', error);
    const message = error instanceof Error ? error.message : '生成图片失败，请稍后重试。';
    throw new Error(message);
  }
};

