const AUTH_TOKEN_KEYS = [
  'auth_token',
  'user_manager_token',
  'unityshop-main-frontend-token',
  'admin_token',
] as const;

type AuthTokenKey = (typeof AUTH_TOKEN_KEYS)[number];

function shouldRemoveTokenKeyOnUnauthorized(key: AuthTokenKey): boolean {
  return key === 'auth_token' || key === 'admin_token';
}

function listAuthTokenCandidates(): Array<{ key: AuthTokenKey; token: string }> {
  const seen = new Set<string>();
  const result: Array<{ key: AuthTokenKey; token: string }> = [];
  for (const key of AUTH_TOKEN_KEYS) {
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

export async function fetchWithAuthFallback(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  const candidates = listAuthTokenCandidates();
  const attempts = candidates.length > 0 ? candidates : [{ key: null, token: '' }];
  let lastResponse: Response | null = null;

  for (const candidate of attempts) {
    const headers = new Headers(init.headers);
    if (candidate.token) {
      headers.set('Authorization', `Bearer ${candidate.token}`);
    } else {
      headers.delete('Authorization');
    }

    const response = await fetch(input, { ...init, credentials: 'same-origin', headers });
    if (response.status === 401 && candidate.key) {
      if (shouldRemoveTokenKeyOnUnauthorized(candidate.key as AuthTokenKey)) {
        localStorage.removeItem(candidate.key);
      }
      lastResponse = response;
      continue;
    }
    if (response.ok && candidate.token) {
      bridgeWorkingToken(candidate.token);
    }
    return response;
  }

  return lastResponse ?? fetch(input, init);
}

export async function readApiData<T>(response: Response, fallback: string): Promise<T> {
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
