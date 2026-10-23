
export enum ImageEditMode {
  CHANGE_MODEL = 'CHANGE_MODEL',
  CHANGE_BACKGROUND = 'CHANGE_BACKGROUND',
  CHANGE_BOTH = 'CHANGE_BOTH',
}

export enum AspectRatio {
  SQUARE = '1:1',
  PORTRAIT = '3:4',
  LANDSCAPE = '4:3',
  VERTICAL_VIDEO = '9:16', // More like story/reel ratio
  HORIZONTAL_VIDEO = '16:9',
}

export enum SceneOption {
  STUDIO_WHITE = 'STUDIO_WHITE',
  MINIMALIST_GREY = 'MINIMALIST_GREY',
  SOFT_LIGHT_STUDIO = 'SOFT_LIGHT_STUDIO',
  SUNLIT_BEACH = 'SUNLIT_BEACH',
  URBAN_STREET = 'URBAN_STREET',
  GREEN_PARK = 'GREEN_PARK',
  COZY_CAFE = 'COZY_CAFE',
  MODERN_LIVING_ROOM = 'MODERN_LIVING_ROOM',
  LUXURY_BOUTIQUE = 'LUXURY_BOUTIQUE',
  VINTAGE_LIBRARY = 'VINTAGE_LIBRARY',
  ABSTRACT_GEOMETRIC = 'ABSTRACT_GEOMETRIC',
  WATERCOLOR_SPLASH = 'WATERCOLOR_SPLASH',
  RUSTIC_WOOD = 'RUSTIC_WOOD',
}

export interface GeneratedImage {
  url: string;
  alt: string;
}

export interface ImagePart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

export interface TextPart {
  text: string;
}

export type ContentPart = ImagePart | TextPart;

