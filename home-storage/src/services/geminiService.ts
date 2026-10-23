import {
  extractImageFromResponse,
  extractJsonTextFromResponse,
  extractTextFromResponse,
  generateContent,
  uploadAssetToCOSWithPresignedURL,
} from '../../../../shared_services/geminiProxyService';
import { createTaskQueueItem, recordTaskManagerObject } from '../../../../services/taskManagerService';

const APP_ID = 'home-storage';
const TEXT_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const IMAGE_BILLING_TASK = 'image_gen';
const IMAGE_BILLING_TASK_4K = 'image_gen_4k';
const IMAGE_BILLING_TASK_4K_EXTRA = 'image_gen_4k_extra';
const IMAGE_BILLING_TASK_RETRY = 'image_gen_retry';

export type AspectRatio = '1:1' | '3:4' | '9:16' | '16:9';
export type ImageResolution = '2K' | '4K';
export type GenerationType = 'scene' | 'model';
export type ModelStyle = 'asian' | 'jk' | 'caucasian' | 'influencer';
export type StylePreset = 'none' | 'ikea' | 'xiaohongshu' | 'midcentury' | 'nordic' | 'luxury';

export interface ImageInput {
  mimeType: string;
  data: string;
}

export interface InlineImagePart {
  inlineData: ImageInput;
}

export interface GenerateSceneRequest {
  productImage: ImageInput;
  referenceImage?: ImageInput | null;
  generationType: GenerationType;
  modelStyle: ModelStyle;
  resolution: ImageResolution;
  aspectRatio: AspectRatio;
  stylePreset: StylePreset;
  customPrompt: string;
  productDescription: string;
  sellingPoints: string;
}

export interface PersistImageOptions {
  title?: string;
  fileName?: string;
  prompt: string;
  generationType: GenerationType;
  aspectRatio: AspectRatio;
  resolution?: ImageResolution;
  stylePreset: StylePreset;
  sellingPoints?: string;
  productDescription?: string;
  customPrompt?: string;
  imageIndex?: number;
  index?: number;
  sourceLabel?: string;
}

const STYLE_PROMPTS: Record<Exclude<StylePreset, 'none'>, string> = {
  ikea: 'Clean, modern, minimalist Scandinavian interior setting. Bright natural lighting, light wood textures, highly functional, organized space. Classic IKEA showroom style. High quality commercial photography.',
  xiaohongshu: 'A trendy, cozy, aesthetic living space. Warm ambient lighting, soft luxurious textures, pastel and beige tones, delicate cinematic shadows. Popular Xiaohongshu lifestyle aesthetic.',
  midcentury: 'Mid-century modern interior. Teak wood furniture, retro color palettes with mustard, teal, and burnt orange, geometric shapes, and 1960s sophistication.',
  nordic: 'Nordic log cabin aesthetic. Raw wood textures, airy white walls, cozy textiles, faux fur throws, and cool natural light from large windows.',
  luxury: 'French luxury interior. Ornate wall moldings, marble surfaces, brass accents, velvet textures, grand chandeliers, and elegant editorial lighting.',
};

const SELLING_POINTS_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    sellingPoints: {
      type: 'array',
      items: { type: 'string', description: '单条中文商品卖点，8到24字，直接可用于电商场景表达。禁止输出 string、placeholder 或英文示例值。' },
    },
  },
  required: ['sellingPoints'],
};

const MAX_IMAGE_SEED = 2147483647;
const DEFAULT_IMAGE_REQUEST_STAGGER_MS = 350;

function buildInlineImagePart(input: ImageInput): InlineImagePart {
  return {
    inlineData: {
      mimeType: input.mimeType || 'image/jpeg',
      data: input.data,
    },
  };
}

function buildSystemInstruction(text: string) {
  return { parts: [{ text }] };
}

