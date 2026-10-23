export type AspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
export type Resolution = '2K' | '4K';

export interface StylePreset {
  id: string;
  name: string;
  prompt: string;
  preview: string;
}

export interface GenerationSettings {
  aspectRatio: AspectRatio;
  resolution: Resolution;
  styleId: string;
  prompt: string;
  referenceImage?: string;
}
