import type { StyleOption, AspectRatio } from '../types';
import { generateContent, extractTextFromResponse, extractImageFromResponse } from '../../../shared_services/geminiProxyService';

export const GENERATED_IMAGE_COUNT = 2;

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

export const analyzeImageForSellingPoints = async (
  base64ImageData: string,
  mimeType: string,
): Promise<string> => {
  const imagePart = {
    inlineData: {
      data: base64ImageData,
      mimeType: mimeType,
    },
  };
  const textPart = {
    text: `请分析以下食品图片。用一段简短且有市场吸引力的中文文字（2-3句话）描述其核心的视觉卖点。请专注于能够唤起食欲的特质，例如颜色、可感知的质地、新鲜度以及整体品质。例如："这颗鲜红的苹果表皮光滑油亮，看起来爽脆多汁，让人忍不住想咬一口。它饱满无暇的外形预示着恰到好处的成熟度和天然的甜美味道。"`,
  };

  try {
    const response = await withRetry(() => generateContent({
      model: TASK_MODEL_MAP.text_gen,
      task: 'text_gen',
      contents: {
        parts: [imagePart, textPart]
      },
      retry_attempt: MAX_RETRY_ATTEMPTS,
    }));
    
    const text = extractTextFromResponse(response);
    if (text) {
      return text.trim();
    }
    throw new Error("未能从 AI 获取分析结果。");

  } catch (error) {
    console.error('分析卖点时出错:', error);
    throw new Error(
      `AI 分析失败。详情: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

const getPromptForStyle = (style: StyleOption, sellingPoints: string, customPrompt: string): string => {
  const sellingPointsInstruction = `The generated scene must visually emphasize the following product characteristics: "${sellingPoints}".`;
  const customPromptInstruction = customPrompt ? `Additionally, strictly follow this custom instruction: "${customPrompt}".` : '';

  switch (style) {
    case 'baby':
      return `Create a product scene for the provided image. The style should be clean, soft, and gentle, suitable for a high-end maternal and baby brand. Use a palette of pastel colors, soft, diffuse lighting, and a minimalist, uncluttered background. The overall feeling should be one of safety, purity, and organic quality. Do not include any people or babies in the image. ${sellingPointsInstruction} ${customPromptInstruction} Generate a unique variation.`;
    case 'natural':
      return `Generate a product scene for the provided image. The style should be natural, authentic, and premium, evoking a farm-to-table feeling. Use natural lighting, like warm sunlight. Place the product in a rustic setting, for example on a wooden surface or with natural elements like leaves or grains in the background. The aesthetic should be high-end, fresh, and organic. ${sellingPointsInstruction} ${customPromptInstruction} Generate a unique variation.`;
    case 'model':
      return `Generate a lifestyle product scene for the provided image, featuring a model interacting naturally with the product. The scene should be bright, clean, and appealing, suitable for social media or e-commerce. The model's face should be partially or fully obscured to keep the focus on the product (e.g., showing only hands, a side profile, or shot from behind). ${sellingPointsInstruction} ${customPromptInstruction} Generate a unique variation.`;
    default:
      throw new Error('提供了无效的风格选项。');
  }
};

const generateSingleImage = async (
  base64ImageData: string,
  mimeType: string,
  textPrompt: string,
  aspectRatio: AspectRatio
): Promise<string> => {
  const imagePart = {
    inlineData: {
      data: base64ImageData,
      mimeType: mimeType,
    },
  };
  const textPart = {
    text: textPrompt,
  };

  const response = await withRetry(() => generateContent({
    model: TASK_MODEL_MAP.image_gen,
    task: 'image_gen',
    contents: {
      parts: [imagePart, textPart],
    },
    config: {
      imageConfig: {
        aspectRatio: aspectRatio,
      }
    },
    retry_attempt: MAX_RETRY_ATTEMPTS,
  }));

  const imageUrl = extractImageFromResponse(response);
  if (!imageUrl) {
    throw new Error('未能从 API 响应中找到生成的图片。');
  }

  return imageUrl;
};

export const generateSceneImage = async (
  base64ImageData: string,
  mimeType: string,
  style: StyleOption,
  aspectRatio: AspectRatio,
  sellingPoints: string,
  customPrompt: string,
): Promise<string[]> => {
  const textPrompt = getPromptForStyle(style, sellingPoints, customPrompt);
  
  try {
    const imagePromises = Array.from({ length: GENERATED_IMAGE_COUNT }, () =>
      generateSingleImage(base64ImageData, mimeType, textPrompt, aspectRatio)
    );

    const results = await Promise.all(imagePromises);
    return results;

  } catch (error) {
    console.error('调用 Gemini API 时出错:', error);
    throw new Error(
      `生成图片失败。请检查您的提示和 API 密钥。详情: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

