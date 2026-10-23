export interface GeneratedImage {
  id: string;
  url: string;
  scenario: string;
  prompt: string;
  aspectRatio?: string;
}

export enum GenerationStatus {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  GENERATING = 'GENERATING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR'
}

export interface ScenarioConfig {
  id: string;
  title: string;
  promptSuffix: string;
  iconName: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  enName: string; // Used for prompt
}

export interface SceneStyle {
  id: string;
  name: string;
  description: string;
  vibe: string;
}

export type AspectRatio = '1:1' | '3:4' | '4:3' | '16:9' | '9:16';

