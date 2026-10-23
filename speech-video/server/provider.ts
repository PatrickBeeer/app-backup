import { config } from './config';
import { DEFAULT_MODEL, type ModelId } from '../shared/models';

export const MODEL = DEFAULT_MODEL;
export const RESOLUTION = '480p';

async function json(url: string, init: RequestInit, label: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let result: any;
    try { result = JSON.parse(text); } catch { throw new Error(`${label} 返回了非 JSON 响应（HTTP ${res.status}）。`); }
    if (!res.ok || (result?.code && !['0', '200', 'success', 'ok'].includes(String(result.code).toLowerCase()))) {
      throw new Error(`${label}失败：${result?.error?.message || result?.errorMessage || result?.message || `HTTP ${res.status}`}`);
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}

function cprt(path: string, body?: unknown): Promise<any> {
  if (!config.cprtKey) throw new Error('请配置 CPRT_KEY。');
  return json(`${config.cprtBaseUrl}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${config.cprtKey}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }, 'CPRT 请求');
}

function bailian(path: string, body: unknown): Promise<any> {
  if (!config.bailianKey || !config.bailianBaseUrl) throw new Error('请配置 BAILIAN_KEY 和 BAILIAN_WORKSPACE_ID。');
  return json(`${config.bailianBaseUrl}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.bailianKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  }, '百炼请求');
}

const TTS_MODEL = 'qwen-audio-3.0-tts-plus';

export function speechRefs(payload: any): { audioUrl: string; inlineBase64: string } {
  const firstString = (values: unknown[]): string =>
    values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim() || '';
  return {
    audioUrl: firstString([
      payload?.output?.audio?.url,
      payload?.output?.audio_url,
      payload?.output?.url,
      payload?.audio_url,
      payload?.url,
    ]),
    inlineBase64: firstString([payload?.output?.audio?.data, payload?.data]),
  };
}

export async function enrollVoice(url: string): Promise<string> {
  const response = await bailian('/api/v1/services/audio/tts/customization', {
    model: 'voice-enrollment',
    input: { action: 'create_voice', target_model: TTS_MODEL, prefix: `sv${Math.random().toString(16).slice(2, 10).padEnd(8, '0')}`, url },
  });
  const voice = response?.output?.voice_id || response?.output?.voiceId;
  if (!voice || !/^[\w.-]{1,255}$/.test(voice)) throw new Error('百炼没有返回有效的音色 ID。');
  return voice;
}

