import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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
    timeout: 30_000,
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
