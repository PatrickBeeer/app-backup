// Shared geminiProxyService pattern：浏览器侧直接走 app-manager 的 LLM 执行端点 + COS presign。
// 不再走 Vite 代理（vite.config.ts 的 /api/gemini/generate 中间件已移除）。
//
// 端点：
// - LLM 生成：POST /standalone/<app_id>/api/execute/llm-generate
// - COS presign：POST /standalone/<app_id>/api/execute/cos/presign-upload（返回 snake_case 字段）
//
// 鉴权：从 localStorage 候选键取 Bearer token；401 时按规则丢弃并重试下一个候选。

export interface GeminiGenerateRequest {
  model: string;
  task: string;
  billing_task?: string;
  contents?: unknown;
  config?: Record<string, unknown>;
  systemInstruction?: unknown;
}

const STANDALONE_APP_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

const AUTH_TOKEN_KEYS = [
  'unityshop-main-frontend-token',
  'user_manager_token',
  'auth_token',
  'admin_token',
] as const;

type AuthTokenKey = (typeof AUTH_TOKEN_KEYS)[number];
const blockedTokenKeys = new Set<AuthTokenKey>();

function shouldRemoveTokenKeyOnUnauthorized(key: AuthTokenKey): boolean {
  return key === 'auth_token' || key === 'admin_token';
}

function listAuthTokenCandidates(): Array<{ key: AuthTokenKey; token: string }> {
  const seen = new Set<string>();
  const result: Array<{ key: AuthTokenKey; token: string }> = [];
  for (const key of AUTH_TOKEN_KEYS) {
    if (blockedTokenKeys.has(key)) continue;
    const token = (localStorage.getItem(key) || '').trim();
    if (token && !seen.has(token)) {
      seen.add(token);
      result.push({ key, token });
    }
  }
  return result;
}

function bridgeWorkingToken(token: string): void {
  const current = (localStorage.getItem('auth_token') || '').trim();
  if (token && current !== token) {
    localStorage.setItem('auth_token', token);
  }
}

function notifySessionExpired(): void {
  try {
    window.top?.postMessage({ type: 'unityshop-auth-expired' }, window.location.origin);
  } catch {
    // 跨窗口消息失败时静默忽略。
  }
}

function resolveAppId(): string {
  if (typeof window !== 'undefined' && window.location) {
    const match = String(window.location.pathname || '').match(/^\/standalone\/([^/]+)(?:\/|$)/);
    const candidate = decodeURIComponent(String(match?.[1] || '')).trim();
    if (candidate && STANDALONE_APP_ID_PATTERN.test(candidate)) {
      return candidate;
    }
  }
  return 'video-clone-v3';
}

// 安全序列化：丢弃函数、DOM 节点等不可序列化值，避免循环引用抛错。
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, val) => {
    if (val === undefined) return undefined;
    if (typeof val === 'function') return undefined;
    if (typeof val === 'object' && val !== null) {
      if (typeof (val as { nodeType?: unknown }).nodeType === 'number') return '[dom-node]';
      if (typeof (val as { $$typeof?: unknown }).$$typeof !== 'undefined') return '[react-element]';
      if (seen.has(val as object)) return '[circular]';
      seen.add(val as object);
    }
    return val;
  }) as string;
}

async function fetchWithAuthFallback(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  const candidates = listAuthTokenCandidates();
  if (candidates.length === 0) {
    notifySessionExpired();
    throw new Error('未找到登录凭证，请先登录。');
  }

  let lastResponse: Response | null = null;
  for (const { key, token } of candidates) {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);

    const response = await fetch(input, { ...init, credentials: 'same-origin', headers });
    if (response.status === 401) {
      blockedTokenKeys.add(key);
      if (shouldRemoveTokenKeyOnUnauthorized(key)) {
        localStorage.removeItem(key);
      }
      lastResponse = response;
      continue;
    }
    bridgeWorkingToken(token);
    return response;
  }

  notifySessionExpired();
  return lastResponse ?? fetch(input, init);
}

async function readApiData<T>(response: Response, fallback: string): Promise<T> {
  const text = await response.text();
  let payload: any = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`${fallback}: non-JSON response (HTTP ${response.status}).`);
    }
  }
  if (!response.ok || payload?.success === false) {
    throw new Error(String(payload?.message || payload?.error || `${fallback} (HTTP ${response.status}).`));
  }
  return (payload?.data ?? payload) as T;
}

async function parseResponse(response: Response): Promise<any> {
  const text = await response.text();
  let payload: any = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { text };
  }
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || `API request failed: ${response.status}`);
  }
  return payload;
}

function standalonePath(suffix: string): string {
  return `/standalone/${encodeURIComponent(resolveAppId())}${suffix}`;
}

// BFF 基址：生产环境下 nginx 把 /video-clone-v3-bff/ 转发到独立 BFF（端口 9896）。
// 开发模式下 vite 中间件在 :1111 直接处理 /api/*，返回空串走同源。
function bffBase(): string {
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/standalone/video-clone-v3/')) {
    return '/video-clone-v3-bff';
  }
  return '';
}

