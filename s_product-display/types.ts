
export interface FileData {
  file: File;
  previewUrl: string;
  base64: string;
  mimeType: string;
}

export enum AppStatus {
  IDLE = 'IDLE',
  ANALYZING_PRODUCT = 'ANALYZING_PRODUCT',
  IMAGE_REVIEW = 'IMAGE_REVIEW',
  GENERATING_IMAGE = 'GENERATING_IMAGE',
  GENERATING_VIDEO = 'GENERATING_VIDEO',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export interface ProductAnalysis {
  sellingPoints: string[];
  targetAudience: string[];
  suggestedScenarios: string[];
  productType: string;
}

export interface GenerationResult {
  imageUrl?: string;
  videoUrl?: string;
  error?: string;
}