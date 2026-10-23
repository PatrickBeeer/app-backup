import {
  createTaskQueueItem as createRemoteTaskQueueItem,
  recordTaskManagerObject as recordRemoteTaskManagerObject,
  updateTaskQueueItem,
} from '../../../services/taskManagerService';

const TASKS_KEY = 'product-video-task-queue';

type CachedTask = {
  id: number | string;
  item_type?: string;
  status?: string;
  payload?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

function readTasks(): CachedTask[] {
  try {
    return JSON.parse(localStorage.getItem(TASKS_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeTasks(tasks: CachedTask[]): void {
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks.slice(0, 100)));
}

function cacheTask(task: CachedTask): void {
  const nextTasks = [task, ...readTasks().filter((item) => String(item?.id) !== String(task.id))];
  writeTasks(nextTasks);
}

export async function createTaskQueueItem(item: Record<string, unknown>): Promise<any> {
  const task = await createRemoteTaskQueueItem(item as any);
  cacheTask(task as CachedTask);
  return task;
}

export async function recordTaskManagerObject(item: Record<string, unknown>): Promise<any> {
  return recordRemoteTaskManagerObject(item as any);
}

export function getLatestVideoTask(): { taskId: string; status: string; videoUrl: string | null } | null {
  const task = readTasks().find((item) => item?.item_type === 'video_task');
  const payload = task?.payload || {};
  const taskId = String(payload.taskId || payload.task_id || '').trim();
  if (!taskId) {
    return null;
  }

  const videoUrl = String(payload.videoUrl || payload.video_url || '').trim() || null;
  return {
    taskId,
    status: String(payload.query_status || task.status || 'queued').trim(),
    videoUrl,
  };
}

export function updateTaskQueueVideoResult(taskId: string, status: string, videoUrl: string | null): void {
  const normalizedTaskId = String(taskId || '').trim();
  if (!normalizedTaskId) {
    return;
  }

  const tasks = readTasks();
  const nextTasks = tasks.map((task) => {
    const payload = task?.payload || {};
    const storedTaskId = String(payload.taskId || payload.task_id || '').trim();
    if (storedTaskId !== normalizedTaskId) {
      return task;
    }

    const nextTask = {
      ...task,
      status: videoUrl ? 'finished' : 'running',
      payload: {
        ...payload,
        query_status: status,
        videoUrl,
        video_url: videoUrl,
      },
    };

    if (typeof task.id === 'number') {
      void updateTaskQueueItem(task.id, {
        status: nextTask.status,
        payload: nextTask.payload,
      }).catch(() => undefined);
    }

    return nextTask;
  });

  writeTasks(nextTasks);
}
