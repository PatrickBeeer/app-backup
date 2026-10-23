export type DubbingStatus = {
  id: string;
  status: string;
  error?: string | null;
};

export type LipSyncStatus = {
  taskId: string;
  status: string;
  statusMessage?: string;
  videoUrl: string | null;
};

// BFF 基址：生产环境 nginx 转发 /video-clone-v3-bff/ → BFF(9896)；
// 开发模式 vite 中间件在 :1111 处理 /api/*，返回空串走同源。
function bffBase(): string {
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/standalone/video-clone-v3/')) {
    return '/video-clone-v3-bff';
  }
  return '';
}

async function parseResponse(response: Response): Promise<any> {
  const text = await response.text();
  let payload: any = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { message: text }; }
  if (!response.ok) {
    const message = String(payload?.detail?.message || payload?.detail || payload?.message || `API request failed: ${response.status}`);
    if (message.includes('dubbing_write')) {
      throw new Error('ElevenLabs Key 缺少 Dubbing Write 权限。请在 Developers → API Keys 中编辑该 Key，并开启 Dubbing 的 Read 和 Write 权限。');
    }
    throw new Error(message);
  }
  return payload;
}

export async function createMultilingualDubbing(sourceUrl: string, targetLang: string): Promise<{ dubbingId: string }> {
  const response = await fetch(`${bffBase()}/api/elevenlabs/dubbing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceUrl, targetLang }),
  });
  const payload = await parseResponse(response);
  const dubbingId = String(payload?.dubbing_id || '').trim();
  if (!dubbingId) throw new Error('ElevenLabs 未返回配音任务 ID。');
  return { dubbingId };
}

export async function queryMultilingualDubbing(dubbingId: string): Promise<DubbingStatus> {
  const response = await fetch(`${bffBase()}/api/elevenlabs/dubbing/${encodeURIComponent(dubbingId)}`, { cache: 'no-store' });
  const payload = await parseResponse(response);
  return {
    id: String(payload?.dubbing_id || dubbingId),
    status: String(payload?.status || 'unknown'),
    error: payload?.error ? String(payload.error) : null,
  };
}

export function multilingualDubbingMediaUrl(dubbingId: string, targetLang: string): string {
  return `${bffBase()}/api/elevenlabs/dubbing/${encodeURIComponent(dubbingId)}/audio/${encodeURIComponent(targetLang)}`;
}

export async function publishLipSyncAudio(dataUrl: string): Promise<string> {
  const response = await fetch(`${bffBase()}/api/kling/assets/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl }),
  });
  const payload = await parseResponse(response);
  const url = String(payload?.url || '').trim();
  if (!url) throw new Error('没有生成可灵可访问的音频地址。');
  return url;
}

export const publishTemporaryMedia = publishLipSyncAudio;

export async function convertAudioVoiceGender(
  audioDataUrl: string,
  voiceGender: 'female' | 'male',
): Promise<string> {
  const response = await fetch(`${bffBase()}/api/elevenlabs/voice-convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioDataUrl, voiceGender }),
  });
  const payload = await parseResponse(response);
  const base64 = String(payload?.base64 || '').trim();
  if (!base64) throw new Error('ElevenLabs 未返回转换后的声线音频。');
  return `data:${String(payload?.contentType || 'audio/mpeg')};base64,${base64}`;
}

export async function createKlingLipSync(videoUrl: string, audioUrl: string): Promise<{ taskId: string }> {
  const response = await fetch(`${bffBase()}/api/kling/lip-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrl, audioUrl }),
  });
  const payload = await parseResponse(response);
  const taskId = String(payload?.taskId || '').trim();
  if (!taskId) throw new Error('可灵未返回口型同步任务 ID。');
  return { taskId };
}

export async function queryKlingLipSync(taskId: string): Promise<LipSyncStatus> {
  const response = await fetch(`${bffBase()}/api/kling/lip-sync/${encodeURIComponent(taskId)}`, { cache: 'no-store' });
  const payload = await parseResponse(response);
  return {
    taskId: String(payload?.taskId || taskId),
    status: String(payload?.status || 'unknown'),
    statusMessage: String(payload?.statusMessage || ''),
    videoUrl: String(payload?.videoUrl || '').trim() || null,
  };
}
