// BFF config. Loads .run/rednote-app.env (dotenv). The TIKHUB token stays
// server-side — never shipped to the browser.

import dotenv from 'dotenv';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.run', 'rednote-app.env');
dotenv.config({ path: envPath });

function env(key: string, fallback = ''): string {
  const value = process.env[key];
  return value === undefined || value === '' ? fallback : value;
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: envInt('PORT', 9899),
  tikhubApiToken: env('TIKHUB_API_TOKEN'),
  tikhubBaseUrl: env('TIKHUB_BASE_URL', 'https://api.tikhub.io').replace(/\/+$/, ''),
  tikhubWebNoteDetailPath: env('TIKHUB_WEB_NOTE_DETAIL_PATH', '/api/v1/xiaohongshu/web_v3/fetch_note_detail'),
  tikhubImageNoteDetailPath: env('TIKHUB_IMAGE_NOTE_DETAIL_PATH', '/api/v1/xiaohongshu/app_v2/get_image_note_detail'),
  tikhubVideoNoteDetailPath: env('TIKHUB_VIDEO_NOTE_DETAIL_PATH', '/api/v1/xiaohongshu/app_v2/get_video_note_detail'),
  tikhubNoteCommentsPath: env('TIKHUB_NOTE_COMMENTS_PATH', '/api/v1/xiaohongshu/app_v2/get_note_comments'),
  maxMediaBytes: envInt('MAX_MEDIA_BYTES', 20_000_000),
  bannedTerms: env('BANNED_TERMS', '百分百,绝对有效,保证治愈,全网第一,国家级,点击关注,点赞收藏'),
};
