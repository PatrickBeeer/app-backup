import {
  generateContent,
  extractImageFromResponse,
  extractJsonTextFromResponse,
  uploadAssetToCOSWithPresignedURL,
} from '../../../../shared_services/geminiProxyService';
import {
  buildMainPlanAnalysisPrompt,
  buildSellingPointAnalysisPrompt,
  buildPrompt,
  buildGenerationVariation,
  buildMainConsistencyAnchorPrompt,
  buildVideoPrompt,
  getMainImageRole,
  getModelPerformanceVariantCount,
} from '../lib/promptBuilder';
import { buildGenerationPlan, buildImageParts, buildTextAnalysisParts } from '../lib/geminiPayload';
import { detectProductColor } from '../lib/productColor';
import { loadIdentityReference, loadUnderwearReference } from '../lib/referenceAssets';
import type {
  ImageRatio,
  ImageResolution,
  MainPlan,
  MainPlanAnalysis,
  ProductColorHint,
  ReferenceImage,
  SellingPointAnalysis,
  VideoRatio,
  VideoTaskResult,
} from '../types';

const IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const TEXT_MODEL = 'gemini-3-flash-preview';
const VIDEO_MODEL_FAST = 'doubao-seedance-2-0-fast-260128';
const COS_APP_ID = 'shuyang-studio';

// 内裤类目：命中则保留编号硬规则，不回灌主图角色方案。
const UNDERWEAR_CATEGORY_PATTERN = /内裤|底裤|平角裤|三角裤|四角裤/;

export function dataUrlToReference(dataUrl: string): ReferenceImage {
  const match = String(dataUrl || '').match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('请上传 PNG、JPG 或 WebP 产品图。');
  return { mimeType: match[1], data: match[2] };
}

export function dataUrlsToReferences(dataUrls: string[]): ReferenceImage[] {
  return (dataUrls || []).filter(Boolean).map(dataUrlToReference);
}

function toDataUrl(ref: ReferenceImage): string {
  return `data:${ref.mimeType};base64,${ref.data}`;
}

function clip(value: unknown, max: number, fallback = ''): string {
  return String(value ?? fallback).trim().slice(0, max);
}

function normalizeMainPlans(value: unknown): MainPlan[] | null {
  if (!Array.isArray(value) || value.length !== 5) return null;
  const plans: MainPlan[] = value.map((item: any, index) => ({
    role: clip(item?.role || getMainImageRole(index).role, 40),
    title: clip(item?.title || `0${index + 1} 主图方案`, 60),
    sellingPoint: clip(item?.sellingPoint || '', 160),
    prompt: clip(item?.prompt || '', 1400),
    layoutType: clip(item?.layoutType || 'single', 20, 'single'),
    keyBenefit: clip(item?.keyBenefit || '', 120),
  }));
  return plans.every((item) => item.title && item.sellingPoint && item.prompt) ? plans : null;
}

/** 生成前主图规划：返回结构化 5 张方案；解析失败返回 null（调用方优雅降级）。 */
export async function analyzeMainPlans(productReferences: ReferenceImage[]): Promise<MainPlanAnalysis | null> {
  const parts = buildTextAnalysisParts({
    prompt: buildMainPlanAnalysisPrompt(),
    productReferences,
  });
  const response = await generateContent({
    model: TEXT_MODEL,
    task: 'text_gen',
    billing_task: 'text_gen',
    contents: { parts },
    config: { responseMimeType: 'application/json' },
  });
  const parsed = JSON.parse(extractJsonTextFromResponse(response));
  const plans = normalizeMainPlans(parsed?.plans);
  if (!plans) return null;
  return {
    category: clip(parsed?.category || '贴身服饰', 60, '贴身服饰'),
    summary: clip(parsed?.summary || '', 240),
    plans,
  };
}

/** 卖点视频分析：视觉理解 → 卖点 + 成片脚本。无效结果抛错。 */
export async function analyzeSellingPoints(
  productReferences: ReferenceImage[],
  customSellingPoints: string,
): Promise<SellingPointAnalysis> {
  const parts = buildTextAnalysisParts({
    prompt: buildSellingPointAnalysisPrompt(customSellingPoints),
    productReferences,
  });
  const response = await generateContent({
    model: TEXT_MODEL,
    task: 'text_gen',
    billing_task: 'text_gen',
    contents: { parts },
    config: { responseMimeType: 'application/json' },
  });
  const parsed = JSON.parse(extractJsonTextFromResponse(response));
  const category = clip(parsed?.category || '产品展示', 60, '产品展示');
  const sellingPoints = Array.isArray(parsed?.sellingPoints)
    ? parsed.sellingPoints.map((item: unknown) => String(item || '').trim()).filter(Boolean).slice(0, 12)
    : [];
  const videoPrompt = clip(parsed?.videoPrompt || '', 4000);
  if (!videoPrompt) throw new Error('Gemini 未返回有效的卖点与成片脚本，请手动重新分析。');
  return { category, sellingPoints, videoPrompt };
}

