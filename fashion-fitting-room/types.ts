export enum ModelGender {
  FEMALE = 'Female',
  MALE = 'Male',
  COUPLE = 'Couple (Male & Female)'
}

export enum Ethnicity {
  CAUCASIAN = 'Caucasian',
  AFRICAN = 'African',
  ASIAN = 'Asian',
  LATIN = 'Latin',
  MIDDLE_EASTERN = 'Middle Eastern',
  MIXED = 'Mixed',
  INFLUENCER = 'Influencer', // 网红风
}

export enum BodyType {
  SLIM = 'Slim Model',
  ATHLETIC = 'Athletic/Fit',
  CURVY = 'Curvy/Plus Size',
  STANDARD = 'Standard Commercial'
}

export interface ModelSettings {
  gender: ModelGender;
  ethnicity: Ethnicity;
  age: number;
  bodyType: string;
  faceReferenceImage: string | null; // Base64
}

export interface ClothingSettings {
  garmentImages: (string | null)[]; // 支持多张服装图
  garmentType: string;
  description: string;
}

export interface SceneSettings {
  aspectRatio: "1:1" | "3:4" | "4:3" | "16:9" | "9:16";
  seed: number;
}

export interface GeneratedImage {
  id: string;
  batchId: string; // 用于将多张图关联到同一次生成
  url: string;
  prompt: string;
  timestamp: number;
}

