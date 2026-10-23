import { randomUUID } from 'node:crypto';

export type CloneSpeechTaskRequest = {
  sourceAudioUrl: string;
  sourceAudioMimeType: string;
  sourceAudioDurationSeconds?: number | null;
  voiceSampleUrl?: string;
  voiceSampleMimeType?: string;
  voiceSampleFileName?: string;
  resultUploadUrl: string;
  resultPublicUrl: string;
  resultUploadHeaders?: Record<string, string>;
  voiceId?: string;
};

export type SpeechTaskStatus = {
  id: string;
  status: string;
  errorMessage: string | null;
  videoUrl: string | null;
  progress: number | null;
  createdAt: number | null;
  updatedAt: number | null;
  providerStatus: string | null;
  providerTaskStatus: string | null;
  providerCreatedAt: number | null;
  providerUpdatedAt: number | null;
};

export type SpeechPipelineInfo = {
  mode: 'suspended_placeholder';
  label: string;
  suspended: boolean;
};

export function resolveSpeechPipeline(): SpeechPipelineInfo {
  return {
    mode: 'suspended_placeholder',
    label: 'Speech suspended placeholder (reuse extracted reference audio)',
    suspended: true,
  };
}

export async function resolveSpeechDeployment(): Promise<{ deployment_name: string }> {
  return {
    deployment_name: 'Speech suspended placeholder',
  };
}

export async function createCloneSpeechTask(input: CloneSpeechTaskRequest): Promise<{ taskId: string; status: string; audioUrl: string }> {
  const taskId = `speech_placeholder_${randomUUID()}`;
  return {
    taskId,
    status: 'completed',
    audioUrl: String(input.sourceAudioUrl || '').trim(),
  };
}

export async function getCloneSpeechTask(taskId: string): Promise<SpeechTaskStatus> {
  const now = Date.now();
  return {
    id: taskId,
    status: 'completed',
    errorMessage: null,
    videoUrl: null,
    progress: 100,
    createdAt: now,
    updatedAt: now,
    providerStatus: 'suspended_placeholder',
    providerTaskStatus: 'completed',
    providerCreatedAt: now,
    providerUpdatedAt: now,
  };
}
