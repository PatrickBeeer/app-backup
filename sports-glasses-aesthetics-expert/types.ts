export type AspectRatio = '1:1' | '3:4' | '16:9';

export enum GenerationType {
  Poster = 'POSTER',
  Model = 'MODEL',
}

export interface UploadedImage {
  base64: string;
  mimeType: string;
}

export interface GeneratedImage {
  id: string;
  title: string;
  src: string | null;
  status: 'idle' | 'loading' | 'success' | 'error';
  type: GenerationType;
  prompt: string;
  error?: string;
}

export interface GenerationRecord {
  id: string;
  timestamp: number;
  uploadedImages: UploadedImage[];
  generatedImages: GeneratedImage[];
  aspectRatio: AspectRatio;
}

export interface FileWithPreview extends File {
  preview: string;
}