function createImageSeed(offset = 0): number {
  return (Math.floor(Date.now() % MAX_IMAGE_SEED) + Math.max(0, offset)) % MAX_IMAGE_SEED;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isPlaceholderSellingPoint(text: string): boolean {
  const normalized = String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[\s:：;；,，。.!！?？'"`~\-_/\\()[\]{}]+/g, '');

  return [
    'string',
    'strings',
    'placeholder',
    'placeholders',
    '卖点',
    '核心卖点',
    'sellingpoint',
    'sellingpoints',
  ].includes(normalized);
}

function collectSellingPointSegments(text: string): string[] {
  return String(text || '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .split(/[\r\n；;]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[\-•*\d.、\s]+/, '').trim())
    .filter((line) => {
      const lowered = line.toLowerCase();
      return ![
        '你是一名资深电商策划',
        '请分析这张白底商品图',
        '直接输出一段简洁中文',
        '直接输出 2 到 3 条',
        '直接输出2到3条',
        '不要加标题',
        '不要加序号',
        '不要输出 json',
        '不要输出字段名',
        '所有输出必须为简洁中文',
        'product selling points',
        'additional creative direction',
      ].some((token) => lowered.includes(token.toLowerCase()));
    })
    .map((line) => line.replace(/^(?:卖点|核心卖点|提炼结果|分析结果)[:：]\s*/i, '').trim())
    .filter((line) => !isPlaceholderSellingPoint(line));
}

function sanitizeSellingPointsText(text: string): string {
  const lines = collectSellingPointSegments(text);
  return Array.from(new Set(lines)).join('；').replace(/；{2,}/g, '；').trim();
}

function normalizeSellingPoints(parsed: unknown): string {
  if (Array.isArray(parsed)) {
    return Array.from(new Set(parsed.map((item) => sanitizeSellingPointsText(String(item || ''))).filter(Boolean))).join('；');
  }

  if (typeof parsed === 'string') {
    return sanitizeSellingPointsText(parsed);
  }

  if (!parsed || typeof parsed !== 'object') {
    return '';
  }

  const record = parsed as Record<string, unknown>;
  const candidate =
    record.sellingPoints ??
    record.selling_points ??
    record.points ??
    record.result ??
    record.text;

  return normalizeSellingPoints(candidate);
}

function cleanMimeType(mimeType: string | undefined): string {
  return String(mimeType || '').trim() || 'image/jpeg';
}

function resolveImageBillingTask(resolution: ImageResolution): string {
  return resolution === '4K' ? IMAGE_BILLING_TASK_4K : IMAGE_BILLING_TASK;
}

function resolveBatchImageBillingTask(resolution: ImageResolution, imageCount: number, index: number): string {
  if (resolution !== '4K') {
    return IMAGE_BILLING_TASK;
  }

  if (imageCount > 1 && index > 0) {
    return IMAGE_BILLING_TASK_4K_EXTRA;
  }

  return IMAGE_BILLING_TASK_4K;
}

async function requestSellingPointsAnalysis(productImage: ImageInput, structured: boolean) {
  return generateContent({
    model: TEXT_MODEL,
    task: 'text_gen',
    contents: {
      parts: [
        buildInlineImagePart(productImage),
        {
          text: structured
            ? '你是一名资深电商策划。请分析这张白底商品图，提炼 2 到 3 个最核心、最容易用于场景化表达的功能卖点。返回 JSON 对象，字段名为 sellingPoints，值为中文字符串数组。数组中的每一项都必须是具体中文卖点，禁止输出 string、placeholder、字段说明或额外解释。'
            : '你是一名资深电商策划。请分析这张白底商品图，提炼 2 到 3 个最核心、最容易用于场景化表达的功能卖点。直接输出 2 到 3 条简洁中文卖点，用中文分号分隔，不要加标题、序号、JSON、字段名或任何额外说明。',
        },
      ],
    },
    config: structured
      ? {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: SELLING_POINTS_RESPONSE_SCHEMA,
        }
      : {
          temperature: 0.2,
        },
    systemInstruction: buildSystemInstruction('所有输出必须为简洁中文，聚焦电商转化与场景化卖点表达。禁止输出占位词、字段示例或模板值。'),
  });
}

function buildVariantPrompt(variantIndex: number): string {
  const variants = [
    'Create a hero composition with a polished ecommerce art-direction approach.',
    'Create an alternative composition with different prop placement, camera distance, and lighting nuance while preserving the same product identity.',
  ];

  return variants[variantIndex] || variants[0];
}

function resolveModelDescription(modelStyle: ModelStyle): string {
  switch (modelStyle) {
    case 'asian':
      return 'An attractive, elegant Asian lifestyle model with a stylish professional look';
    case 'jk':
      return 'A stylish Japanese or Korean lifestyle model in trendy fashion attire with a professional ecommerce look';
    case 'caucasian':
      return 'An elegant Caucasian lifestyle model with a sophisticated professional look';
    case 'influencer':
      return 'A highly fashionable influencer lifestyle model with a premium ecommerce aesthetic';
    default:
      return 'A stylish, elegant, and professional lifestyle model';
  }
}

function buildGenerationPrompt(request: GenerateSceneRequest, variantIndex: number): string {
  const sections: string[] = [];

  sections.push(
    'You are an expert AI product photographer. The first image is the original white-background product.',
    'CRITICAL REQUIREMENT: STRICTLY PRESERVE THE EXACT PRODUCT IDENTITY. Do not alter, warp, hallucinate, or modify the text, logos, shape, proportions, or structural details of the product.',
    'The product must look exactly as it does in the source image, only relocated into a realistic environment.',
  );

  if (request.sellingPoints.trim()) {
    sections.push(`Product selling points to highlight naturally: ${request.sellingPoints.trim()}.`);
  }

  if (request.productDescription.trim()) {
    sections.push(`Product description for scale and placement: ${request.productDescription.trim()}.`);
  }

  if (request.stylePreset !== 'none') {
    sections.push(`Style direction: ${STYLE_PROMPTS[request.stylePreset]}`);
  }

  if (request.referenceImage) {
    sections.push('The second image is a style reference. Borrow its lighting, palette, mood, and room styling, but do not literally place the first product inside the second image subject.');
  }

  if (request.customPrompt.trim()) {
    sections.push(`Additional creative direction that must be followed: ${request.customPrompt.trim()}.`);
  }

  if (request.generationType === 'model') {
    sections.push(
      `Subject: ${resolveModelDescription(request.modelStyle)} is naturally interacting with or standing alongside the product.`,
      'The model must have realistic skin texture, natural expression, and professional commercial-photo quality. Avoid plastic skin, mannequin poses, or amateur selfie aesthetics.',
    );
  } else {
    sections.push('Do not include any people. Focus entirely on product placement, atmosphere, depth, and tasteful home-storage storytelling.');
  }

  sections.push(
    buildVariantPrompt(variantIndex),
    'Do not generate any floating text, watermarks, labels, subtitles, or random letters. The final image must be completely free of text except unavoidable original branding already present on the source product.',
    'Aim for premium ecommerce photography, realistic lighting, believable shadows, and high-end material detail.',
  );

  return sections.join('\n\n');
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error(`failed to prepare generated image (HTTP ${response.status})`);
  }
  return response.blob();
}

export async function analyzeProductImage(productImage: ImageInput): Promise<string> {
  const response = await requestSellingPointsAnalysis(productImage, true);

  try {
    const parsed = JSON.parse(extractJsonTextFromResponse(response));
    const normalized = normalizeSellingPoints(parsed);
    if (normalized) {
      return normalized;
    }
  } catch {
    // Fall through to loose text cleanup.
  }

  const fallback = normalizeSellingPoints(extractTextFromResponse(response));
  if (fallback) {
    return fallback;
  }

  const plainTextResponse = await requestSellingPointsAnalysis(productImage, false);
  const plainTextFallback = normalizeSellingPoints(extractTextFromResponse(plainTextResponse));
  if (plainTextFallback) {
    return plainTextFallback;
  }

  throw new Error('卖点提取结果为空');
}

export async function generateSceneImage(request: GenerateSceneRequest, variantIndex = 0): Promise<string> {
  const parts = [buildInlineImagePart(request.productImage)];
  if (request.referenceImage) {
    parts.push(buildInlineImagePart(request.referenceImage));
  }
  parts.push({ text: buildGenerationPrompt(request, variantIndex) });

  const response = await generateContent({
    model: IMAGE_MODEL,
    task: 'image_gen',
    billing_task: resolveImageBillingTask(request.resolution),
    contents: { parts },
    config: {
      seed: createImageSeed(variantIndex),
      imageConfig: {
        aspectRatio: request.aspectRatio,
        imageSize: request.resolution,
      },
    },
    systemInstruction: buildSystemInstruction('You are a premium commercial product photographer. Preserve product identity exactly, keep composition realistic, and generate polished ecommerce imagery without any added text.'),
  });

  const imageUrl = extractImageFromResponse(response);
  if (!imageUrl) {
    throw new Error('未能生成图片，请稍后重试。');
  }

  return imageUrl;
}

export async function generateStyledImages(options: {
  parts: InlineImagePart[];
  prompt: string;
  aspectRatio: AspectRatio;
  imageSize: ImageResolution;
  imageCount: number;
  billingTask?: string;
  requestSpacingMs?: number;
  onImage?: (result: { index: number; imageUrl: string }) => void | Promise<void>;
}): Promise<string[]> {
  const requestSpacingMs = Math.max(0, options.requestSpacingMs ?? DEFAULT_IMAGE_REQUEST_STAGGER_MS);
  const settled = await Promise.allSettled(
    Array.from({ length: options.imageCount }, async (_, index) => {
      if (index > 0 && requestSpacingMs > 0) {
        await delay(index * requestSpacingMs);
      }

      const response = await generateContent({
        model: IMAGE_MODEL,
        task: 'image_gen',
        billing_task: options.billingTask || resolveBatchImageBillingTask(options.imageSize, options.imageCount, index),
        contents: {
          parts: [
            ...options.parts,
            {
              text: `${options.prompt}\n\n${buildVariantPrompt(index)}`,
            },
          ],
        },
        config: {
          seed: createImageSeed(index),
          imageConfig: {
            aspectRatio: options.aspectRatio,
            imageSize: options.imageSize,
          },
        },
        systemInstruction: buildSystemInstruction('You are a premium commercial product photographer. Preserve product identity exactly, keep composition realistic, and generate polished ecommerce imagery without any added text.'),
      });

      const imageUrl = extractImageFromResponse(response);
      if (!imageUrl) {
        throw new Error('未能生成图片，请稍后重试。');
      }

      if (options.onImage) {
        void Promise.resolve(options.onImage({ index, imageUrl })).catch((error) => {
          console.warn('[home-storage] immediate image callback failed', error);
        });
      }

      return { index, imageUrl };
    })
  );

  const results = settled
    .filter((item): item is PromiseFulfilledResult<{ index: number; imageUrl: string }> => item.status === 'fulfilled')
    .map((item) => item.value)
    .sort((left, right) => left.index - right.index)
    .map((item) => item.imageUrl);

  if (results.length === 0) {
    const firstFailure = settled.find((item): item is PromiseRejectedResult => item.status === 'rejected');
    throw firstFailure?.reason instanceof Error ? firstFailure.reason : new Error('未能生成图片，请稍后重试。');
  }

  return results;
}

export async function editGeneratedImage(
  image: ImageInput,
  instruction: string,
  aspectRatio: AspectRatio,
  resolution: ImageResolution,
): Promise<string> {
  const response = await generateContent({
    model: IMAGE_MODEL,
    task: 'image_gen',
    billing_task: resolveImageBillingTask(resolution),
    contents: {
      parts: [
        buildInlineImagePart({
          data: image.data,
          mimeType: cleanMimeType(image.mimeType),
        }),
        {
          text: `Edit this image according to the following instruction while keeping the product identity and overall realism intact: ${instruction}`,
        },
      ],
    },
    config: {
      imageConfig: {
        aspectRatio,
        imageSize: resolution,
      },
    },
    systemInstruction: buildSystemInstruction('Perform controlled commercial-image edits. Preserve the core product and keep the result realistic, polished, and free of added text.'),
  });

  const imageUrl = extractImageFromResponse(response);
  if (!imageUrl) {
    throw new Error('未能生成图片，请稍后重试。');
  }

  return imageUrl;
}

export async function persistGeneratedImageTask(imageDataUrl: string, options: PersistImageOptions): Promise<string> {
  const blob = await dataUrlToBlob(imageDataUrl);
  const upload = await uploadAssetToCOSWithPresignedURL(blob, {
    fileName: options.fileName || `home-storage-${Date.now()}.png`,
    objectPath: `standalone/${APP_ID}/generated_images`,
    appID: APP_ID,
    camAppID: APP_ID,
    contentType: blob.type || 'image/png',
  });

  const persistedURL =
    String(upload.url || '').trim() ||
    String(upload.signed_url || '').trim() ||
    String(upload.public_url || '').trim() ||
    imageDataUrl;

  let objectRecord: Awaited<ReturnType<typeof recordTaskManagerObject>> | null = null;
  if (String(upload.bucket_name || '').trim() && String(upload.object_key || '').trim()) {
    try {
      objectRecord = await recordTaskManagerObject({
        bucket_name: String(upload.bucket_name || '').trim(),
        region: String(upload.region || '').trim(),
        object_key: String(upload.object_key || '').trim(),
        url: persistedURL,
        size_bytes: blob.size,
        mime_type: blob.type || 'image/png',
      });
    } catch (error) {
      console.warn('[home-storage] object metadata write failed, continue task queue write', error);
    }
  }

  const basePayload = {
    title: options.title || `家居收纳生成图 ${Number(options.index ?? options.imageIndex ?? 0) + 1}`,
    name: options.title || `家居收纳生成图 ${Number(options.index ?? options.imageIndex ?? 0) + 1}`,
    image_url: persistedURL,
    url: persistedURL,
    object_id: objectRecord?.object_id,
    object_key: upload.object_key,
    bucket: upload.bucket_name,
    region: upload.region,
    mime_type: blob.type || 'image/png',
    size_bytes: blob.size,
    prompt: options.prompt,
    generation_type: options.generationType,
    aspect_ratio: options.aspectRatio,
    resolution: options.resolution || '',
    style_preset: options.stylePreset,
    selling_points: options.sellingPoints || '',
    product_description: options.productDescription || '',
    custom_prompt: options.customPrompt || '',
    image_index: options.imageIndex ?? options.index,
    source_label: options.sourceLabel || '',
  };

  try {
    await createTaskQueueItem({
      source_app_id: APP_ID,
      item_type: 'image_link',
      status: 'finished',
      payload: basePayload,
    });
  } catch (error) {
    await createTaskQueueItem({
      source_app_id: APP_ID,
      item_type: 'image_link',
      status: 'finished',
      payload: {
        title: options.title || `家居收纳生成图 ${Number(options.index ?? options.imageIndex ?? 0) + 1}`,
        name: options.title || `家居收纳生成图 ${Number(options.index ?? options.imageIndex ?? 0) + 1}`,
        image_url: persistedURL,
        url: persistedURL,
      },
    });
    console.warn('[home-storage] image task persisted with minimal payload', error);
  }

  return persistedURL;
}