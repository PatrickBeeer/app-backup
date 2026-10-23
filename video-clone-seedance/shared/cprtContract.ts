export const CPRT_MULTIMODAL_VIDEO_MODELS = [
  'free-video-2.0-mini-multimodal-video',
  'free-video-2.0-fast-multimodal-video',
  'free-video-2.0-multimodal-video',
  'free-video-2.5-multimodal-video',
] as const;

export type CprtMultimodalVideoModel = (typeof CPRT_MULTIMODAL_VIDEO_MODELS)[number];

export const CPRT_RESOLUTIONS_BY_MODEL: Record<CprtMultimodalVideoModel, readonly string[]> = {
  'free-video-2.0-mini-multimodal-video': ['480p', '720p'],
  'free-video-2.0-fast-multimodal-video': ['480p', '720p'],
  'free-video-2.0-multimodal-video': ['480p', '720p', '1080p', '4k'],
  'free-video-2.5-multimodal-video': ['480p', '720p'],
};

export const CPRT_DURATION_SECONDS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;
export const CPRT_RATIOS = ['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16', '21:9'] as const;

export const DEFAULT_CPRT_MODEL: CprtMultimodalVideoModel = 'free-video-2.0-mini-multimodal-video';
export const DEFAULT_CPRT_RESOLUTION = '480p';
export const MIN_REFERENCE_IMAGES = 1;
export const MAX_REFERENCE_IMAGES = 3;
export const MAX_REFERENCE_AUDIOS = 3;
export const MIN_PROMPT_LENGTH = 1;
export const MAX_PROMPT_LENGTH = 20_480;

export type CprtConversionSlot =
  | 'all'
  | `image${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`
  | `video${1 | 2 | 3}`;

export function isCprtModel(value: string): value is CprtMultimodalVideoModel {
  return (CPRT_MULTIMODAL_VIDEO_MODELS as readonly string[]).includes(value);
}

export function isCprtResolution(model: CprtMultimodalVideoModel, value: string): boolean {
  return CPRT_RESOLUTIONS_BY_MODEL[model].includes(normalizeCprtResolution(value));
}

export function normalizeCprtResolution(value: string): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'native1080p') return '1080p';
  if (normalized === 'native4k') return '4k';
  return normalized;
}

export function toCprtProviderResolution(value: string): string {
  const normalized = normalizeCprtResolution(value);
  if (normalized === '1080p') return 'native1080p';
  if (normalized === '4k') return 'native4k';
  return normalized;
}

export function buildConversionSlots(imageCount: number, videoCount = 1): CprtConversionSlot[] {
  if (!Number.isInteger(imageCount) || imageCount < 0 || imageCount > 9) {
    throw new Error('imageCount must be an integer between 0 and 9.');
  }
  if (!Number.isInteger(videoCount) || videoCount < 0 || videoCount > 3) {
    throw new Error('videoCount must be an integer between 0 and 3.');
  }

  const slots: CprtConversionSlot[] = [];
  for (let index = 1; index <= videoCount; index += 1) {
    slots.push(`video${index}` as CprtConversionSlot);
  }
  for (let index = 1; index <= imageCount; index += 1) {
    slots.push(`image${index}` as CprtConversionSlot);
  }
  return slots;
}
