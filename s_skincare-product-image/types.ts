
export interface ImageFile {
  id: string;
  name: string;
  type: string;
  size: number;
  base64: string;
  previewUrl: string;
}

export type AspectRatio = '1:1' | '3:4';
export type ImageSize = '1K'; // 移除了 2K 和 4K

export interface MarketingCopy {
  mainTitle: string;
  subTitle: string;
}

export interface GeneratedImage {
  id: number;
  title: string;
  description: string;
  prompt: string;
  copy: MarketingCopy;
  src: string;
  isLoading: boolean;
  error?: string;
}

