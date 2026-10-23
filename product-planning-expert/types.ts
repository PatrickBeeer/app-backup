export interface ProductFormData {
  platform: string;
  category: string;
  targetAudience: string;
  priceRange: string;
  positioning: string;
  advantages: string;
  competitors: string;
  brandStyle: string;
}

export interface MainImageCard {
  order: number;
  goal: string;
  copy: string;
  visualSuggestion: string;
  mjPrompt: string;
}

export interface DetailPageRow {
  screen: string;
  content: string;
  visualFocus: string;
}

export interface ABTestOption {
  location: string;
  optionA: string;
  optionB: string;
  optionC?: string;
}

export interface SEOStrategy {
  coreKeywords: string[];
  longTailKeywords: string[];
  scenarioKeywords: string[];
}

export interface StrategyResult {
  analysisSummary: string;
  differentiation: string;
  competitorWeakness: string;
  styleAdvice: string[];
  seoStrategy: SEOStrategy;
  mainImages: MainImageCard[];
  detailPage: DetailPageRow[];
  abTesting: ABTestOption[];
}

export enum AppState {
  INPUT = 'INPUT',
  LOADING = 'LOADING',
  RESULT = 'RESULT',
  ERROR = 'ERROR'
}
