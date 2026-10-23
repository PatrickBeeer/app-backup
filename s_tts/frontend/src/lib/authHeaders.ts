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
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }

  const seen = new Set<string>();
  const result: Array<{ key: AuthTokenKey; token: string }> = [];

  for (const key of AUTH_TOKEN_KEYS) {
    const token = (window.localStorage.getItem(key) || '').trim();
    if (!token || seen.has(token)) {
      continue;
    }
    seen.add(token);
    result.push({ key, token });
  }

  return result;
}

function bridgeWorkingToken(token: string): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  const trimmed = String(token || '').trim();
  if (!trimmed) {
    return;
  }

  const current = (window.localStorage.getItem('auth_token') || '').trim();
  if (current !== trimmed) {
    window.localStorage.setItem('auth_token', trimmed);
  }
}

export function getAuthHeaders(): Record<string, string> {
  const firstCandidate = listAuthTokenCandidates()[0];
  if (firstCandidate?.token) {
    return { Authorization: `Bearer ${firstCandidate.token}` };
  }
  return {};
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

    const response = await fetch(input, {
      ...init,
      headers,
      credentials: init.credentials || 'same-origin',
    });

    if (response.status === 401 && candidate.key) {
      if (
        typeof window !== 'undefined' &&
        window.localStorage &&
        shouldRemoveTokenKeyOnUnauthorized(candidate.key)
      ) {
        window.localStorage.removeItem(candidate.key);
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