type TaskQueuePayload = {
  source_app_id: string;
  item_type: string;
  status: string;
  payload: Record<string, unknown>;
};

export async function createTaskQueueItem(item: TaskQueuePayload): Promise<TaskQueuePayload> {
  console.info('[standalone-preview] task queue item skipped', item);
  return item;
}

export async function recordTaskManagerObject(object: Record<string, unknown>): Promise<Record<string, unknown>> {
  return {
    ...object,
    object_id: `standalone-${Date.now()}`,
  };
}
