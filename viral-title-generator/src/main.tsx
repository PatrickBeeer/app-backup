import React, { StrictMode } from 'react';
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
let authRetryDisabled = false;
let lastAuthSignature = '';

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
  const current = (localStorage.getItem('auth_token') || '').trim();
  if (token && current !== token) {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('user_manager_token', token);
    sessionStorage.setItem('auth_token', token);
    sessionStorage.setItem('user_manager_token', token);
  }
}

function notifyParentAuthExpired(): void {
  try {
    window.top?.postMessage({ type: 'unityshop-auth-expired' }, window.location.origin);
  } catch {
    // Ignore cross-window messaging failures.
  }
}

function bootstrapAuthTokenFromURL() {
  const params = new URLSearchParams(window.location.search);
  const token = (params.get('auth_token') || params.get('token') || '').trim();
  if (!token) {
    return;
  }

  localStorage.setItem('auth_token', token);
  localStorage.setItem('user_manager_token', token);
  sessionStorage.setItem('auth_token', token);
  sessionStorage.setItem('user_manager_token', token);
}

function notifySessionExpired(): void {
  try {
    window.top?.postMessage({ type: 'unityshop-auth-expired' }, window.location.origin);
  } catch {
    // Ignore cross-window messaging failures.
  }
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
    authRetryDisabled = false;
    lastAuthSignature = '';
    notifySessionExpired();
    notifyParentAuthExpired();
    return null;
  }

  const authSignature = candidates.map(({ key, token }) => `${key}:${token}`).join('|');
  if (authSignature !== lastAuthSignature) {
    lastAuthSignature = authSignature;
    authRetryDisabled = false;
  }

  if (authRetryDisabled) {
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

    authRetryDisabled = false;
    bridgeAuthToken(token);
    return response;
  }

  authRetryDisabled = true;
  notifySessionExpired();
  notifyParentAuthExpired();
  return null;
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

function openRechargePrompt(): void {
  window.alert('点数不足，请充值');

  try {
    if (window.top) {
      window.top.postMessage(
        {
          type: 'unityshop-open-recharge',
          reason: 'insufficient-credits',
          message: '点数不足，请充值',
        },
        window.location.origin
      );

      if (window.top !== window) {
        return;
      }
    }
  } catch {
    // Ignore cross-window messaging failures and fall back to direct recharge.
  }

  const target = new URL('/pay-service/', window.location.origin);
  target.searchParams.set('openRecharge', '1');
  target.searchParams.set('ui_v', '20260507a');
  window.location.assign(target.toString());
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
      standalonePlatform.showRecharge();
    }
    return enough;
  },
  deductCredits: async () => false,
  refreshCredits: async () => {
    await fetchCreditBalance();
  },
  showRecharge: () => {
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
          window.location.origin
        );

        if (window.top !== window) {
          return;
        }
      }
    } catch {
      // Fall through to direct recharge page fallback.
    }

    const target = new URL('/pay-service/', window.location.origin);
    target.searchParams.set('openRecharge', '1');
    target.searchParams.set('ui_v', '20260507a');

    try {
      const popup = window.open(target.toString(), `pay_service_recharge_${Date.now()}`, 'popup=yes,width=520,height=860');
      if (popup) {
        popup.focus();
        return;
      }
    } catch {
      // Fall through to current window redirect.
    }

    window.location.assign(target.toString());
  },
  onBack: () => {
    const target = new URL('/app/', window.location.origin).toString();

    try {
      if (window.top && window.top !== window) {
        window.top.location.assign(target);
        return;
      }
    } catch {
      // Fall through to current-window redirect when top navigation is unavailable.
    }

    window.location.assign(target);
  },
};

const standaloneCosts = {
  GENERATE_TITLES: 0,
};

void fetchCreditBalance();

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(
  <StrictMode>
    <App platform={standalonePlatform as any} costs={standaloneCosts as any} />
  </StrictMode>
);
