// master-video-s2-* = 火山引擎 Ark 的 doubao-seedance 2.x 系列经 CPRT 网关代理（素材先送审）。
// 实测支持的分辨率：s2-0-mini/fast 480p/720p；s2-0 最高 1080p；s2-5 仅 480p/720p。
// free-video 2.0 系（wrapper）保留在 cprt.ts 的备用分支里，需要时把名字加回此列表即可。
export const CPRT_MULTIMODAL_VIDEO_MODELS = [
  'master-video-s2-0-mini',
  'master-video-s2-0-fast',
  'master-video-s2-0',
  'master-video-s2-5',
  'tokendance-seedance-2.0-mini',
] as const;

export type CprtMultimodalVideoModel = (typeof CPRT_MULTIMODAL_VIDEO_MODELS)[number];

export const CPRT_RESOLUTIONS_BY_MODEL: Record<CprtMultimodalVideoModel, readonly string[]> = {
  'master-video-s2-0-mini': ['480p', '720p'],
  'master-video-s2-0-fast': ['480p', '720p'],
  'master-video-s2-0': ['480p', '720p', '1080p'],
  'master-video-s2-5': ['480p', '720p'],
  'tokendance-seedance-2.0-mini': ['480p', '720p'],
};

export const CPRT_DURATION_SECONDS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;
export const CPRT_RATIOS = ['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16', '21:9'] as const;

export const DEFAULT_CPRT_MODEL: CprtMultimodalVideoModel = 'master-video-s2-0-mini';
export const DEFAULT_CPRT_RESOLUTION = '480p';
export const MIN_REFERENCE_IMAGES = 1;
export const MAX_REFERENCE_IMAGES = 3;
export const MIN_PROMPT_LENGTH = 1;
export const MAX_PROMPT_LENGTH = 20_480;

export const VOICE_LANGUAGE_OPTIONS = [
  'keep',
  'zh-CN',
  'en-US',
  'ja-JP',
  'ko-KR',
  'fr-FR',
  'de-DE',
  'es-ES',
  'pt-BR',
  'ar-SA',
] as const;

export const BACKGROUND_MODE_OPTIONS = ['keep', 'replace'] as const;

export type VoiceLanguage = (typeof VOICE_LANGUAGE_OPTIONS)[number];
export type BackgroundMode = (typeof BACKGROUND_MODE_OPTIONS)[number];

export type VoiceReplacementInput = {
  enabled: boolean;
  language: VoiceLanguage;
  /**
   * 用户上传人声样本后由百炼声音复刻返回的专属音色 ID。
   * 需要 TTS 合成（换语言或手填台词）时必填；「保持原语言 + 不填台词」
   * 走原视频音轨，不需要复刻音色。
   */
  voiceId?: string;
  /**
   * 人声样本的公网 HTTPS URL（用户上传的参考音频）。
   * voiceId 失效（长期未用被清理）时，服务端用它重新复刻音色。
   */
  voiceAudioUrl?: string;
  /**
   * 目标语言台词（换语言时请填已翻译成目标语言的文本）。
   * 开启语音替换并需要合成时：生成前会先用百炼复刻音色把它合成为音频，
   * 再作为 audioUrls 喂给 CPRT 让人物对口型朗读，音频连贯且嘴型对齐。
   */
  script?: string;
  /**
   * 生成前已合成好的目标音频公网 URL（由 BFF 合成后回填）。
   * 传入后 CPRT 直接对口型朗读该音频，不再自行生成语音。
   */
  audioUrl?: string;
};

export type BackgroundReplacementInput = {
  mode: BackgroundMode;
  prompt?: string;
  imageUrl?: string;
};

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

export function isVoiceLanguage(value: string): value is VoiceLanguage {
  return (VOICE_LANGUAGE_OPTIONS as readonly string[]).includes(value);
}

export function isBackgroundMode(value: string): value is BackgroundMode {
  return (BACKGROUND_MODE_OPTIONS as readonly string[]).includes(value);
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
