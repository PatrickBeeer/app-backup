import {
  extractImageFromResponse,
  extractTextFromResponse,
  generateContent,
} from '../../../../shared_services/geminiProxyService';

const IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const IMAGE_TASK = 'image_gen';
const MAX_RETRIES = 2;

type ImageSize = '1K' | '2K';

export interface GenerateRequest {
  referenceImage: string;
  productImages: string[];
  prompt: string;
  aspectRatio: string;
  imageSize: ImageSize;
  productConsistency: boolean;
}

export interface EditRequest {
  image: string;
  editPrompt: string;
  maskImage?: string | null;
  productConsistency: boolean;
}

export interface GeneratedAsset {
  imageUrl: string;
  title: string;
  tagline: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isRetryableError(error: unknown): boolean {
  const message = String((error as Error | undefined)?.message || '').toLowerCase();
  return (
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('524') ||
    message.includes('timeout') ||
    message.includes('bad gateway') ||
    message.includes('service unavailable') ||
    message.includes('non-json response')
  );
}

function stripDataUrlPrefix(dataUrl: string): string {
  return String(dataUrl || '').replace(/^data:[^;]+;base64,/, '');
}

function detectMimeType(dataUrl: string, fallback = 'image/png'): string {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,/i);
  return match?.[1] || fallback;
}

function imagePart(image: string) {
  return {
    inlineData: {
      mimeType: detectMimeType(image),
      data: stripDataUrlPrefix(image),
    },
  };
}

function extractCopyLines(response: Parameters<typeof extractTextFromResponse>[0]): string[] {
  try {
    return extractTextFromResponse(response)
      .split('\n')
      .map((line) => line.replace(/^[#*\-\s:：]+/, '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_RETRIES || !isRetryableError(error)) {
        throw error;
      }
      await sleep((attempt + 1) * 1000);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Generation failed');
}

export async function generateCompositeAsset(request: GenerateRequest): Promise<GeneratedAsset> {
  if (!request.referenceImage || request.productImages.length === 0) {
    throw new Error('请至少上传一张参考图和一张产品图');
  }

  const parts = [imagePart(request.referenceImage), ...request.productImages.map(imagePart)];
  parts.push({
    text: [
      'Use the first image as the visual reference for layout, lighting, camera angle, background, typography, and ecommerce poster style.',
      'Replace the main product in the first image with the product shown in the following uploaded product images.',
      request.productConsistency
        ? 'Strict product consistency: preserve the target product color, material, shape, accessories, logo placement, and fine details exactly from the uploaded product photos.'
        : '',
      'Scene integration is critical: the inserted product must match the reference scene naturally, including light direction, highlight intensity, shadow softness, contact shadows, reflections, perspective, scale, depth of field, color temperature, contrast, grain, and atmospheric haze.',
      'Do not make the product look pasted on. Re-render edges and nearby environment so the product feels physically grounded inside the scene.',
      `Extra user direction: ${request.prompt || 'Premium ecommerce product visual, clean composition, realistic studio lighting.'}`,
      'Return one final image. Also return two short Chinese lines: line 1 is a title, line 2 is a marketing tagline.',
    ]
      .filter(Boolean)
      .join('\n'),
  });

  const response = await withRetry(() =>
    generateContent({
      model: IMAGE_MODEL,
      task: IMAGE_TASK,
      billing_task: 'image_gen',
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio: request.aspectRatio,
          imageSize: request.imageSize,
        },
      },
    }),
  );

  const imageUrl = extractImageFromResponse(response);
  if (!imageUrl) {
    throw new Error('模型未返回图片数据');
  }

  const lines = extractCopyLines(response);
  return {
    imageUrl,
    title: lines[0] || 'AI 复刻图',
    tagline: lines[1] || '已完成产品与参考风格融合',
  };
}

export async function editCompositeAsset(request: EditRequest): Promise<GeneratedAsset> {
  if (!request.image || !request.editPrompt) {
    throw new Error('请提供原图和修改指令');
  }

  const parts = [imagePart(request.image)];
  if (request.maskImage) {
    parts.push(imagePart(request.maskImage));
  }

  parts.push({
    text: [
      request.maskImage ? 'Edit only the text area painted by the white mask.' : 'Edit the image according to the instruction.',
      `Edit instruction:\n${request.editPrompt}`,
      request.productConsistency
        ? 'Product consistency: keep the product color, material, shape, structure, and fine details unchanged unless the instruction explicitly asks otherwise.'
        : '',
      'This is primarily a text replacement task. Preserve the original visual style, layout, lighting, typography, font size, color, kerning, text alignment, and positioning.',
      'Replace only the masked text content. Do not move surrounding objects, do not redraw unrelated areas, and do not add new decorative effects.',
      'Return the edited image. Also return two short Chinese lines: line 1 is a title, line 2 is a short description.',
    ]
      .filter(Boolean)
      .join('\n'),
  });

  const response = await withRetry(() =>
    generateContent({
      model: IMAGE_MODEL,
      task: IMAGE_TASK,
      billing_task: 'image_gen',
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio: '1:1',
          imageSize: '1K',
        },
      },
    }),
  );

  const imageUrl = extractImageFromResponse(response);
  if (!imageUrl) {
    throw new Error('编辑失败，模型未返回图片');
  }

  const lines = extractCopyLines(response);
  return {
    imageUrl,
    title: lines[0] || '精修成果',
    tagline: lines[1] || '局部修改已完成',
  };
}
