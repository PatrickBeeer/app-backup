
export interface GeneratedImage {
  url: string;
  alt: string;
}

export interface ProductImageInfo {
  id: string; // Unique ID for keying in React lists
  file: File;
  base64: string;
}

export enum AspectRatio {
  SQUARE = '1:1',
  PORTRAIT_4_3 = '3:4',
  LANDSCAPE_3_4 = '4:3',
  PORTRAIT_9_16 = '9:16',
  LANDSCAPE_16_9 = '16:9',
}

export enum ImageQuantity {
  ONE = 1,
  TWO = 2,
  FOUR = 4,
}

// New: Enum for Gender selection
export enum Gender {
  UNSPECIFIED = '不限',
  FEMALE = '女性',
  MALE = '男性',
}