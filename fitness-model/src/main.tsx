import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const AUTH_TOKEN_KEYS = [
  'unityshop-main-frontend-token',
  'user_manager_token',
  'auth_token',
  'admin_token',
] as const;

type AuthTokenKey = (typeof AUTH_TOKEN_KEYS)[number];

const blockedTokenKeys = new Set<AuthTokenKey>();
const CREDITS_CACHE_KEY = 'user_credits';

function shouldRemoveTokenKeyOnUnauthorized(key: AuthTokenKey): boolean {
  return key === 'auth_token' || key === 'admin_token';
}

function listAuthTokens(): Array<{ key: AuthTokenKey; token: string }> {
  const result: Array<{ key: AuthTokenKey; token: string }> = [];
  const seen = new Set<string>();

  for (const key of AUTH_TOKEN_KEYS) {
    if (blockedTokenKeys.has(key)) {
      continue;
    }

    const localValue = localStorage.getItem(key);
    const sessionValue = sessionStorage.getItem(key);
    const token = (localValue || sessionValue || '').trim();
    if (!token || seen.has(token)) {
      continue;
    }

    seen.add(token);
    result.push({ key, token });
  }

  return result;
}

function bridgeAuthToken(token: string) {
  if (!token) {
    return;
  }

  localStorage.setItem('auth_token', token);
  localStorage.setItem('user_manager_token', token);
  sessionStorage.setItem('auth_token', token);
  sessionStorage.setItem('user_manager_token', token);
}

function bootstrapAuthTokenFromURL() {
  const params = new URLSearchParams(window.location.search);
  const token = (params.get('auth_token') || params.get('token') || '').trim();
  if (!token) {
    return;
  }

  bridgeAuthToken(token);
}

function parseJSONSafe(text: string): any {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function updateCachedCredits(value: unknown) {
  const next = Number(value);
  if (Number.isFinite(next)) {
    cachedCredits = next;
    localStorage.setItem(CREDITS_CACHE_KEY, String(next));
  }
}

async function fetchWithAuth(url: string, init: RequestInit): Promise<Response | null> {
  const candidates = listAuthTokens();
  if (candidates.length === 0) {
    return null;
  }

  for (const { key, token } of candidates) {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);

    const response = await fetch(url, {
      ...init,
      credentials: 'same-origin',
      headers,
    });

    if (response.status === 401) {
      blockedTokenKeys.add(key);
      if (shouldRemoveTokenKeyOnUnauthorized(key)) {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      }
      continue;
    }

    bridgeAuthToken(token);
    return response;
  }

  return null;
}

function openRecharge() {
  const message = '点数不足，请充值';
  window.alert(message);

  try {
    if (window.top) {
      window.top.postMessage(
        {
          type: 'unityshop-open-recharge',
          reason: 'insufficient-credits',
          message,
        },
        window.location.origin,
      );

      if (window.top !== window) {
        return;
      }
    }
  } catch {
    // Fall back to direct navigation below.
  }

  const target = new URL('/pay-service/', window.location.origin);
  target.searchParams.set('openRecharge', '1');
  target.searchParams.set('ui_v', '20260507a');
  window.location.assign(target.toString());
}

bootstrapAuthTokenFromURL();

let cachedCredits = Number(localStorage.getItem(CREDITS_CACHE_KEY) || '0') || 0;

async function fetchCreditBalance(): Promise<number> {
  const response = await fetchWithAuth('/user-manager/api/v1/user/credits/balance', {
    method: 'GET',
  });

  if (!response) {
    updateCachedCredits(0);
    return cachedCredits;
  }

  const text = await response.text();
  const parsed = parseJSONSafe(text);
  if (!response.ok || parsed?.success === false) {
    return cachedCredits;
  }

  const data = parsed?.data ?? parsed;
  updateCachedCredits(data?.credits ?? data?.balance);
  return cachedCredits;
}

const standalonePlatform = {
  user: {
    id: 0,
    username: 'standalone-user',
    credits: cachedCredits,
  },
  get credits() {
    return cachedCredits;
  },
  checkBalance: (amount: number) => {
    const enough = cachedCredits >= amount;
    if (!enough) {
      openRecharge();
    }
    return enough;
  },
  deductCredits: async () => false,
  refreshCredits: async () => {
    await fetchCreditBalance();
  },
  showRecharge: () => {
    openRecharge();
  },
  onBack: () => {
    const target = new URL('/app/', window.location.origin).toString();

    try {
      if (window.top && window.top !== window) {
        window.top.location.assign(target);
        return;
      }
    } catch {
      // Fall through to current-window redirect.
    }

    window.location.assign(target);
  },
};

const standaloneCosts = {
  ANALYZE_IMAGE: 0,
  GENERATE_IMAGE: 10,
  EDIT_IMAGE: 10,
  GENERATE_VIDEO: 30,
  image_gen: 10,
  text_gen: 0,
  video_gen: 30,
};

void fetchCreditBalance();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App platform={standalonePlatform as any} costs={standaloneCosts as any} />
  </StrictMode>,
);
