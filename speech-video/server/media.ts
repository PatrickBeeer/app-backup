import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';

const run = promisify(execFile);

export function narrationPolicy(seconds: number): { cropped: boolean; durationSeconds: number } {
  if (!Number.isFinite(seconds) || seconds < 4) {
    throw new Error('音频不足4秒，请增加口播内容后重试。');
  }
  return { cropped: seconds > 15, durationSeconds: Math.min(15, Math.ceil(seconds)) };
}

export async function duration(file: string): Promise<number> {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file], { timeout: 30000 });
  const seconds = Number(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('无法读取音频时长，请重新生成语音。');
  return seconds;
}

export async function validatePortrait(file: string): Promise<void> {
  if ((await fs.stat(file)).size >= 5 * 1024 * 1024) throw new Error('人物图片须小于5MB，请压缩后重试。');
  try {
    const { stdout } = await run('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
      '-of', 'json', file,
    ], { timeout: 10000 });
    const { width, height } = JSON.parse(stdout).streams?.[0] || {};
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width >= 4096 || height >= 4096) {
      throw new Error('人物图片宽高须小于4096像素，请调整后重试。');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('宽高须')) throw error;
    throw new Error('无法读取人物图片，请重新上传 JPG、PNG 或 WebP 图片。');
  }
}

export async function cropAudio(input: string, output: string, seconds: number): Promise<void> {
  if (!Number.isInteger(seconds) || seconds < 4 || seconds > 15) throw new Error('视频时长须为4至15秒。');
  // PCM WAV has no MP3 encoder padding, so the reviewed reference stops at the requested video duration.
  await run('ffmpeg', ['-y', '-i', input, '-t', String(seconds), '-ar', '24000', '-ac', '1', '-c:a', 'pcm_s16le', output], { timeout: 60000 });
}

export async function muxVideo(videoUrl: string, audioFile: string, output: string): Promise<void> {
  const parsed = new URL(videoUrl);
  if (parsed.protocol !== 'https:') throw new Error('CPRT 返回的视频地址无效。');
  const response = await fetch(videoUrl);
  if (!response.ok) throw new Error(`下载视频失败（HTTP ${response.status}）。`);
  const videoFile = `${output}.download`;
  try {
    await fs.writeFile(videoFile, new Uint8Array(await response.arrayBuffer()));
    const audioSeconds = await duration(audioFile);
    const videoSeconds = await duration(videoFile);
    if (videoSeconds + 0.35 < audioSeconds) {
      throw new Error('生成的视频短于口播音频，无法保持口型同步，请重新生成视频。');
    }
    await run('ffmpeg', [
      '-y', '-i', videoFile, '-i', audioFile, '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
      '-t', String(Math.min(videoSeconds, audioSeconds)), '-movflags', '+faststart', output,
    ], { timeout: 120000 });
  } finally {
    await fs.rm(videoFile, { force: true });
  }
}
