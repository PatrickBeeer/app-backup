import { ImageAsset } from "../types";
import { generateContent, extractImageFromResponse } from "../../../shared_services/geminiProxyService";

interface GenerateClothingOptions {
  imageCount?: number;
  clientMaxRetries?: number;
}

export const generateClothingImage = async (
  productImage: ImageAsset,
  referenceImage: ImageAsset | null,
  additionalPrompt: string = "",
  options: GenerateClothingOptions = {}
): Promise<string[]> => {
  const imageCount = Math.max(1, options.imageCount ?? 2);

  const promptText = referenceImage 
    ? `
      任务：生成时尚大片。亚洲女性模特。
      穿着：模特必须穿着[图片1]中的服装。
      参考：姿势和光影参考[图片2]。
      风格：帅气、中性、酷感氛围。
      核心约束：产品是"束胸"（Chest Binder）。模特胸部必须完全平坦。严禁出现乳沟或胸部隆起。躯干线条笔直。
      用户指令：${additionalPrompt}
      重要提示：生成的图片宽高比必须严格为 3:4，请确保构图和布局完全符合此比例要求。
      `
    : `
      任务：生成时尚大片。亚洲女性模特。
      穿着：模特必须穿着[图片1]中的服装。
      风格：帅气、中性、酷感氛围。请严格执行"用户指令"中的风格描述。
      核心约束：产品是"束胸"（Chest Binder）。模特胸部必须完全平坦。严禁出现乳沟或胸部隆起。躯干线条笔直。
      用户指令：${additionalPrompt}
      重要提示：生成的图片宽高比必须严格为 3:4，请确保构图和布局完全符合此比例要求。
      `;

  try {
    // 移除 data URL 前缀（如果有）
    const productBase64 = productImage.base64.includes(',') ? productImage.base64.split(',')[1] : productImage.base64;

    const runGeneration = async () => {
      const parts: any[] = [
        { text: promptText },
        {
          inlineData: {
            mimeType: productImage.mimeType,
            data: productBase64,
          },
        },
      ];

      if (referenceImage) {
        const refBase64 = referenceImage.base64.includes(',') ? referenceImage.base64.split(',')[1] : referenceImage.base64;
        parts.push({
          inlineData: {
            mimeType: referenceImage.mimeType,
            data: refBase64,
          },
        });
      }

      const response = await generateContent({
        model: "gemini-3.1-flash-image-preview",
        task: "image_gen",
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: '3:4', // 固定为 3:4 比例
          },
        }
      });

      const imageUrl = extractImageFromResponse(response);
      if (!imageUrl) {
        throw new Error("响应中未找到图片数据");
      }

      return imageUrl;
    };

    // 顺序生成，避免并发请求造成排队/长尾。
    const results: string[] = [];
    for (let i = 0; i < imageCount; i++) {
      const imageUrl = await runGeneration();
      results.push(imageUrl);
    }
    return results;
  } catch (error: any) {
    console.error('生成服装图片失败:', error);
    throw error;
  }
};
