import { normalizeCprtResolution } from './cprtContract';

export const BASE_VIDEO_POINTS_PER_SECOND = 3.6;
export const VIDEO_GENERATION_FLAT_POINTS = 10;

export const VIDEO_PRICE_MULTIPLIERS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  'free-video-2.0-mini-multimodal-video': {
    '480p': 1,
    '720p': 2.14,
  },
  'free-video-2.0-fast-multimodal-video': {
    '480p': 1.57,
    '720p': 3.4,
  },
  'free-video-2.0-multimodal-video': {
    '480p': 2,
    '720p': 4.32,
    '1080p': 10.75,
    '4k': 22.21,
  },
  'free-video-2.5-multimodal-video': {
    '480p': 2.89,
    '720p': 6.46,
    '1080p': 15.96,
  },
};

export function calculateVideoPointCost(model: string, resolution: string, durationSeconds: number): number {
  const multiplier = VIDEO_PRICE_MULTIPLIERS[String(model || '').trim()]?.[normalizeCprtResolution(resolution)];
  if (!Number.isFinite(multiplier) || Number(multiplier) <= 0) {
    throw new RangeError(`Unsupported video pricing combination: ${model} / ${resolution}`);
  }

  const seconds = Number(durationSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new RangeError('Video duration must be greater than zero.');
  }

  return Math.ceil(
    BASE_VIDEO_POINTS_PER_SECOND * Number(multiplier) * seconds
      + VIDEO_GENERATION_FLAT_POINTS,
  );
}
