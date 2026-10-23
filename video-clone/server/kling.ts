import { config } from './config';

export type VideoDeploymentKey = 'motion_control' | 'omni' | 'kling_3' | 'turbo';

export type CloneVideoTaskRequest = {
  imageUrl: string;
  subjectImageUrls?: string[];
  referenceVideoUrl?: string;
  aspectRatio: '16:9' | '9:16';
  durationSeconds: number;
  resolution: '720p' | '1080p';
  prompt: string;
  videoDeploymentKey?: VideoDeploymentKey;
  externalTaskId?: string;
};

export type ProviderTaskStatus = {
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

export type KlingDeployment =
  | {
    deployment_key: 'motion_control';
    deployment_name: 'TokenDance Kling 3.0 Motion Control';
    requested_key: VideoDeploymentKey;
    requested_name: string;
    model_slug: 'kling-3.0';
    endpoint_path: '/motion-control';
    is_alias: boolean;
  }
  | {
    deployment_key: 'omni';
    deployment_name: 'Kling 3.0 Omni';
    requested_key: VideoDeploymentKey;
    requested_name: string;
    model_slug: 'kling-3.0-omni';
    endpoint_path: '/omni-video/kling-3.0-omni';
    is_alias: boolean;
  };

type CloneVideoProviderKind = 'omni' | 'motion_control';

type KlingElement = {
  element_id?: string | number;
  element_name?: string;
  element_description?: string;
  element_type?: string;
  status?: string;
};

type KlingCreateResponse = {
  code?: number;
  message?: string;
  request_id?: string;
  data?: {
    id?: string;
    task_id?: string;
    status?: string;
    task_status?: string;
    create_time?: number | string;
    created_at?: number | string;
    update_time?: number | string;
    updated_at?: number | string;
    external_id?: string;
  };
};

type KlingTaskItem = {
  id?: string;
  task_id?: string;
  status?: string;
  message?: string;
  create_time?: number | string;
  created_at?: number | string;
  update_time?: number | string;
  updated_at?: number | string;
  external_id?: string;
  outputs?: Array<Record<string, unknown>>;
  task_status?: string;
  task_status_msg?: string;
  task_result?: {
    videos?: Array<{ url?: string; duration?: string }>;
    elements?: KlingElement[];
  };
};

type KlingTaskQueryResponse = {
  code?: number;
  message?: string;
  request_id?: string;
  data?: KlingTaskItem[];
};

type KlingElementCreateResponse = {
  code?: number;
  message?: string;
  request_id?: string;
  data?: {
    task_id?: string;
    task_status?: string;
    created_at?: number | string;
    updated_at?: number | string;
    task_info?: {
      external_task_id?: string;
    };
  };
};

type KlingElementTaskQueryResponse = {
  code?: number;
  message?: string;
  request_id?: string;
  data?: KlingTaskItem;
};

const DEPLOYMENT_NAME_BY_KEY: Record<VideoDeploymentKey, string> = {
  motion_control: 'TokenDance Kling 3.0 Motion Control',
  omni: 'Kling 3.0 Omni',
  kling_3: 'Kling 3.0 (alias -> Omni)',
  turbo: 'Kling 3.0 Turbo (alias -> Omni)',
};

function authHeaders(): HeadersInit {
  if (!config.klingApiKey) {
    throw new Error('KLING_API_KEY is not configured for the video-clone BFF.');
  }

  return {
    Authorization: `Bearer ${config.klingApiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function requestKling<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${config.klingBaseUrl}${path}`, {
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
    const message = String(payload?.message || payload?.error || `HTTP ${response.status}`).trim();
    throw new Error(message || `Kling request failed (${response.status})`);
  }

  if (typeof payload?.code === 'number' && payload.code !== 0) {
    const message = String(payload?.message || `Kling API error (${payload.code})`).trim();
    throw new Error(message || `Kling API error (${payload.code})`);
  }

  return payload as T;
}

async function requestTokendanceKling<T>(path: string, init?: RequestInit): Promise<T> {
  if (!config.tokendanceApiKey) {
    throw new Error('TOKENDANCE_KEY is not configured for Kling Motion Control.');
  }

  const response = await fetch(`${config.tokendanceBaseUrl}/gateway/kling/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.tokendanceApiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init?.headers || {}),
    },
  });
  const text = await response.text();
  let payload: any;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`TokenDance Kling 返回了非 JSON 响应（HTTP ${response.status}）。`);
  }
  if (!response.ok || (typeof payload?.code === 'number' && payload.code !== 0 && payload.code !== 200)) {
    throw new Error(pickFirstString(payload?.message, payload?.msg, payload?.error?.message) || `TokenDance Kling 请求失败（HTTP ${response.status}）。`);
  }
  return payload as T;
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return asNumber;
  }
  const asDate = Date.parse(value);
  return Number.isFinite(asDate) ? asDate : null;
}

function pickFirstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function extractVideoUrl(task: KlingTaskItem | null | undefined): string | null {
  const outputs = Array.isArray(task?.outputs) ? task.outputs : [];
  for (const output of outputs) {
    if (String(output?.type || '').trim().toLowerCase() !== 'video') {
      continue;
    }
    const url = pickFirstString(output?.url, output?.uri);
    if (url) {
      return url;
    }
  }

  const legacyVideos = Array.isArray(task?.task_result?.videos) ? task.task_result.videos : [];
  for (const video of legacyVideos) {
    const url = pickFirstString(video?.url);
    if (url) {
      return url;
    }
  }

  return null;
}

function parseTaskId(task: KlingTaskItem | null | undefined): string {
  return pickFirstString(task?.id, task?.task_id);
}

function parseTaskStatus(task: KlingTaskItem | null | undefined): string {
  return pickFirstString(task?.status, task?.task_status) || 'unknown';
}

function parseTaskCreatedAt(task: KlingTaskItem | null | undefined): number | null {
  return parseTimestamp(task?.create_time ?? task?.created_at);
}

function parseTaskUpdatedAt(task: KlingTaskItem | null | undefined): number | null {
  return parseTimestamp(task?.update_time ?? task?.updated_at);
}

function mapResolutionToMode(resolution: '720p' | '1080p'): 'std' | 'pro' {
  return resolution === '1080p' ? 'pro' : 'std';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseElementId(task: KlingTaskItem | null | undefined): string {
  const elements = Array.isArray(task?.task_result?.elements) ? task.task_result.elements : [];
  for (const element of elements) {
    const value = element?.element_id;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function buildMotionControlPrompt(prompt: string): string {
  const trimmed = String(prompt || '').trim();
  if (!trimmed) {
    return '请严格以参考图和@element_1作为最终唯一主体身份参考，保留参考图中的脸部五官、脸型、发型发色、肤色、年龄气质、体型比例与主要装束。参考视频只负责动作、人物朝向、镜头节奏、构图、场景、背景、道具、机位与运镜，不要继承参考视频中人物的身份。';
  }
  if (/@element_1\b/.test(trimmed)) {
    return trimmed;
  }
  return `请严格以参考图和@element_1作为最终唯一主体身份参考，保留参考图中的脸部五官、脸型、发型发色、肤色、年龄气质、体型比例与主要装束。参考视频只负责动作、人物朝向、镜头节奏、构图、场景、背景、道具、机位与运镜，不要继承参考视频中人物的身份。${trimmed}`.trim();
}

async function ensureImageElementId(imageUrl: string | string[]): Promise<string> {
  const normalizedImageUrls = (Array.isArray(imageUrl) ? imageUrl : [imageUrl])
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  const frontalImageUrl = normalizedImageUrls[0];
  if (!frontalImageUrl) {
    throw new Error('Reference image URL is required for advanced custom element creation.');
  }

  const createPayload = {
    element_name: `vc_${Date.now()}`,
    element_description: 'video clone subject identity',
    reference_type: 'image_refer',
    element_image_list: {
      frontal_image: frontalImageUrl,
      refer_images: normalizedImageUrls.map((url) => ({ image_url: url })),
    },
    external_task_id: `video-clone-element-${Date.now()}`,
  };

  const createResponse = await requestKling<KlingElementCreateResponse>('/v1/general/advanced-custom-elements/', {
    method: 'POST',
    body: JSON.stringify(createPayload),
  });

  const taskId = pickFirstString(createResponse?.data?.task_id);
  if (!taskId) {
    throw new Error('Kling advanced custom element task did not return a task ID.');
  }

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const queryResponse = await requestKling<KlingElementTaskQueryResponse>(`/v1/general/advanced-custom-elements/${encodeURIComponent(taskId)}`, {
      method: 'GET',
    });
    const task = queryResponse?.data || null;
    const status = parseTaskStatus(task).toLowerCase();
    const elementId = parseElementId(task);

    if (status === 'succeed' || status === 'succeeded') {
      if (!elementId) {
        throw new Error('Kling advanced custom element succeeded without returning an element ID.');
      }
      return elementId;
    }

    if (status === 'failed') {
      throw new Error(pickFirstString(task?.task_status_msg, task?.message) || 'Kling advanced custom element creation failed.');
    }

    await sleep(1500);
  }

  throw new Error('Timed out while waiting for Kling advanced custom element creation.');
}

export async function resolveVideoDeployment(requestedKey: VideoDeploymentKey = 'motion_control'): Promise<KlingDeployment> {
  if (requestedKey === 'motion_control') {
    return {
      deployment_key: 'motion_control',
      deployment_name: 'TokenDance Kling 3.0 Motion Control',
      requested_key: requestedKey,
      requested_name: DEPLOYMENT_NAME_BY_KEY[requestedKey],
      model_slug: 'kling-3.0',
      endpoint_path: '/motion-control',
      is_alias: false,
    };
  }

  return {
    deployment_key: 'omni',
    deployment_name: 'Kling 3.0 Omni',
    requested_key: requestedKey,
    requested_name: DEPLOYMENT_NAME_BY_KEY[requestedKey],
    model_slug: 'kling-3.0-omni',
    endpoint_path: '/omni-video/kling-3.0-omni',
    is_alias: requestedKey !== 'omni',
  };
}

export async function createCloneVideoTask(input: CloneVideoTaskRequest): Promise<{ taskId: string; status: string; providerKind: CloneVideoProviderKind }> {
  const deployment = await resolveVideoDeployment(input.videoDeploymentKey || 'motion_control');
  const normalizedDuration = Math.max(4, Math.min(15, Math.ceil(Number(input.durationSeconds))));
  const externalTaskId = String(input.externalTaskId || '').trim() || `video-clone-kling-${Date.now()}`;
  const prompt = String(input.prompt || '').trim();
  const referenceVideoUrl = String(input.referenceVideoUrl || '').trim();
  if (referenceVideoUrl && deployment.deployment_key === 'motion_control') {
    const payload = await requestTokendanceKling<KlingCreateResponse>(deployment.endpoint_path, {
      method: 'POST',
      body: JSON.stringify({
        model_name: 'kling-3.0',
        contents: [
          { type: 'prompt', text: prompt },
          { type: 'image', url: input.imageUrl },
          { type: 'video', url: referenceVideoUrl },
        ],
        settings: {
          character_orientation: 'video',
          resolution: input.resolution,
          audio: 'off',
        },
        options: { external_task_id: externalTaskId },
      }),
    });
    const taskId = pickFirstString(payload?.data?.id, payload?.data?.task_id);
    if (!taskId) {
      throw new Error('TokenDance Kling Motion Control 未返回任务 ID。');
    }
    return {
      taskId,
      status: pickFirstString(payload?.data?.status) || 'submitted',
      providerKind: 'motion_control',
    };
  }
  if (referenceVideoUrl) {
    const subjectImageUrls = [
      String(input.imageUrl || '').trim(),
      ...((Array.isArray(input.subjectImageUrls) ? input.subjectImageUrls : []).map((item) => String(item || '').trim())),
    ].filter(Boolean);
    const elementId = await ensureImageElementId(subjectImageUrls);
    const contents: Array<Record<string, unknown>> = [
      {
        type: 'prompt',
        text: buildMotionControlPrompt(prompt),
      },
      {
        type: 'image',
        url: input.imageUrl,
      },
      {
        type: 'video',
        url: referenceVideoUrl,
      },
      {
        type: 'element',
        element_id: elementId,
        id: 'element_1',
      },
    ];

    const payload = await requestKling<KlingCreateResponse>(deployment.endpoint_path, {
      method: 'POST',
      body: JSON.stringify({
        contents,
        settings: {
          character_orientation: 'video',
          resolution: input.resolution,
          audio: 'off',
        },
        options: {
          external_task_id: externalTaskId,
        },
      }),
    });

    const taskId = pickFirstString(payload?.data?.id);
    if (!taskId) {
      throw new Error('Kling task did not return a task ID.');
    }

    return {
      taskId,
      status: pickFirstString(payload?.data?.status) || 'submitted',
      providerKind: 'motion_control',
    };
  }

  const contents: Array<Record<string, unknown>> = [
    {
      type: 'prompt',
      text: prompt,
    },
    {
      type: 'first_frame',
      url: input.imageUrl,
      id: 'image_1',
    },
  ];

  const payload = await requestKling<KlingCreateResponse>(deployment.endpoint_path, {
    method: 'POST',
    body: JSON.stringify({
      contents,
      settings: {
        resolution: input.resolution,
        duration: normalizedDuration,
        audio: 'off',
        multi_shot: false,
        aspect_ratio: input.aspectRatio,
      },
      options: {
        external_task_id: externalTaskId,
      },
    }),
  });

  const taskId = pickFirstString(payload?.data?.id);
  if (!taskId) {
    throw new Error('Kling task did not return a task ID.');
  }

  return {
    taskId,
    status: pickFirstString(payload?.data?.status) || 'submitted',
    providerKind: 'omni',
  };
}

export async function getCloneVideoTask(taskId: string, providerKind: CloneVideoProviderKind = 'omni'): Promise<ProviderTaskStatus> {
  const payload = providerKind === 'motion_control'
    ? await requestTokendanceKling<KlingTaskQueryResponse>(`/motion-control/${encodeURIComponent(taskId)}`, { method: 'GET' })
    : await requestKling<KlingTaskQueryResponse>(`/tasks?task_ids=${encodeURIComponent(taskId)}`, {
      method: 'GET',
    });

  const task = Array.isArray(payload?.data)
    ? payload.data.find((item) => parseTaskId(item) === taskId) || payload.data[0]
    : payload?.data && typeof payload.data === 'object'
      ? payload.data as KlingTaskItem
      : null;

  if (!task) {
    return {
      id: taskId,
      status: 'submitted',
      errorMessage: null,
      videoUrl: null,
      progress: null,
      createdAt: null,
      updatedAt: null,
      providerStatus: null,
      providerTaskStatus: 'submitted',
      providerCreatedAt: null,
      providerUpdatedAt: null,
    };
  }

  const status = parseTaskStatus(task);
  const videoUrl = extractVideoUrl(task);
  return {
    id: parseTaskId(task) || taskId,
    status,
    errorMessage: pickFirstString(task.message, task.task_status_msg) || null,
    videoUrl,
    progress: null,
    createdAt: parseTaskCreatedAt(task),
    updatedAt: parseTaskUpdatedAt(task),
    providerStatus: pickFirstString(task.message) || null,
    providerTaskStatus: status || null,
    providerCreatedAt: parseTaskCreatedAt(task),
    providerUpdatedAt: parseTaskUpdatedAt(task),
  };
}
