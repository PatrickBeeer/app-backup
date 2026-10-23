export type VideoTask = {
  id?: string;
  taskId?: string;
  status: 'idle' | 'queued' | 'running' | 'succeeded' | 'failed';
  content?: { video_url?: string };
  error?: { message?: string } | string;
};

export type VideoRequest = {
  prompt: string;
  ratio: '9:16' | '16:9';
  duration: number;
  resolution: '720p' | '1080p';
  scene: string;
  imageDataUrls: string[];
};

export async function createVideoTask(request: VideoRequest): Promise<VideoTask> {
  const response = await fetch('/api/video/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || data.error || '视频任务创建失败');
  return { ...data, id: data.taskId || data.id, status: data.status || 'queued' };
}

export async function getVideoTask(id: string): Promise<VideoTask> {
  const response = await fetch(`/api/video/tasks/${id}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || data.error || '视频任务查询失败');
  return { ...data, id, status: data.status || 'queued' };
}
