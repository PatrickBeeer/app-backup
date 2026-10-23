export interface Option {
  label: string;
  value: string;
}

export type Ethnicity = Option;
export type SceneStyle = Option;
export type ImageType = Option;
export type AspectRatio = Option;

export interface FileWithPreview extends File {
  preview: string;
}

