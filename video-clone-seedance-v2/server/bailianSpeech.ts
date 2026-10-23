import { config } from './config';
import { RequestValidationError } from './validation';
import {
  BAILIAN_TTS_MODEL,
  BAILIAN_VOICE_ENROLLMENT_MODEL,
  BAILIAN_TTS_SYNTHESIZER_PATH,
  BAILIAN_VOICE_CUSTOMIZATION_PATH,
} from '../shared/speechContract';

/**
 * 阿里云百炼 Qwen-Audio-TTS 语音服务：
 *  - enrollCloneVoice：声音复刻（voice-enrollment），上传一段公网可访问的人声样本，
 *    即时返回绑定 qwen-audio-3.0-tts-plus 的专属 voice_id（无需训练）。
 *  - synthesizeSpeech：非实时语音合成（SpeechSynthesizer，非流式），
 *    响应里给的是音频文件 URL（24 小时有效），下载后转 base64 交给既有 BFF 链路。
 *
 * 鉴权：Authorization: Bearer <BAILIAN_KEY>，sk-ws- Key 必须打业务空间专属域名。
 */

export class BailianApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BailianApiError';
  }
}

function requireConfig(): { apiKey: string; baseUrl: string } {
  if (!config.bailianApiKey) {
    throw new RequestValidationError(
      '尚未配置阿里云百炼 API Key。请在 .env 中填写 BAILIAN_KEY（百炼控制台 API Key 页面创建的 sk-ws- Key）。',
      503,
    );
  }
  if (!config.bailianBaseUrl) {
    throw new RequestValidationError(
      '尚未配置百炼业务空间域名。请在 .env 中填写 BAILIAN_WORKSPACE_ID（业务空间 ID，如 ws-xxxxxxxx）；'
      + 'sk-ws- Key 必须通过 https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com 调用。',
      503,
    );
  }
  return { apiKey: config.bailianApiKey, baseUrl: config.bailianBaseUrl };
}

function pickString(payload: any, paths: string[][]): string {
  for (const pathToValue of paths) {
    let current: any = payload;
    let ok = true;
    for (const key of pathToValue) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        ok = false;
        break;
      }
    }
    // 只接受字符串：百炼响应里 output.audio 等节点是对象，
    // String(object) 会得到 "[object Object]"，绝不能当成音频数据。
    if (ok && typeof current === 'string') {
      const value = current.trim();
      if (value) {
        return value;
      }
    }
  }
  return '';
}

function friendlyBailianError(status: number, code: string, message: string): string {
  const normalizedCode = String(code || '').trim();
  const normalizedMessage = String(message || '');
  if (status === 401 || status === 403 || /InvalidApiKey|Incorrect API key/i.test(normalizedMessage)) {
    return '百炼 API Key 无效或已被删除。请到百炼控制台「API Key」页面重新创建 Key 并更新 .env 的 BAILIAN_KEY；'
      + '注意 sk-ws- Key 必须与 BAILIAN_WORKSPACE_ID（业务空间专属域名）配套使用。';
  }
  if (/data.inspection|DataInspection|审核|合规/i.test(`${normalizedCode} ${normalizedMessage}`)) {
    return `百炼内容安全校验未通过：${normalizedMessage || '请更换更干净的人声样本/台词后重试（样本需无背景音乐、无其他人声）。'}`;
  }
  if (/audio|url/i.test(normalizedCode) && /无法访问|下载|fetch|download/i.test(normalizedMessage)) {
    return `百炼无法下载样本音频：${normalizedMessage}。请确认音频是公网可访问的 HTTPS 地址（隧道正常运行）且文件未损坏。`;
  }
  if (/request asr failed|asr/i.test(`${normalizedCode} ${normalizedMessage}`)) {
    return '百炼未能从样本中识别到合格人声：请更换 10~20 秒连续、清晰的单人朗读录音（无背景音乐、无其他人声、无明显噪音，采样率 ≥16kHz）后重试。';
  }
  return `百炼语音接口报错（HTTP ${status}${normalizedCode ? `, code ${normalizedCode}` : ''}）：${normalizedMessage || '(无错误信息)'}`;
}

