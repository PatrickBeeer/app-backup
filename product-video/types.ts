
export interface Shot {
  stage: string; // 场景名，例如：晨间唤醒、通勤补能
  description: string;
  overlayText: string;
  cameraMovement: 'Pan' | 'Zoom' | 'Orbit' | 'Static';
  duration: string;
  videoUrl?: string; // New: Store video for individual shot
}

export interface AudienceOption {
  id: string;
  name: string;
  ageRange: string;
  profile: string;
  painPoint: string;
  sellingPoint: string;
  sceneDirection: string;
}

export interface AdPlan {
  category: string;
  audience: AudienceOption | null;
  angle: string; // 脚本创意角度名称，例如：痛点直击、场景种草
  concept: string;
  sellingPoints: string[];
  storyboard: Shot[];
  videoPrompt: string;
  // 无模特模式：按目标人群偏好推导出的短视频片型（如 ASMR 静音开箱、极简高级感特写）
  videoStyle?: string;
  videoStyleReason?: string;
}

export interface AppState {
  image: string | null;
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

export interface AppPlatform {
  user: { id: number | string; username: string; credits?: number };
  credits?: number;
  checkBalance: (amount: number) => boolean;
  deductCredits: (amount: number) => Promise<boolean>;
  refreshCredits: () => Promise<void>;
  showRecharge: () => void;
  openTaskManager: () => void;
  onBack: () => void;
}

export interface AppCosts {
  [key: string]: number | undefined;
  PLAN_ANALYSIS?: number;
  SHOT_IMAGE?: number;
  SHOT_VIDEO?: number;
  FULL_VIDEO?: number;
  plan_analysis?: number;
  shot_image?: number;
  shot_video?: number;
  full_video?: number;
}

export interface AppProps {
  platform: AppPlatform;
  costs: AppCosts;
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
