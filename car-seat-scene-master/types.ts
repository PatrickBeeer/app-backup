export interface GeneratedImage {
  url: string;
  title: string;
}

export enum GenerationStatus {
  IDLE = 'idle',
  GENERATING = 'generating',
  SUCCESS = 'success',
  ERROR = 'error'
}

export type SceneCategory = 'standard' | 'convertible';

