export type Platform = 'all' | 'midjourney' | 'jimeng';
export type VideoPlatform = 'all' | 'veo' | 'jimeng_video' | 'hailuo';

export interface PromptResponse {
  midjourneyPrompt?: string;
  jimengPrompt?: string;
  mjTips?: string;
  veoPrompt?: string;
  jimengVideoPrompt?: string;
  hailuoPrompt?: string;
  jsonSystemPrompt?: string;
  promptAnalysis?: string;
  recommendedPlatform?: string;
  detectedAspectRatio?: string;
}

export enum GenerationStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}
