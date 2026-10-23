export enum JewelryType {
  NECKLACE = 'Necklace',
  EARRINGS = 'Earrings',
  RING = 'Ring',
  BRACELET = 'Bracelet',
  PENDANT = 'Pendant',
}

export enum ViewType {
  CLOSE_UP = 'Close-up',   // 特写
  MEDIUM_SHOT = 'Medium',  // 中景
  FULL_SHOT = 'Full',      // 全景
}

export enum ModelGender {
  FEMALE = 'Female',
  MALE = 'Male',
}

export enum ModelEthnicity {
  ASIAN = 'Asian',
  CAUCASIAN = 'Caucasian',
  BLACK = 'Black',
  HISPANIC = 'Hispanic',
  SOUTH_ASIAN = 'South Asian'
}

export enum ModelAge {
  YOUNG_ADULT = '18-24',
  ADULT = '25-34',
  MATURE = '35-44',
  SENIOR = '45+',
}

export enum EcommerceStyle {
  MINIMALIST = 'Minimalist', // 极简冷淡
  LUXURY = 'Luxury',         // 高级轻奢
  STREET = 'Street',         // 潮流街头
  VINTAGE = 'Vintage',       // 复古胶片
  NATURE = 'Nature',         // 清新自然
  INFLUENCER = 'Influencer', // 网红爆款
  NEW_CHINESE = 'New Chinese', // 新中式
}

export type ImageSize = '1K' | '2K' | '4K';

export interface GeneratedImageResult {
  imageUrl: string;
  timestamp: number;
}

export interface ProcessingState {
  isLoading: boolean;
  statusMessage: string;
  error?: string;
}

export type ImageSource = 'upload' | 'preset';

export interface PromptParts {
  modelDefinition: string;
  artDirection: string;
  styleAndScene: string;
  customInstructions: string;
}

