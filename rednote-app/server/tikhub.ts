// TikHub client. Ported from backend/app/clients/tikhub.py — defensive multi-shape
// adapter preserved exactly, since TikHub responses vary across web_v3/app_v2.

import { createHash } from 'node:crypto';
import { config } from './config';

export interface NoteSnapshot {
  note_id: string;
  note_type: 'image' | 'video';
  title: string;
  content: string;
  author: { id?: string; name?: string; avatar?: string };
  metrics: { likes: number; collects: number; comments: number };
  images: string[];
  video_url: string | null;
  cover_url: string | null;
}

export interface Comment {
  external_id: string;
  content: string;
  likes: number;
  author_hash: string | null;
  published_at: string | null;
}

export class TikHubError extends Error {}

type Json = any;

const XHS_SHORT_LINK_HOSTS = new Set([
  'xhslink.com',
  'www.xhslink.com',
  'xhslink.cn',
  'www.xhslink.cn',
]);

function first(data: Json, ...paths: string[]): Json {
  for (const path of paths) {
    let cur: Json = data;
    for (const part of path.split('.')) {
      if (Array.isArray(cur) && /^\d+$/.test(part)) {
        const idx = Number(part);
        cur = idx < cur.length ? cur[idx] : null;
      } else if (cur && typeof cur === 'object') {
        cur = cur[part];
      } else {
        cur = null;
        break;
      }
    }
    if (cur !== null && cur !== '' && cur !== undefined && !(Array.isArray(cur) && cur.length === 0) && !(typeof cur === 'object' && !Array.isArray(cur) && Object.keys(cur).length === 0)) {
      return cur;
    }
  }
  return null;
}

function urls(items: Json): string[] {
  if (!Array.isArray(items)) return [];
  const output: string[] = [];
  for (const item of items) {
    if (typeof item === 'string') {
      output.push(item);
    } else if (item && typeof item === 'object') {
      const url = first(item, 'url', 'url_default', 'url_size_large', 'original', 'url_multi_level.high', 'info_list.0.url');
      if (url) output.push(String(url));
    }
  }
  return output;
}

function extractNoteId(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (XHS_SHORT_LINK_HOSTS.has(parsed.hostname.toLowerCase().replace(/\.+$/, ''))) return null;
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length >= 3 && parts[0] === 'discovery' && parts[1] === 'item') return parts[2];
  for (const marker of ['explore', 'discovery', 'item']) {
    if (parts.includes(marker)) {
      const index = parts.indexOf(marker);
      if (index + 1 < parts.length) return parts[index + 1];
    }
  }
  return parts.length ? parts[parts.length - 1] : null;
}

export function normalizeNote(payload: Json): NoteSnapshot {
  let root: Json = payload?.data ?? payload;
  if (root && typeof root === 'object') root = root.data ?? root;

  let note: Json =
    first(
      payload,
      'data.data.0.note_list.0',
      'data.note',
      'data.note_card',
      'data.items.0.note_card',
      'data.note_list.0',
      'note',
      'note_card',
      'items.0.note_card',
      'note_list.0',
    ) ?? first(root && typeof root === 'object' ? root : {}, 'note', 'note_card', 'items.0.note_card', 'data.0.note_list.0', 'note_list.0') ?? root;

  const video = first(note, 'video', 'video_info') || {};
  const images = urls(first(note, 'image_list', 'images_list', 'images') || []);
  const typeValue = String(first(note, 'type', 'note_type') || 'image').toLowerCase();
  const isVideo = Boolean(video && Object.keys(video).length) || typeValue.includes('video') || typeValue.includes('视频');
  const interactions = first(note, 'interact_info', 'interaction_info', 'metrics') || note;
  const author = first(note, 'user', 'author', 'user_info') || {};

  return {
    note_id: String(first(note, 'note_id', 'id', 'noteId') || ''),
    note_type: isVideo ? 'video' : 'image',
    title: String(first(note, 'title', 'display_title') || ''),
    content: String(first(note, 'desc', 'content', 'description') || ''),
    author: {
      id: first(author, 'user_id', 'userid', 'id') ?? undefined,
      name: first(author, 'nickname', 'name') ?? '未知作者',
      avatar: first(author, 'avatar', 'image', 'headPhoto') ?? undefined,
    },
    metrics: {
      likes: Number(first(interactions, 'liked_count', 'like_count', 'likes') || 0) || 0,
      collects: Number(first(interactions, 'collected_count', 'collect_count', 'favNum') || 0) || 0,
      comments: Number(first(interactions, 'comment_count', 'comments_count', 'comments', 'cmtNum') || 0) || 0,
    },
    images,
    video_url: first(video, 'media.stream.h264.0.master_url', 'url', 'play_url', 'master_url') ?? null,
    cover_url: first(video, 'image.thumbnail_file', 'cover', 'cover_url') ?? (images[0] || null),
  };
}

