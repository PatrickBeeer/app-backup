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
export type BackgroundStyle = string;
export type AspectRatio = '1:1' | '3:4' | '4:3' | '16:9' | '9:16' | '2:3' | '21:9';

export type TimeOfDay = 'default' | 'morning' | 'noon' | 'sunset' | 'night';
export type LightingType = 'natural' | 'studio' | 'cinematic' | 'dramatic' | 'soft';
export type ImageQuality = 'realistic' | 'editorial' | 'lifestyle' | 'film' | 'xiaohongshu';

export type ModelEthnicity = 'asian' | 'caucasian' | 'black' | 'latino' | 'southeast_asian' | 'mixed';
export type ModelAge = 'teen' | '20s' | '30s' | '40s';
export type ModelBodyShape = 'slim' | 'standard' | 'athletic' | 'curvy' | 'pear' | 'plus_size' | 'muscular' | 'petite' | 'tall';

export type ModelPose = 
  | 'standing_basic' | 'standing_crossed_arms' | 'standing_hands_pocket' | 'leaning_wall'
  | 'walking' | 'running'
  | 'sitting_stool' | 'sitting_chair' | 'sitting_floor'
  | 'looking_back' | 'side_profile'
  | 'dynamic_fashion';

export interface TryOnRequest {
  clothingImage: UploadedImage;
  modelImage?: UploadedImage | null;
  garmentCategory: GarmentCategory;
  backgroundStyle: BackgroundStyle;
  aspectRatio: AspectRatio;
  isProductFocus: boolean;
  timeOfDay: TimeOfDay;
  lighting: LightingType;
  imageQuality: ImageQuality;
  modelEthnicity: ModelEthnicity;
  modelAge: ModelAge;
  modelBodyShape: ModelBodyShape;
  modelPose: ModelPose;
  customPrompt?: string;
}

