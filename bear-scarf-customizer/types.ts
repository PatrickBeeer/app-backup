export interface GeneratedImage {
  id: string;
  url: string;
  alt: string;
}

export enum GenerationScenario {
  PRODUCT = 'product',
  COUPLE = 'couple',
  CUSTOM = 'custom',
}

