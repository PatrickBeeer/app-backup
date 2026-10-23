import { generateContent, extractImageFromResponse } from '../../../../shared_services/geminiProxyService';

type GenerationModel = 'flash' | 'pro';
type ImageSize = '2K' | '4K';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function isTransientConnectionError(error: unknown): boolean {
  const msg = String((error as any)?.message || error || '').toLowerCase();
  return (
    msg.includes('empty response') ||
    msg.includes('返回空响应') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('fetch') ||
    msg.includes('broken pipe') ||
    msg.includes('unexpected end') ||
    msg.includes('socket')
  );
}

function fileToInlineData(file: File): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIndex = result.indexOf(',');
      if (commaIndex < 0) {
        reject(new Error('无法解析上传图片数据'));
        return;
      }
      resolve({
        data: result.slice(commaIndex + 1),
        mimeType: file.type || 'image/png',
      });
    };
    reader.onerror = () => reject(new Error('读取上传图片失败'));
    reader.readAsDataURL(file);
  });
}

export async function generateLicensePlateScene(
  file: File,
  prompt: string,
  model: GenerationModel = 'flash',
  imageSize: ImageSize = '2K'
): Promise<string> {
  const inlineData = await fileToInlineData(file);
  const finalPrompt = `Generate a high-quality product photography background for this item. The new background should be: ${prompt}. Seamlessly blend the product into the new scene with appropriate lighting, reflections, and shadows. Keep the original product exactly as it is. CRITICAL INSTRUCTION: DO NOT generate or add any extra text, numbers, letters, logos, or unrequested props to the background. The background must be completely clean except for the uploaded product.`;
  const modelId = model === 'pro' ? 'gemini-3.1-flash-image-preview' : 'gemini-3.1-flash-image-preview';

  const maxAttempts = 3;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await generateContent({
        model: modelId,
        task: 'image_gen',
        billing_task: 'image_gen',
        contents: {
          parts: [
            { inlineData },
            { text: finalPrompt },
          ],
        },
        config: {
          imageConfig: {
            imageSize,
          },
        },
      });

      const imageUrl = extractImageFromResponse(response);
      if (imageUrl) {
        return imageUrl;
      }
      throw new Error('AI 没有返回图片。');
    } catch (error) {
      lastError = error;
      if (!isTransientConnectionError(error) || attempt === maxAttempts) {
        throw error;
      }
      await sleep(1200 * attempt);
    }
  }

  throw lastError || new Error('生成图片失败');
}
