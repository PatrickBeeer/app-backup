
export type ImageStyle = 'scene' | 'ootd' | 'natural' | 'minimalist' | 'old_money' | 'cream_jewelry';

export type TextStyle = 'lively' | 'healing';

export interface XiaohongshuPost {
  title: string;
  body: string;
  hashtags: string[];
  images: string[];
}
