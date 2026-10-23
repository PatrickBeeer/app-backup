const DEFAULT_LLM_EXECUTE_ENDPOINT = '/api_manager/api/v1/execute/llm-generate';
const STANDALONE_APP_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export function getLLMExecuteEndpoint(): string {
  if (typeof window === 'undefined' || !window.location) {
    return DEFAULT_LLM_EXECUTE_ENDPOINT;
  }

  const match = String(window.location.pathname || '').match(/^\/standalone\/([^/]+)(?:\/|$)/);
  const candidate = decodeURIComponent(String(match?.[1] || '')).trim();
  if (!candidate || !STANDALONE_APP_ID_PATTERN.test(candidate)) {
    return DEFAULT_LLM_EXECUTE_ENDPOINT;
  }

  return `/standalone/${encodeURIComponent(candidate)}/api/execute/llm-generate`;
}