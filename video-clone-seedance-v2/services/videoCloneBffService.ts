import { fetchWithAuthFallback } from './authenticatedFetch';

const STANDALONE_APP_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function resolveAppId(): string {
  if (typeof window !== 'undefined' && window.location) {
    const match = String(window.location.pathname || '').match(/^\/standalone\/([^/]+)(?:\/|$)/);
    const candidate = decodeURIComponent(String(match?.[1] || '')).trim();
    if (candidate && STANDALONE_APP_ID_PATTERN.test(candidate)) {
      return candidate;
    }
  }
  return 'video-clone-seedance-v2';
}

// 安全序列化：丢弃函数、DOM 节点等不可序列化值，并兜底循环引用，
// 避免把 React 事件、DOM 按钮等混入请求体时 JSON.stringify 直接抛
// "Converting circular structure to JSON"（HTMLButtonElement 循环引用）。
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, val) => {
    if (val === undefined) return undefined;
    if (typeof val === 'function') return undefined;
    if (typeof val === 'object' && val !== null) {
      // 任何 DOM 节点 / React 元素都不应进入请求体，直接丢弃。
      if (typeof (val as { nodeType?: unknown }).nodeType === 'number') return '[dom-node]';
      if (typeof (val as { $$typeof?: unknown }).$$typeof !== 'undefined') return '[react-element]';
      if (seen.has(val as object)) return '[circular]';
      seen.add(val as object);
    }
    return val;
  }) as string;
}

