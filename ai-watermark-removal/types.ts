
export interface ProcessedImage {
  original: string;
  result: string | null;
  status: 'idle' | 'detecting' | 'removing' | 'completed' | 'error';
  errorMessage?: string;
}

export enum ProcessingStep {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  DETECTING = 'DETECTING',
  REMOVING = 'REMOVING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export enum RemovalMode {
  AUTO = 'AUTO',
  MANUAL = 'MANUAL'
}
