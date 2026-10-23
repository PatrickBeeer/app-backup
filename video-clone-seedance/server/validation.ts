import {
  CPRT_DURATION_SECONDS,
  CPRT_MULTIMODAL_VIDEO_MODELS,
  CPRT_RATIOS,
  CPRT_RESOLUTIONS_BY_MODEL,
  MAX_PROMPT_LENGTH,
  MAX_REFERENCE_AUDIOS,
  MAX_REFERENCE_IMAGES,
  normalizeCprtResolution,
  MIN_PROMPT_LENGTH,
  MIN_REFERENCE_IMAGES,
  isCprtModel,
  isCprtResolution,
  type CprtMultimodalVideoModel,
} from '../shared/cprtContract';

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
  audioUrls: string[];
  model: CprtMultimodalVideoModel;
  resolution: string;
  durationSeconds: number;
  ratio: string;
  realPersonMode: boolean;
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

function optionalHttpsUrlArray(body: RunBody, key: string, maxItems: number): string[] {
  const value = body[key];
  if (value === undefined || value === null) {
    return [];
  }
  return requireHttpsUrlArray(body, key, 0, maxItems);
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

export function parseStartCloneInput(body: RunBody): StartCloneInput {
  const model = requireModel(body);
  return {
    prompt: requirePrompt(body),
    referenceVideoUrl: requireHttpsUrl(body, 'referenceVideoUrl'),
    imageUrls: requireHttpsUrlArray(body, 'imageUrls', MIN_REFERENCE_IMAGES, MAX_REFERENCE_IMAGES),
    audioUrls: optionalHttpsUrlArray(body, 'audioUrls', MAX_REFERENCE_AUDIOS),
    model,
    resolution: requireResolution(body, model),
    durationSeconds: requireDuration(body),
    ratio: requireRatio(body),
    realPersonMode: optionalBoolean(body, 'realPersonMode', true),
  };
}
