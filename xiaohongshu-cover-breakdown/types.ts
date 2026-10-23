export interface AnalysisResult {
  toxicDiagnosis: {
    whyViral: string;
    mustCopy: string[];
    optimization: string;
  };
  mobileSop: {
    lighting: string;
    props: string[];
    steps: string[];
    vibe: string;
  };
  aiPrompts: {
    midjourney: string;
    jimeng: string;
  };
}

export enum AppState {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  ANALYZING = 'ANALYZING',
  RESULT = 'RESULT',
  ERROR = 'ERROR',
}
