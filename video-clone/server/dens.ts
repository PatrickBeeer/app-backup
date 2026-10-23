import { config } from './config';

export type DensDeployment = {
  deployment_id: string;
  deployment_name: string;
  model_id: string;
  model_name?: string;
  model_slug?: string;
  provider_slug?: string;
  enabled?: boolean;
  status?: string;
};

export type CloneVideoTaskRequest = {
  imageUrl: string;
  referenceVideoUrl: string;
  aspectRatio: '16:9' | '9:16';
  durationSeconds: number;
  resolution: '720p' | '1080p';
  prompt: string;
  videoDeploymentKey?: VideoDeploymentKey;
};

export type CloneSpeechTaskRequest = {
  sourceAudioUrl: string;
  sourceAudioMimeType: string;
  sourceAudioDurationSeconds?: number | null;
  resultUploadUrl: string;
  resultUploadHeaders?: Record<string, string>;
  voiceId?: string;
};

export type DensTaskStatus = {
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

type CachedDeployments = {
  video: Record<VideoDeploymentKey, DensDeployment | null>;
  speech: DensDeployment | null;
};

export type VideoDeploymentKey = 'omni' | 'kling_3' | 'turbo';

const VIDEO_DEPLOYMENT_MATCHERS: Record<VideoDeploymentKey, { name: string; slug: string }> = {
  omni: { name: 'Kling 3.0 Omni', slug: 'kling-3.0-omni' },
  kling_3: { name: 'Kling 3.0', slug: 'kling-3.0' },
  turbo: { name: 'Kling 3.0 Turbo', slug: 'kling-3.0-turbo' },
};

const FALLBACK_VIDEO_DEPLOYMENTS: Record<VideoDeploymentKey, DensDeployment> = {
  omni: {
    deployment_id: 'c7433936-45e2-45e3-8f8f-7b990fefff5f',
    deployment_name: 'Kling 3.0 Omni',
    model_id: '93262365-6866-4bc7-b3a3-4c1ee9782c62',
    model_slug: 'kling-3.0-omni',
    provider_slug: 'klingai',
    enabled: true,
    status: 'active',
  },
  kling_3: {
    deployment_id: 'a52e3ae3-4cd4-4a2f-9b59-61e4ed62968d',
    deployment_name: 'Kling 3.0',
    model_id: '207c8b87-e476-4513-9788-a9b1e1e2b47a',
    model_slug: 'kling-3.0',
    provider_slug: 'klingai',
    enabled: true,
    status: 'active',
  },
  turbo: {
    deployment_id: '9844e717-f441-44cd-805f-cc61cda04396',
    deployment_name: 'Kling 3.0 Turbo',
    model_id: '112b5900-31d4-4bb4-bdc6-437d9969e9c0',
    model_slug: 'kling-3.0-turbo',
    provider_slug: 'klingai',
    enabled: true,
    status: 'active',
  },
};

const deploymentCache: CachedDeployments = {
  video: {
    omni: null,
    kling_3: null,
    turbo: null,
  },
  speech: null,
};

function authHeaders(): HeadersInit {
  if (!config.densApiKey) {
    throw new Error('DENS_KEY is not configured for the video-clone BFF.');
  }
  return {
    Authorization: `Bearer ${config.densApiKey}`,
    'Content-Type': 'application/json',
  };
}

async function requestDens<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${config.densBaseUrl}${path}`, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(init?.headers || {}),
    },
  });

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const text = await response.text();
  let payload: any = {};
  if (text) {
    if (contentType.includes('application/json')) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { message: text };
      }
    } else {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    const message = String(payload?.error || payload?.message || payload?.detail || `HTTP ${response.status}`).trim();
    throw new Error(message || `DENS request failed (${response.status})`);
  }

  return payload as T;
}

function pickFirstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function pickFirstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractVideoUrl(payload: any): string | null {
  const direct = [
    payload?.video_url,
    payload?.videoUrl,
    payload?.url,
    payload?.uri,
    payload?.result?.video_url,
    payload?.result?.videoUrl,
    payload?.result?.url,
    payload?.result?.uri,
    payload?.result?.output?.url,
    payload?.result?.output_asset?.url,
    payload?.result?.output_asset?.fetch_url,
    payload?.data?.video_url,
    payload?.data?.videoUrl,
    payload?.videos?.[0]?.url,
    payload?.outputs?.[0],
  ];

  for (const candidate of direct) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function extractTaskError(payload: any): string | null {
  const value = pickFirstString(
    payload?.error_message,
    payload?.error,
    payload?.message,
    payload?.detail,
    payload?.result?.error_message,
    payload?.result?.error,
  );
  return value || null;
}

async function listVideoDeployments(): Promise<DensDeployment[]> {
  const payload = await requestDens<{ items?: DensDeployment[] }>(
    '/v1/capabilities/task.video_generation/deployments?provider=klingai&enabled=true&limit=20',
    { method: 'GET' },
  );
  return Array.isArray(payload?.items) ? payload.items : [];
}

async function listSpeechDeployments(): Promise<DensDeployment[]> {
  const payload = await requestDens<{ items?: DensDeployment[] }>(
    '/v1/capabilities/task.speech_to_speech/deployments?provider=elevenlabs&enabled=true&limit=20',
    { method: 'GET' },
  );
  return Array.isArray(payload?.items) ? payload.items : [];
}

export async function resolveVideoDeployment(key: VideoDeploymentKey = 'omni'): Promise<DensDeployment> {
  if (deploymentCache.video[key]) {
    return deploymentCache.video[key] as DensDeployment;
  }

  const matcher = VIDEO_DEPLOYMENT_MATCHERS[key];
  try {
    const deployments = await listVideoDeployments();
    const match = deployments.find((item) => String(item.deployment_name || '').trim() === matcher.name)
      || deployments.find((item) => String(item.model_slug || '').trim() === matcher.slug);

    if (match) {
      deploymentCache.video[key] = match;
      return match;
    }
  } catch {
    // Fall back to the last confirmed external deployment IDs when discovery is unavailable.
  }

  const fallback = FALLBACK_VIDEO_DEPLOYMENTS[key];
  if (fallback) {
    deploymentCache.video[key] = fallback;
    return fallback;
  }

  throw new Error(`${matcher.name} deployment is not available in DENS.`);
}

export async function resolveSpeechDeployment(): Promise<DensDeployment> {
  if (deploymentCache.speech) {
    return deploymentCache.speech;
  }

  const deployments = await listSpeechDeployments();
  const match = deployments.find((item) => String(item.deployment_name || '').trim() === 'ElevenLabs Voice Changer')
    || deployments.find((item) => String(item.provider_slug || '').trim() === 'elevenlabs');

  if (!match) {
    throw new Error('ElevenLabs Voice Changer deployment is not available in DENS.');
  }

  deploymentCache.speech = match;
  return match;
}

export async function createCloneVideoTask(input: CloneVideoTaskRequest): Promise<{ taskId: string; status: string }> {
  const deploymentKey = input.videoDeploymentKey || 'omni';
  const deployment = await resolveVideoDeployment(deploymentKey);
  const normalizedDuration = Math.max(4, Math.min(15, Math.ceil(Number(input.durationSeconds))));
  const mode = input.resolution === '720p' ? 'std' : 'pro';
  const clientRequestId = `video-clone-video-${Date.now()}`;
  const basePrompt = String(input.prompt || '').trim();
  const prompt = deploymentKey === 'omni'
    ? `以参考人物形象为主体。${basePrompt}`
    : basePrompt;
  const videoPayload = deploymentKey === 'omni'
    ? {
        contents: [
          {
            type: 'prompt',
            text: prompt,
          },
          {
            type: 'refer_image',
            url: input.imageUrl,
            id: 'image_1',
          },
          {
            type: 'feature_video',
            url: input.referenceVideoUrl,
            id: 'video_1',
          },
        ],
        settings: {
          resolution: input.resolution,
          duration: normalizedDuration,
          audio: 'off',
          multi_shot: false,
          aspect_ratio: input.aspectRatio,
        },
        options: {
          external_task_id: clientRequestId,
        },
      }
    : {
        prompt,
        mode,
        duration: String(normalizedDuration),
        aspect_ratio: input.aspectRatio,
        sound: 'off',
        image_list: [
          {
            image_url: input.imageUrl,
            type: 'first_frame',
          },
        ],
      };
  const payload = await requestDens<any>('/v1/capabilities/task.video_generation/create', {
    method: 'POST',
    body: JSON.stringify({
      capability: 'vid_gen',
      model_id: deployment.model_id,
      deployment_id: deployment.deployment_id,
      payload: videoPayload,
      metadata: {
        client_request_id: clientRequestId,
        diagnostic_deployment_key: deploymentKey,
      },
    }),
  });

  const taskId = pickFirstString(payload?.id, payload?.task_id, payload?.taskId);
  if (!taskId) {
    throw new Error('DENS video task did not return a task ID.');
  }

  return {
    taskId,
    status: pickFirstString(payload?.status, payload?.task_status) || 'queued',
  };
}

export async function getCloneVideoTask(taskId: string): Promise<DensTaskStatus> {
  const payload = await requestDens<any>('/v1/capabilities/task.video_generation/get', {
    method: 'POST',
    body: JSON.stringify({ task_id: taskId }),
  });

  return {
    id: taskId,
    status: pickFirstString(payload?.status, payload?.task_status) || 'unknown',
    errorMessage: extractTaskError(payload),
    videoUrl: extractVideoUrl(payload),
    progress: pickFirstNumber(payload?.progress, payload?.result?.progress),
    createdAt: parseTimestamp(payload?.created_at),
    updatedAt: parseTimestamp(payload?.updated_at),
    providerStatus: pickFirstString(
      payload?.result?.provider_status,
      payload?.result?.response?.dispatch_state,
      payload?.result?.response?.result?.dispatch_state,
    ) || null,
    providerTaskStatus: pickFirstString(
      payload?.result?.response?.result?.provider_response?.data?.status,
      payload?.result?.response?.result?.provider_response?.status,
      payload?.result?.response?.status,
    ) || null,
    providerCreatedAt: parseTimestamp(
      payload?.result?.response?.result?.provider_response?.data?.create_time,
    ),
    providerUpdatedAt: parseTimestamp(
      payload?.result?.response?.result?.provider_response?.data?.update_time,
    ),
  };
}

export async function createCloneSpeechTask(input: CloneSpeechTaskRequest): Promise<{ taskId: string; status: string }> {
  const deployment = await resolveSpeechDeployment();
  const voiceId = String(input.voiceId || config.elevenLabsVoiceId || '').trim();
  if (!voiceId) {
    throw new Error('No ElevenLabs voice ID is configured for speech-to-speech.');
  }

  const payload = await requestDens<any>('/v1/capabilities/task.speech_to_speech/create', {
    method: 'POST',
    body: JSON.stringify({
      capability: 'speech_to_speech',
      model_id: deployment.model_id,
      deployment_id: deployment.deployment_id,
      payload: {
        voice_id: voiceId,
        source_asset: {
          kind: 'audio',
          role: 'source_audio',
          fetch_url: input.sourceAudioUrl,
          mime_type: input.sourceAudioMimeType,
          ...(Number.isFinite(input.sourceAudioDurationSeconds) && (input.sourceAudioDurationSeconds || 0) > 0
            ? { duration_seconds: Number(input.sourceAudioDurationSeconds) }
            : {}),
        },
        result_target: {
          kind: 'upload_target',
          method: 'PUT',
          upload_url: input.resultUploadUrl,
          headers: input.resultUploadHeaders || {},
        },
        output_format: 'mp3_44100_128',
        enable_logging: false,
        remove_background_noise: false,
      },
      metadata: {
        client_request_id: `video-clone-speech-${Date.now()}`,
      },
    }),
  });

  const taskId = pickFirstString(payload?.id, payload?.task_id, payload?.taskId);
  if (!taskId) {
    throw new Error('DENS speech task did not return a task ID.');
  }

  return {
    taskId,
    status: pickFirstString(payload?.status, payload?.task_status) || 'queued',
  };
}

export async function getCloneSpeechTask(taskId: string): Promise<DensTaskStatus> {
  const payload = await requestDens<any>('/v1/capabilities/task.speech_to_speech/get', {
    method: 'POST',
    body: JSON.stringify({ task_id: taskId }),
  });

  return {
    id: taskId,
    status: pickFirstString(payload?.status, payload?.task_status) || 'unknown',
    errorMessage: extractTaskError(payload),
    videoUrl: null,
    progress: pickFirstNumber(payload?.progress, payload?.result?.progress),
    createdAt: parseTimestamp(payload?.created_at),
    updatedAt: parseTimestamp(payload?.updated_at),
    providerStatus: pickFirstString(
      payload?.result?.provider_status,
      payload?.result?.response?.dispatch_state,
      payload?.result?.response?.result?.dispatch_state,
    ) || null,
    providerTaskStatus: pickFirstString(
      payload?.result?.response?.result?.provider_response?.data?.status,
      payload?.result?.response?.result?.provider_response?.status,
      payload?.result?.response?.status,
    ) || null,
    providerCreatedAt: parseTimestamp(
      payload?.result?.response?.result?.provider_response?.data?.create_time,
    ),
    providerUpdatedAt: parseTimestamp(
      payload?.result?.response?.result?.provider_response?.data?.update_time,
    ),
  };
}
