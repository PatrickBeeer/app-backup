import { generateContent, extractImageFromResponse } from "../../../shared_services/geminiProxyService";
import type { UploadedImage } from '../types';

export type ImageResult = {
  success: boolean;
  imageUrl?: string;
  error?: string;
};

const generateSingleImage = async (
  image: UploadedImage,
  prompt: string,
  aspectRatio: string,
  seed: number,
  styleReferenceImage: UploadedImage | null
): Promise<ImageResult> => {
  const maxAttempts = 3;
  let lastError = '生成图片失败';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // 在提示词中明确强调宽高比要求
      const aspectRatioEmphasisStart = `【⚠️ 强制要求 - 最高优先级】图片的宽高比必须严格为 ${aspectRatio}。这是最关键的约束条件，必须严格遵守。生成的图片必须是 ${aspectRatio} 比例，不允许有任何偏差。`;
      const aspectRatioEmphasisMiddle = `【重要提醒】请确保生成的图片宽高比严格为 ${aspectRatio}。构图、布局、画面裁剪都必须完全符合 ${aspectRatio} 的比例要求。`;
      const aspectRatioEmphasisEnd = `【最终确认 - 必须遵守】生成的图片宽高比必须严格为 ${aspectRatio}，不允许有任何偏差。如果比例不正确，图片将被视为失败。请确保构图、布局和画面裁剪完全符合 ${aspectRatio} 比例要求。`;
      const retryHint = attempt > 0 ? `\n\n【重试补充】这是第 ${attempt + 1} 次生成，请只输出图片，不要返回解释文本。` : '';
      const enhancedPrompt = `${aspectRatioEmphasisStart}\n\n${prompt}\n\n${aspectRatioEmphasisMiddle}\n\n${aspectRatioEmphasisEnd}${retryHint}`;

      const textPart = { text: enhancedPrompt };
      const productPart = {
        inlineData: {
          data: image.base64.split(',')[1],
          mimeType: image.mimeType
        }
      };

      const parts: any[] = [];
      if (styleReferenceImage) {
        parts.push({
          inlineData: {
            data: styleReferenceImage.base64.split(',')[1],
            mimeType: styleReferenceImage.mimeType,
          }
        });
      }
      parts.push(productPart);
      parts.push(textPart);

      const response = await generateContent({
        model: "gemini-3.1-flash-image-preview",
        task: 'image_gen',
        contents: {
          parts
        },
        config: {
          seed: seed + attempt,
          imageConfig: {
            aspectRatio: aspectRatio,
          },
        },
      });

      const imageUrl = extractImageFromResponse(response);
      if (imageUrl) {
        return {
          success: true,
          imageUrl,
        };
      }

      lastError = '未能从响应中提取图片';
      console.warn(`[women-bag-scene-model] attempt ${attempt + 1}/${maxAttempts} returned no image`);
    } catch (error) {
      lastError = error instanceof Error ? error.message : '生成图片失败';
      console.warn(`[women-bag-scene-model] attempt ${attempt + 1}/${maxAttempts} failed:`, lastError);
    }
  }

  return {
    success: false,
    error: lastError,
  };
};

export const generateModelImages = async (
  image: UploadedImage,
  scenePrompt: string,
  modelStylePrompt: string,
  ethnicityPrompt: string,
  aspectRatio: string,
  seed: number,
  photographyStyle: string,
  customPrompt: string,
  styleReferenceImage: UploadedImage | null
): Promise<ImageResult[]> => {
  let basePrompt: string;

  if (photographyStyle === 'still_life') {
    basePrompt = `Create a high-quality, photorealistic e-commerce still life photograph. The subject is the product provided in the image. The setting is ${scenePrompt}.

Crucial instructions:
- The product from the original image must be preserved *exactly*. Do not alter its shape, color, texture, details, or branding.
- The product should be placed elegantly in the scene, potentially with subtle, non-distracting props that match the scene's aesthetic.
- The final image must be clean, professional, and well-lit.
- The focus should be solely on the product.`;
  } else { // 'model' photography
    const subjectDescription = modelStylePrompt.replace('a model', ethnicityPrompt);
    
    basePrompt = `Create a high-quality, photorealistic e-commerce photograph of a model holding the product provided in the image.

**Setting:** ${scenePrompt}.
**Model Style:** ${subjectDescription}.

**Crucial Instructions:**
- The product from the product image must be preserved *exactly*. Do not alter its shape, color, texture, details, or branding.
- The model should be holding the bag naturally.
- The final image must be clean, professional, and well-lit, with the focus on the product.`;
  }

  if (styleReferenceImage) {
    basePrompt += `\n- **Style Reference:** The generated image's overall style, mood, lighting, and composition MUST be heavily inspired by the *first* provided image (the style reference). The *second* image is the product. This is a strict requirement.`;
  }
  if (customPrompt) {
    basePrompt += `\n- **Core Instructions:** Adhere strictly to these user-provided instructions: "${customPrompt}".`;
  }
  
  const prompt1 = basePrompt;
  const prompt2 = `${basePrompt}\n- **Variation:** Generate a variation with a different pose or a slightly different camera angle.`;

  // 并行生成2张图片，每个请求独立处理错误
  const [result1, result2] = await Promise.all([
    generateSingleImage(image, prompt1, aspectRatio, seed, styleReferenceImage),
    generateSingleImage(image, prompt2, aspectRatio, seed + 1, styleReferenceImage)
  ]);

  return [result1, result2];
};

