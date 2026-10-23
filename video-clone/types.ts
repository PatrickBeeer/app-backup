
export interface Shot {
  stage: string; // Stage name: 起屏吸睛, 卖点拆解, 使用场景, 品牌收尾
  description: string;
  overlayText: string;
  cameraMovement: 'Pan' | 'Zoom' | 'Orbit' | 'Static';
  duration: string;
  previewUrl?: string;
  videoUrl?: string; // New: Store video for individual shot
}

export interface AdPlan {
  category: string;
  sellingPoints: string[];
  storyboard: Shot[];
  videoPrompt: string;
}

export interface FaceSelectionPoint {
  x: number;
  y: number;
  timeSec: number;
}

export interface AppState {
  image: string | null;
  referenceVideo: string | null;
  referenceVideoDurationSec?: number | null;
  referenceVideoHasFace?: boolean;
  plan: AdPlan | null;
  videoUrl: null | string;
  isAnalyzing: boolean;
  isGeneratingImages: boolean;
  isGeneratingVideo: boolean;
  error: string | null;
  aspectRatio: '16:9' | '9:16';
  editedPrompt: string;
  shotCount: number;
}

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}
