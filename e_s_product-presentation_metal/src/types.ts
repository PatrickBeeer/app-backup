export interface SceneStyle {
  id: string;
  name: string;
  description: string;
  prompt: string;
  previewUrl: string;
}

export interface GenerationParams {
  styleId: string;
  customPrompt: string;
  aspectRatio: "1:1" | "3:4" | "9:16";
}