export async function generateContent(request: GeminiGenerateRequest): Promise<any> {
  const configuredTimeout = Number(request.config?.timeoutMs);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 120_000;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  // 混合路由：
  // - seedance2 / kling 的「新建任务」（config.taskId 为空）走 app-manager 计费端点
  //   /standalone/<app_id>/api/execute/run（action=start_clone_job），由 app-manager
  //   向 BFF 询价（quote_clone_job）并扣费后再转发到 BFF 的视频生成逻辑。
  // - seedance2 / kling 的「任务查询」（config.taskId 已设置）继续走 BFF 直连
  //   /api/gemini/generate，不经 app-manager 计费（避免重复扣费）。
  // - 文本/图片生成、veo31/grokv3/jimeng 走 app-manager 共享 LLM 网关（Bearer token）。
  const config = (request.config as Record<string, unknown> | undefined) ?? {};
  const provider = config.provider;
  const isVideoProvider = provider === 'seedance2' || provider === 'kling' || provider === 'cprt';
  const hasTaskId = Boolean(String(config.taskId || '').trim());
  const isBilledVideoGen = isVideoProvider && !hasTaskId;
  try {
    if (isBilledVideoGen) {
      const response = await fetchWithAuthFallback(standalonePath('/api/execute/run'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: safeStringify({ action: 'start_clone_job', ...request }),
        signal: controller.signal,
      });
      // BFF 把上游 payload 包成 {success, data, message}；readApiData 自动解包 data。
      return await readApiData(response, '视频生成失败');
    }
    if (isVideoProvider) {
      // 任务查询：BFF 直连，未经 app-manager 计费。
      const response = await fetch(`${bffBase()}/api/gemini/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: safeStringify(request),
        signal: controller.signal,
      });
      return await parseResponse(response);
    }
    const response = await fetchWithAuthFallback(standalonePath('/api/execute/llm-generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: safeStringify(request),
      signal: controller.signal,
    });
    return await parseResponse(response);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`请求超过 ${Math.ceil(timeoutMs / 1000)} 秒未响应，已停止等待，请重试。`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function extractTextFromResponse(response: any): string {
  return (
    response?.text ||
    response?.output_text ||
    response?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') ||
    ''
  );
}

export function extractJsonTextFromResponse(response: any): string {
  const text = extractTextFromResponse(response);
  if (text) return text;
  return JSON.stringify(response?.json || response?.output || response?.data);
}

export function extractImageFromResponse(response: any): string | null {
  const part = response?.candidates?.[0]?.content?.parts?.find((item: any) => item?.inlineData?.data);
  if (part?.inlineData?.data) {
    return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
  }
  return response?.imageUrl || response?.image_url || response?.data?.imageUrl || null;
}

// 浏览器侧 COS presign：先向 app-manager 申请预签名上传 URL，再把字节直接 PUT 到 COS。
// 返回的 signed_url 即可作为素材公网 URL 交给 CPRT（24h 有效）。
export async function uploadAssetToCOSWithPresignedURL(
  blob: Blob,
  options: { fileName?: string; contentType?: string; objectPath?: string } = {},
): Promise<{ signedUrl: string; publicUrl: string; objectKey: string }> {
  const fileName = String(options.fileName || 'asset.bin');
  const contentType = String(options.contentType || blob.type || 'application/octet-stream');
  const objectPath = String(options.objectPath || `standalone/${resolveAppId()}/uploads/${Date.now()}-${fileName}`);

  const presignResponse = await fetchWithAuthFallback(standalonePath('/api/execute/cos/presign-upload'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_name: fileName,
      content_type: contentType,
      object_path: objectPath,
      app_id: resolveAppId(),
    }),
  });

  // 服务端返回 snake_case（与 api-manager PresignCOSUploadResult 对齐）。
  const presign = await readApiData<{
    bucket_name: string;
    region: string;
    object_key: string;
    public_url: string;
    signed_url: string;
    upload_url: string;
    url: string;
    headers?: Record<string, string>;
  }>(presignResponse, 'COS presign 失败');

  const uploadResponse = await fetch(presign.upload_url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      ...(presign.headers ?? {}),
    },
    body: blob,
  });
  if (!uploadResponse.ok) {
    const text = await uploadResponse.text().catch(() => '');
    throw new Error(`COS 直传失败（${uploadResponse.status}）：${text || uploadResponse.statusText}`);
  }

  return {
    signedUrl: presign.signed_url || presign.public_url || presign.url,
    publicUrl: presign.public_url || presign.signed_url || presign.url,
    objectKey: presign.object_key,
  };
}

export async function uploadDataUrlToCOS(
  dataUrl: string,
  options: { fileName?: string; contentType?: string; objectPath?: string } = {},
): Promise<string> {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) throw new Error('素材不是有效的 Base64 data: URL。');
  const mimeType = match[1];
  const base64 = match[2];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  const result = await uploadAssetToCOSWithPresignedURL(blob, {
    ...options,
    contentType: options.contentType || mimeType,
  });
  return result.signedUrl;
}

// BFF 调用：POST /standalone/<app_id>/api/run（unbilled）或 /api/execute/run（billed）。
export async function postRun<T>(
  action: string,
  params: Record<string, unknown> = {},
  billed = false,
): Promise<T> {
  const endpoint = billed ? 'api/execute/run' : 'api/run';
  const response = await fetchWithAuthFallback(standalonePath(`/${endpoint}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: safeStringify({ action, ...params }),
  });
  return readApiData<T>(response, '本地服务请求失败');
}
