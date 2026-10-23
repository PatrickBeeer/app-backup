// Shared types for the shuyang-studio standalone app.

export type TaskType = 'model' | 'product' | 'detail' | 'ecommerce' | 'social';

export type ImageRatio = '3:4' | '1:1' | '4:5';
export type ImageResolution = '1K' | '2K';
export type VideoRatio = '9:16' | '16:9' | '1:1' | '3:4';

export interface ProductColorHint {
  hex: string;
  rgb: [number, number, number];
}

/** A single product reference image carried as base64 (data URL or raw base64). */
export interface ReferenceImage {
  mimeType: string;
  /** Raw base64 without data URL prefix. */
  data: string;
}

/** Structured five-image main-plan produced by the text/vision planning step. */
export interface MainPlan {
  role: string;
  title: string;
  sellingPoint: string;
  prompt: string;
  layoutType: string;
  keyBenefit: string;
}

export interface MainPlanAnalysis {
  category: string;
  summary: string;
  plans: MainPlan[];
}

export interface SellingPointAnalysis {
  category: string;
  sellingPoints: string[];
  videoPrompt: string;
}

export interface VideoTaskResult {
  taskId: string | null;
  status: string;
  videoUrl: string | null;
}

/** Request params for one batched image generation flow (model or ecommerce). */
export interface GenerateImagesParams {
  taskType: TaskType;
  ratio: ImageRatio;
  resolution: ImageResolution;
  count: number;
  /** Product images (one or several views of the same product). */
  productImages: ReferenceImage[];
  userPrompt: string;
  /** Per-image refinement (ecommerce single-image refine/regenerate). */
  refineIndex?: number;
  refinePrompt?: string;
  /** Optional progress callback after each sequential image returns. */
  onPartialImage?: (index: number, dataUrl: string) => void;
  /** Optional pre-resolved main plan injection (tests / advanced callers). */
  signal?: AbortSignal;
}
