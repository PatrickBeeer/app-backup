export type AspectRatio = "1:1" | "9:16" | "16:9" | "3:4" | "4:3";
export type StylePreset = 'japanese_wood' | 'minimalist' | 'scandinavian' | 'bohemian' | 'modern';
export type ProductType = 'crib' | 'stroller' | 'walker' | 'toy' | 'splicing_bed' | 'platform_bed' | 'other';

export interface ProcessingState {
  isAnalyzing: boolean;
  isGenerating: boolean;
  isIdentifying: boolean;
  isAnalyzingReference: boolean;
  error: string | null;
}

export interface ImageData {
  base64: string;
  mimeType: string;
}

export interface HistoryItem {
  id: string;
  imageUrls: string[];
  timestamp: number;
  aspectRatio: AspectRatio;
  stylePreset: StylePreset;
  productType: ProductType;
  userPrompt: string;
  productInputImage?: ImageData | null;
  modelInputImage?: ImageData | null;
  styleReferenceInputImage?: ImageData | null;
  referenceImagePrompt?: string;
}

export interface AppState {
  productImage: ImageData | null;
  modelImage: ImageData | null;
  styleReferenceImage: ImageData | null;
  resultImages: string[] | null;
  aspectRatio: AspectRatio;
  stylePreset: StylePreset;
  productType: ProductType;
  userPrompt: string;
  referenceImagePrompt: string;
  history: HistoryItem[];
}

