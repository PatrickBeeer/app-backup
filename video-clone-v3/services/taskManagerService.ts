const TASKS_KEY = 'video-clone-task-queue';

function readTasks(): any[] {
  try { return JSON.parse(localStorage.getItem(TASKS_KEY) || '[]'); } catch { return []; }
}

export async function createTaskQueueItem(item: Record<string, unknown>): Promise<any> {
  const task = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...item };
  localStorage.setItem(TASKS_KEY, JSON.stringify([task, ...readTasks()].slice(0, 100)));
  return task;
}

export async function recordTaskManagerObject(item: Record<string, unknown>): Promise<any> {
  return { id: crypto.randomUUID(), ...item };
}

export function getLatestVideoTask(): { taskId: string; status: string; videoUrl: string | null } | null {
  const task = readTasks().find((item) => item?.item_type === 'video_task');
  const payload = task?.payload || {};
  const taskId = String(payload.taskId || payload.task_id || '').trim();
  if (!taskId) return null;
  const videoUrl = String(payload.videoUrl || payload.video_url || '').trim() || null;
  return {
    taskId,
    status: String(payload.query_status || task.status || 'queued').trim(),
    videoUrl,
  };
}

export function updateTaskQueueVideoResult(taskId: string, status: string, videoUrl: string | null): void {
  const normalizedTaskId = String(taskId || '').trim();
  if (!normalizedTaskId) return;
  const tasks = readTasks();
  const nextTasks = tasks.map((task) => {
    const payload = task?.payload || {};
    const storedTaskId = String(payload.taskId || payload.task_id || '').trim();
    if (storedTaskId !== normalizedTaskId) return task;
    return {
      ...task,
      status: videoUrl ? 'finished' : task.status,
      payload: {
        ...payload,
        query_status: status,
        videoUrl,
        video_url: videoUrl,
      },
    };
  });
  localStorage.setItem(TASKS_KEY, JSON.stringify(nextTasks));
}
