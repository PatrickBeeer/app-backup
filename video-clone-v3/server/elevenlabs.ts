// ElevenLabs 客户端：Dubbing（整段视频翻译，时间对齐的配音）+ Voice Convert（声线转换）。
// 直接 fetch，不走任何本地桥接（v2 的 klingNetworkBridge 已废弃）。

import { Buffer } from 'node:buffer';

const ELEVENLABS_API_BASE_URL = 'https://api.elevenlabs.io/v1';

export interface ElevenLabsDubbingCreateResult {
  dubbingId: string;
}

export interface ElevenLabsDubbingStatus {
  id: string;
  status: string;
  error?: string | null;
}

export interface ElevenLabsVoiceConvertResult {
  base64: string;
  contentType: string;
  voiceGender: 'female' | 'male';
}

/**
 * 解析目标声线 voice_id：优先环境变量 ELEVENLABS_FEMALE_VOICE_ID / ELEVENLABS_MALE_VOICE_ID；
 * 若未配置，则查询 /voices 列表，按 labels.gender 匹配第一个可用音色。
 * 找不到时抛错（由调用方映射为 422）。
 */
async function resolveVoiceId(
  apiKey: string,
  voiceGender: 'female' | 'male',
): Promise<string> {
  const envKey = voiceGender === 'female'
    ? process.env.ELEVENLABS_FEMALE_VOICE_ID
    : process.env.ELEVENLABS_MALE_VOICE_ID;
  const fromEnv = String(envKey || '').trim();
  if (fromEnv) return fromEnv;

  const response = await fetch(`${ELEVENLABS_API_BASE_URL}/voices`, {
    method: 'GET',
    headers: { 'xi-api-key': apiKey, Accept: 'application/json' },
  });
  const text = await response.text();
  const payload = parseJsonText(text, response.status);
  if (!response.ok) {
    throw new Error(
      String(payload?.detail?.message || payload?.detail || payload?.message || `读取 ElevenLabs 音色失败: ${response.status}`),
    );
  }
  const voices = Array.isArray(payload?.voices) ? payload.voices : [];
  const selectedVoice = voices.find((voice: any) =>
    String(voice?.labels?.gender || '').toLowerCase() === voiceGender,
  );
  const voiceId = String(selectedVoice?.voice_id || '').trim();
  if (!voiceId) {
    throw new Error(`当前 ElevenLabs 账号中没有可用的${voiceGender === 'female' ? '女性' : '男性'}音色。`);
  }
  return voiceId;
}

function parseJsonResponse(text: string, status: number): any {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { message: text || `ElevenLabs HTTP ${status}` };
  }
}

function ensureKey(apiKey: string): void {
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY 未配置');
}

export async function createDubbing(
  apiKey: string,
  sourceUrl: string,
  targetLang: string,
): Promise<ElevenLabsDubbingCreateResult> {
  ensureKey(apiKey);
  if (!/^https?:\/\//i.test(sourceUrl)) {
    throw new Error('多语言配音要求生成结果为公网视频 URL。');
  }
  if (!/^[a-z]{2,3}(?:-[a-z]{2})?$/i.test(targetLang)) {
    throw new Error('目标语言代码无效。');
  }

  const form = new FormData();
  form.append('source_url', sourceUrl);
  form.append('source_lang', 'auto');
  form.append('target_lang', targetLang);
  form.append('num_speakers', '0');
  form.append('watermark', 'true');
  form.append('name', `video-clone-v3-${targetLang}-${Date.now()}`);

  const response = await fetch(`${ELEVENLABS_API_BASE_URL}/dubbing`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: form,
  });
  const text = await response.text();
  const payload = parseJsonText(text, response.status);
  if (!response.ok) {
    const message = String(
      payload?.detail?.message || payload?.detail || payload?.message || `ElevenLabs 请求失败: ${response.status}`,
    );
    if (message.includes('dubbing_write')) {
      throw new Error('ElevenLabs Key 缺少 Dubbing Write 权限。请在 Developers → API Keys 中编辑该 Key，并开启 Dubbing 的 Read 和 Write 权限。');
    }
    throw new Error(message);
  }
  const dubbingId = String(payload?.dubbing_id || '').trim();
  if (!dubbingId) throw new Error('ElevenLabs 未返回配音任务 ID。');
  return { dubbingId };
}