export interface GenerateImageBatchOptions {
  taskType: 'model' | 'ecommerce';
  ratio: ImageRatio;
  resolution: ImageResolution;
  count: number;
  productReferences: ReferenceImage[];
  userPrompt: string;
  /** 电商单张修改/重绘时的目标下标（0–4），此时 count 固定为 1。 */
  refineIndex?: number;
  refinePrompt?: string;
  /** 每张图返回后的增量回调（用于逐张呈现）。 */
  onPartialImage?: (index: number, dataUrl: string) => void;
}

/**
 * 复刻原服务端 generateImage 的逐张生成循环：主图先生成规划（内裤不回灌）、
 * 首图作为后续一致性锚点；模特模式走动作方案轮换。
 */
export async function generateImageBatch(options: GenerateImageBatchOptions): Promise<string[]> {
  const {
    taskType,
    ratio,
    resolution,
    count,
    productReferences,
    userPrompt,
    refineIndex = 0,
    refinePrompt = '',
    onPartialImage,
  } = options;

  if (!productReferences.length) throw new Error('请上传 PNG、JPG 或 WebP 产品图。');
  const isEcommerce = taskType === 'ecommerce';
  const isRefinement = isEcommerce && Boolean(refinePrompt);

  let identityReference: ReferenceImage | null = null;
  let visualReference: ReferenceImage | null = null;
  if (taskType === 'model' || isEcommerce) {
    try {
      identityReference = await loadIdentityReference();
    } catch {
      throw new Error('舒氧固定模特身份参考图不可用，请检查应用资产。');
    }
  }
  if (isEcommerce) {
    try {
      visualReference = await loadUnderwearReference();
    } catch {
      throw new Error('舒氧内裤姿态与臀型参考图不可用，请检查应用资产。');
    }
  }

  // 主图规划回灌：仅文胸/上装内搭使用角色方案；内裤保持编号硬规则。失败则降级为 null。
  let mainPlans: MainPlan[] | null = null;
  if (isEcommerce && !isRefinement) {
    try {
      const analysis = await analyzeMainPlans(productReferences);
      if (analysis?.plans) {
        const categoryText = analysis.category.toLowerCase();
        if (!UNDERWEAR_CATEGORY_PATTERN.test(categoryText)) {
          mainPlans = analysis.plans;
        }
      }
    } catch {
      mainPlans = null;
    }
  }

  // 实测产品主色（仅主图模式，用于颜色硬锁定）；失败不阻断生成。
  let productColorHint: ProductColorHint | null = null;
  if (isEcommerce) {
    try {
      productColorHint = await detectProductColor(toDataUrl(productReferences[0]));
    } catch {
      productColorHint = null;
    }
  }

  const basePrompt = buildPrompt({
    brandId: 'shuyang',
    taskType,
    ratio,
    userPrompt,
    productColorHint,
  });

  const variantCount = getModelPerformanceVariantCount();
  const batchOffset = Math.floor(Math.random() * variantCount);

  const generated: string[] = [];
  let anchorReference: ReferenceImage | null = null;

  for (const generationIndex of buildGenerationPlan(count)) {
    const planIndex = isRefinement ? refineIndex : generationIndex;
    const variationPrompt = buildGenerationVariation({
      taskType,
      generationIndex: planIndex,
      generationCount: isRefinement ? 5 : count,
      batchOffset,
      mainPlan: mainPlans ? mainPlans[planIndex] : null,
    });
    const refinementLayer = isRefinement
      ? `Layer 7 · 单张主图修改：只按照用户对第 ${refineIndex + 1} 张主图的修改要求调整动作、景别、光影或构图：${refinePrompt}。保留上传产品的颜色、版型、结构、材质和比例；继续禁止文字、Logo、水印；如果出现人物，继续使用舒氧固定模特规则，不随机更换模特。`
      : '';
    const useAnchor = isEcommerce && !isRefinement && Boolean(anchorReference);
    const anchorPrompt = useAnchor ? buildMainConsistencyAnchorPrompt() : '';
    const prompt = [basePrompt, variationPrompt, refinementLayer, anchorPrompt].filter(Boolean).join('\n\n');

    const parts = buildImageParts({
      prompt,
      productReferences,
      identityReference,
      visualReference,
      consistencyReference: useAnchor ? anchorReference : null,
    });

    const response = await generateContent({
      model: IMAGE_MODEL,
      task: 'image_gen',
      billing_task: 'image_gen',
      contents: { parts },
      config: { imageConfig: { aspectRatio: ratio, imageSize: resolution } },
    });

    const dataUrl = extractImageFromResponse(response);
    if (!dataUrl) {
      throw new Error('图片生成失败：未返回可用图片。');
    }
    generated.push(dataUrl);
    onPartialImage?.(generationIndex, dataUrl);

    if (isEcommerce && !isRefinement && generationIndex === 0) {
      anchorReference = dataUrlToReference(dataUrl);
    }
  }

  return generated;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const mimeMatch = String(dataUrl).match(/^data:([^;]+);base64,/i);
  const mimeType = mimeMatch?.[1] || 'application/octet-stream';
  const raw = String(dataUrl).replace(/^data:[^;]+;base64,/, '');
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

/** 提交卖点视频（Seedance 2.0 Fast 图生视频，720p，first_frame）。 */
export async function submitVideo(
  firstFrameDataUrl: string,
  ratio: VideoRatio,
  durationSeconds: number,
  userPrompt: string,
): Promise<VideoTaskResult> {
  const prompt = buildVideoPrompt({ ratio, durationSeconds, userPrompt });

  const upload = await uploadAssetToCOSWithPresignedURL(dataUrlToBlob(firstFrameDataUrl), {
    fileName: 'shuyang-first-frame.png',
    appID: COS_APP_ID,
    objectPath: `standalone/${COS_APP_ID}/seedance_refs`,
  });
  const frameUrl = upload.url || upload.signed_url || upload.public_url || '';
  if (!frameUrl) throw new Error('产品首帧上传失败，无法生成视频。');

  const content = [
    { type: 'text', text: prompt },
    { type: 'image_url', image_url: { url: frameUrl }, role: 'first_frame' },
  ];

  const payload: any = await generateContent({
    model: VIDEO_MODEL_FAST,
    task: 'video_gen_submit' as any,
    billing_task: 'video_gen',
    contents: { content },
    config: {
      resolution: '720p',
      aspectRatio: ratio,
      durationSeconds,
      submitOnly: true,
    } as any,
    billing: { video: { seconds: durationSeconds } },
  } as any);

  const taskId = [
    payload?.id,
    payload?.task_id,
    payload?.taskId,
    payload?.data?.id,
    payload?.data?.task_id,
    payload?.data?.taskId,
    payload?.result?.id,
    payload?.result?.task_id,
    payload?.result?.taskId,
  ].find((value) => typeof value === 'string' && value.trim()) as string | undefined;

  const videoUrlCandidate = [
    payload?.content?.video_url,
    payload?.content?.videoUrl,
    payload?.video_url,
    payload?.videoUrl,
    payload?.url,
    payload?.uri,
    payload?.data?.content?.video_url,
    payload?.data?.video_url,
    payload?.data?.videoUrl,
    payload?.result?.content?.video_url,
    payload?.result?.video_url,
    payload?.videos?.[0]?.url,
    payload?.videos?.[0]?.uri,
  ].find((value) => typeof value === 'string' && value.trim()) as string | undefined;

  const status = String(payload?.status || payload?.data?.status || payload?.result?.status || '').trim();
  const videoUrl = videoUrlCandidate ? videoUrlCandidate.trim() : null;
  if (videoUrl) return { taskId: taskId ? taskId.trim() : null, status: status || 'succeeded', videoUrl };
  if (taskId) return { taskId: taskId.trim(), status: status || 'queued', videoUrl: null };
  throw new Error('视频服务未返回任务编号或视频地址。');
}

/** 查询视频任务状态。任务尚未建立时返回 queued，与轮询流程兼容。 */
export async function queryVideoTask(taskId: string): Promise<VideoTaskResult> {
  const trimmed = String(taskId || '').trim();
  if (!trimmed) throw new Error('视频任务编号无效。');

  let payload: any;
  try {
    payload = await generateContent({
      model: VIDEO_MODEL_FAST,
      task: 'video_task_query' as any,
      billing_task: 'video_gen',
      contents: {} as any,
      config: { taskId: trimmed } as any,
    } as any);
  } catch (error) {
    const message = String((error as Error)?.message || '').toLowerCase();
    if (message.includes('task_not_exist') || message.includes('task not exist') || message.includes('task_not_ex')) {
      return { taskId: trimmed, status: 'queued', videoUrl: null };
    }
    throw error;
  }

  const status = String(payload?.status || payload?.data?.status || payload?.result?.status || 'unknown').trim();
  const candidate = [
    payload?.content?.video_url,
    payload?.content?.videoUrl,
    payload?.video_url,
    payload?.videoUrl,
    payload?.data?.content?.video_url,
    payload?.data?.video_url,
    payload?.result?.content?.video_url,
    payload?.result?.video_url,
    payload?.videos?.[0]?.url,
    payload?.videos?.[0]?.uri,
  ].find((value) => typeof value === 'string' && value.trim()) as string | undefined;

  return {
    taskId: trimmed,
    status,
    videoUrl: candidate ? candidate.trim() : null,
  };
}
