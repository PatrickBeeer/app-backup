import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_PROVIDER_IMAGE_EDGE = 1536;

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

type UploadTarget = {
  uploadUrl: string;
  uploadHeaders?: Record<string, string>;
};

export type ExtractedVideoFrame = {
  index: number;
  timestampSeconds: number;
  dataUri: string;
};

function buildScaleFilter(maxEdge: number): string {
  const edge = Math.max(256, Math.floor(Number(maxEdge) || MAX_PROVIDER_IMAGE_EDGE));
  return `scale='if(gt(iw,ih),min(${edge},iw),-2)':'if(gt(iw,ih),-2,min(${edge},ih))'`;
}

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

function inferMimeTypeFromUrl(sourceUrl: string, fallback: string): string {
  const normalized = String(sourceUrl || '').toLowerCase();
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.webp')) return 'image/webp';
  if (normalized.endsWith('.gif')) return 'image/gif';
  if (normalized.endsWith('.bmp')) return 'image/bmp';
  if (normalized.endsWith('.tif') || normalized.endsWith('.tiff')) return 'image/tiff';
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
  return fallback;
}

async function downloadToBuffer(sourceUrl: string): Promise<{ bytes: Uint8Array; contentType: string | null }> {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`下载媒体文件失败（HTTP ${response.status}）。`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error('下载到的媒体文件为空。');
  }
  return {
    bytes,
    contentType: String(response.headers.get('content-type') || '').split(';')[0].trim() || null,
  };
}

async function downloadToFile(sourceUrl: string, filePath: string): Promise<void> {
  const { bytes } = await downloadToBuffer(sourceUrl);
  await fs.writeFile(filePath, bytes);
}

async function uploadFile(filePath: string, target: UploadTarget, contentType: string): Promise<void> {
  const bytes = await fs.readFile(filePath);
  const response = await fetch(target.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      ...(target.uploadHeaders || {}),
    },
    body: bytes,
  });
  if (!response.ok) {
    throw new Error(`上传处理后的媒体文件失败（HTTP ${response.status}）。`);
  }
}

