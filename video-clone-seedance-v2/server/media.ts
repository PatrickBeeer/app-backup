import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const FFMPEG_TIMEOUT_MS = 5 * 60 * 1000;

/** Keep the reference picture bit-for-bit while removing every audio stream. */
export async function stripVideoAudio(sourcePath: string, outputPath: string): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-y', '-i', sourcePath, '-map', '0:v:0', '-c:v', 'copy', '-an',
    '-movflags', '+faststart', outputPath,
  ], { maxBuffer: 8 * 1024 * 1024, timeout: FFMPEG_TIMEOUT_MS });
}

/** Save the original track locally for later restoration; silent sources have none. */
export async function extractOriginalAudio(sourcePath: string, outputPath: string): Promise<boolean> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name',
    '-of', 'default=nw=1:nk=1', sourcePath,
  ], { maxBuffer: 1024 * 1024, timeout: 30_000 });
  if (!String(stdout).trim()) {
    return false;
  }
  const codec = String(stdout).trim();
  await execFileAsync('ffmpeg', [
    '-y', '-i', sourcePath, '-map', '0:a:0', '-vn',
    ...(codec === 'aac' ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '192k']),
    outputPath,
  ], { maxBuffer: 8 * 1024 * 1024, timeout: FFMPEG_TIMEOUT_MS });
  return true;
}

/** Restore original audio without changing any generated video frames. */
export async function restoreOriginalAudio(videoPath: string, audioPath: string, outputPath: string): Promise<void> {
  const duration = await probeDuration(videoPath);
  await execFileAsync('ffmpeg', [
    '-y', '-i', videoPath, '-i', audioPath,
    '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy',
    ...(duration ? ['-t', String(duration)] : []),
    '-movflags', '+faststart', outputPath,
  ], { maxBuffer: 8 * 1024 * 1024, timeout: FFMPEG_TIMEOUT_MS });
}