export async function postBailianJson(
  pathname: string,
  body: unknown,
  timeoutMs = 120_000,
  extraHeaders: Record<string, string> = {},
): Promise<any> {
  const { apiKey, baseUrl } = requireConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  let raw = '';
  try {
    response = await fetch(`${baseUrl}${pathname}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...extraHeaders,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    raw = await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new RequestValidationError('百炼语音接口请求超时，请稍后重试。', 504);
    }
    throw new RequestValidationError(
      `百炼语音接口请求失败：${error instanceof Error ? error.message : 'network error'}`,
      502,
    );
  } finally {
    clearTimeout(timer);
  }

  let payload: any = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
  }

  if (!response.ok || (payload && (payload.code || payload.Code) && !isSuccessCode(String(payload.code || payload.Code)))) {
    const code = String(payload?.code || payload?.Code || '').trim();
    const message = String(payload?.message || payload?.Message || raw.slice(0, 300)).trim();
    const requestId = String(payload?.request_id || payload?.requestId || '').trim();
    throw new BailianApiError(
      response.status || 502,
      code,
      `${friendlyBailianError(response.status || 502, code, message)}${requestId ? `（request_id: ${requestId}）` : ''}`,
    );
  }

  return payload;
}

function isSuccessCode(code: string): boolean {
  return code === '0' || code === '200' || code.toLowerCase() === 'success' || code.toLowerCase() === 'ok';
}

/**
 * 百炼合成偶发引擎抖动（实测会出现 HTTP 400 code=InvalidParameter,
 * message "[cosyvoice]Engine error [411]: TTS speak operation failed"，
 * 同文本立刻重试即成功）或 5xx：只重试这类瞬时错误，参数/内容类错误不重试。
 */
export function isTransientBailianError(error: unknown): boolean {
  if (!(error instanceof BailianApiError)) {
    return false;
  }
  if (error.status >= 500) {
    return true;
  }
  return /Engine error|TTS speak operation failed|InternalError|timeout|timed?\s*out|服务繁忙|系统繁忙|限流|throttl|rate.?limit/i.test(
    `${error.code} ${error.message}`,
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type EnrollCloneVoiceInput = {
  /** 样本音频公网 HTTPS 地址（mp3/m4a/wav，10~20 秒最佳，≤10MB）。 */
  audioUrl: string;
  /** 音色名称前缀。 */
  prefix: string;
};

export type EnrollCloneVoiceResult = {
  voiceId: string;
  targetModel: string;
};

/**
 * 声音复刻：创建专属音色。Qwen-Audio-TTS 无需训练，正常情况下同步返回 voice_id。
 * target_model 固定为 qwen-audio-3.0-tts-plus（必须与合成模型完全一致）。
 */
export async function enrollCloneVoice(input: EnrollCloneVoiceInput): Promise<EnrollCloneVoiceResult> {
  const payload = await postBailianJson(BAILIAN_VOICE_CUSTOMIZATION_PATH, {
    model: BAILIAN_VOICE_ENROLLMENT_MODEL,
    input: {
      action: 'create_voice',
      target_model: BAILIAN_TTS_MODEL,
      prefix: input.prefix,
      url: input.audioUrl,
    },
  }, 120_000);

  // Qwen-Audio-TTS 返回 output.voice_id；兼容不同版本字段名。
  const voiceId = pickString(payload, [
    ['output', 'voice_id'],
    ['output', 'voiceId'],
    ['output', 'voice'],
    ['voice_id'],
    ['voiceId'],
  ]);
  if (!voiceId) {
    throw new RequestValidationError(
      `百炼声音复刻已受理但未返回 voice_id，响应：${JSON.stringify(payload).slice(0, 300)}`,
      502,
    );
  }
  return { voiceId, targetModel: BAILIAN_TTS_MODEL };
}

export type SynthesizeSpeechInput = {
  text: string;
  /** 复刻音色 voice_id（也支持系统音色 voice）。 */
  voice: string;
  format?: 'mp3' | 'wav' | 'pcm';
  sampleRate?: number;
};

export type SynthesizeSpeechResult = {
  /** mp3 base64（无 data: 前缀）。 */
  audioBase64: string;
  /** 百炼返回的音频 URL（24h 有效），有则透出，便于排查。 */
  audioUrl?: string;
};

/**
 * 非实时语音合成（非流式）：响应 JSON 里带音频文件 URL，下载后转 base64。
 * 文档：非实时语音合成 - Qwen-Audio-TTS（SpeechSynthesizer）。
 */
export async function synthesizeSpeech(input: SynthesizeSpeechInput): Promise<SynthesizeSpeechResult> {
  const text = String(input.text || '').trim();
  if (!text) {
    throw new RequestValidationError('缺少待合成的台词文本（text）。', 400);
  }

  const requestBody = {
    model: BAILIAN_TTS_MODEL,
    input: {
      text: text.slice(0, 3000),
      voice: input.voice,
      format: input.format || 'mp3',
      sample_rate: input.sampleRate ?? 24000,
    },
  };

  // 百炼合成偶发引擎抖动（cosyvoice 411 / 5xx / 200 但响应缺音频地址）：同文本间隔重试一次。
  const callOnce = () => postBailianJson(BAILIAN_TTS_SYNTHESIZER_PATH, requestBody);
  const readAudioRefs = (payload: any) => ({
    audioUrl: pickString(payload, [
      ['output', 'audio', 'url'],
      ['output', 'audio_url'],
      ['output', 'url'],
      ['audio_url'],
      ['url'],
    ]),
    inlineBase64: pickString(payload, [
      ['output', 'audio', 'data'],
      ['data'],
    ]),
  });

  let payload: any;
  let refs = { audioUrl: '', inlineBase64: '' };
  try {
    payload = await callOnce();
    refs = readAudioRefs(payload);
  } catch (error) {
    if (!isTransientBailianError(error)) {
      throw error;
    }
    console.warn('[bailian-tts] transient synthesis error, retrying once in 1.5s ...', error instanceof Error ? error.message : error);
    await delay(1500);
    payload = await callOnce();
    refs = readAudioRefs(payload);
  }

  const { audioUrl, inlineBase64 } = refs;

  if (inlineBase64) {
    // 兼容 data:audio/mpeg;base64,xxxx 形态，只保留 base64 负载本身。
    const commaIndex = inlineBase64.indexOf(',');
    const pureBase64 = inlineBase64.startsWith('data:') && commaIndex >= 0
      ? inlineBase64.slice(commaIndex + 1)
      : inlineBase64;
    return { audioBase64: pureBase64, audioUrl };
  }
  if (!audioUrl) {
    // 200 但没给音频地址（实测偶发）：按瞬时抖动重试一次。
    console.warn('[bailian-tts] 200 response without audio url, retrying once in 1.5s ...');
    await delay(1500);
    payload = await callOnce();
    const retried = readAudioRefs(payload);
    if (retried.inlineBase64) {
      const commaIndex = retried.inlineBase64.indexOf(',');
      return {
        audioBase64: retried.inlineBase64.startsWith('data:') && commaIndex >= 0
          ? retried.inlineBase64.slice(commaIndex + 1)
          : retried.inlineBase64,
        audioUrl: retried.audioUrl,
      };
    }
    if (!retried.audioUrl) {
      throw new RequestValidationError(
        `百炼语音合成未返回音频地址，响应：${JSON.stringify(payload).slice(0, 300)}`,
        502,
      );
    }
    return downloadBailianAudio(retried.audioUrl);
  }

  return downloadBailianAudio(audioUrl);
}

/** 下载百炼生成的音频（URL 24h 有效）并转 base64。 */
async function downloadBailianAudio(audioUrl: string): Promise<SynthesizeSpeechResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(audioUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new RequestValidationError(`下载百炼合成音频失败（HTTP ${response.status}）。`, 502);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) {
      throw new RequestValidationError('百炼合成音频下载为空。', 502);
    }
    return { audioBase64: buffer.toString('base64'), audioUrl };
  } catch (error) {
    if (error instanceof RequestValidationError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new RequestValidationError('下载百炼合成音频超时。', 504);
    }
    throw new RequestValidationError(
      `下载百炼合成音频失败：${error instanceof Error ? error.message : 'network error'}`,
      502,
    );
  } finally {
    clearTimeout(timer);
  }
}

export type SynthesizeVoiceResult = {
  /** base64 音频（mp3）。 */
  audioBase64: string;
  /** 实际使用的模型。 */
  provider: string;
};

/**
 * 生成「对口型换声」用的目标音频：用用户上传样本复刻出的专属音色一次性合成，
 * 音频连贯，后续作为 audioUrls 交给 CPRT 对口型生成视频。
 * 没有台词时不合成（调用方会改用视频原始音轨让 CPRT 直接对口型）。
 */
export async function synthesizeVoice(input: {
  text?: string;
  voice: string;
}): Promise<SynthesizeVoiceResult | null> {
  const text = String(input.text || '').trim();
  if (!text) {
    return null;
  }
  const speech = await synthesizeSpeech({ text, voice: input.voice, format: 'mp3', sampleRate: 24000 });
  return { audioBase64: speech.audioBase64, provider: BAILIAN_TTS_MODEL };
}

/** 判断是否「音色尚不可用 / voice_id 无效」类错误（用于失败后用样本重新复刻）。 */
export function isCloneVoiceUnavailableError(error: unknown): boolean {
  if (!(error instanceof BailianApiError)) {
    return false;
  }
  return /voice|音色|not\s*found|不存在|invalid/i.test(`${error.code} ${error.message}`);
}
