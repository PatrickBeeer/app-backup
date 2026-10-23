import type {
  SeedanceCreatePayload,
  SeedanceTaskResponse,
  SeedreamGeneratePayload,
  SeedreamGenerateResponse,
} from '../types';

const ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const CREATE_TASK_URL = `${ARK_BASE_URL}/contents/generations/tasks`;
const QUERY_TASK_URL = `${ARK_BASE_URL}/contents/generations/tasks`;
const SEEDREAM_GENERATE_URL = `${ARK_BASE_URL}/images/generations`;

const REQUEST_TIMEOUT_MS = 300000;

async function requestJson<T>(url: string, init: RequestInit, apiKey: string): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });

    const text = await response.text();
    let payload: unknown = {};

    if (text.trim()) {
      try {
        payload = JSON.parse(text);
      } catch {
        const preview = text.replace(/\s+/g, ' ').trim().slice(0, 200);
        throw new Error(`Seedance response is not JSON (HTTP ${response.status}): ${preview}`);
      }
    }

    if (!response.ok) {
      const message =
        (payload as any)?.error?.message ||
        (payload as any)?.message ||
        (payload as any)?.error ||
        `Seedance request failed (HTTP ${response.status})`;
      throw new Error(String(message));
    }

    return payload as T;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function createSeedanceTask(payload: SeedanceCreatePayload, apiKey: string): Promise<{id: string}> {
  const created = await requestJson<{id: string}>(
    CREATE_TASK_URL,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    apiKey,
  );

  if (!created?.id) {
    throw new Error('Create task succeeded but task id is missing.');
  }

  return created;
}

export async function getSeedanceTask(taskId: string, apiKey: string): Promise<SeedanceTaskResponse> {
  const url = `${QUERY_TASK_URL}/${encodeURIComponent(taskId)}`;
  return requestJson<SeedanceTaskResponse>(
    url,
    {
      method: 'GET',
    },
    apiKey,
  );
}

export async function generateSeedreamImage(
  payload: SeedreamGeneratePayload,
  apiKey: string,
): Promise<SeedreamGenerateResponse> {
  return requestJson<SeedreamGenerateResponse>(
    SEEDREAM_GENERATE_URL,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    apiKey,
  );
}

export function isTerminalTaskStatus(status?: string): boolean {
  const normalized = String(status || '').toLowerCase();
  return ['succeeded', 'failed', 'cancelled', 'expired'].includes(normalized);
}
