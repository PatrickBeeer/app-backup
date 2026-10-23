// Virtual Try-On 应用的类型定义

export enum AppStatus {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export interface UploadedImage {
  file: File;
  previewUrl: string;
  base64Data: string; // Raw base64 without prefix
  mimeType: string;
}

export type GarmentCategory = 'tops' | 'bottoms' | 'outerwear' | 'dresses' | 'outfits';
export type BackgroundStyle = 'studio' | 'urban' | 'nature' | 'luxury' | 'beach';
export type AspectRatio = '1:1' | '3:4' | '4:3' | '16:9' | '9:16';

export interface TryOnRequest {
  clothingImage: UploadedImage;
  modelImage?: UploadedImage | null;
  garmentCategory: GarmentCategory;
  backgroundStyle: BackgroundStyle;
  aspectRatio: AspectRatio;
  isProductFocus: boolean;
  customPrompt?: string;
}

