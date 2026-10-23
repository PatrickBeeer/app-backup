const STANDALONE_APP_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function resolveAppId(): string {
  if (typeof window !== 'undefined' && window.location) {
    const match = String(window.location.pathname || '').match(/^\/standalone\/([^/]+)(?:\/|$)/);
    const candidate = decodeURIComponent(String(match?.[1] || '')).trim();
    if (candidate && STANDALONE_APP_ID_PATTERN.test(candidate)) {
      return candidate;
    }
  }
  return 'video-clone';
}

async function postRun<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`/standalone/${encodeURIComponent(resolveAppId())}/api/run`, {
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

export type CloneJobStartResult = {
  jobId: string;
  status: string;
  videoTaskId: string;
  speechTaskId: string;
  videoDeploymentKey?: 'motion_control' | 'omni' | 'kling_3' | 'turbo';
  videoDeploymentName?: string;
};

export type CloneJobStatus = {
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  videoTaskId: string;
  speechTaskId: string;
  videoDeploymentKey?: 'motion_control' | 'omni' | 'kling_3' | 'turbo';
  videoDeploymentName?: string;
  videoStatus?: string;
  speechStatus?: string;
  videoUrl?: string;
  audioUrl?: string;
  errorMessage?: string;
};

export type CloneFramesResult = {
  frameUrls: string[];
};

export type KlingVideoTaskStartResult = {
  taskId: string;
  status: string;
  videoDeploymentKey?: 'motion_control' | 'omni' | 'kling_3' | 'turbo';
  videoDeploymentName?: string;
  requestedVideoDeploymentKey?: 'motion_control' | 'omni' | 'kling_3' | 'turbo';
};

export type KlingVideoTaskStatus = {
  taskId: string;
  status: string;
  videoUrl?: string | null;
  errorMessage?: string | null;
  progress?: number | null;
};

export const videoCloneBffService = {
  inspectReferenceVideo: (sourceUrl: string) =>
    postRun<ReferenceVideoInspection>('inspect_reference_video', { sourceUrl }),
  generateCloneFrames: (payload: {
    imageUrl: string;
    referenceVideoUrl: string;
    durationSeconds: number;
    seedreamPrompt?: string;
  }) => postRun<CloneFramesResult>('generate_clone_frames', payload),
  startKlingVideoTask: (payload: {
    imageUrl: string;
    referenceVideoUrl?: string;
    aspectRatio: '16:9' | '9:16';
    durationSeconds: number;
    resolution: '720p' | '1080p';
    prompt: string;
    videoDeploymentKey?: 'motion_control' | 'omni' | 'kling_3' | 'turbo';
  }) => postRun<KlingVideoTaskStartResult>('start_kling_video_task', payload),
  getKlingVideoTask: (taskId: string) =>
    postRun<KlingVideoTaskStatus>('get_kling_video_task', { taskId }),
  startCloneJob: (payload: {
    imageUrl: string;
    referenceVideoUrl: string;
    sourceAudioUrl: string;
    referenceVideoDurationSeconds?: number | null;
    preparedReferenceUploadUrl?: string;
    preparedReferenceUploadHeaders?: Record<string, string>;
    preparedReferencePublicUrl?: string;
    sourceAudioUploadUrl: string;
    sourceAudioUploadHeaders?: Record<string, string>;
    sourceAudioPublicUrl: string;
    sourceAudioDurationSeconds?: number | null;
    voiceSampleUrl?: string;
    voiceSampleMimeType?: string;
    voiceSampleFileName?: string;
    resultUploadUrl: string;
    resultUploadHeaders?: Record<string, string>;
    resultPublicUrl: string;
    mergedVideoUploadUrl: string;
    mergedVideoUploadHeaders?: Record<string, string>;
    mergedVideoPublicUrl: string;
    aspectRatio: '16:9' | '9:16';
    durationSeconds: number;
    resolution: '720p' | '1080p';
    prompt: string;
    seedreamPrompt?: string;
    generatedFrameUrls?: string[];
    directVideoGeneration?: boolean;
    videoDeploymentKey?: 'motion_control' | 'omni' | 'kling_3' | 'turbo';
    voiceId?: string;
  }) => postRun<CloneJobStartResult>('start_clone_job', payload),
  getCloneJob: (jobId: string) => postRun<CloneJobStatus>('get_clone_job', { jobId }),
  health: () => postRun<Record<string, unknown>>('health'),
};
