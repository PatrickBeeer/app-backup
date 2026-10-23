export enum VisualStyle {
  CYBERPUNK = '3C科技风格',
  APPLE = '极简果系风格',
  COMMERCIAL = '高端商务质感'
}

export enum AspectRatio {
  SQUARE = '1:1',
  PORTRAIT = '4:5'
}

export enum TargetMarket {
  USA = '美国 (USA)',
  GERMANY = '德国 (Germany)',
  JAPAN = '日本 (Japan)',
  UK = '英国 (UK)',
  FRANCE = '法国 (France)'
}

export interface ImageStrategy {
  id: number;
  title: string;
  concept: string;
  details: string;
  aiPrompt: string;
  overlayText?: string; // Marketing text to be included or overlayed
}

export interface PlanningResponse {
  productName: string;
  style: VisualStyle;
  strategies: ImageStrategy[];
}
