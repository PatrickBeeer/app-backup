import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';
import { buildStandaloneBackendUrl } from './standaloneHost';

let ffmpegPromise: Promise<FFmpeg> | null = null;

const FFMPEG_LOAD_TIMEOUT_MS = 60_000;

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

function readableMediaUrl(mediaUrl: string): string {
  return /^https?:\/\//i.test(mediaUrl)
    ? buildStandaloneBackendUrl(`/api/kling/media?url=${encodeURIComponent(mediaUrl)}`)
    : mediaUrl;
}

/**
 * 替换视频某一时间段的画面内容：
 * [0, startSec) 与 [endSec, 结束] 的原画面与声音逐帧保留（无损语义），
 * 中间段替换为 replacementClipUrl 的新画面（静音），本地 ffmpeg 拼接为完整视频。
 */
export async function replaceVideoSegmentDataUrl(
  videoUrl: string,
  startSec: number,
  endSec: number,
  replacementClipUrl: string,
  targetSize?: { width: number; height: number; totalDurationSec?: number },
): Promise<string> {
  const start = Math.max(0, startSec);
  const end = Math.max(start + 0.2, endSec);
  const segmentDuration = end - start;
  const width = Math.max(2, Math.round(targetSize?.width || 720));
  const height = Math.max(2, Math.round(targetSize?.height || 1280));
  const hasHead = start > 0.05;
  const hasTail = targetSize?.totalDurationSec
    ? end < targetSize.totalDurationSec - 0.05
    : true;

  const ffmpeg = await getFFmpeg();
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const inputName = `segment-replace-input-${nonce}.mp4`;
  const middleName = `segment-replace-middle-${nonce}.mp4`;
  const outputName = `segment-replace-output-${nonce}.mp4`;

  const videoNormalize = [
    'fps=30',
    `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    'setsar=1',
  ].join(',');

  const buildFilter = (withAudio: boolean): string => {
    const parts: string[] = [];
    const videoLabels: string[] = [];
    if (hasHead) {
      parts.push(`[0:v]trim=0:${start.toFixed(3)},setpts=PTS-STARTPTS,${videoNormalize}[vhead]`);
      videoLabels.push('[vhead]');
    }
    parts.push(
      `[1:v]trim=0:${segmentDuration.toFixed(3)},setpts=PTS-STARTPTS,` +
      `tpad=stop_mode=clone:stop_duration=600,trim=0:${segmentDuration.toFixed(3)},setpts=PTS-STARTPTS,` +
      `${videoNormalize}[vmid]`,
    );
    videoLabels.push('[vmid]');
    if (hasTail) {
      parts.push(`[0:v]trim=${end.toFixed(3)},setpts=PTS-STARTPTS,${videoNormalize}[vtail]`);
      videoLabels.push('[vtail]');
    }

    if (!withAudio) {
      parts.push(`${videoLabels.join('')}concat=n=${videoLabels.length}:v=1:a=0[vout]`);
      return parts.join(';');
    }

    const audioLabels: string[] = [];
    if (hasHead) {
      parts.push(`[0:a]atrim=0:${start.toFixed(3)},asetpts=PTS-STARTPTS,aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[ahead]`);
      audioLabels.push('[ahead]');
    }
    parts.push(
      `anullsrc=r=44100:cl=stereo,atrim=0:${segmentDuration.toFixed(3)},asetpts=PTS-STARTPTS[amid]`,
    );
    audioLabels.push('[amid]');
    if (hasTail) {
      parts.push(`[0:a]atrim=${end.toFixed(3)},asetpts=PTS-STARTPTS,aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[atail]`);
      audioLabels.push('[atail]');
    }
    parts.push(`${videoLabels.join('')}concat=n=${videoLabels.length}:v=1:a=0[vout]`);
    parts.push(`${audioLabels.join('')}concat=n=${audioLabels.length}:v=0:a=1[aout]`);
    return parts.join(';');
  };

  const encodeArgs = (withAudio: boolean) => [
    '-i', inputName,
    '-i', middleName,
    '-filter_complex', buildFilter(withAudio),
    '-map', '[vout]',
    ...(withAudio ? ['-map', '[aout]'] : ['-an']),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-maxrate', '4M',
    '-bufsize', '8M',
    '-pix_fmt', 'yuv420p',
    ...(withAudio ? ['-c:a', 'aac', '-b:a', '128k'] : []),
    '-movflags', '+faststart',
    outputName,
  ];

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(readableMediaUrl(videoUrl)));
    await ffmpeg.writeFile(middleName, await fetchFile(readableMediaUrl(replacementClipUrl)));

    let exitCode = await ffmpeg.exec(encodeArgs(true), 600_000);
    if (exitCode !== 0) {
      // 原视频可能没有音轨，降级为无音频拼接。
      exitCode = await ffmpeg.exec(encodeArgs(false), 600_000);
    }
    if (exitCode !== 0) {
      throw new Error(`本地时间段替换失败（代码 ${exitCode}）。`);
    }

    const output = await ffmpeg.readFile(outputName);
    if (!(output instanceof Uint8Array) || output.byteLength === 0) {
      throw new Error('本地时间段替换没有生成有效视频。');
    }
    return await bytesToDataUrl(output, 'video/mp4');
  } finally {
    await ffmpeg.deleteFile(inputName).catch(() => undefined);
    await ffmpeg.deleteFile(middleName).catch(() => undefined);
    await ffmpeg.deleteFile(outputName).catch(() => undefined);
  }
}

/**
 * 用若干 AI 生成的片段重建一整条视频：
 * 片段按顺序首尾相接，长度不足自动用尾帧补齐、超出则截断；
 * 画面统一到目标分辨率/帧率，声音沿用原视频的音轨（原视频无音轨时降级为静音输出）。
 */
export async function rebuildVideoFromClipsDataUrl(
  originalVideoUrl: string,
  clips: { url: string; durationSec: number }[],
  targetSize?: { width: number; height: number },
): Promise<string> {
  const usableClips = clips.filter((clip) => clip?.url && clip.durationSec > 0);
  if (usableClips.length === 0) {
    throw new Error('没有可用于重建视频的画面片段。');
  }

  const width = Math.max(2, Math.round(targetSize?.width || 720));
  const height = Math.max(2, Math.round(targetSize?.height || 1280));
  const videoNormalize = [
    'fps=30',
    `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    'setsar=1',
  ].join(',');

  const ffmpeg = await getFFmpeg();
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const originalName = `rebuild-original-${nonce}.mp4`;
  const clipNames = usableClips.map((_, i) => `rebuild-clip-${i}-${nonce}.mp4`);
  const outputName = `rebuild-output-${nonce}.mp4`;

  const filterParts: string[] = [];
  const clipLabels: string[] = [];
  usableClips.forEach((clip, i) => {
    const duration = clip.durationSec.toFixed(3);
    filterParts.push(
      `[${i + 1}:v]trim=0:${duration},setpts=PTS-STARTPTS,` +
      `tpad=stop_mode=clone:stop_duration=600,trim=0:${duration},setpts=PTS-STARTPTS,` +
      `${videoNormalize}[c${i}]`,
    );
    clipLabels.push(`[c${i}]`);
  });
  filterParts.push(`${clipLabels.join('')}concat=n=${clipLabels.length}:v=1:a=0[vout]`);
  filterParts.push('[0:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[aout]');

  const encodeArgs = (withAudio: boolean) => [
    '-i', originalName,
    ...clipNames.flatMap((name) => ['-i', name]),
    '-filter_complex', filterParts.join(';'),
    '-map', '[vout]',
    ...(withAudio ? ['-map', '[aout]'] : ['-an']),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-maxrate', '4M',
    '-bufsize', '8M',
    '-pix_fmt', 'yuv420p',
    ...(withAudio ? ['-c:a', 'aac', '-b:a', '128k'] : []),
    '-shortest',
    '-movflags', '+faststart',
    outputName,
  ];

  try {
    await ffmpeg.writeFile(originalName, await fetchFile(readableMediaUrl(originalVideoUrl)));
    for (let i = 0; i < usableClips.length; i += 1) {
      await ffmpeg.writeFile(clipNames[i], await fetchFile(readableMediaUrl(usableClips[i].url)));
    }

    let exitCode = await ffmpeg.exec(encodeArgs(true), 900_000);
    if (exitCode !== 0) {
      // 原视频可能没有音轨，降级为无音频重建。
      exitCode = await ffmpeg.exec(encodeArgs(false), 900_000);
    }
    if (exitCode !== 0) {
      throw new Error(`本地画面重建失败（代码 ${exitCode}）。`);
    }

    const output = await ffmpeg.readFile(outputName);
    if (!(output instanceof Uint8Array) || output.byteLength === 0) {
      throw new Error('本地画面重建没有生成有效视频。');
    }
    return await bytesToDataUrl(output, 'video/mp4');
  } finally {
    await ffmpeg.deleteFile(originalName).catch(() => undefined);
    for (const name of clipNames) {
      await ffmpeg.deleteFile(name).catch(() => undefined);
    }
    await ffmpeg.deleteFile(outputName).catch(() => undefined);
  }
}

export async function mergeVideoWithReferenceAudioDataUrl(videoUrl: string, referenceVideoDataUrl: string): Promise<string> {
  if (/^https?:\/\//i.test(videoUrl) && referenceVideoDataUrl.startsWith('data:')) {
    try {
      const response = await fetch(buildStandaloneBackendUrl('/api/media/merge-audio'), {
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
      ? buildStandaloneBackendUrl(`/api/kling/media?url=${encodeURIComponent(videoUrl)}`)
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
