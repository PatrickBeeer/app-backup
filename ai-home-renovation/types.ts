export interface ImageFile {
  file: File;
  previewUrl: string;
  base64: string;
  width: number;
  height: number;
}

export enum GenerationStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export interface GeneratedResult {
  imageUrl: string;
  description?: string;
}