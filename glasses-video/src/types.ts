export interface AppProps {
  platform?: unknown;
  costs?: Record<string, number>;
}

export interface VideoGenerationResult {
  taskId: string | null;
  status: string;
  videoUrl: string | null;
}

export interface VideoTaskQueryResult {
  taskId: string;
  status: string;
  videoUrl: string | null;
}

export interface FileWithPreview extends File {
  preview: string;
}