// xsec_token/xsec_source are carried by every XHS share link. app_v2 endpoints
// accept (and ignore) them, while web_v3 fetch_note_detail 422s without them.
function xsecParams(sourceUrl: string): Record<string, string> {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    return {};
  }
  const out: Record<string, string> = {};
  const token = parsed.searchParams.get('xsec_token');
  const source = parsed.searchParams.get('xsec_source');
  if (token) out.xsec_token = token;
  if (source) out.xsec_source = source;
  return out;
}

export class TikHubClient {
  async _get(path: string, params: Record<string, string>): Promise<Json> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const url = new URL(config.tikhubBaseUrl + path);
        for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${config.tikhubApiToken}` },
          signal: AbortSignal.timeout(25000),
        });
        if (!response.ok) throw new TikHubError(`TikHub HTTP ${response.status}`);
        const data: Json = await response.json() as Json;
        const code = data?.code ?? 200;
        if (code !== 0 && code !== 200) {
          throw new TikHubError(data?.message_zh || data?.message || 'TikHub 请求失败');
        }
        return data;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await sleep(400 * 2 ** attempt);
      }
    }
    throw new TikHubError(String((lastError as Error)?.message || lastError));
  }

  static detailParams(sourceUrl: string): Record<string, string> {
    const noteId = extractNoteId(sourceUrl);
    return { ...xsecParams(sourceUrl), ...(noteId ? { note_id: noteId } : { share_text: sourceUrl }) };
  }

  static commentParams(noteId: string, sourceUrl: string, cursor: string, index: number, pageArea: string): Record<string, string> {
    const params: Record<string, string> = {
      ...xsecParams(sourceUrl),
      cursor,
      index: String(index),
      pageArea,
      sort_strategy: 'latest_v2',
    };
    if (noteId) params.note_id = noteId;
    else params.share_text = sourceUrl;
    return params;
  }

  async fetchNote(shareText: string): Promise<NoteSnapshot> {
    const params = TikHubClient.detailParams(shareText);
    for (const path of [
      config.tikhubImageNoteDetailPath,
      config.tikhubVideoNoteDetailPath,
      config.tikhubWebNoteDetailPath,
    ]) {
      try {
        const payload = await this._get(path, params);
        const note = normalizeNote(payload);
        if (note.title || note.content || note.images.length || note.video_url) return note;
      } catch (error) {
        if (!(error instanceof TikHubError)) throw error;
        continue;
      }
    }
    throw new TikHubError('无法获取笔记详情，请确认链接公开且有效');
  }

  async fetchComments(noteId: string, shareText: string, limit = 50): Promise<Comment[]> {
    const comments: Comment[] = [];
    let cursor = '';
    let index = 0;
    let pageArea = 'UNFOLDED';
    const toComment = (item: Json): Comment => {
      const userId = String(first(item, 'user_info.user_id', 'user.id') || '');
      return {
        external_id: String(first(item, 'id', 'comment_id') || ''),
        content: String(first(item, 'content', 'text') || ''),
        likes: Number(first(item, 'like_count', 'liked_count') || 0) || 0,
        author_hash: userId ? createHash('sha256').update(userId, 'utf8').digest('hex').slice(0, 16) : null,
        published_at: String(first(item, 'create_time', 'time') || '') || null,
      };
    };
    while (comments.length < limit) {
      let payload: Json;
      const isFirstPage = comments.length === 0;
      try {
        payload = await this._get(config.tikhubNoteCommentsPath, TikHubClient.commentParams(noteId, shareText, cursor, index, pageArea));
      } catch (error) {
        // First page is a hard failure; later pages are best-effort enrichment,
        // so a stale cursor / rate limit must not discard comments already got.
        if (isFirstPage || !(error instanceof TikHubError)) throw error;
        break;
      }
      const root = payload?.data?.data ?? payload?.data ?? {};
      const batch = first(root, 'comments', 'comment_list', 'items') || [];
      if (!Array.isArray(batch) || batch.length === 0) break;
      for (const item of batch) {
        comments.push(toComment(item));
        if (comments.length >= limit) break;
      }
      // has_more is the authoritative stop signal. The returned cursor is an
      // opaque context echo; paging with it when has_more=false makes TikHub 400.
      const hasMore = first(root, 'has_more', 'hasMore');
      if (hasMore === false || hasMore === 'false') break;

      const nextCursor = first(root, 'cursor.cursor', 'cursor');
      if (nextCursor && typeof nextCursor === 'object') {
        cursor = nextCursor.cursor || '';
        index = nextCursor.index ?? index + 1;
      } else {
        cursor = String(nextCursor || '');
        index = Number(first(root, 'index') ?? index + 1);
      }
      pageArea = String(first(root, 'pageArea', 'page_area') || pageArea);
      if (!cursor) break;
    }
    return comments;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
