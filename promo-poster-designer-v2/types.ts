export interface UserInput {
  mainTitle: string;
  subtitle: string;
  otherInfo: string;
  productImages: File[];
  aspectRatios: string[];
}

export interface GeneratedImage {
  aspectRatio: string;
  url: string | null;
  loading: boolean;
}

