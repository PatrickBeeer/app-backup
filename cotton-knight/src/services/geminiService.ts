import {
  extractImageFromResponse,
  extractTextFromResponse,
  generateContent,
} from '../../../../shared_services/geminiProxyService';

const APP_ID = 'cotton-knight';
const TEXT_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const GPT_IMAGE_MODEL = 'gpt-image-2';
const TEXT_TASK = 'text_gen';
const IMAGE_TASK = 'image_gen';
const IMAGE_TASK_LOW = 'image_gen_low';
const MAX_RETRIES = 2;

export type CottonKnightModelId = 'nanobanana' | 'image-2';

export interface UploadedImage {
  mimeType: string;
  data: string;
}

export interface GenerateProductImagesRequest {
  prompt: string;
  model?: CottonKnightModelId;
  referenceImage: UploadedImage;
  styleReferenceImage?: UploadedImage | null;
  aspectRatio?: string;
  imageSize?: '1K' | '2K';
  numberOfImages?: number;
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

function imagePart(image: UploadedImage) {
  return {
    inlineData: {
      mimeType: image.mimeType,
      data: image.data,
    },
  };
}

function normalizePromptText(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/^[#*\-\s:：]+/, '').trim())
    .filter(Boolean)
    .join(' ');
}

async function generateBackgroundPrompt(
  referenceImage: UploadedImage,
  styleReferenceImage: UploadedImage | null | undefined,
  prompt: string,
): Promise<string> {
  const parts: Array<{ text: string } | ReturnType<typeof imagePart>> = [imagePart(referenceImage)];

  if (styleReferenceImage) {
    parts.push(imagePart(styleReferenceImage));
  }

  parts.push({
    text: [
      'You are a senior ecommerce art director and prompt engineer.',
      'The first image is the product image that must remain faithful to the original packaging, structure, logo placement, and visible text.',
      styleReferenceImage
        ? 'The second image is a style reference. Analyze its lighting, color palette, composition, materials, atmosphere, and premium commercial photography style.'
        : 'Create a premium ecommerce hero-shot background style suitable for a soft cotton facial towel product.',
      prompt
        ? `The user also wants this scene direction: ${prompt}`
        : 'Preferred direction: clean, premium, soft, trustworthy, airy, skincare-adjacent product photography.',
      'Write one concise English image-generation prompt only.',
      'Describe the scene, props, lighting, composition, texture, and camera feeling.',
      'Do not describe changing the product text or logo. Do not include markdown or explanations.',
    ].join('\n'),
  });

  const response = await withRetry(() =>
    generateContent({
      model: TEXT_MODEL,
      task: TEXT_TASK,
      billing_task: TEXT_TASK,
      contents: { parts },
      systemInstruction: {
        role: 'system',
        parts: [
          {
            text: 'Generate a single production-ready prompt for a commercial product image model.',
          },
        ],
      },
    }),
  );

  const text = normalizePromptText(extractTextFromResponse(response));
  if (!text) {
    throw new Error('模型未返回有效场景提示词');
  }
  return text;
}

async function generateSingleImage(
  referenceImage: UploadedImage,
  styleReferenceImage: UploadedImage | null | undefined,
  prompt: string,
  aspectRatio: string,
  imageSize: '1K' | '2K',
  variationIndex: number,
  billingTask: string,
  imageModel: string,
): Promise<string> {
  const parts: Array<{ text: string } | ReturnType<typeof imagePart>> = [imagePart(referenceImage)];

  if (styleReferenceImage) {
    parts.push(imagePart(styleReferenceImage));
  }

  parts.push({
    text: [
      'Create one premium ecommerce hero image for the uploaded product.',
      'Preserve the product packaging, proportions, brand marks, visible text, and material details from the product image.',
      styleReferenceImage
        ? 'Use the style reference to match the visual language, lighting, composition, and atmosphere.'
        : 'Use a high-end clean lifestyle or studio composition that fits a facial towel/skincare-adjacent product.',
      `Scene prompt: ${prompt}`,
      'Composite the product naturally into the new scene with realistic shadows, reflections, perspective, and contact lighting.',
      'Do not rewrite, blur, or hallucinate product text and logos.',
      `Create a distinct variation for output #${variationIndex + 1} by changing micro-composition, camera crop, prop placement, or light angle while keeping the same overall art direction.`,
    ].join('\n'),
  });

  const response = await withRetry(() =>
    generateContent({
      model: imageModel,
      task: IMAGE_TASK,
      billing_task: billingTask,
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio,
          imageSize,
        },
      },
      systemInstruction: {
        role: 'system',
        parts: [
          {
            text: 'Return a polished commercial product image. Image output is required.',
          },
        ],
      },
    }),
  );

  const imageUrl = extractImageFromResponse(response);
  if (!imageUrl) {
    throw new Error('模型未返回图片数据');
  }

  return imageUrl;
}

export async function generateProductImages(
  request: GenerateProductImagesRequest,
): Promise<{ images: string[]; promptUsed: string }> {
  const {
    prompt,
    model = 'nanobanana',
    referenceImage,
    styleReferenceImage,
    aspectRatio = '1:1',
    imageSize = '1K',
    numberOfImages = 2,
  } = request;

  if (!referenceImage) {
    throw new Error('请先上传商品主体图');
  }

  const promptUsed = await generateBackgroundPrompt(referenceImage, styleReferenceImage, prompt);
  const images: string[] = [];
  const billingTask = model === 'image-2' ? IMAGE_TASK_LOW : IMAGE_TASK;
  const imageModel = model === 'image-2' ? GPT_IMAGE_MODEL : IMAGE_MODEL;

  for (let index = 0; index < Math.max(1, numberOfImages); index += 1) {
    const imageUrl = await generateSingleImage(
      referenceImage,
      styleReferenceImage,
      promptUsed,
      aspectRatio,
      imageSize,
      index,
      billingTask,
      imageModel,
    );
    images.push(imageUrl);
  }

  return {
    images,
    promptUsed,
  };
}

export { APP_ID, IMAGE_MODEL, TEXT_MODEL };