/** 把远端资源下载到本地文件。 */
export async function downloadToFile(sourceUrl: string, targetPath: string): Promise<number> {
  // 隧道/公网下载偶发 ECONNRESET / terminated：重试 3 次，避免 start_clone_job 整体 500。
  const MAX_ATTEMPTS = 3;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(sourceUrl, { redirect: 'follow' });
      if (!response.ok) {
        throw new Error(`下载素材失败（HTTP ${response.status}）：${sourceUrl}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength === 0) {
        throw new Error(`下载到的素材为空：${sourceUrl}`);
      }
      await fs.writeFile(targetPath, buffer);
      return buffer.byteLength;
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      const isTransient = /ECONNRESET|terminated|ETIMEDOUT|ECONNREFUSED|socket hang up|network/i.test(msg);
      if (!isTransient || attempt === MAX_ATTEMPTS) {
        throw error;
      }
      console.warn(`[video-clone-seedance-bff] downloadToFile attempt ${attempt} failed (${msg}), retrying...`);
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastError;
}

/** 从视频中抽取人声轨（单声道 mp3，用于百炼语音识别/保持原声对口型，限制 30 秒 / 10MB）。 */
export async function extractAudioTrack(sourceUrl: string, outputPath: string, maxSeconds = 30): Promise<void> {
  try {
    await execFileAsync('ffmpeg', [
      '-y', '-i', sourceUrl,
      '-vn', '-ac', '1', '-ar', '44100',
      '-t', String(maxSeconds),
      '-c:a', 'libmp3lame', '-b:a', '96k',
      outputPath,
    ], { maxBuffer: 8 * 1024 * 1024, timeout: FFMPEG_TIMEOUT_MS });
  } catch (error) {
    throw new Error(
      `无法从视频中抽取音轨：${error instanceof Error ? error.message : String(error)}。`
      + '请确认该视频本身带有音频轨道。',
    );
  }
}

/**
 * 抽取用于「语音识别」的轻量音轨：16kHz 单声道低码率。
 * 识别只需要人声频段，体积小才不会在把 base64 塞进请求体时被服务端掐断连接。
 */
export async function extractSpeechTrack(sourceUrl: string, outputPath: string, maxSeconds = 15): Promise<void> {
  try {
    await execFileAsync('ffmpeg', [
      '-y', '-i', sourceUrl,
      '-vn', '-ac', '1', '-ar', '16000',
      '-t', String(maxSeconds),
      '-c:a', 'libmp3lame', '-b:a', '32k',
      outputPath,
    ], { maxBuffer: 8 * 1024 * 1024, timeout: FFMPEG_TIMEOUT_MS });
  } catch (error) {
    throw new Error(
      `无法从视频中抽取音轨：${error instanceof Error ? error.message : String(error)}。`
      + '请确认该视频本身带有音频轨道。',
    );
  }
}

/**
 * 把「参考视频的镜头抖动」原样搬到生成视频上。
 *
 * 视频生成模型天生倾向输出平滑运动，即使提示词写死"必须晃动"，成片也常常被压平。
 * 这里改用工程手段：先用 vidstabdetect 分析参考视频的帧间运动轨迹，
 * 再用 vidstabtransform 把这条轨迹**正向**（invert=0）施加到成片上，
 * 于是成片会跟着参考视频一起晃，而不是被抹平。
 */
export async function applyCameraShake(input: {
  /** 抖动来源（参考视频）。 */
  sourceVideoPath: string;
  /** 被施加抖动的视频（生成的成片）。 */
  targetVideoPath: string;
  outputPath: string;
  /** 轨迹文件的存放目录（同时作为 ffmpeg 工作目录，避免 Windows 盘符冒号破坏滤镜语法）。 */
  workDir: string;
}): Promise<void> {
  const trfName = 'camera-shake.trf';
  // ffmpeg 的工作目录被设成 workDir（为了让滤镜里的轨迹文件用相对名），
  // 因此输入输出都必须先解析成绝对路径。
  const sourcePath = path.resolve(input.sourceVideoPath);
  const targetPath = path.resolve(input.targetVideoPath);
  const outputPath = path.resolve(input.outputPath);
  try {
    // Pass 1：分析参考视频的抖动轨迹（只分析不输出画面）。
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', sourcePath,
      '-vf', `vidstabdetect=result=${trfName}:shakiness=10:accuracy=15`,
      '-f', 'null', '-',
    ], { cwd: input.workDir, maxBuffer: 8 * 1024 * 1024, timeout: FFMPEG_TIMEOUT_MS });

    // Pass 2：把轨迹正向施加到成片（invert=0 表示"复制抖动"而不是抵消抖动）。
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', targetPath,
      '-vf', `vidstabtransform=input=${trfName}:invert=0:smoothing=0:relative=1:zoom=5`,
      '-c:a', 'copy',
      '-movflags', '+faststart',
      outputPath,
    ], { cwd: input.workDir, maxBuffer: 8 * 1024 * 1024, timeout: FFMPEG_TIMEOUT_MS });
  } catch (error) {
    throw new Error(
      `无法套用参考视频的运镜：${error instanceof Error ? error.message : String(error)}。`
      + '请确认参考视频能正常解码且带有画面运动。',
    );
  }
}

export async function probeDuration(filePathOrUrl: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', filePathOrUrl,
    ], { maxBuffer: 1024 * 1024, timeout: 30_000 });
    const value = Number(String(stdout || '').trim());
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * 把新音轨装回视频。画面流直接 copy（一帧不动），只替换声音。
 * audioTempo > 1 时对音频做变速，避免配音比画面长导致尾部拖尾。
 */
export async function muxAudioIntoVideo(input: {
  videoPath: string;
  audioPath: string;
  outputPath: string;
  audioTempo?: number;
}): Promise<void> {
  const tempo = Number(input.audioTempo) || 1;
  const filterArgs: string[] = [];
  if (Math.abs(tempo - 1) > 0.01 && tempo > 0) {
    filterArgs.push('-filter:a', buildAtempoChain(tempo));
  }

  await execFileAsync('ffmpeg', [
    '-y',
    '-i', input.videoPath,
    '-i', input.audioPath,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'copy',
    ...filterArgs,
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    input.outputPath,
  ], { maxBuffer: 8 * 1024 * 1024, timeout: FFMPEG_TIMEOUT_MS });
}

/** atempo 单个滤镜只支持 0.5~2.0，超出范围需要串联多个。 */
function buildAtempoChain(tempo: number): string {
  const clamped = Math.min(4, Math.max(0.25, tempo));
  const parts: number[] = [];
  let remaining = clamped;
  while (remaining > 2.0001) {
    parts.push(2);
    remaining /= 2;
  }
  while (remaining < 0.4999) {
    parts.push(0.5);
    remaining /= 0.5;
  }
  parts.push(Number(remaining.toFixed(4)));
  return parts.map((value) => `atempo=${value}`).join(',');
}

export type VideoInspection = {
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  pixelArea: number | null;
  aspectRatio: number | null;
  codecName: string | null;
  formatName: string | null;
};

function parseFraction(input: string | null | undefined): number | null {
  const value = String(input || '').trim();
  if (!value) {
    return null;
  }

  if (!value.includes('/')) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  const [left, right] = value.split('/');
  const numerator = Number(left);
  const denominator = Number(right);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }

  const result = numerator / denominator;
  return Number.isFinite(result) && result > 0 ? result : null;
}

export async function inspectVideo(sourceUrl: string): Promise<VideoInspection> {
  const isLocal = sourceUrl.startsWith('/') || sourceUrl.startsWith('./') || !/^https?:\/\//.test(sourceUrl);
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_streams',
    '-show_format',
    sourceUrl,
  ], {
    maxBuffer: 8 * 1024 * 1024,
    timeout: isLocal ? 30_000 : 120_000,
  });

  const payload = JSON.parse(String(stdout || '{}')) as {
    streams?: Array<Record<string, unknown>>;
    format?: Record<string, unknown>;
  };

  const videoStream = Array.isArray(payload.streams)
    ? payload.streams.find((stream) => String(stream?.codec_type || '') === 'video')
    : null;

  const width = Number(videoStream?.width);
  const height = Number(videoStream?.height);
  const duration = Number(videoStream?.duration ?? payload?.format?.duration);
  const fps = parseFraction(
    String(videoStream?.avg_frame_rate || '') || String(videoStream?.r_frame_rate || ''),
  );
  const pixelArea = Number.isFinite(width) && Number.isFinite(height) ? width * height : null;
  const aspectRatio = Number.isFinite(width) && Number.isFinite(height) && height > 0 ? width / height : null;

  return {
    durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : null,
    width: Number.isFinite(width) && width > 0 ? width : null,
    height: Number.isFinite(height) && height > 0 ? height : null,
    fps,
    pixelArea,
    aspectRatio,
    codecName: typeof videoStream?.codec_name === 'string' ? String(videoStream.codec_name) : null,
    formatName: typeof payload?.format?.format_name === 'string' ? String(payload.format.format_name) : null,
  };
}
