// Browser → Node BFF client. The BFF is proxied by app-manager at
// /standalone/<appId>/api/run (same origin as the SPA), so no CORS needed.

import type { Comment, CoverPlan, FetchMediaResult, NoteSnapshot } from '../types';

const STANDALONE_APP_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function resolveAppId(): string {
  if (typeof window !== 'undefined' && window.location) {
    const match = String(window.location.pathname).match(/^\/standalone\/([^/]+)(?:\/|$)/);
    const candidate = decodeURIComponent(String(match?.[1] || '')).trim();
    if (candidate && STANDALONE_APP_ID_PATTERN.test(candidate)) return candidate;
  }
  return 'rednote-app';
}

async function postRun<T>(action: string, params: object = {}): Promise<T> {
  const url = `/standalone/${encodeURIComponent(resolveAppId())}/api/run`;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 300000); // 5 min, matches app-manager budget
  try {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...params }),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: any = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error(`BFF 返回非 JSON（HTTP ${response.status}）`);
      }
    }
    if (!response.ok || payload?.success === false) {
      throw new Error(String(payload?.message || payload?.error || `BFF 请求失败（HTTP ${response.status})`));
    }
    return (payload?.data ?? payload) as T;
  } finally {
    window.clearTimeout(timer);
  }
}

export interface ComposeCoverPayload {
  coverType: 'text_only' | 'photo_text';
  baseImageB64?: string; // data URL of the AI-generated cover (photo_text only)
  title: string;
  typography?: {
    typography_symbols: string[];
    emphasis_method: string;
    line_break_pattern: string;
    title_position: string;
  };
  visualReference?: string; // for text_only style selection
  variant?: string; // seed component for text_only (generation id)
}

export const bffService = {
  fetchNote: (url: string) => postRun<NoteSnapshot>('fetch_note', { url }),
  fetchComments: (noteId: string, url: string) =>
    postRun<Comment[]>('fetch_comments', { noteId, url }),
  fetchMedia: (params: { coverUrl: string | null; videoUrl?: string | null }) =>
    postRun<FetchMediaResult>('fetch_media', params),
  composeCover: (payload: ComposeCoverPayload) =>
    postRun<{ coverDataUrl: string }>('compose_cover', payload),
  health: () => postRun<{ status: string }>('health'),
};

export type { CoverPlan };
