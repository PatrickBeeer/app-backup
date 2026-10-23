import {
  extractImageFromResponse,
  generateContent,
} from '../../../../shared_services/geminiProxyService';

export const IMAGE_MODEL = 'gpt-image-2.5-flare';

export type BillingTask = 'main_render' | 'flat_conversion' | 'element_split';

export type InlineImage = {
  mimeType: string;
  data: string;
};

const ACCEPTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
// Keep accepted uploads as-is below this size; larger ones get re-encoded.
const MAX_PASSTHROUGH_IMAGE_BYTES = 4 * 1024 * 1024;
const REENCODE_MAX_EDGE = 2048;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isTransientConnectionError(error: unknown): boolean {
  const msg = String((error as any)?.message || error || '').toLowerCase();
  return (
    msg.includes('empty response') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('fetch') ||
    msg.includes('broken pipe') ||
    msg.includes('unexpected end') ||
    msg.includes('socket')
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.split(',')[1] || '';
      if (!base64) {
        reject(new Error('图片编码失败，请重试'));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('图片读取失败，请重试'));
    reader.readAsDataURL(blob);
  });
}

async function reencodeToJPEG(source: Blob): Promise<Blob> {
  const objectUrl = URL.createObjectURL(source);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error('无法读取当前图片'));
      nextImage.src = objectUrl;
    });

    const scale = Math.min(1, REENCODE_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法处理当前图片');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) throw new Error('图片压缩失败，请重试');
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function blobToInlineImage(blob: Blob): Promise<InlineImage> {
  const mimeType = (blob.type || 'image/png').toLowerCase();
  if (ACCEPTED_MIME_TYPES.includes(mimeType) && blob.size <= MAX_PASSTHROUGH_IMAGE_BYTES) {
    return { mimeType, data: await blobToBase64(blob) };
  }
  return { mimeType: 'image/jpeg', data: await blobToBase64(await reencodeToJPEG(blob)) };
}

export async function fileToInlineImage(file: File): Promise<InlineImage> {
  return blobToInlineImage(file);
}

export async function urlToInlineImage(url: string): Promise<InlineImage> {
  let response: Response;
  try {
    response = await fetch(url, { mode: 'cors' });
  } catch {
    throw new Error('无法读取案例参考图，请检查网络后重试，或将图片下载后手动上传');
  }
  if (!response.ok) {
    throw new Error(`案例参考图加载失败（${response.status}）`);
  }
  const blob = await response.blob();
  if (!blob.size) {
    throw new Error('案例参考图为空');
  }
  return blobToInlineImage(blob);
}

export async function generateImage(options: {
  prompt: string;
  images: InlineImage[];
  size: string;
  billingTask: BillingTask;
}): Promise<string> {
  const parts: any[] = options.images.map((image) => ({
    inlineData: { mimeType: image.mimeType, data: image.data },
  }));
  parts.push({ text: options.prompt });

  const maxAttempts = 3;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await generateContent({
        model: IMAGE_MODEL,
        task: 'image_gen',
        billing_task: options.billingTask,
        contents: { parts },
        config: {
          size: options.size,
          quality: 'high',
          output_format: 'png',
        } as any,
      });

      const image = extractImageFromResponse(response);
      if (image) {
        return image;
      }
      throw new Error('模型未返回有效的图片数据');
    } catch (error) {
      lastError = error;
      if (!isTransientConnectionError(error) || attempt === maxAttempts) {
        throw error;
      }
      await sleep(1500 * attempt);
    }
  }

  throw lastError || new Error('生成失败，请稍后重试');
}
