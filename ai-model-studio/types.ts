export interface ModelAnalysis {
  genderFeatures: string;
  clothingDetails: string;
  environment: string;
  lightingAndStyle: string;
}

export type AspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9' | '2:3' | '3:2';

export enum GenerationStatus {
  IDLE = 'idle',
  ANALYZING = 'analyzing',
  GENERATING = 'generating',
  SUCCESS = 'success',
  ERROR = 'error'
}

