import { generateContent, extractImageBase64FromResponse } from "../../../shared_services/geminiProxyService";

export async function generate3DModel(
  base64ImageData: string,
  mimeType: string,
  clothingType: string,
  templatePrompt: string
): Promise<string | null> {
  const prompt = `Generate a photorealistic 3D product photograph of this ${clothingType} from the provided flat-lay image. The final image should feature the clothing item perfectly shaped as if worn by an invisible mannequin, giving it form and volume. Apply the following style: ${templatePrompt}. The background must be a clean, solid, light gray studio background. Do not include any text or watermarks.`;

  try {
    // 移除 data URL 前缀（如果有）
    const imageBase64 = base64ImageData.includes(',') ? base64ImageData.split(',')[1] : base64ImageData;

    const imagePart = {
      inlineData: {
        data: imageBase64,
        mimeType: mimeType,
      },
    };

    const textPart = {
      text: prompt,
    };
    
    const response = await generateContent({
      model: 'gemini-3.1-flash-image-preview',
      task: 'image_gen',
      contents: {
        parts: [imagePart, textPart],
      },
    });

    const imageBase64Result = extractImageBase64FromResponse(response);
    return imageBase64Result || null;
  } catch (error: any) {
    console.error('生成3D模型失败:', error);
    throw error;
  }
}
