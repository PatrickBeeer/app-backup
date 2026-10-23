
// types.ts
export interface SceneType {
  id: string;
  name: string;
  description: string;
  promptHint: string; 
  imageUrl: string; 
}

export interface UploadedImageData {
  base64: string;
  mimeType: string;
}

export type AspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
export type ImageSize = '1K' | '2K' | '4K';
export type PerspectiveType = 'front' | 'side' | 'top';

export type ImageCount = 1 | 2 | 4;

export type ModelVersion = 'standard' | 'pro';
