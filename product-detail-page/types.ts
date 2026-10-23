
export enum ModelTier {
  PRO = 'Pro (Gemini 3)'
}

export enum ImageResolution {
  RES_1K = '1K'
}

export enum AspectRatio {
  SQUARE = '1:1',
  PORTRAIT = '9:16',
  PORTRAIT_3_4 = '3:4'
}

export enum TargetAudience {
  WHITE_COLLAR = '新锐白领',
  MIDDLE_CLASS = '资深中产',
  EXQUISITE_MAMA = '精致妈妈',
  GEN_Z = 'Z世代',
  SMALL_TOWN_YOUTH = '小镇青年',
  SILVER_FOX = '都市银发',
  BLUE_COLLAR = '都市蓝领',
  SMALL_TOWN_SPENDER = '小镇阔太'
}

export interface ProductAnalysis {
  name: string;
  category: string;
  topBrands: string[];
  visualFeatures: string[];
  mood: string[];
  summary: string;
}

export interface DesignTheme {
  id: string;
  title: string;
  rationale: string;
  visualStyle: string;
  structureOutline: string;
}

export interface PageSection {
  id: string;
  sectionNumber: number;
  sectionType: string;
  copywriting: string;
  visualPrompt: string;
  specs?: string; 
  imageUrl?: string;
  imageHistory: string[];
  historyIndex: number;
  isGeneratingImage: boolean;
  isEditingImage: boolean;
  modelTier: ModelTier;
  resolution: ImageResolution;
  aspectRatio: AspectRatio;
}

export interface PageStructureItem {
  sectionNumber: number;
  sectionType: string;
  visual: string;
  copywriting: string;
}
