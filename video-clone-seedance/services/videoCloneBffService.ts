import { fetchWithAuthFallback } from './authenticatedFetch';

const STANDALONE_APP_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function resolveAppId(): string {
  if (typeof window !== 'undefined' && window.location) {
    const match = String(window.location.pathname || '').match(/^\/standalone\/([^/]+)(?:\/|$)/);
    const candidate = decodeURIComponent(String(match?.[1] || '')).trim();
    if (candidate && STANDALONE_APP_ID_PATTERN.test(candidate)) {
      return candidate;
    }
  }
  return 'video-clone-seedance';
}

async function postRun<T>(action: string, params: Record<string, unknown> = {}, billed = false): Promise<T> {
  const endpoint = billed ? 'api/execute/run' : 'api/run';
  const response = await fetchWithAuthFallback(`/standalone/${encodeURIComponent(resolveAppId())}/${endpoint}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  });

  const text = await response.text();
  let payload: any = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`本地服务返回了非 JSON 响应（HTTP ${response.status}）。`);
    }
  }

  if (!response.ok || payload?.success === false) {
    throw new Error(String(payload?.message || payload?.error || `本地服务请求失败（HTTP ${response.status}）。`));
  }

  return (payload?.data ?? payload) as T;
}

export type ReferenceVideoInspection = {
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  pixelArea: number | null;
  aspectRatio: number | null;
  codecName: string | null;
  formatName: string | null;
};

export type CprtModel = {
  key: string;
  label: string;
  resolutions: string[];
};

export const CPRT_MODEL_OPTIONS: CprtModel[] = [
  ...CPRT_MULTIMODAL_VIDEO_MODELS.map((key) => ({
    key,
    label: ({
      'free-video-2.0-mini-multimodal-video': 'Mini',
      'free-video-2.0-fast-multimodal-video': 'Fast',
      'free-video-2.0-multimodal-video': '2.0',
      'free-video-2.5-multimodal-video': '2.5',
    } as const)[key],
    resolutions: [...CPRT_RESOLUTIONS_BY_MODEL[key]],
  })),
];

export const CPRT_RATIO_OPTIONS = CPRT_RATIOS;

export const CPRT_DURATION_OPTIONS = CPRT_DURATION_SECONDS;

export type CloneJobStartResult = {
  jobId: string;
  taskId: string;
  status: string;
  model: string;
  pointCost: number;
};

export type CloneJobStatus = {
  jobId: string;
  taskId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  videoUrl?: string | null;
  errorMessage?: string | null;
};

export type BffHealth = {
  status: string;
  service: string;
  hasCprtKey: boolean;
};

export const videoCloneBffService = {
  health: () => postRun<BffHealth>('health'),
  inspectReferenceVideo: (sourceUrl: string) =>
    postRun<ReferenceVideoInspection>('inspect_reference_video', { sourceUrl }),
  inspectReferenceAudio: (sourceUrl: string) =>
    postRun<ReferenceVideoInspection>('inspect_reference_audio', { sourceUrl }),
  startCloneJob: (payload: {
    referenceVideoUrl: string;
    imageUrls: string[];
    audioUrls: string[];
    prompt: string;
    model: string;
    resolution: string;
    durationSeconds: number;
    ratio: string;
    realPersonMode: boolean;
  }) => postRun<CloneJobStartResult>('start_clone_job', payload, true),
  getCloneJob: (jobId: string) => postRun<CloneJobStatus>('get_clone_job', { jobId }),
};
import {
  CPRT_DURATION_SECONDS,
  CPRT_MULTIMODAL_VIDEO_MODELS,
  CPRT_RATIOS,
  CPRT_RESOLUTIONS_BY_MODEL,
} from '../shared/cprtContract';
