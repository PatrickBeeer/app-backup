import { config } from './config';
import type { CprtVideoTask } from './cprt';

export const TOKENDANCE_MODEL = 'tokendance-seedance-2.0-mini';
const PROVIDER_MODEL = 'seedance-2.0-mini';
const TASK_PREFIX = 'tokendance:';

type TaskResponse = {
  id?: string;
  status?: string;
  content?: { video_url?: string | null };
  error?: { message?: string; code?: string } | string;
  errorMessage?: string;
  message?: string;
};

async function requestTokendance(path: string, init?: RequestInit): Promise<TaskResponse> {
  if (!config.tokendanceApiKey) {
    throw new Error('TOKENDANCE_KEY is not configured for video generation.');
  }
  const response = await fetch(`${config.tokendanceBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.tokendanceApiKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const raw = await response.text();
  let payload: TaskResponse;
  try {
    payload = JSON.parse(raw) as TaskResponse;
  } catch {
    throw new Error(`TokenDance returned invalid JSON (HTTP ${response.status}): ${raw.slice(0, 200)}`);
  }
  if (!response.ok) {
    const error = payload.error;
    const detail = typeof error === 'string' ? error : error?.message || error?.code;
    throw new Error(`TokenDance request failed (HTTP ${response.status}): ${detail || payload.errorMessage || payload.message || 'unknown error'}`);
  }
  return payload;
}

function normalizeStatus(value: string): CprtVideoTask['status'] {
  switch (value.toLowerCase()) {
    case 'succeeded':
    case 'completed':
    case 'success':
      return 'completed';
    case 'failed':
    case 'error':
    case 'cancelled':
      return 'failed';
    case 'queued':
    case 'pending':
      return 'queued';
    default:
      return 'running';
  }
}

export async function createTokendanceVideoTask(input: {
  prompt: string;
  resolution: string;
  durationSeconds: number;
  ratio?: string;
  imageUrls?: string[];
  videoUrls?: string[];
  backgroundImageUrl?: string;
  audioUrl?: string;
  generateAudio?: boolean;
}): Promise<{ taskId: string; status: string }> {
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: input.prompt }];
  for (const url of [...(input.imageUrls || []), ...(input.backgroundImageUrl ? [input.backgroundImageUrl] : [])]) {
    content.push({ type: 'image_url', image_url: { url }, role: 'reference_image' });
  }
  for (const url of input.videoUrls || []) {
    content.push({ type: 'video_url', video_url: { url }, role: 'reference_video' });
  }
  if (input.audioUrl) {
    content.push({ type: 'audio_url', audio_url: { url: input.audioUrl }, role: 'reference_audio' });
  }
  // #region debug-point A:media-hosts
  void fetch('http://127.0.0.1:7777/event', { method: 'POST', body: JSON.stringify({ sessionId: 'tokendance-submit-failure', runId: 'post-fix', hypothesisId: 'A', location: 'server/tokendance.ts:create', msg: '[DEBUG] Submitted media hosts', data: { media: content.filter((part) => part.type !== 'text').map((part) => ({ role: part.role, host: new URL(String((part[part.type as string] as { url: string }).url)).host })) }, ts: Date.now() }) }).catch(() => {});
  // #endregion
  // #region debug-point B:request-shape
  void fetch('http://127.0.0.1:7777/event', { method: 'POST', body: JSON.stringify({ sessionId: 'tokendance-submit-failure', runId: 'post-fix', hypothesisId: 'B', location: 'server/tokendance.ts:create', msg: '[DEBUG] Submission fields', data: { model: PROVIDER_MODEL, resolution: input.resolution, duration: input.durationSeconds, ratio: input.ratio || 'adaptive', generateAudio: Boolean(input.generateAudio), contentRoles: content.map((part) => part.role || 'text') }, ts: Date.now() }) }).catch(() => {});
  // #endregion
  const payload = await requestTokendance('/generations/tasks', {
    method: 'POST',
    body: JSON.stringify({
      model: PROVIDER_MODEL,
      content,
      resolution: input.resolution,
      duration: input.durationSeconds,
      ratio: input.ratio || 'adaptive',
      generate_audio: input.generateAudio || undefined,
      watermark: false,
    }),
  });
  if (!payload.id) {
    throw new Error(`TokenDance did not return a task ID: ${payload.errorMessage || payload.message || 'empty response'}`);
  }
  // #region debug-point D:accepted-task
  void fetch('http://127.0.0.1:7777/event', { method: 'POST', body: JSON.stringify({ sessionId: 'tokendance-submit-failure', runId: 'post-fix', hypothesisId: 'D', location: 'server/tokendance.ts:create', msg: '[DEBUG] Provider accepted submission', data: { taskId: payload.id, status: payload.status }, ts: Date.now() }) }).catch(() => {});
  // #endregion
  return { taskId: `${TASK_PREFIX}${payload.id}`, status: payload.status || 'queued' };
}

export function isTokendanceTask(taskId: string): boolean {
  return taskId.startsWith(TASK_PREFIX);
}

export async function getTokendanceVideoTask(taskId: string): Promise<CprtVideoTask> {
  if (!isTokendanceTask(taskId) || !taskId.slice(TASK_PREFIX.length)) {
    throw new Error('Invalid TokenDance task ID.');
  }
  const payload = await requestTokendance(`/generations/tasks/${encodeURIComponent(taskId.slice(TASK_PREFIX.length))}`);
  let status = normalizeStatus(payload.status || '');
  const videoUrl = payload.content?.video_url?.trim() || null;
  if (status === 'completed' && !videoUrl) status = 'failed';
  const error = payload.error;
  const errorCode = typeof error === 'object' && error ? error.code : undefined;
  // #region debug-point D:provider-failure
  if (status === 'failed') void fetch('http://127.0.0.1:7777/event', { method: 'POST', body: JSON.stringify({ sessionId: 'tokendance-submit-failure', runId: 'post-fix', hypothesisId: 'D', location: 'server/tokendance.ts:poll', msg: '[DEBUG] Provider task failed', data: { taskId, code: errorCode, status: payload.status, message: typeof error === 'object' && error ? error.message : error }, ts: Date.now() }) }).catch(() => {});
  // #endregion
  const detail = (typeof error === 'string' ? error : error?.message)
    || payload.errorMessage || payload.message || 'Task failed or returned no video URL.';
  return {
    taskId,
    status,
    videoUrl: status === 'completed' ? videoUrl : null,
    errorMessage: status === 'failed'
      ? `TokenDance ${errorCode ? `[${errorCode}] ` : ''}${detail} (task ID: ${taskId})`
      : null,
  };
}
