import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';

let ffmpegPromise: Promise<FFmpeg> | null = null;

const FFMPEG_LOAD_TIMEOUT_MS = 60_000;

async function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ffmpeg = new FFmpeg();
      let timeoutId: number | undefined;
      try {
        // #region debug-point B:ffmpeg-load-start
        fetch('http://172.16.0.2:7777/event', { method: 'POST', body: JSON.stringify({ sessionId: 'browser-trim-timeout', runId: 'pre-fix', hypothesisId: 'B', location: 'videoTrimService.ts:15', msg: '[DEBUG] ffmpeg wasm load start', data: { timeoutMs: FFMPEG_LOAD_TIMEOUT_MS }, ts: Date.now() }) }).catch(() => {});
        // #endregion
        await Promise.race([
          ffmpeg.load({ coreURL, wasmURL }),
          new Promise<never>((_, reject) => {
            timeoutId = window.setTimeout(() => reject(new Error('本地视频处理组件加载超时，请刷新页面后重试。')), FFMPEG_LOAD_TIMEOUT_MS);
          }),
        ]);
        // #region debug-point B:ffmpeg-load-success
        fetch('http://172.16.0.2:7777/event', { method: 'POST', body: JSON.stringify({ sessionId: 'browser-trim-timeout', runId: 'pre-fix', hypothesisId: 'B', location: 'videoTrimService.ts:23', msg: '[DEBUG] ffmpeg wasm load success', data: {}, ts: Date.now() }) }).catch(() => {});
        // #endregion
      } catch (error) {
        // #region debug-point B:ffmpeg-load-failed
        fetch('http://172.16.0.2:7777/event', { method: 'POST', body: JSON.stringify({ sessionId: 'browser-trim-timeout', runId: 'pre-fix', hypothesisId: 'B', location: 'videoTrimService.ts:26', msg: '[DEBUG] ffmpeg wasm load failed', data: { error: error instanceof Error ? error.message : String(error) }, ts: Date.now() }) }).catch(() => {});
        // #endregion
        ffmpeg.terminate();
        throw error;
      } finally {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      }
      return ffmpeg;
    })().catch((error) => {
      ffmpegPromise = null;
      throw error;
    });
  }
  return ffmpegPromise;
}

function dataUrlMimeType(dataUrl: string): string {
  return dataUrl.match(/^data:([^;,]+)/i)?.[1] || 'video/mp4';
}

function dataUrlExtension(dataUrl: string): 'mp4' | 'mov' {
  return /video\/(quicktime|mov)/i.test(dataUrlMimeType(dataUrl)) ? 'mov' : 'mp4';
}

async function bytesToDataUrl(bytes: Uint8Array, mimeType: string): Promise<string> {
  const stableBytes = new Uint8Array(bytes.byteLength);
  stableBytes.set(bytes);
  const blob = new Blob([stableBytes], { type: mimeType });
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('无法读取截取后的视频。'));
    reader.readAsDataURL(blob);
  });
}

export async function trimReferenceVideoDataUrl(
  dataUrl: string,
  sourceDurationSec: number | null | undefined,
  targetDurationSec: number,
): Promise<string> {
  const sourceDuration = Number(sourceDurationSec);
  if (Number.isFinite(sourceDuration) && sourceDuration <= targetDurationSec) {
    return dataUrl;
  }

  const ffmpeg = await getFFmpeg();
  const extension = dataUrlExtension(dataUrl);
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const inputName = `face-swap-input-${nonce}.${extension}`;
  const outputName = `face-swap-output-${nonce}.${extension}`;
  // Stream-copy cuts on encoded packet boundaries, so the resulting MP4 can be
  // slightly longer than -t (for example 4.95s becoming 5.023s). Kling rejects
  // even that tiny overrun. Keep enough headroom while preserving all streams.
  const safeDuration = Math.max(0.25, targetDurationSec - 0.25).toFixed(2);

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(dataUrl));
    const exitCode = await ffmpeg.exec([
      '-i', inputName,
      '-t', safeDuration,
      '-map', '0:v:0',
      '-map', '0:a?',
      '-c', 'copy',
      '-avoid_negative_ts', 'make_zero',
      '-movflags', '+faststart',
      outputName,
    ], 180_000);
    if (exitCode !== 0) {
      throw new Error(`本地截取失败（代码 ${exitCode}）。`);
    }

    const output = await ffmpeg.readFile(outputName);
    if (!(output instanceof Uint8Array) || output.byteLength === 0) {
      throw new Error('本地截取没有生成有效视频。');
    }
    return await bytesToDataUrl(output, dataUrlMimeType(dataUrl));
  } finally {
    await ffmpeg.deleteFile(inputName).catch(() => undefined);
    await ffmpeg.deleteFile(outputName).catch(() => undefined);
  }
}

