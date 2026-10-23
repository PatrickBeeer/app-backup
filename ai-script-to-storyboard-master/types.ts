export type AspectRatio = '16:9' | '9:16' | '4:3' | '3:4' | '1:1';

export interface Shot {
  id: number;
  description: string; // 画面内容
  composition: string; // 构图方式
  camera: string; // 机位与焦距
  lighting: string; // 光影与色温
  mood: string; // 情绪与节奏
  type: string; // 首帧/尾帧/独立
  mjPrompt: string; // Midjourney Prompt
  cnPrompt: string; // Chinese Prompt
  sdParams?: string; // Optional SD params
  imageUrl?: string; // Generated image base64 or URL
  isGeneratingImage?: boolean;
}

export enum GenerationStatus {
  IDLE = 'idle',
  ANALYZING = 'analyzing',
  GENERATING_IMAGES = 'generating_images',
  COMPLETED = 'completed',
  ERROR = 'error'
}

export interface ScriptSettings {
  panelCount: number; // 0 for auto
  aspectRatio: AspectRatio;
  style: 'sketch' | 'cinematic' | 'anime';
}

// Token Usage & Cost Interfaces
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalImages: number;
}

export interface AnalysisResult {
  shots: Shot[];
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

