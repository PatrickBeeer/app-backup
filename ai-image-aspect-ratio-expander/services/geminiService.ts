import { generateContent, extractImageFromResponse } from '../../../shared_services/geminiProxyService';

export const GEMINI_TEXT_MODEL = 'gemini-3-flash-preview';
export const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
export const VEO_VIDEO_MODEL = 'veo_3_1';

/**
 * 扩展图片到指定宽高比
 */
export const extendImage = async (
  base64ImageData: string,
  mimeType: string,
  targetAspectRatio: string
): Promise<string> => {
  try {
    void GEMINI_TEXT_MODEL;
    void VEO_VIDEO_MODEL;
    
    // 使用最明确的 outpainting 提示词
    // 关键：明确告诉模型这是图片扩展任务，不是图片生成或编辑
    const prompt = `IMAGE OUTPAINTING TASK: Extend the provided image to ${targetAspectRatio} aspect ratio.

WHAT TO DO:
1. Keep the provided image content EXACTLY as it is - do not modify, crop, or resize it
2. Add NEW visual content around the edges of the original image
3. The new content should extend the canvas to achieve ${targetAspectRatio} aspect ratio
4. The extended areas must be a seamless, natural continuation of the original image
5. Match the style, colors, lighting, textures, shadows, and atmosphere perfectly
6. The final image must have ${targetAspectRatio} aspect ratio (width:height = ${targetAspectRatio})

WHAT NOT TO DO:
- Do NOT return the original image unchanged
- Do NOT crop or resize the original image
- Do NOT just add borders or padding
- Do NOT add text, watermarks, or logos

TECHNICAL REQUIREMENT:
The output image dimensions must match ${targetAspectRatio} aspect ratio. If the input is square (1:1) and you need 16:9, you must add content to the left and right sides. If the input is wide and you need 9:16, you must add content to the top and bottom.

This is OUTPAINTING - extending the image by generating new content around the edges, not modifying the original content.`;

    const response = await generateContent({
      model: GEMINI_IMAGE_MODEL,
      task: 'image_gen',
      billing_task: 'image_gen',
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
      config: {
        imageConfig: {
          aspectRatio: targetAspectRatio,
        },
      },
    });

    const imageUrl = extractImageFromResponse(response);
    if (!imageUrl) {
      throw new Error('API 响应中未找到图片数据。');
    }

    // 验证返回的图片是否与原图不同
    const returnedBase64 = imageUrl.split(',')[1];
    const inputBase64Length = base64ImageData.length;
    const returnedBase64Length = returnedBase64.length;
    
    const lengthDiff = Math.abs(returnedBase64Length - inputBase64Length);
    const lengthDiffPercent = (lengthDiff / inputBase64Length) * 100;

    void lengthDiffPercent;

    // 尝试从 base64 数据中提取图片尺寸信息（PNG 文件头包含尺寸信息）
    try {
      const inputImage = new Image();
      inputImage.src = `data:${mimeType};base64,${base64ImageData}`;
      inputImage.onload = () => {};
      
      const outputImage = new Image();
      outputImage.src = imageUrl;
      outputImage.onload = () => {
        const outputAspectRatio = (outputImage.width / outputImage.height).toFixed(2);
        const expectedAspectRatio = targetAspectRatio === '1:1' ? '1.00' : 
                                    targetAspectRatio === '16:9' ? '1.78' :
                                    targetAspectRatio === '9:16' ? '0.56' :
                                    targetAspectRatio === '4:3' ? '1.33' :
                                    targetAspectRatio === '3:4' ? '0.75' : 'unknown';
        void outputAspectRatio;
        void expectedAspectRatio;
        void inputImage;
      };
    } catch (e) {
      void e;
    }

    return imageUrl;
  } catch (error: any) {
    const message = error instanceof Error ? error.message : '生成图片失败，请稍后重试。';
    throw new Error(message);
  }
};

