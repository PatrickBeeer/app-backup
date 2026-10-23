import { fetchWithAuthFallback, readApiData } from './authenticatedFetch';

export type TaskQueueItem = {
  id: number;
  status: string;
  payload: Record<string, unknown>;
};

export type CreateTaskQueueItemRequest = {
  source_app_id: string;
  item_type: string;
  status?: string;
  payload?: Record<string, unknown>;
};

function sanitizePayload(payload?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!payload) return payload;
  const sanitized = { ...payload };
  for (const key of ['image_url', 'imageUrl', 'video_url', 'videoUrl', 'url', 'preview_url', 'previewUrl']) {
    const value = sanitized[key];
    if (typeof value === 'string' && /^(data|blob):/i.test(value.trim())) {
      delete sanitized[key];
    }
  }
  return sanitized;
}

export async function createTaskQueueItem(request: CreateTaskQueueItemRequest): Promise<TaskQueueItem> {
  const response = await fetchWithAuthFallback('/api/v1/task-manager/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...request, payload: sanitizePayload(request.payload) }),
  });
  const data = await readApiData<{ task?: TaskQueueItem }>(response, '写入任务面板失败');
  if (!data.task || typeof data.task.id !== 'number') {
    throw new Error('任务面板返回了无效任务。');
  }
  return data.task;
}