async function postRun<T>(action: string, params: Record<string, unknown> = {}, billed = false): Promise<T> {
  const endpoint = billed ? 'api/execute/run' : 'api/run';
  const response = await fetchWithAuthFallback(`/standalone/${encodeURIComponent(resolveAppId())}/${endpoint}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: safeStringify({ action, ...params }),
  });

  const text = await response.text();
  let payload: any = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`本地服务返回了非 JSON 响应（HTTP ${response.status}）。`);
    }
  }

  if (!response.ok || payload?.success === false) {
    throw new Error(String(payload?.message || payload?.error || `本地服务请求失败（HTTP ${response.status}）。`));
  }

  return (payload?.data ?? payload) as T;
}

export type ReferenceVideoInspection = {
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  pixelArea: number | null;
  aspectRatio: number | null;
  codecName: string | null;
  formatName: string | null;
};

export type CprtModel = {
  key: string;
  label: string;
  resolutions: string[];
};

export const CPRT_MODEL_OPTIONS: CprtModel[] = [
  ...CPRT_MULTIMODAL_VIDEO_MODELS.map((key) => ({
    key,
    label: ({
      'free-video-2.0-mini-multimodal-video': 'Mini',
      'free-video-2.0-fast-multimodal-video': 'Fast',
      'free-video-2.0-multimodal-video': '2.0',
      'master-video-s2-0-mini': 'Mini (M)',
      'master-video-s2-0-fast': 'Fast (M)',
      'master-video-s2-0': '2.0 (M)',
      'master-video-s2-5': '2.5 (M)',
      'tokendance-seedance-2.0-mini': '2.0 Mini (TokenDance)',
    } as const)[key],
    resolutions: [...CPRT_RESOLUTIONS_BY_MODEL[key]],
  })),
];

export const CPRT_RATIO_OPTIONS = CPRT_RATIOS;

export const CPRT_DURATION_OPTIONS = CPRT_DURATION_SECONDS;

export type CloneJobAutoScript = {
  originalText: string;
  translatedText: string;
};

export type CloneJobStartResult = {
  jobId: string;
  taskId: string;
  status: string;
  model: string;
  pointCost: number;
  /** 未手填台词时，由「语音识别 + 翻译」自动产出的台词。 */
  voiceAutoScript?: CloneJobAutoScript | null;
  /** 生成阶段合成好的配音公网地址（tts 时 finalize 会强制覆盖进成片音轨）。 */
  voiceAudioUrl?: string | null;
  /** 'tts' = 复刻音色合成配音；'source' = 原视频提取音轨（保持原声时）。 */
  voiceAudioKind?: 'tts' | 'source' | null;
  /** 本次使用的复刻音色 ID（现场复刻/失效重录后可能更新，前端需回写保存）。 */
  voiceId?: string | null;
};

export type CloneVoiceResult = {
  voiceId: string;
  targetModel: string;
  audioUrl: string;
};

export type VoicePreviewResult = {
  voiceId: string;
  language: string;
  /** 试听音频（mp3 base64，不含 data: 前缀）。 */
  audioBase64: string;
};

export type CloneJobStatus = {
  jobId: string;
  taskId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  videoUrl?: string | null;
  originalVideoUrl?: string | null;
  errorMessage?: string | null;
};

export type BffHealth = {
  status: string;
  service: string;
  hasCprtKey: boolean;
  hasTokendanceKey?: boolean;
  hasBailianKey?: boolean;
  bailianWorkspaceId?: string | null;
  bailianModel?: string;
};

export type AudioSwapResult = {
  videoUrl: string;
  audioUrl: string | null;
  voiceId?: string;
  videoDurationSeconds: number | null;
  audioDurationSeconds: number | null;
  audioTempo: number;
};

export const videoCloneBffService = {
  health: () => postRun<BffHealth>('health'),
  inspectReferenceVideo: (sourceUrl: string) =>
    postRun<ReferenceVideoInspection>('inspect_reference_video', { sourceUrl }),
  startCloneJob: (payload: {
    referenceVideoUrl: string;
    imageUrls: string[];
    prompt: string;
    model: string;
    resolution: string;
    durationSeconds: number;
    ratio: string;
    realPersonMode: boolean;
    voiceReplacement: VoiceReplacementInput;
    backgroundReplacement: BackgroundReplacementInput;
  }) => postRun<CloneJobStartResult>('start_clone_job', payload, true),
  getCloneJob: (jobId: string) => postRun<CloneJobStatus>('get_clone_job', { jobId }),
  /** 声音复刻：上传样本后用样本公网地址即时创建专属音色，返回 voice_id。 */
  createCloneVoice: (audioUrl: string) =>
    postRun<CloneVoiceResult>('create_clone_voice', { audioUrl }),
  /** 复刻音色试听：用该音色合成一句固定短词，返回 base64 mp3；音色失效时可带样本地址自动重建。 */
  previewVoice: (voiceId: string, language: string, voiceAudioUrl?: string) =>
    postRun<VoicePreviewResult>('preview_voice', { voiceId, language, voiceAudioUrl }),
  swapVideoAudio: (payload: {
    videoUrl: string;
    language: string;
    script?: string;
    voiceId: string;
    voiceAudioUrl?: string;
  }) => postRun<AudioSwapResult>('swap_video_audio', payload),
  /** 兜底换声：用生成阶段已合成的配音直接覆盖成片音轨（画面一帧不动）。 */
  muxGeneratedAudio: (payload: { videoUrl: string; audioUrl: string }) =>
    postRun<AudioSwapResult>('mux_generated_audio', payload),
  /** 把参考视频的镜头抖动搬到成片上（模型把画面抹平时补救用）。 */
  applyCameraShake: (payload: { referenceVideoUrl: string; videoUrl: string }) =>
    postRun<{ videoUrl: string }>('apply_camera_shake', payload),
    /** 仅在需要复刻配音时自动后处理；视频流保持原样。 */
  finalizeVideo: (payload: {
    videoUrl: string;
    /** 复刻音色合成的配音地址：传入后 finalize 会强制替换成片音轨。 */
    voiceAudioUrl?: string;
    /** 生成任务 ID：传入后服务端会记录最终成片 URL，刷新页面仍能取回配音版。 */
    jobId?: string;
  }) => postRun<{
    videoUrl: string;
    /** 成片音轨是否已被复刻配音覆盖。 */
    audioReplaced?: boolean;
    audioTempo?: number;
  }>('finalize_video', payload),
};
import {
  CPRT_DURATION_SECONDS,
  CPRT_MULTIMODAL_VIDEO_MODELS,
  CPRT_RATIOS,
  CPRT_RESOLUTIONS_BY_MODEL,
  type BackgroundReplacementInput,
  type VoiceReplacementInput,
} from '../shared/cprtContract';
