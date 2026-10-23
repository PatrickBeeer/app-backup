import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// 服务端 FFmpeg：把生成的视频（公网 URL）与 ElevenLabs 配音合并成最终成片。
// 视频流 copy（画面一帧不动），音频用 aac 重新编码。配音比画面长则整体加速对齐。

export interface MergeAudioInput {
  videoUrl: string;
  audioDataUrl: string;
}

export interface MergeAudioResult {
  bytes: Buffer;
  contentType: string;
  videoDurationSeconds: number | null;
  audioDurationSeconds: number | null;
  audioTempo: number;
}

function decodeDataUrl(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:[^;,]+;base64,(.+)$/s);
  if (!match) throw new Error('音频素材不是有效的 Base64 文件。');
  return Buffer.from(match[1], 'base64');
}

async function runLocalFfmpeg(args: string[], options: { cwd?: string } = {}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('ffmpeg', args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], cwd: options.cwd });
    const stderr: Buffer[] = [];
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) return resolve();
      const detail = Buffer.concat(stderr).toString('utf8').trim().split(/\r?\n/).slice(-3).join(' ');
      reject(new Error(detail || `FFmpeg 退出代码 ${code ?? -1}`));
    });
  });
}

export async function probeDuration(filePath: string): Promise<number | null> {
  return await new Promise<number | null>((resolve) => {
    const child = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const stdout: Buffer[] = [];
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    child.once('error', () => resolve(null));
    child.once('close', () => {
      const text = Buffer.concat(stdout).toString('utf8').trim();
      const value = Number(text);
      resolve(Number.isFinite(value) && value > 0 ? value : null);
    });
  });
}

export async function mergeVideoWithAudio(input: MergeAudioInput): Promise<MergeAudioResult> {
  if (!/^https?:\/\//i.test(input.videoUrl)) {
    throw new Error('生成视频地址无效。');
  }
  if (!input.audioDataUrl.startsWith('data:')) {
    throw new Error('参考音频文件无效。');
  }

  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'video-clone-v3-merge-'));
  const videoPath = path.join(tempDirectory, 'generated-video.mp4');
  const audioPath = path.join(tempDirectory, 'reference-audio.bin');
  const outputPath = path.join(tempDirectory, 'video-with-audio.mp4');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);
    let generatedVideo: Buffer;
    try {
      const upstream = await fetch(input.videoUrl, { signal: controller.signal });
      if (!upstream.ok) throw new Error(`HTTP ${upstream.status}`);
      generatedVideo = Buffer.from(await upstream.arrayBuffer());
    } finally {
      clearTimeout(timeout);
    }
    if (!generatedVideo.byteLength) throw new Error('上游返回了空视频。');

    await writeFile(videoPath, generatedVideo);
    await writeFile(audioPath, decodeDataUrl(input.audioDataUrl));

    const videoDuration = await probeDuration(videoPath);
    const audioDuration = await probeDuration(audioPath);
    const audioTempo =
      videoDuration && audioDuration && audioDuration > videoDuration * 1.03
        ? Number((audioDuration / videoDuration).toFixed(4))
        : 1;

    const audioFilter = audioTempo > 1 ? `-af=atempo=${audioTempo}` : '';
    const args = [
      '-y',
      '-i', videoPath,
      '-i', audioPath,
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '160k',
      '-shortest',
      '-movflags', '+faststart',
      ...(audioFilter ? ['-af', `atempo=${audioTempo}`] : []),
      outputPath,
    ];

    await runLocalFfmpeg(args);
    const output = await readFile(outputPath);
    if (!output.byteLength) throw new Error('没有生成包含声音的视频。');

    return {
      bytes: output,
      contentType: 'video/mp4',
      videoDurationSeconds: videoDuration,
      audioDurationSeconds: audioDuration,
      audioTempo,
    };
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

/** 把远端资源下载到本地文件（隧道/公网下载偶发瞬断，重试 3 次）。 */
export async function downloadToFile(sourceUrl: string, targetPath: string): Promise<number> {
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
      await writeFile(targetPath, buffer);
      return buffer.byteLength;
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      const isTransient = /ECONNRESET|terminated|ETIMEDOUT|ECONNREFUSED|socket hang up|network|aborted/i.test(msg);
      if (!isTransient || attempt === MAX_ATTEMPTS) {
        throw error;
      }
      console.warn(`[video-clone-v3-bff] downloadToFile attempt ${attempt} failed (${msg}), retrying...`);
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastError;
}

/**
 * 把「参考视频的镜头抖动」原样搬到生成视频上（从 video-clone-seedance-v2/server/media.ts 移植）。
 *
 * 视频生成模型天生倾向输出平滑运动，即使提示词写死“必须晃动”，成片也常常被压平。
 * 这里用工程手段：先用 vidstabdetect 分析参考视频的帧间运动轨迹，
 * 再用 vidstabtransform 把这条轨迹正向（invert=0）施加到成片上，
 * 于是成片会跟着参考视频一起晃，而不是被抹平。
 */
export async function applyCameraShake(input: {
  /** 抖动来源（参考视频）。 */
  sourceVideoPath: string;
  /** 被施加抖动的视频（生成的成片）。 */
  targetVideoPath: string;
  outputPath: string;
  /** 轨迹文件的存放目录（同时作为 ffmpeg 工作目录，避免滤镜里的轨迹文件用相对名）。 */
  workDir: string;
}): Promise<void> {
  const trfName = 'camera-shake.trf';
  const sourcePath = path.resolve(input.sourceVideoPath);
  const targetPath = path.resolve(input.targetVideoPath);
  const outputPath = path.resolve(input.outputPath);
  try {
    // Pass 1：分析参考视频的抖动轨迹（只分析不输出画面）。
    await runLocalFfmpeg([
      '-y',
      '-i', sourcePath,
      '-vf', `vidstabdetect=result=${trfName}:shakiness=10:accuracy=15`,
      '-f', 'null', '-',
    ], { cwd: input.workDir });

    // Pass 2：把轨迹正向施加到成片（invert=0 表示“复制抖动”而不是抵消抖动）。
    await runLocalFfmpeg([
      '-y',
      '-i', targetPath,
      '-vf', `vidstabtransform=input=${trfName}:invert=0:smoothing=0:relative=1:zoom=5`,
      '-c:a', 'copy',
      '-movflags', '+faststart',
      outputPath,
    ], { cwd: input.workDir });
  } catch (error) {
    throw new Error(
      `无法套用参考视频的运镜：${error instanceof Error ? error.message : String(error)}。`
      + '请确认参考视频能正常解码且带有画面运动。',
    );
  }
}
