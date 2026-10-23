export enum AgeGroup {
  TODDLER = '1-3 岁 (幼儿)',
  PRESCHOOL = '3-5 岁 (学龄前)',
  SCHOOL = '5-7 岁 (学龄期)'
}

export enum Ethnicity {
  CAUCASIAN = '欧美白人',
  ASIAN = '亚洲人'
}

export enum SceneStyle {
  WARM_INDOOR = '温馨室内',
  OUTDOOR = '户外自然',
  WHITE_STUDIO = '白色无影棚',
  CUSTOM = '自定义风格'
}

export enum CompositionRatio {
  PRODUCT_FOCUS = '产品特写 (近景)',
  BALANCED = '人景平衡 (中景)',
  SCENE_FOCUS = '环境氛围 (远景)'
}

export type AspectRatio = '1:1' | '3:4' | '9:16';

export type ImageResolution = '2K' | '4K';

export interface GeneratedImage {
  id: string;
  url: string;
  createdAt: number;
}

export type GenerationStatus = 'idle' | 'uploading' | 'generating' | 'success' | 'error';

export type LightingOption = 'default' | 'warm' | 'cool' | 'studio';
export type BlurOption = 'default' | 'strong' | 'sharp';
export type ColorOption = 'default' | 'vivid' | 'soft';

export interface EditOptions {
  lighting: LightingOption;
  blur: BlurOption;
  color: ColorOption;
  customPrompt?: string;
}
