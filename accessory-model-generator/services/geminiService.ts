import { generateContent, extractImageFromResponse } from '../../../shared_services/geminiProxyService';
import { AccessoryType } from '../types';

const TASK_MODEL_MAP = {
  text_gen: 'gemini-3-flash-preview',
  image_gen: 'gemini-3.1-flash-image-preview',
  video_gen: 'veo_3_1',
} as const;

const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 1200;

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
    'timeout',
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

      const waitMs = BASE_RETRY_DELAY_MS * (2 ** (attempt - 1));
      await sleep(waitMs);
    }
  }

  throw lastError;
}

/**
 * Generates a virtual try-on image using Gemini API
 */
export const generateTryOnImage = async (
  productImageBase64: string,
  productImageMimeType: string,
  modelImageBase64: string,
  modelImageMimeType: string,
  accessoryType: AccessoryType
): Promise<string> => {
  const model = TASK_MODEL_MAP.image_gen;

  const prompt = `Task: Virtual Try-On.
  Source Image: Product image containing a ${accessoryType}.
  Target Image: Model image.
  
  Action:
  1. Extract the ${accessoryType} from the Source Image.
  2. Wear/Place the extracted ${accessoryType} onto the model in the Target Image.
  3. CRITICAL: Keep the product design, color, and texture exactly the same as the Source Image.
  4. Ensure realistic lighting, shadows, and perspective matching.
  5. View: Natural frontal view. This is the main showcase image.
  6. Quality: 生成一张高分辨率、照片般逼真的虚拟试戴效果图。`;

  const productImagePart = {
    inlineData: {
      mimeType: productImageMimeType,
      data: productImageBase64,
    },
  };

  const modelImagePart = {
    inlineData: {
      mimeType: modelImageMimeType,
      data: modelImageBase64,
    },
  };

  try {
    const response = await withRetry(() => generateContent({
      model,
      task: 'image_gen',
      contents: {
        parts: [
          { text: prompt },
          productImagePart,
          modelImagePart,
        ],
      },
      config: {},
      retry_attempt: MAX_RETRY_ATTEMPTS,
    }));
    
    // 1. 优先查找是否有图片数据
    const imageUrl = extractImageFromResponse(response);
    if (imageUrl) {
      return imageUrl;
    }

    // 2. 如果没有图片，检查是否有文本（可能是拒绝理由）
    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      const textPart = candidate.content.parts.find((p: any) => p.text);
      if (textPart && textPart.text) {
        console.warn("Model returned text instead of image:", textPart.text);
        throw new Error(`模型无法生成图片，回复内容: ${textPart.text}`);
      }
    }

    throw new Error('模型未返回任何图片或有效信息。这可能是由于触发了安全过滤器。');

  } catch (error: any) {
    console.error("Error calling Gemini API:", error);
    // 提取更详细的错误信息
    const errorMessage = error.message || "未知错误";
    
    if (errorMessage.includes("413") || errorMessage.includes("Payload Too Large")) {
      throw new Error("图片体积过大，请尝试上传更小的图片。");
    }
    
    throw new Error(`生成失败: ${errorMessage}`);
  }
};

