import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config';

export function saveAsset(name: string, bytes: Buffer): string {
  fs.mkdirSync(config.storageDir, { recursive: true });
  const extension = path.extname(name).toLowerCase();
  const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.mp3', '.wav', '.m4a', '.mp4'];
  if (!allowed.includes(extension)) throw new Error('素材格式不支持，请上传 JPG、PNG、WebP、MP3、WAV、M4A 或 MP4。');
  const file = `${crypto.randomUUID()}${extension}`;
  fs.writeFileSync(path.join(config.storageDir, file), bytes, { flag: 'wx' });
  return file;
}

export function assetPath(id: string): string {
  if (!/^[a-f0-9-]{36}\.(jpg|jpeg|png|webp|mp3|wav|m4a|mp4)$/.test(id)) {
    throw new Error('无效的素材编号。');
  }
  const file = path.join(config.storageDir, id);
  if (!fs.existsSync(file)) throw new Error('素材已失效，请重新上传或生成。');
  return file;
}

export function previewUrl(id: string): string {
  return `/standalone/speech-video/api/output/${id}`;
}

export function publicUrl(id: string): string {
  const base = (process.env.PUBLIC_ASSET_BASE_URL || (fs.existsSync(config.baseUrlFile) ? fs.readFileSync(config.baseUrlFile, 'utf8') : '')).trim().replace(/\/$/, '');
  if (!/^https:\/\//.test(base)) throw new Error('素材需要公网 HTTPS 地址：请启动素材隧道或配置 PUBLIC_ASSET_BASE_URL。');
  return `${base}/assets/${id}`;
}

export async function providerUrl(id: string): Promise<string> {
  const file = assetPath(id);
  const types: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4' };
  const type = types[path.extname(file)] || 'application/octet-stream';
  try {
    const response = await fetch(`${(process.env.API_MANAGER_INTERNAL_BASE_URL || 'http://127.0.0.1:3051').replace(/\/$/, '')}/api/v1/execute/cos/presign-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-ID': (process.env.COS_MIRROR_USER_ID || '1') },
      body: JSON.stringify({ file_name: id, content_type: type, app_id: 'speech-video', object_path: 'standalone/speech-video/cprt_refs' }),
    });
    if (!response.ok) throw new Error(`presign ${response.status}`);
    const payload = await response.json() as { data?: { upload_url?: string; url?: string; signed_url?: string; public_url?: string; headers?: Record<string, string> } };
    const data = payload.data;
    if (!data?.upload_url) throw new Error('missing upload_url');
    const upload = await fetch(data.upload_url, { method: 'PUT', headers: { 'Content-Type': type, ...data.headers }, body: new Uint8Array(fs.readFileSync(file)) });
    if (!upload.ok) throw new Error(`upload ${upload.status}`);
    const url = data.url || data.signed_url || data.public_url;
    if (!url || !url.startsWith('https://')) throw new Error('missing HTTPS asset URL');
    return url;
  } catch (error) {
    console.warn('[speech-video] COS mirror unavailable:', error);
    return publicUrl(id);
  }
}
