
export enum RoomStyle {
  CREAMY_WIND = 'Creamy Wind',
  FRENCH_VINTAGE = 'French Vintage',
  MODERN_AMERICAN = 'Modern American',
  BEDROOM = 'Bedroom',
  NURSERY = 'Nursery Room',
  CUSTOM = 'Custom'
}

export enum RugMaterial {
  WOOL = 'Wool',
  SILK = 'Silk',
  JUTE = 'Jute',
  SYNTHETIC = 'Synthetic',
  SHAGGY = 'Shaggy',
  COTTON = 'Cotton',
  CUSTOM = 'Custom'
}

export enum InputType {
  FLAT_DESIGN = 'Flat Design',
  REAL_PHOTO = 'Real Photo'
}

export enum AspectRatio {
  SQUARE = '1:1',
  LANDSCAPE_43 = '4:3',
  PORTRAIT_34 = '3:4',
  LANDSCAPE_169 = '16:9',
  PORTRAIT_916 = '9:16'
}

export type ImageSize = '1K' | '2K';

export interface HistoryItem {
  id: string;
  url: string;
  timestamp: number;
}

export interface GenerationState {
  isGenerating: boolean;
  resultUrls: string[];
  lastPrompts: string[];
  error: string | null;
  progressMessage: string;
}

export interface RugImage {
  file: File;
  preview: string;
}
