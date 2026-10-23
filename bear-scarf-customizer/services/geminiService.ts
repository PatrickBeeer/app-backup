import { generateContent, extractImageFromResponse } from '../../../shared_services/geminiProxyService';
import { GenerationScenario } from '../types';
import { PROMPTS, NUM_IMAGES_TO_GENERATE } from '../constants';

interface ImageGenerationOptions {
  prompt: string;
  imageFile: File;
  aspectRatio?: string;
  imageSize?: string;
  seed?: number;
}

const cleanBase64 = (b64: string) => {
  return b64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
};

const getMimeType = (file: File): string => {
  return file.type || 'image/jpeg';
};

export async function generateImageWithGemini({
  prompt,
  imageFile,
  aspectRatio = '1:1',
  imageSize = '1K',
  seed,
}: ImageGenerationOptions): Promise<string> {
  try {
    const base64ImageData = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(cleanBase64(reader.result));
        } else {
          reject(new Error('Failed to convert file to base64.'));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(imageFile);
    });

    const mimeType = getMimeType(imageFile);

    // gemini-3.1-flash-image-preview uses imageConfig.aspectRatio.
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

    const imageUrl = extractImageFromResponse(response);
    if (!imageUrl) {
      throw new Error('模型响应中未找到图片数据。');
    }

    return imageUrl;
  } catch (error: any) {
    console.error('生成图片时出错:', error);
    throw new Error(`生成图片失败: ${error.message || '未知错误'}`);
  }
}

export async function generateImages(
  imageFile: File,
  scenario: GenerationScenario,
  aspectRatio: string,
  customPrompt?: string
): Promise<string[]> {
  let basePrompt = PROMPTS[scenario];
  
  if (scenario === GenerationScenario.CUSTOM && customPrompt) {
    basePrompt = customPrompt.trim();
  }

  const getRandomSeed = () => Math.floor(Math.random() * 100000);

  const generationPromises = Array(NUM_IMAGES_TO_GENERATE).fill(0).map((_, index) =>
    generateImageWithGemini({
      prompt: basePrompt + (scenario !== GenerationScenario.CUSTOM ? ` (第${index + 1}张)` : ''),
      imageFile: imageFile,
      aspectRatio: aspectRatio,
      // 注意：gemini-3.1-flash-image-preview 不支持 imageSize，因此不传递此参数
      seed: getRandomSeed(),
    })
  );

  try {
    const results = await Promise.all(generationPromises);
    return results;
  } catch (error: any) {
    console.error('生成图片失败:', error);
    throw error;
  }
}

