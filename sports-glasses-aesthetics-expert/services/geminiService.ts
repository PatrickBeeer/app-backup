import { generateContent, extractImageFromResponse } from '../../../shared_services/geminiProxyService';
import { UploadedImage, AspectRatio } from '../types';

/**
 * 生成风格化图片
 * @param uploadedImages 上传的图片数组（base64）
 * @param prompt 文本提示词
 * @param aspectRatio 图片比例
 * @param seed 随机种子
 * @returns 生成的图片 data URL
 */
export const generateStyledImage = async (
  uploadedImages: UploadedImage[],
  prompt: string,
  aspectRatio: AspectRatio,
  seed: number,
): Promise<string> => {
  try {
    const imageParts = uploadedImages.map(image => ({
      inlineData: {
        data: image.base64,
        mimeType: image.mimeType,
      },
    }));

    // 在提示词中明确强调宽高比要求
    const enhancedPrompt = `${prompt}\n\n重要提示：生成的图片宽高比必须严格为 ${aspectRatio}，请确保构图和布局完全符合此比例要求。`;

    const response = await generateContent({
      model: 'gemini-3.1-flash-image-preview',
      task: 'image_gen',
      contents: {
        parts: [
          ...imageParts,
          {
            text: enhancedPrompt,
          },
        ],
      },
      config: {
        seed: seed,
        imageConfig: {
          aspectRatio: aspectRatio,
          imageSize: '2K',
        },
      },
    });

    const imageUrl = extractImageFromResponse(response);
    if (!imageUrl) {
      throw new Error('API 响应中未找到图像数据');
    }

    return imageUrl;
  } catch (error: any) {
    console.error('调用 Gemini API 时出错:', error);
    const message = error instanceof Error ? error.message : '生成图片失败。请检查网络或重试。';
    throw new Error(message);
  }
};
