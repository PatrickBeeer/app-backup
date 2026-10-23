import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { GenerationUnit, Shot, SpeechSegment, VideoProbe } from '../core/types.js';

interface ProcessResult {
  stdout: string;
  stderr: string;
}

async function run(command: string, args: string[]): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => (stdout += chunk));
    child.stderr.on('data', (chunk: string) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} 执行失败（${code ?? 'unknown'}）：${stderr.slice(-1800)}`));
    });
  });
}

function parseFps(value: unknown): number {
  if (typeof value !== 'string') return 0;
  const [numeratorText, denominatorText] = value.split('/');
  const numerator = Number(numeratorText);
  const denominator = Number(denominatorText ?? 1);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0;
  return Math.round((numerator / denominator) * 100) / 100;
}

export function parseProbeJson(json: string): VideoProbe {
  const value = JSON.parse(json) as {
    format?: { duration?: string; format_name?: string };
    streams?: Array<{ codec_type?: string; width?: number; height?: number; r_frame_rate?: string }>;
  };
  const streams = value.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === 'video');
  const formatName = value.format?.format_name;
  return {
    duration: Number(value.format?.duration ?? 0),
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    fps: parseFps(video?.r_frame_rate),
    hasVideo: Boolean(video),
    hasAudio: streams.some((stream) => stream.codec_type === 'audio'),
    ...(formatName ? { formatName } : {})
  };
}

export function parseSceneTimes(stderr: string, duration: number): number[] {
  const matches = [...stderr.matchAll(/pts_time:([0-9.]+)/g)].map((match) => Number(match[1]));
  const filtered: number[] = [];
  for (const timestamp of matches) {
    if (!Number.isFinite(timestamp) || timestamp < 0.35 || timestamp > duration - 0.35) continue;
    if (filtered.length === 0 || timestamp - filtered.at(-1)! >= 0.5) {
      filtered.push(Math.round(timestamp * 1000) / 1000);
    }
  }
  return filtered;
}

export function parseSpeechSegments(stderr: string, duration: number): SpeechSegment[] {
  const silences: Array<[number, number]> = [];
  let openStart: number | undefined;
  for (const line of stderr.split(/\r?\n/)) {
    const start = line.match(/silence_start:\s*([0-9.]+)/);
    if (start) openStart = Number(start[1]);
    const end = line.match(/silence_end:\s*([0-9.]+)/);
    if (end && openStart !== undefined) {
      silences.push([openStart, Number(end[1])]);
      openStart = undefined;
    }
  }
  if (openStart !== undefined) silences.push([openStart, duration]);

  const speech: SpeechSegment[] = [];
  let cursor = 0;
  for (const [silenceStart, silenceEnd] of silences) {
    if (silenceStart - cursor >= 0.25) {
      speech.push({
        id: `speech-${speech.length + 1}`,
        start: Math.round(cursor * 1000) / 1000,
        end: Math.round(silenceStart * 1000) / 1000
      });
    }
    cursor = Math.max(cursor, silenceEnd);
  }
  if (duration - cursor >= 0.25) {
    speech.push({
      id: `speech-${speech.length + 1}`,
      start: Math.round(cursor * 1000) / 1000,
      end: Math.round(duration * 1000) / 1000
    });
  }
  return speech;
}

export async function probeVideo(filePath: string, ffprobePath = 'ffprobe'): Promise<VideoProbe> {
  const { stdout } = await run(ffprobePath, [
    '-v', 'error', '-show_entries', 'format=duration,format_name:stream=codec_type,width,height,r_frame_rate',
    '-of', 'json', filePath
  ]);
  return parseProbeJson(stdout);
}

export async function detectShots(
  filePath: string,
  duration: number,
  ffmpegPath = 'ffmpeg',
  sceneThreshold = 0.28
): Promise<Shot[]> {
  const { stderr } = await run(ffmpegPath, [
    '-hide_banner', '-i', filePath, '-vf', `select=gt(scene\\,${sceneThreshold}),showinfo`, '-an', '-f', 'null', '-'
  ]);
  const boundaries = [0, ...parseSceneTimes(stderr, duration), duration];
  return boundaries.slice(0, -1).map((start, index) => ({
    id: `shot-${index + 1}`,
    start,
    end: boundaries[index + 1]!
  }));
}

export async function detectSpeechSegments(
  filePath: string,
  duration: number,
  ffmpegPath = 'ffmpeg'
): Promise<SpeechSegment[]> {
  const { stderr } = await run(ffmpegPath, [
    '-hide_banner', '-i', filePath, '-af', 'silencedetect=noise=-35dB:d=0.35', '-vn', '-f', 'null', '-'
  ]);
  return parseSpeechSegments(stderr, duration);
}

export async function extractRepresentativeFrames(
  filePath: string,
  outputDir: string,
  duration: number,
  count = 8,
  ffmpegPath = 'ffmpeg'
): Promise<string[]> {
  await mkdir(outputDir, { recursive: true });
  const frameCount = Math.max(1, Math.min(count, Math.floor(duration)));
  const outputs: string[] = [];
  for (let index = 0; index < frameCount; index += 1) {
    const time = ((index + 0.5) / frameCount) * duration;
    const outputPath = path.join(outputDir, `frame-${String(index + 1).padStart(2, '0')}.jpg`);
    await run(ffmpegPath, buildSingleFrameArgs(filePath, time, outputPath, 3));
    outputs.push(outputPath);
  }
  return outputs;
}

export async function sliceGenerationUnit(
  inputPath: string,
  unit: GenerationUnit,
  outputPath: string,
  ffmpegPath = 'ffmpeg'
): Promise<string> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  // XG-MASTER-VIDEO-2.5（doubao-seedance-2-5 r2v）要求参考视频总像素 ≥ 407696，
  // 否则上游返回 400 "video pixel count ... must be greater than or equal to
  // 407696"。用户上传的参考视频可能只有 360×640=230400，需在此放大到阈值之上。
  // 策略：源总像素 < 410000（留 ~0.7% 余量）时，将长边放大到 960 并保持原宽高比
  // （9:16→540×960=518400 ✓，16:9→960×540=518400 ✓，1:1→960×960 ✓，均超阈值）；
  // 已达标的源保持原分辨率不缩小（W=iw,H=ih 为 no-op）。
  // force_divisible_by=2 保证偶数维以兼容 libx264 yuv420p。
  const minPixels = 410000;
  const targetLongSide = 960;
  const scaleFilter = `scale='if(lt(iw*ih,${minPixels}),${targetLongSide},iw)':'if(lt(iw*ih,${minPixels}),${targetLongSide},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos`;
  await run(ffmpegPath, [
    '-y', '-ss', unit.start.toFixed(3), '-i', inputPath, '-t', unit.duration.toFixed(3),
    '-map', '0:v:0', '-map', '0:a:0?',
    '-vf', scaleFilter,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-c:a', 'aac', '-b:a', '160k',
    '-movflags', '+faststart', outputPath
  ]);
  return outputPath;
}

export async function extractBoundaryFrame(
  inputPath: string,
  timestamp: number,
  outputPath: string,
  ffmpegPath = 'ffmpeg'
): Promise<string> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await run(ffmpegPath, buildSingleFrameArgs(inputPath, timestamp, outputPath, 2));
  return outputPath;
}

export function buildSingleFrameArgs(
  inputPath: string,
  timestamp: number,
  outputPath: string,
  quality: number
): string[] {
  return [
    '-y', '-ss', Math.max(0, timestamp).toFixed(3), '-i', inputPath,
    '-frames:v', '1', '-threads', '1', '-pix_fmt', 'yuvj420p', '-q:v', String(quality), '-update', '1', outputPath
  ];
}
