export interface ImageAsset {
  file: File;
  previewUrl: string;
  base64: string;
  mimeType: string;
}

export enum GenerationStatus {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  GENERATING = 'GENERATING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export interface GeneratedResult {
  imageUrl: string;
  refImageUrl: string;
  timestamp: number;
}

