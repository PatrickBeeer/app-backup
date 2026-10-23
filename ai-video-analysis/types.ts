
export interface StoryboardShot {
  shotNumber: number;
  visualContent: string;
  composition: string;
  camera: string;
  lighting: string;
  mood: string;
  isDynamicSplit: boolean;
  splitType?: 'StartFrame' | 'EndFrame' | 'Independent';
  mjPromptEn: string;
  mjPromptZh: string;
  sdParams?: string;
  directorNote?: string;
}

export interface VideoAnalysis {
  originalScript: string;
  visualStyleAnalysis: string;
  cinematographyTechniques: string;
  marketingAdvice: string; // 新增：从自媒体/电商角度给出的优化建议
  colorPalette: string[];
  directorAdvice: string;
  reimaginedStoryboard: StoryboardShot[];
  isRewrite?: boolean;
}

export enum AnalysisStatus {
  IDLE = 'idle',
  UPLOADING = 'uploading',
  ANALYZING = 'analyzing',
  COMPLETED = 'completed',
  ERROR = 'error'
}
