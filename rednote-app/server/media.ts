// Media helpers: download (stream + size guard) and optional FFmpeg frame extraction.
// Ported from backend/app/services/media.py. Frame extraction is only invoked when
// explicitly requested — the default analyze flow downloads only the source cover,
// keeping the BFF light (no ffmpeg subprocess in the common path).

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from './config';

export interface DownloadedMedia {
  buffer: Buffer;
  mimeType: string;
}

export async function downloadMedia(url: string, maxBytes = config.maxMediaBytes): Promise<DownloadedMedia> {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`媒体下载失败（HTTP ${response.status}）`);
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim();
  if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) {
    throw new Error('媒体类型不受支持');
  }
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength && contentLength > maxBytes) throw new Error('媒体文件超过大小限制');

  const reader = response.body?.getReader();
  if (!reader) throw new Error('媒体下载流不可用');
  const chunks: Buffer[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) throw new Error('媒体文件超过大小限制');
    chunks.push(Buffer.from(value));
  }
  return { buffer: Buffer.concat(chunks), mimeType: contentType || 'image/jpeg' };
}

export function toDataUrl(media: DownloadedMedia): string {
  return `data:${media.mimeType};base64,${media.buffer.toString('base64')}`;
}

// Extract `count` frames from a video buffer via ffmpeg-static. Returns data URLs.
// Only used when the caller explicitly passes a videoUrl and requests frames.
export async function extractFrames(videoBuffer: Buffer, count = 6): Promise<string[]> {
  // Lazy-import so ffmpeg-static is only loaded when actually needed.
  const ffmpegStatic = (await import('ffmpeg-static')) as unknown as string;
  const { execFile } = await import('node:child_process');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rednote-frames-'));
  const videoPath = path.join(tmpDir, 'video.mp4');
  const pattern = path.join(tmpDir, 'frame-%02d.jpg');
  try {
    await fs.writeFile(videoPath, videoBuffer);
    await new Promise<void>((resolve, reject) => {
      execFile(
        ffmpegStatic,
        ['-y', '-i', videoPath, '-vf', `thumbnail,scale='min(1280,iw)':-2`, '-frames:v', String(count), pattern],
        { timeout: 90000 },
        (err, _stdout, stderr) => (err ? reject(new Error(`ffmpeg 失败：${stderr || err.message}`)) : resolve()),
      );
    });
    const files = (await fs.readdir(tmpDir)).filter((f) => f.startsWith('frame-')).sort();
    const frames: string[] = [];
    for (const file of files.slice(0, count)) {
      const buf = await fs.readFile(path.join(tmpDir, file));
      frames.push(`data:image/jpeg;base64,${buf.toString('base64')}`);
    }
    return frames;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}