export async function extractAudioFromVideoToUpload(input: {
  sourceVideoUrl: string;
  uploadUrl: string;
  uploadHeaders?: Record<string, string>;
}): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-clone-audio-'));
  const inputPath = path.join(tempDir, 'input.mp4');
  const outputPath = path.join(tempDir, 'output.wav');
  try {
    await downloadToFile(input.sourceVideoUrl, inputPath);
    const { stderr } = await execFileAsync('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-vn',
      '-map', '0:a:0',
      '-ac', '1',
      '-ar', '44100',
      '-c:a', 'pcm_s16le',
      outputPath,
    ], {
      maxBuffer: 8 * 1024 * 1024,
    });
    await uploadFile(outputPath, {
      uploadUrl: input.uploadUrl,
      uploadHeaders: input.uploadHeaders,
    }, 'audio/wav');
    void stderr;
  } catch (error) {
    throw error instanceof Error ? error : new Error('提取参考视频音频失败。');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function trimVideoToUpload(input: {
  sourceVideoUrl: string;
  targetDurationSeconds: number;
  uploadUrl: string;
  uploadHeaders?: Record<string, string>;
}): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-clone-trim-'));
  const inputPath = path.join(tempDir, 'input.mp4');
  const outputPath = path.join(tempDir, 'trimmed.mp4');
  const safeDuration = Math.max(3.1, Number(input.targetDurationSeconds)).toFixed(2);
  try {
    await downloadToFile(input.sourceVideoUrl, inputPath);
    const { stderr } = await execFileAsync('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-t', safeDuration,
      '-map', '0:v:0',
      '-map', '0:a?',
      '-c', 'copy',
      '-avoid_negative_ts', 'make_zero',
      '-movflags', '+faststart',
      outputPath,
    ], {
      maxBuffer: 8 * 1024 * 1024,
    });
    const copiedDuration = (await inspectVideo(outputPath)).durationSeconds;
    if (copiedDuration === null || copiedDuration < 3.05) {
      await execFileAsync('ffmpeg', [
        '-y',
        '-i', inputPath,
        '-t', safeDuration,
        '-map', '0:v:0',
        '-map', '0:a?',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '20',
        '-c:a', 'aac',
        '-movflags', '+faststart',
        outputPath,
      ], {
        maxBuffer: 8 * 1024 * 1024,
      });
    }
    const preparedDuration = (await inspectVideo(outputPath)).durationSeconds;
    if (preparedDuration === null || preparedDuration < 3) {
      throw new Error('裁剪后的参考视频不足 3 秒，请使用稍长的参考视频。');
    }
    await uploadFile(outputPath, {
      uploadUrl: input.uploadUrl,
      uploadHeaders: input.uploadHeaders,
    }, 'video/mp4');
    void stderr;
  } catch (error) {
    throw error instanceof Error ? error : new Error('裁剪参考视频失败。');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function mergeVideoAndAudioToUpload(input: {
  sourceVideoUrl: string;
  sourceAudioUrl: string;
  uploadUrl: string;
  uploadHeaders?: Record<string, string>;
}): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-clone-merge-'));
  const videoPath = path.join(tempDir, 'video.mp4');
  const audioPath = path.join(tempDir, 'audio.wav');
  const outputPath = path.join(tempDir, 'final.mp4');
  try {
    await Promise.all([
      downloadToFile(input.sourceVideoUrl, videoPath),
      downloadToFile(input.sourceAudioUrl, audioPath),
    ]);
    const { stderr } = await execFileAsync('ffmpeg', [
      '-y',
      '-i', videoPath,
      '-i', audioPath,
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-shortest',
      '-movflags', '+faststart',
      outputPath,
    ], {
      maxBuffer: 8 * 1024 * 1024,
    });
    await uploadFile(outputPath, {
      uploadUrl: input.uploadUrl,
      uploadHeaders: input.uploadHeaders,
    }, 'video/mp4');
    void stderr;
  } catch (error) {
    throw error instanceof Error ? error : new Error('合成最终视频失败。');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function downloadImageAsDataUri(sourceUrl: string): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-clone-image-'));
  const inputPath = path.join(tempDir, 'input-image');
  const outputPath = path.join(tempDir, 'prepared-image.jpg');
  try {
    const { bytes, contentType } = await downloadToBuffer(sourceUrl);
    const sourceMimeType = inferMimeTypeFromUrl(sourceUrl, contentType || 'image/jpeg');
    const sourceExtension = sourceMimeType.includes('png')
      ? '.png'
      : sourceMimeType.includes('webp')
        ? '.webp'
        : '.jpg';
    const typedInputPath = `${inputPath}${sourceExtension}`;
    await fs.writeFile(typedInputPath, bytes);
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', typedInputPath,
      '-vf', buildScaleFilter(MAX_PROVIDER_IMAGE_EDGE),
      '-q:v', '2',
      outputPath,
    ], {
      maxBuffer: 8 * 1024 * 1024,
    });
    const outputBytes = await fs.readFile(outputPath);
    if (!outputBytes.byteLength) {
      throw new Error('处理参考图片失败。');
    }
    return `data:image/jpeg;base64,${outputBytes.toString('base64')}`;
  } catch (error) {
    throw error instanceof Error ? error : new Error('处理参考图片失败。');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function extractVideoFramesToDataUris(input: {
  sourceVideoUrl: string;
  frameCount?: number;
  durationSeconds?: number | null;
}): Promise<ExtractedVideoFrame[]> {
  const frameCount = Math.max(1, Math.min(10, Math.floor(Number(input.frameCount) || 3)));
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-clone-frames-'));
  const inputPath = path.join(tempDir, 'input.mp4');
  try {
    await downloadToFile(input.sourceVideoUrl, inputPath);
    const inspection = Number.isFinite(input.durationSeconds) && Number(input.durationSeconds) > 0
      ? { durationSeconds: Number(input.durationSeconds) }
      : await inspectVideo(inputPath);
    const durationSeconds = Number(inspection.durationSeconds);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error('无法读取参考视频时长，不能提取关键帧。');
    }

    const frames: ExtractedVideoFrame[] = [];
    for (let index = 0; index < frameCount; index += 1) {
      const rawTimestamp = durationSeconds * ((index + 1) / (frameCount + 1));
      const timestampSeconds = Math.max(0.1, Math.min(durationSeconds - 0.1, rawTimestamp));
      const outputPath = path.join(tempDir, `frame-${index + 1}.jpg`);
      await execFileAsync('ffmpeg', [
        '-y',
        '-ss', timestampSeconds.toFixed(3),
        '-i', inputPath,
        '-vf', buildScaleFilter(MAX_PROVIDER_IMAGE_EDGE),
        '-frames:v', '1',
        '-q:v', '2',
        outputPath,
      ], {
        maxBuffer: 8 * 1024 * 1024,
      });
      const bytes = await fs.readFile(outputPath);
      if (!bytes.byteLength) {
        throw new Error(`提取第 ${index + 1} 帧失败。`);
      }
      frames.push({
        index: index + 1,
        timestampSeconds,
        dataUri: `data:image/jpeg;base64,${bytes.toString('base64')}`,
      });
    }

    return frames;
  } catch (error) {
    throw error instanceof Error ? error : new Error('提取参考视频关键帧失败。');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
