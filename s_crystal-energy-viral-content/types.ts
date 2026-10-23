export type ImageStyle = 'scene' | 'ootd' | 'natural' | 'minimalist' | 'oldMoney' | 'creamJewelry';

export type TextStyle = 'lively' | 'healing';

export type GenerationMode = '1k' | '2k';

export interface XiaohongshuPost {
  title: string;
  body: string;
  hashtags: string[];
  images: string[];
  prompts: string[];
  mode: GenerationMode;
  createdAt: string;
}
