// Shared types for the jade-main-image-app standalone app.

export interface ImageInput {
  image: string; // base64 (no data URL prefix)
  mime?: string;
  name?: string;
}

export interface Dimensions {
  width: number;
  height: number;
  depth: number;
}

export type AspectRatio = '3:4' | '1:1' | '9:16' | '16:9';

export type Quality = '1K' | '4K';

export type GenModel = 'gemini' | 'gptimage';

export type Audience =
  | 'young_woman'
  | 'mature_woman'
  | 'young_man'
  | 'mature_man'
  | 'no_model';

export type Occupancy = 'small' | 'standard' | 'large';

export interface Scene {
  id: string;
  title: string;
  purpose: string;
  lens: string;
  lighting: string;
  composition: string;
  background: string;
  shadow: string;
  feel: string;
  extra: string;
}

export interface IdentityLock {
  overall: string;
  sourceDimensions: string;
  referenceImageCount: number;
  identityRule: string;
}

export interface Settings {
  size: AspectRatio;
  quality: Quality;
  model: GenModel;
  audience: Audience;
  extra_prompt: string;
  dimensions: Partial<Dimensions>;
}

export interface SceneResult {
  scene: string;
  title: string;
  url?: string;       // object URL for display + download
  base64?: string;    // raw PNG base64 (kept for refresh/seed of next pass)
  error?: string;
  status: 'idle' | 'loading' | 'done' | 'error';
}

export const SCENE_IDS = ['01', '02', '03', '04', '05'] as const;
export type SceneId = (typeof SCENE_IDS)[number];

export const QUALITY_TARGETS: Record<Quality, number> = {
  '1K': 1024,
  '4K': 4096,
};

export const RATIO_PAIRS: Record<AspectRatio, [number, number]> = {
  '3:4': [3, 4],
  '1:1': [1, 1],
  '9:16': [9, 16],
  '16:9': [16, 9],
};

export const RATIO_LABELS: Record<AspectRatio, string> = {
  '3:4': '竖版 3:4 比例',
  '1:1': '正方形 1:1 比例',
  '9:16': '竖版 9:16 比例（手机全屏）',
  '16:9': '横版 16:9 比例',
};
