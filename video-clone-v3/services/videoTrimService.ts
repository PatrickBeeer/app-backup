import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';

// BFF 基址：生产环境 nginx 转发 /video-clone-v3-bff/ → BFF(9896)；
// 开发模式 vite 中间件在 :1111 处理 /api/*，返回空串走同源。
function bffBase(): string {
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/standalone/video-clone-v3/')) {
    return '/video-clone-v3-bff';
  }
  return '';
}

let ffmpegPromise: Promise<FFmpeg> | null = null;

const FFMPEG_LOAD_TIMEOUT_MS = 180_000;

async function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ffmpeg = new FFmpeg();
      let timeoutId: number | undefined;
      try {
        await Promise.race([
          ffmpeg.load({ coreURL, wasmURL }),
          new Promise<never>((_, reject) => {
            timeoutId = window.setTimeout(() => reject(new Error('本地视频处理组件加载超时，请刷新页面后重试。')), FFMPEG_LOAD_TIMEOUT_MS);
          }),
        ]);
      } catch (error) {
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
  targetDurationSec: 5 | 10 | 15,
): Promise<string> {
  const ffmpeg = await getFFmpeg();
  const extension = dataUrlExtension(dataUrl);
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const inputName = `face-swap-input-${nonce}.${extension}`;
  const outputName = `face-swap-output-${nonce}.mp4`;
  // Stream-copy cuts on encoded packet boundaries, so the resulting MP4 can be
  // slightly longer than -t (for example 4.95s becoming 5.023s). Kling rejects
  // even that tiny overrun. Keep enough headroom while preserving all streams.
  const safeDuration = targetDurationSec === 5 ? '4.75' : targetDurationSec === 10 ? '9.75' : '14.75';

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(dataUrl));
    const normalizedCanvasFilter = [
      "scale=w='if(gt(a,1.1),1280,720)':h='if(lt(a,0.9),1280,720)':force_original_aspect_ratio=decrease",
      "pad=w='if(gt(a,1.1),1280,720)':h='if(lt(a,0.9),1280,720)':x=(ow-iw)/2:y=(oh-ih)/2:color=black",
      'setsar=1',
    ].join(',');
    const command = [
      '-i', inputName,
      '-t', safeDuration,
      '-map', '0:v:0',
      '-map', '0:a?',
      '-vf', normalizedCanvasFilter,
      '-r', '30',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-maxrate', '3M',
      '-bufsize', '6M',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-avoid_negative_ts', 'make_zero',
      '-movflags', '+faststart',
      outputName,
    ];
    const exitCode = await ffmpeg.exec(command, 300_000);
    if (exitCode !== 0) {
      throw new Error(`本地截取失败（代码 ${exitCode}）。`);
    }

    const output = await ffmpeg.readFile(outputName);
    if (!(output instanceof Uint8Array) || output.byteLength === 0) {
      throw new Error('本地截取没有生成有效视频。');
    }
    return await bytesToDataUrl(output, 'video/mp4');
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
  if (/^https?:\/\//i.test(videoUrl) && referenceVideoDataUrl.startsWith('data:')) {
    try {
      const response = await fetch(`${bffBase()}/api/media/merge-audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl, audioDataUrl: referenceVideoDataUrl }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(payload.message || `本地声音合并服务返回 HTTP ${response.status}`);
      }
      const outputBlob = await response.blob();
      if (!outputBlob.size) throw new Error('本地声音合并服务返回了空视频。');
      return URL.createObjectURL(new Blob([outputBlob], { type: 'video/mp4' }));
    } catch (serverMergeError) {
      console.warn('Local audio merge service failed; falling back to browser FFmpeg.', serverMergeError);
    }
  }

  const ffmpeg = await getFFmpeg();
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const videoName = `silent-face-video-${nonce}.mp4`;
  const referenceName = `reference-audio-${nonce}.mp4`;
  const outputName = `face-video-with-audio-${nonce}.mp4`;
  try {
    const readableVideoUrl = /^https?:\/\//i.test(videoUrl)
      ? `${bffBase()}/api/kling/media?url=${encodeURIComponent(videoUrl)}`
      : videoUrl;
    await ffmpeg.writeFile(videoName, await fetchFile(readableVideoUrl));
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

export async function upscaleVideoTo1080p(videoUrl: string, aspectRatio: '16:9' | '9:16'): Promise<string> {
  const ffmpeg = await getFFmpeg();
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const inputName = `upscale-input-${nonce}.mp4`;
  const outputName = `upscale-1080p-${nonce}.mp4`;
  const width = aspectRatio === '9:16' ? 1080 : 1920;
  const height = aspectRatio === '9:16' ? 1920 : 1080;
  try {
    await ffmpeg.writeFile(inputName, await fetchFile(videoUrl));
    const exitCode = await ffmpeg.exec([
      '-i', inputName,
      '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`,
      '-map', '0:v:0',
      '-map', '0:a?',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '18',
      '-c:a', 'copy',
      '-movflags', '+faststart',
      outputName,
    ], 300_000);
    if (exitCode !== 0) throw new Error(`1080p 升格失败（代码 ${exitCode}）。`);
    const output = await ffmpeg.readFile(outputName);
    if (!(output instanceof Uint8Array) || output.byteLength === 0) throw new Error('1080p 升格结果为空。');
    const bytes = new Uint8Array(output.byteLength);
    bytes.set(output);
    return URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
  } finally {
    await ffmpeg.deleteFile(inputName).catch(() => undefined);
    await ffmpeg.deleteFile(outputName).catch(() => undefined);
  }
}

// 运镜复刻（vidstab）：把参考视频的镜头晃动轨迹叠加到生成的视频上。
// 走 BFF 的 /api/video/finalize（本地 FFmpeg vidstabdetect + vidstabtransform），
// 参考视频须是 data: URL 或公网 https 地址。
export async function finalizeVideoWithCameraShake(videoUrl: string, referenceVideo: string): Promise<string | null> {
  if (!/^https?:\/\//i.test(videoUrl)) return null;
  const trimmedReference = String(referenceVideo || '').trim();
  if (!trimmedReference) return null;
  const response = await fetch(`${bffBase()}/api/video/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrl, referenceVideo: trimmedReference }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(payload.message || `运镜复刻服务返回 HTTP ${response.status}`);
  }
  const payload = await response.json().catch(() => ({})) as { videoUrl?: string };
  const finalUrl = String(payload.videoUrl || '').trim();
  if (!finalUrl) throw new Error('运镜复刻服务没有返回视频地址。');
  return finalUrl;
}
