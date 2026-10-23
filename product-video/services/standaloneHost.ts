const STANDALONE_APP_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export function resolveStandaloneAppId(defaultAppId = 'product-video'): string {
  if (typeof window !== 'undefined' && window.location) {
    const match = String(window.location.pathname || '').match(/^\/standalone\/([^/]+)(?:\/|$)/);
    const candidate = decodeURIComponent(String(match?.[1] || '')).trim();
    if (candidate && STANDALONE_APP_ID_PATTERN.test(candidate)) {
      return candidate;
    }
  }

  return defaultAppId;
}

export function buildStandaloneBackendUrl(assetPath: string, defaultAppId = 'product-video'): string {
  const normalizedPath = assetPath.startsWith('/') ? assetPath : `/${assetPath}`;
  return `/standalone/${encodeURIComponent(resolveStandaloneAppId(defaultAppId))}${normalizedPath}`;
}
