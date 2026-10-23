import {
  CPRT_DURATION_SECONDS,
  CPRT_MULTIMODAL_VIDEO_MODELS,
  CPRT_RATIOS,
  CPRT_RESOLUTIONS_BY_MODEL,
  MAX_PROMPT_LENGTH,
  MAX_REFERENCE_IMAGES,
  BACKGROUND_MODE_OPTIONS,
  VOICE_LANGUAGE_OPTIONS,
  normalizeCprtResolution,
  MIN_PROMPT_LENGTH,
  MIN_REFERENCE_IMAGES,
  isBackgroundMode,
  isCprtModel,
  isCprtResolution,
  isVoiceLanguage,
  type BackgroundReplacementInput,
  type CprtMultimodalVideoModel,
  type VoiceReplacementInput,
} from '../shared/cprtContract';
import { isCloneVoiceId } from '../shared/speechContract';

export type RunBody = {
  action?: string;
  [key: string]: unknown;
};

export class RequestValidationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'RequestValidationError';
  }
}

export type StartCloneInput = {
  prompt: string;
  referenceVideoUrl: string;
  imageUrls: string[];
  model: CprtMultimodalVideoModel;
  resolution: string;
  durationSeconds: number;
  ratio: string;
  realPersonMode: boolean;
  voiceReplacement: VoiceReplacementInput;
  backgroundReplacement: BackgroundReplacementInput;
};

export function requireString(body: RunBody, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new RequestValidationError(`Missing required string field: ${key}`);
  }
  return value.trim();
}

export function requireHttpsUrl(body: RunBody, key: string): string {
  const value = requireString(body, key);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new RequestValidationError(`${key} must be a valid HTTPS URL.`);
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname) {
    throw new RequestValidationError(`${key} must be a valid HTTPS URL.`);
  }
  return parsed.toString();
}

function requirePrompt(body: RunBody): string {
  const prompt = requireString(body, 'prompt');
  if (prompt.length < MIN_PROMPT_LENGTH || prompt.length > MAX_PROMPT_LENGTH) {
    throw new RequestValidationError(`prompt must contain ${MIN_PROMPT_LENGTH}-${MAX_PROMPT_LENGTH} characters.`);
  }
  return prompt;
}

function requireStringArray(body: RunBody, key: string, minItems: number, maxItems: number): string[] {
  const value = body[key];
  if (!Array.isArray(value)) {
    throw new RequestValidationError(`${key} must be an array of strings.`);
  }
  if (value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new RequestValidationError(`${key} must contain only non-empty strings.`);
  }
  const items = value.map((item) => item.trim());
  if (items.length < minItems || items.length > maxItems) {
    throw new RequestValidationError(`${key} must contain ${minItems}-${maxItems} items.`);
  }
  return items;
}

function requireHttpsUrlArray(body: RunBody, key: string, minItems: number, maxItems: number): string[] {
  const items = requireStringArray(body, key, minItems, maxItems);
  return items.map((item, index) => {
    try {
      const parsed = new URL(item);
      if (parsed.protocol !== 'https:' || !parsed.hostname) {
        throw new Error('invalid protocol');
      }
      return parsed.toString();
    } catch {
      throw new RequestValidationError(`${key}[${index}] must be a valid HTTPS URL.`);
    }
  });
}

function optionalHttpsUrl(value: unknown, fieldName: string): string | undefined {
  const raw = String(value || '').trim();
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' || !parsed.hostname) {
      throw new Error('invalid protocol');
    }
    return parsed.toString();
  } catch {
    throw new RequestValidationError(`${fieldName} must be a valid HTTPS URL.`);
  }
}

function requireModel(body: RunBody): CprtMultimodalVideoModel {
  const value = requireString(body, 'model');
  if (!isCprtModel(value)) {
    throw new RequestValidationError(`model must be one of: ${CPRT_MULTIMODAL_VIDEO_MODELS.join(', ')}`);
  }
  return value;
}

