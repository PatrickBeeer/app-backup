// CPRT master-video-s2-* 合约：从 video-clone-seedance-v2/shared/cprtContract.ts 移植。
// master-video-s2-* = 火山引擎 Ark 的 doubao-seedance 2.x 系列经 CPRT 网关代理（素材先送审）。
// 实测支持的分辨率：s2-0-mini/fast 480p/720p；s2-0 最高 1080p；s2-5 仅 480p/720p。

export const CPRT_MULTIMODAL_VIDEO_MODELS = [
  'master-video-s2-0-mini',
  'master-video-s2-0-fast',
  'master-video-s2-0',
  'master-video-s2-5',
] as const;

export type CprtMultimodalVideoModel = (typeof CPRT_MULTIMODAL_VIDEO_MODELS)[number];

export const CPRT_RESOLUTIONS_BY_MODEL: Record<CprtMultimodalVideoModel, readonly string[]> = {
  'master-video-s2-0-mini': ['480p', '720p'],
  'master-video-s2-0-fast': ['480p', '720p'],
  'master-video-s2-0': ['480p', '720p', '1080p'],
  'master-video-s2-5': ['480p', '720p'],
};

export const CPRT_DURATION_SECONDS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;
export const CPRT_RATIOS = ['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16', '21:9'] as const;

export const DEFAULT_CPRT_MODEL: CprtMultimodalVideoModel = 'master-video-s2-0-mini';
export const DEFAULT_CPRT_RESOLUTION = '480p';
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
  // Ark 网关直接接受 480p/720p/1080p（不再使用旧 wrapper 的 native1080p/native4k 命名）。
  return normalizeCprtResolution(value);
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