export async function queryDubbing(apiKey: string, dubbingId: string): Promise<ElevenLabsDubbingStatus> {
  ensureKey(apiKey);
  const response = await fetch(`${ELEVENLABS_API_BASE_URL}/dubbing/${encodeURIComponent(dubbingId)}`, {
    method: 'GET',
    headers: { 'xi-api-key': apiKey },
  });
  const text = await response.text();
  const payload = parseJsonText(text, response.status);
  if (!response.ok) {
    throw new Error(
      String(payload?.detail?.message || payload?.detail || payload?.message || `ElevenLabs 查询失败: ${response.status}`),
    );
  }
  return {
    id: String(payload?.dubbing_id || dubbingId),
    status: String(payload?.status || 'unknown'),
    error: payload?.error ? String(payload.error) : null,
  };
}

export async function fetchDubbingAudio(
  apiKey: string,
  dubbingId: string,
  languageCode: string,
): Promise<{ bytes: Buffer; contentType: string }> {
  ensureKey(apiKey);
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(
      `${ELEVENLABS_API_BASE_URL}/dubbing/${encodeURIComponent(dubbingId)}/audio/${encodeURIComponent(languageCode)}`,
      { method: 'GET', headers: { 'xi-api-key': apiKey } },
    );
    if (response.ok) {
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.byteLength) throw new Error('ElevenLabs 返回了空的配音文件。');
      return {
        bytes,
        contentType: response.headers.get('content-type') || 'video/mp4',
      };
    }
    if (response.status < 500) {
      const text = await response.text();
      const payload = parseJsonText(text, response.status);
      throw new Error(
        String(payload?.detail?.message || payload?.detail || payload?.message || `ElevenLabs 取音频失败: ${response.status}`),
      );
    }
    lastError = new Error(`ElevenLabs 服务暂不可用 (HTTP ${response.status})`);
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
  }
  throw lastError ?? new Error('ElevenLabs 未返回配音媒体。');
}

export class ElevenLabsVoiceNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ElevenLabsVoiceNotFoundError';
  }
}

export async function convertVoiceGender(
  apiKey: string,
  audioDataUrl: string,
  voiceGender: 'female' | 'male',
): Promise<ElevenLabsVoiceConvertResult> {
  ensureKey(apiKey);
  const match = audioDataUrl.match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) throw new Error('音频素材不是有效的 Base64 文件。');
  const mimeType = match[1] || 'audio/mpeg';
  const audioBytes = Buffer.from(match[2], 'base64');
  if (!audioBytes.byteLength) throw new Error('待转换的说话音频无效。');

  // 1) 解析 voice_id（env 优先，否则查 /voices）
  let voiceId: string;
  try {
    voiceId = await resolveVoiceId(apiKey, voiceGender);
  } catch (error) {
    if (error instanceof Error && error.message.includes('没有可用的')) {
      throw new ElevenLabsVoiceNotFoundError(error.message);
    }
    throw error;
  }

  // 2) POST /speech-to-speech/{voiceId}?output_format=mp3_44100_128
  //    使用 eleven_multilingual_sts_v2 模型 + STS voice_settings，读取二进制音频 → base64。
  const extension = mimeType.includes('wav') ? 'wav' : mimeType.includes('mpeg') ? 'mp3' : 'm4a';
  const form = new FormData();
  form.append('audio', new Blob([audioBytes], { type: mimeType }), `speech.${extension}`);
  form.append('model_id', 'eleven_multilingual_sts_v2');
  form.append(
    'voice_settings',
    JSON.stringify({ stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true }),
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  let response: Response;
  try {
    response = await fetch(
      `${ELEVENLABS_API_BASE_URL}/speech-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, Accept: 'audio/mpeg' },
        body: form,
        signal: controller.signal,
      },
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await response.text();
    const payload = parseJsonText(detail, response.status);
    throw new Error(
      String(payload?.detail?.message || payload?.detail || payload?.message || `ElevenLabs 声线转换失败: ${response.status}`),
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.byteLength) throw new Error('ElevenLabs 未返回转换后的声线音频。');
  return {
    base64: bytes.toString('base64'),
    contentType: response.headers.get('content-type') || 'audio/mpeg',
    voiceGender,
  };
}

function parseJsonText(text: string, status: number): any {
  return parseJsonResponse(text, status);
}