function requireResolution(body: RunBody, model: CprtMultimodalVideoModel): string {
  const value = normalizeCprtResolution(requireString(body, 'resolution'));
  if (!isCprtResolution(model, value)) {
    throw new RequestValidationError(`resolution must be one of ${CPRT_RESOLUTIONS_BY_MODEL[model].join(', ')} for model ${model}.`);
  }
  return value;
}

function requireDuration(body: RunBody): number {
  const value = Number(body.durationSeconds);
  if (!(CPRT_DURATION_SECONDS as readonly number[]).includes(value)) {
    throw new RequestValidationError(`durationSeconds must be one of: ${CPRT_DURATION_SECONDS.join(', ')}`);
  }
  return value;
}

function requireRatio(body: RunBody): string {
  const value = String(body.ratio || 'adaptive').trim() || 'adaptive';
  if (!(CPRT_RATIOS as readonly string[]).includes(value)) {
    throw new RequestValidationError(`ratio must be one of: ${CPRT_RATIOS.join(', ')}`);
  }
  return value;
}

function optionalBoolean(body: RunBody, key: string, defaultValue = false): boolean {
  const value = body[key];
  if (value === undefined) {
    return defaultValue;
  }
  if (typeof value !== 'boolean') {
    throw new RequestValidationError(`${key} must be a boolean.`);
  }
  return value;
}

function optionalRecord(body: RunBody, key: string): Record<string, unknown> {
  const value = body[key];
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new RequestValidationError(`${key} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function parseVoiceReplacement(body: RunBody): VoiceReplacementInput {
  const value = optionalRecord(body, 'voiceReplacement');
  const enabled = typeof value.enabled === 'boolean' ? value.enabled : false;
  const language = String(value.language || 'keep').trim();
  if (!isVoiceLanguage(language)) {
    throw new RequestValidationError(`voiceReplacement.language must be one of: ${VOICE_LANGUAGE_OPTIONS.join(', ')}`);
  }
  // 百炼声音复刻返回的 voice_id；voiceAudioUrl 是用户上传样本的公网地址（voiceId 失效时重新复刻）。
  const voiceId = String(value.voiceId || '').trim() || undefined;
  if (voiceId && !isCloneVoiceId(voiceId)) {
    throw new RequestValidationError('voiceReplacement.voiceId 不是有效的复刻音色 ID。');
  }
  const voiceAudioUrl = optionalHttpsUrl(value.voiceAudioUrl, 'voiceReplacement.voiceAudioUrl');
  const script = String(value.script || '').trim() || undefined;
  return {
    enabled,
    language,
    voiceId,
    voiceAudioUrl,
    script,
  };
}

function parseBackgroundReplacement(body: RunBody): BackgroundReplacementInput {
  const value = optionalRecord(body, 'backgroundReplacement');
  const mode = String(value.mode || 'keep').trim();
  if (!isBackgroundMode(mode)) {
    throw new RequestValidationError(`backgroundReplacement.mode must be one of: ${BACKGROUND_MODE_OPTIONS.join(', ')}`);
  }
  const prompt = String(value.prompt || '').trim();
  if (prompt.length > 1_000) {
    throw new RequestValidationError('backgroundReplacement.prompt must contain no more than 1000 characters.');
  }
  const imageUrl = optionalHttpsUrl(value.imageUrl, 'backgroundReplacement.imageUrl');
  return {
    mode,
    prompt: prompt || undefined,
    imageUrl,
  };
}

export function parseStartCloneInput(body: RunBody): StartCloneInput {
  const model = requireModel(body);
  return {
    prompt: requirePrompt(body),
    referenceVideoUrl: requireHttpsUrl(body, 'referenceVideoUrl'),
    imageUrls: requireHttpsUrlArray(body, 'imageUrls', MIN_REFERENCE_IMAGES, MAX_REFERENCE_IMAGES),
    model,
    resolution: requireResolution(body, model),
    durationSeconds: requireDuration(body),
    ratio: requireRatio(body),
    realPersonMode: optionalBoolean(body, 'realPersonMode', true),
    voiceReplacement: parseVoiceReplacement(body),
    backgroundReplacement: parseBackgroundReplacement(body),
  };
}
