import { config } from './config';

export const OMNIHUMAN_MODEL = 'jimeng_realman_avatar_picture_omni_v15';
export const OMNIHUMAN_RESOLUTION = 1080;
const API_BASE = 'https://openapi.cv.volces.com/api/common/v3';
const TASK_ID = /^[A-Za-z0-9_-]{5,128}$/;

async function request(path: string, payload: Record<string, unknown>): Promise<{ data: any; requestId: string; taskId: unknown }> {
  if (!config.volcengineApiKey) throw new Error('请配置 VOLCENGINE_API_KEY_SECRET。');
  const response = await fetch(`${API_BASE}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.volcengineApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ req_key: OMNIHUMAN_MODEL, ...payload }),
    signal: AbortSignal.timeout(30000),
  });
  let result: any;
  try { result = await response.json(); }
  catch { throw new Error(`数字人服务返回了无效响应（HTTP ${response.status}）。`); }
  if (!response.ok || result?.code !== 10000) {
    const detail = String(result?.message || `HTTP ${response.status}`).slice(0, 200);
    throw new Error(`数字人服务请求失败（${result?.code ?? response.status}）：${detail}`);
  }
  return { data: result.data, requestId: String(result.request_id || ''), taskId: result.task_id };
}

export async function startOmnihuman(imageUrl: string, audioUrl: string, direction: string): Promise<string> {
  const prompt = `人物面对镜头自然说话，嘴唇随输入音频的语速与停顿同步。${direction}`.slice(0, 300);
  const { data, requestId, taskId } = await request('submit_task', {
    image_url: imageUrl,
    audio_url: audioUrl,
    output_resolution: OMNIHUMAN_RESOLUTION,
    pe_fast_mode: false,
    prompt,
  });
  const candidate = data?.task_id ?? data?.taskId ?? taskId;
  const id = typeof candidate === 'string' ? candidate.trim()
    : typeof candidate === 'number' && Number.isSafeInteger(candidate) ? String(candidate) : '';
  if (!TASK_ID.test(id)) {
    console.error('[speech-video] OmniHuman submit response has no usable task ID:', {
      requestId, dataType: typeof data, dataFields: data && typeof data === 'object' ? Object.keys(data) : [],
      taskIdType: typeof candidate, taskIdLength: id.length,
    });
    throw new Error(`数字人服务可能已接收任务，但未返回可查询的编号。请勿立即重复提交，请联系管理员核查请求${requestId ? `（${requestId}）` : ''}。`);
  }
  return id;
}

export async function omnihumanStatus(id: string): Promise<{ status: string; videoUrl: string | null; error: string | null }> {
  if (!TASK_ID.test(id)) throw new Error('无效的数字人任务编号。');
  const { data } = await request('get_result', { task_id: id });
  const state = String(data?.status || '');
  if (state === 'done') {
    const url = typeof data.video_url === 'string' ? data.video_url : '';
    return url.startsWith('https://')
      ? { status: 'completed', videoUrl: url, error: null }
      : { status: 'failed', videoUrl: null, error: '数字人任务已结束，但没有返回视频，请重试。' };
  }
  if (state === 'in_queue') return { status: 'queued', videoUrl: null, error: null };
  if (state === 'processing' || state === 'generating') return { status: 'running', videoUrl: null, error: null };
  if (state === 'not_found' || state === 'expired') {
    return { status: 'failed', videoUrl: null, error: '数字人任务已过期或不存在，请重新生成。' };
  }
  throw new Error(`数字人服务返回了未知任务状态：${state.slice(0, 50)}`);
}
