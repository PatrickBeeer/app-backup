import { ModelSettings, ClothingSettings, SceneSettings } from "../types";
import { generateContent, extractImageFromResponse } from "../../../shared_services/geminiProxyService";

const cleanBase64 = (b64: string) => {
  return b64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
};

const getMimeType = (b64: string) => {
  const match = b64.match(/^data:image\/(png|jpeg|jpg|webp);base64,/);
  return match ? `image/${match[1]}` : 'image/jpeg';
};

export const generateFashionImage = async (
  model: ModelSettings,
  clothing: ClothingSettings,
  scene: SceneSettings,
  masterPrompt: string
): Promise<string[]> => {
  const modelName = 'gemini-3.1-flash-image-preview';

  const parts: any[] = [];

  // 添加服装图片
  clothing.garmentImages.forEach((image) => {
    if (image) {
      parts.push({
        inlineData: {
          mimeType: getMimeType(image),
          data: cleanBase64(image)
        }
      });
    }
  });

  // 添加面部参考图（如果有）
  if (model.faceReferenceImage) {
    parts.push({
      inlineData: {
        mimeType: getMimeType(model.faceReferenceImage),
        data: cleanBase64(model.faceReferenceImage)
      }
    });
  }

  // 在提示词中明确强调宽高比要求
  const enhancedPrompt = `${masterPrompt}\n\n重要提示：生成的图片宽高比必须严格为 ${scene.aspectRatio}，请确保构图和布局完全符合此比例要求。`;
  
  // 添加提示词
  parts.push({ text: enhancedPrompt });

  const generateSingleImage = async (seed: number): Promise<string> => {
    const response = await generateContent({
      model: modelName,
      task: 'image_gen',
      contents: { parts },
      config: {
        seed: seed,
        imageConfig: {
          aspectRatio: scene.aspectRatio,
        },
      }
    });

    const imageUrl = extractImageFromResponse(response);
    if (!imageUrl) {
      throw new Error("生成失败，未能获取图片数据。");
    }

    return imageUrl;
  };

  try {
    // 生成两张图片
    const [imageUrl1, imageUrl2] = await Promise.all([
      generateSingleImage(scene.seed),
      generateSingleImage(scene.seed + 1) // 使用不同的种子以获得变化
    ]);
    return [imageUrl1, imageUrl2];
  } catch (error) {
    console.error("Gemini Image Generation Error:", error);
    throw error;
  }
};

