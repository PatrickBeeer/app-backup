import { config } from './config';
import {
  CPRT_DURATION_SECONDS,
  CPRT_MULTIMODAL_VIDEO_MODELS,
  CPRT_RATIOS,
  CPRT_RESOLUTIONS_BY_MODEL,
  type CprtConversionSlot,
  type CprtMultimodalVideoModel,
  toCprtProviderResolution,
} from '../shared/cprtContract';

// CPRT 多模态视频 API：https://ai-cprt-xyz.apifox.cn/ （本目录 docs/cprt/multimodal-video.md）

export {
  CPRT_DURATION_SECONDS,
  CPRT_MULTIMODAL_VIDEO_MODELS,
  CPRT_RATIOS,
  CPRT_RESOLUTIONS_BY_MODEL,
};
export type { CprtMultimodalVideoModel };

type CprtTaskCreateResult = {
  taskId?: string;
  status?: string;
  errorCode?: string;
  errorMessage?: string;
};

type CprtTaskResultItem = {
  url?: string | null;
  outputType?: string | null;
  text?: string | null;
  name?: string | null;
};

type CprtTaskQueryResult = {
  taskId?: string;
  status?: string;
  errorCode?: string;
  errorMessage?: string;
  results?: CprtTaskResultItem[] | null;
  failedReason?: Record<string, unknown> | null;
};

class CprtRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CprtRequestError';
  }
}

export type CprtVideoTask = {
  taskId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  videoUrl: string | null;
  errorMessage: string | null;
};

function authHeaders(): HeadersInit {
  if (!config.cprtApiKey) {
    throw new Error('CPRT_KEY is not configured for the video-clone-seedance BFF.');
  }

  return {
    Authorization: `Bearer ${config.cprtApiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

function normalizeStatus(status: string): CprtVideoTask['status'] {
  const normalized = String(status || '').trim().toUpperCase();
  if (['SUCCESS', 'SUCCEEDED', 'COMPLETED'].includes(normalized)) {
    return 'completed';
  }
  if (['FAILED', 'ERROR', 'CANCELLED', 'CANCELED'].includes(normalized)) {
    return 'failed';
  }
  if (['QUEUED', 'SUBMITTED', 'PENDING'].includes(normalized)) {
    return 'queued';
  }
  return 'running';
}

async function requestCprt<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${config.cprtBaseUrl}${path}`, {
      ...init,
      headers: {
        ...authHeaders(),
        ...(init?.headers || {}),
      },
    });
  } catch (error) {
    throw new Error(`CPRT 请求失败：${error instanceof Error ? error.message : 'network error'}`);
  }

  const text = await response.text();
  let payload: any = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    const nestedError = payload?.error;
    const nestedMessage = typeof nestedError === 'object' && nestedError
      ? nestedError.message
      : nestedError;
    const nestedCode = typeof nestedError === 'object' && nestedError
      ? nestedError.code
      : '';
    const message = String(
      payload?.errorMessage
      || payload?.message
      || nestedMessage
      || `HTTP ${response.status}`,
    ).trim();
    const code = String(payload?.errorCode || nestedCode || '').trim();
    throw new CprtRequestError(
      response.status,
      code,
      message || `CPRT request failed (${response.status})`,
    );
  }

  return payload as T;
}

export async function createMultimodalVideoTask(input: {
  model: CprtMultimodalVideoModel;
  prompt: string;
  resolution: string;
  durationSeconds: number;
  ratio?: string;
  imageUrls?: string[];
  videoUrls?: string[];
  audioUrls?: string[];
  realPersonMode?: boolean;
  conversionSlots?: CprtConversionSlot[];
  seed?: number;
}): Promise<{ taskId: string; status: string }> {
  const payload = await requestCprt<CprtTaskCreateResult>('/v1/chat/asyncTask', {
    method: 'POST',
    body: JSON.stringify({
      model: input.model,
      prompt: input.prompt,
      resolution: toCprtProviderResolution(input.resolution),
      duration: input.durationSeconds,
      ratio: input.ratio || undefined,
      imageUrls: input.imageUrls?.length ? input.imageUrls : undefined,
      videoUrls: input.videoUrls?.length ? input.videoUrls : undefined,
      audioUrls: input.audioUrls?.length ? input.audioUrls : undefined,
      realPersonMode: input.realPersonMode || undefined,
      conversionSlots: input.conversionSlots?.length ? input.conversionSlots : undefined,
      seed: Number.isFinite(input.seed as number) ? input.seed : undefined,
      returnOriginData: true,
    }),
  });

  const taskId = String(payload?.taskId || '').trim();
  if (!taskId) {
    throw new Error(String(payload?.errorMessage || 'CPRT 未返回任务ID。'));
  }

  return { taskId, status: String(payload?.status || 'QUEUED') };
}

export async function getMultimodalVideoTask(taskId: string): Promise<CprtVideoTask> {
  let payload: CprtTaskQueryResult;
  try {
    payload = await requestCprt<CprtTaskQueryResult>(
      `/v1/chat/asyncTask/${encodeURIComponent(taskId)}`,
    );
  } catch (error) {
    const isPublicTaskId = /^\d{14}_[A-Za-z0-9_-]+$/.test(taskId);
    const isRecoverablePollError = error instanceof CprtRequestError
      && (error.status === 429 || error.status >= 500);
    if (isPublicTaskId && isRecoverablePollError) {
      return {
        taskId,
        status: 'running',
        videoUrl: null,
        errorMessage: null,
      };
    }
    throw error;
  }

  let status = normalizeStatus(String(payload?.status || ''));
  const videoResult = Array.isArray(payload?.results)
    ? payload.results.find((item) => String(item?.name || '') === 'videoUrl' && String(item?.url || '').trim())
    : null;

  let failedMessage = String(
    payload?.errorMessage
    || payload?.errorCode
    || (payload?.failedReason && Object.keys(payload.failedReason).length ? JSON.stringify(payload.failedReason) : '')
    || '',
  ).trim();

  const videoUrl = String(videoResult?.url || '').trim() || null;
  if (status === 'completed' && !videoUrl) {
    status = 'failed';
    failedMessage = failedMessage || 'CPRT 任务已完成，但未返回视频地址。';
  }

  return {
    // CPRT may return an internal numeric ID here. Only the public ID returned
    // by task creation is valid for subsequent /asyncTask/{id} queries.
    taskId,
    status,
    videoUrl: status === 'completed' ? videoUrl : null,
    errorMessage: status === 'failed' ? failedMessage || '视频生成失败。' : null,
  };
}
