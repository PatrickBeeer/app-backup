
export enum SceneStyle {
  CREAMY = 'CREAMY', // 奶油风
  NATURAL_WOOD = 'NATURAL_WOOD', // 原木风
  ITALIAN_MINIMALIST = 'ITALIAN_MINIMALIST', // 意式极简
  NEW_CHINESE = 'NEW_CHINESE', // 新中式
  NORDIC_BRIGHT = 'NORDIC_BRIGHT', // 北欧明亮
  INDUSTRIAL_LOFT = 'INDUSTRIAL_LOFT' // 工业风
}

export enum AspectRatio {
  SQUARE = '1:1',
  PORTRAIT_3_4 = '3:4',
  TALL = '9:16',
  WIDE = '16:9'
}

export type ImageSize = '1K' | '2K' | '4K';
export type ModelEthnicity = 'ASIAN' | 'WESTERN' | 'INTERNATIONAL';
export type ModelAge = 'YOUNG' | 'MIDDLE_AGED';

export interface StyleOption {
  id: SceneStyle;
  name: string;
  description: string;
  icon: string; 
  prompt: string; // Internal English technical prompt
  chinesePrompt: string; // User-facing Chinese description
}

export interface GeneratedImage {
  id: string;
  url: string;
  timestamp: number;
  style: SceneStyle;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
}
