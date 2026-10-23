export interface GenerateRequest {
  prompt: string;
  referenceImage?: {
    data: string;
    mimeType: string;
  } | null;
  aspectRatio: string;
  imageSize: string;
  model: string;
  numberOfImages: number;
}