export async function extractAudioDataUrl(mediaUrl: string): Promise<string> {
  const response = await fetch(mediaUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`读取多语言配音失败（HTTP ${response.status}）。`);
  const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const mediaBytes = new Uint8Array(await response.arrayBuffer());
  if (mediaBytes.byteLength === 0) throw new Error('ElevenLabs 返回了空的配音文件。');

  const looksLikeMp3 = (mediaBytes[0] === 0x49 && mediaBytes[1] === 0x44 && mediaBytes[2] === 0x33)
    || (mediaBytes[0] === 0xff && (mediaBytes[1] & 0xe0) === 0xe0);
  const looksLikeWav = mediaBytes[0] === 0x52 && mediaBytes[1] === 0x49
    && mediaBytes[2] === 0x46 && mediaBytes[3] === 0x46
    && mediaBytes[8] === 0x57 && mediaBytes[9] === 0x41;
  if (contentType.startsWith('audio/') || looksLikeMp3 || looksLikeWav) {
    const audioMimeType = contentType.startsWith('audio/')
      ? contentType
      : looksLikeWav ? 'audio/wav' : 'audio/mpeg';
    return await bytesToDataUrl(mediaBytes, audioMimeType);
  }

  const ffmpeg = await getFFmpeg();
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const inputName = `dubbed-video-${nonce}.mp4`;
  const outputName = `dubbed-audio-${nonce}.wav`;
  try {
    await ffmpeg.writeFile(inputName, mediaBytes);
    const exitCode = await ffmpeg.exec([
      '-i', inputName,
      '-vn',
      '-map', '0:a:0',
      '-ac', '1',
      '-ar', '44100',
      '-c:a', 'pcm_s16le',
      outputName,
    ], 180_000);
    if (exitCode !== 0) throw new Error(`多语言音频提取失败（代码 ${exitCode}）。`);
    const output = await ffmpeg.readFile(outputName);
    if (!(output instanceof Uint8Array) || output.byteLength === 0) {
      throw new Error('多语言配音结果中没有可用音频。');
    }
    return await bytesToDataUrl(output, 'audio/wav');
  } finally {
    await ffmpeg.deleteFile(inputName).catch(() => undefined);
    await ffmpeg.deleteFile(outputName).catch(() => undefined);
  }
}

export async function mergeVideoWithReferenceAudioDataUrl(videoUrl: string, referenceVideoDataUrl: string): Promise<string> {
  const ffmpeg = await getFFmpeg();
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const videoName = `silent-face-video-${nonce}.mp4`;
  const referenceName = `reference-audio-${nonce}.mp4`;
  const outputName = `face-video-with-audio-${nonce}.mp4`;
  try {
    await ffmpeg.writeFile(videoName, await fetchFile(videoUrl));
    await ffmpeg.writeFile(referenceName, await fetchFile(referenceVideoDataUrl));
    const exitCode = await ffmpeg.exec([
      '-i', videoName,
      '-i', referenceName,
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-shortest',
      '-movflags', '+faststart',
      outputName,
    ], 180_000);
    if (exitCode !== 0) throw new Error(`恢复参考视频声音失败（代码 ${exitCode}）。`);
    const output = await ffmpeg.readFile(outputName);
    if (!(output instanceof Uint8Array) || output.byteLength === 0) {
      throw new Error('没有生成包含声音的视频。');
    }
    return await bytesToDataUrl(output, 'video/mp4');
  } finally {
    await ffmpeg.deleteFile(videoName).catch(() => undefined);
    await ffmpeg.deleteFile(referenceName).catch(() => undefined);
    await ffmpeg.deleteFile(outputName).catch(() => undefined);
  }
}