export async function synthesize(script: string, voice: string): Promise<Buffer> {
  const input = {
    model: TTS_MODEL, input: { text: script, voice, format: 'mp3', sample_rate: 24000 },
  };
  const call = () => bailian('/api/v1/services/audio/tts/SpeechSynthesizer', input);
  let result: any;
  try {
    result = await call();
  } catch (error) {
    if (!/engine error|speak operation failed|HTTP 5\d\d|timeout/i.test(String(error))) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    result = await call();
  }
  let refs = speechRefs(result);
  if (!refs.inlineBase64 && !refs.audioUrl) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    result = await call();
    refs = speechRefs(result);
  }
  const inline = refs.inlineBase64;
  if (typeof inline === 'string' && inline) return Buffer.from(inline.replace(/^data:.*?base64,/, ''), 'base64');
  const url = refs.audioUrl;
  if (!url) {
    const requestId = String(result?.request_id || result?.requestId || '').slice(0, 80);
    console.warn('[speech-video] Bailian 200 without audio:', {
      requestId,
      outputFields: Object.keys(result?.output || {}),
      audioFields: Object.keys(result?.output?.audio || {}),
    });
    throw new Error(`百炼未返回可下载的语音文件${requestId ? `（request_id: ${requestId}）` : ''}，请稍后重试。`);
  }
  let downloadUrl: URL;
  try { downloadUrl = new URL(url); }
  catch { throw new Error('百炼返回了无效的音频下载地址。'); }
  if (!['http:', 'https:'].includes(downloadUrl.protocol) || downloadUrl.username || downloadUrl.password) {
    throw new Error('百炼返回了不安全的音频下载地址。');
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载语音失败（HTTP ${response.status}）。`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return bytes;
}

async function reviewed(type: 'Image' | 'Audio', url: string): Promise<string> {
  let id = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await cprt('/master/asset/submit', { asset_type: type, url });
      id = String(result?.asset_id || '');
      if (!id) throw new Error('素材送审未返回 asset_id。');
      break;
    } catch (error) {
      if (attempt === 2 || !/DownloadFailed|deadline exceeded|download media/i.test(String(error))) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
  for (let attempt = 0; attempt < 60; attempt++) {
    const response = await cprt('/master/asset/status', { id });
    const status = String(response?.status || '');
    if (status === 'Active') return `asset://${id}`;
    if (/(fail|reject|block|deny|violation)/i.test(status)) throw new Error(`${type === 'Image' ? '参考图片' : '口播音频'}未通过素材审核（${status}）。`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error(`${type === 'Image' ? '参考图片' : '口播音频'}审核超时，请稍后重试。`);
}

export function buildContent(images: string[], audio: string, script: string, direction: string): Array<Record<string, unknown>> {
  return [
    { type: 'text', text: [
      '以参考图片中的同一位人物为唯一主角，正面清晰出镜，保持脸、发型和服饰一致；其他参考图只是同一人物的补充视角。',
      '最高优先级：人物嘴唇的开合、每个音节的口型及其起止时刻，必须与提供的参考音频高度同步，尽可能达到逐帧对齐。以音频为唯一时间轴，严格匹配语速、停顿和静音；静音时闭嘴，绝不可出现嘴巴提前动作、延迟动作、口型与声音对不上或无声说话。',
      '人物自然面对镜头说话，只说音频里实际听得到的台词，不要补说被截断的后半段，不要额外说话或出现字幕。',
      `用户原始台词（音频超过15秒时仅演绎其前15秒）：${script}`,
      direction ? `画面要求：${direction}` : '镜头稳定，单人半身像，真实自然的光照。',
    ].join('\n') },
    ...images.map((url) => ({ type: 'image_url', image_url: { url }, role: 'reference_image' })),
    { type: 'audio_url', audio_url: { url: audio }, role: 'reference_audio' },
  ];
}

export async function startVideo(images: string[], audio: string, script: string, direction: string, duration: number, model: ModelId): Promise<string> {
  const imageRefs: string[] = [];
  for (const url of images) imageRefs.push(await reviewed('Image', url));
  const audioRef = await reviewed('Audio', audio);
  const result = await cprt('/v1/chat/asyncTask', {
    model, content: buildContent(imageRefs, audioRef, script, direction),
    resolution: RESOLUTION, duration, ratio: '9:16', generate_audio: true, watermark: false, returnOriginData: true,
  });
  const id = String(result?.id || result?.taskId || '');
  if (!id) throw new Error('CPRT 未返回视频任务 ID。');
  return id;
}

export async function videoStatus(id: string): Promise<{ status: string; videoUrl: string | null; error: string | null }> {
  if (!/^[A-Za-z0-9_-]{5,128}$/.test(id)) throw new Error('无效的视频任务 ID。');
  const result = await cprt(`/v1/chat/asyncTask/${encodeURIComponent(id)}`);
  const state = String(result?.status || '').toUpperCase();
  const status = ['SUCCESS', 'SUCCEEDED', 'COMPLETED'].includes(state) ? 'completed'
    : ['ERROR', 'FAILED', 'CANCELED', 'CANCELLED'].includes(state) ? 'failed'
      : ['QUEUED', 'SUBMITTED', 'PENDING'].includes(state) ? 'queued' : 'running';
  const videoUrl = result?.content?.video_url || result?.results?.find((item: any) => item?.name === 'videoUrl')?.url || null;
  return { status: status === 'completed' && !videoUrl ? 'failed' : status, videoUrl, error: result?.error?.message || result?.errorMessage || (status === 'completed' && !videoUrl ? '任务完成但没有返回视频。' : null) };
}
