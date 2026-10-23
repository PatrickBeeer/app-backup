
export enum AppState {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  GENERATING = 'GENERATING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export type ResolutionType = '2K' | '4K';
export type AspectRatioType = '1:1' | '3:4' | '9:16';

export interface Ethnicity {
  id: string;
  name: string;
  label: string;
}

export interface Outfit {
  id: string;
  name: string;
  description: string;
  prompt: string;
}

export interface GenerationStyle {
  id: string;
  name: string;
  description: string;
  iconName: string;
  prompt: string;
}

export interface GeneratedResult {
  id: string;
  originalUrl: string;
  resultUrl: string;
  timestamp: number;
  styleName: string;
  ethnicityName: string;
  outfitName: string;
  age: number;
  resolution: ResolutionType;
  aspectRatio: AspectRatioType;
}
