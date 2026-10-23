const APP_ID = "product-fission";
const REQUEST_TIMEOUT_MS = 300_000;
const AUTH_TOKEN_KEYS = [
  "auth_token",
  "user_manager_token",
  "unityshop-main-frontend-token",
  "admin_token",
] as const;

export interface GenerateRequest {
  model: string;
  task: "text_gen";
  billing_task: "text_gen" | "product_analysis";
  contents: unknown;
  systemInstruction?: unknown;
  config?: Record<string, unknown>;
}

interface GenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

function endpoint(): string {
  return `/standalone/${APP_ID}/api/execute/llm-generate`;
}

function authCandidates(): string[] {
  const values = AUTH_TOKEN_KEYS
    .map((key) => localStorage.getItem(key)?.trim() || "")
    .filter(Boolean);
  return [...new Set(values), ""];
}

async function fetchWithAuthFallback(body: string, signal: AbortSignal): Promise<Response> {
  let lastResponse: Response | null = null;
  for (const token of authCandidates()) {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(endpoint(), {
      method: "POST",
      credentials: "same-origin",
      headers,
      body,
      signal,
    });
    if (response.status !== 401) return response;
    lastResponse = response;
  }
  return lastResponse as Response;
}

function humanizeError(status: number, payload: Record<string, unknown>): string {
  const raw = String(payload.error || payload.message || `HTTP ${status}`);
  const lower = raw.toLowerCase();
  if (status === 401) return "登录状态已失效，请重新登录后再试";
  if (status === 402 || lower.includes("credit") || lower.includes("balance")) {
    return "积分不足，请充值后再试";
  }
  if (lower.includes("pricing rule")) {
    return "商品裂变实验室的计费规则尚未配置，请联系管理员";
  }
  if (status === 429) return "请求过于频繁，请稍后再试";
  if (status >= 500) return "AI 服务暂时不可用，请稍后重试";
  return raw;
}

export async function generateContent(request: GenerateRequest): Promise<GenerateResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchWithAuthFallback(JSON.stringify(request), controller.signal);
    const text = await response.text();
    let payload: Record<string, unknown> = {};
    if (text) {
      try {
        payload = JSON.parse(text) as Record<string, unknown>;
      } catch {
        throw new Error(`AI 服务返回了无法识别的内容（HTTP ${response.status}）`);
      }
    }
    if (!response.ok) throw new Error(humanizeError(response.status, payload));
    if (payload.success === false) throw new Error(humanizeError(response.status, payload));
    return ((payload.data as GenerateResponse | undefined) || payload) as GenerateResponse;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("AI 分析超时，请稍后重试");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function extractText(response: GenerateResponse): string {
  return (response.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || "")
    .join("")
    .trim();
}
