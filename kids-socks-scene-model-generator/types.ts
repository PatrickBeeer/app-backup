export enum GenerationType {
  OnFoot = 'on-foot',
  Scene = 'scene',
  Model = 'model',
  Custom = 'custom',
}

export interface GeneratedImage {
  id: string;
  type: GenerationType;
  url: string;
}

