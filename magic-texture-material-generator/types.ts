export enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  GENERATING = 'GENERATING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export interface AnalysisResult {
  visualStyle: string;
  material: string;
  elements: string;
  colorPalette: string[];
  directorNote: string;
  midjourneyPrompt: string;
  chinesePrompt: string;
}

export interface TextureMaps {
  diffuse: string | null;
  normal: string | null;
  height: string | null;
  roughness: string | null;
  metallic: string | null;
}

export interface TextureResult {
  maps: TextureMaps;
  timestamp: number;
}

