import type { PresenterMode, Ratio } from '../core/types.js';

// XG-MASTER-VIDEO-2.5（智算谷转发的火山 Seedance 2.5）使用火山原生 content[]
// 数组契约：每个条目带 type（text/image_url/video_url/audio_url）与可选 role
// （reference_image/reference_video/reference_audio/first_frame/last_frame）。
// 已取代失效的 free-video-2.x 的 imageUrls/videoUrls/conversionSlots 契约。
export type CprtContentRole =
  | 'reference_image'
  | 'reference_video'
  | 'reference_audio'
  | 'first_frame'
  | 'last_frame';

export interface CprtContentItem {
  type: 'text' | 'image_url' | 'video_url' | 'audio_url';
  text?: string;
  image_url?: { url: string };
  video_url?: { url: string };
  audio_url?: { url: string };
  role?: CprtContentRole;
}

export interface CprtMultimodalPayload {
  model: string;
  content: CprtContentItem[];
  generate_audio: true;
  // r2v（参考视频）模式必填；i2v（首帧/首尾帧）模式必须省略——
  // 火山要求 "the output ratio follows the first-frame image"。
  ratio?: Ratio;
  duration: number;
}

// 旧 free-video 契约（firstFrameUrl/lastFrameUrl/conversionSlots/...）的上游已失效
// （返回"上游返回的任务id为空"），§6 兜底已整体改为 XG-MASTER-VIDEO-2.5 的
// content[] i2v 模式，与主模型共用同一活体模型，仅 payload 形态不同。

export interface MultimodalPayloadInput {
  presenterMode: PresenterMode;
  personUrls: string[];
  productUrls: string[];
  referenceVideoUrl: string;
  prompt: string;
  ratio: Ratio;
  requestDuration: number;
  model?: string;
}

export interface ImagePayloadInput {
  firstFrameUrl: string;
  lastFrameUrl?: string;
  prompt: string;
  requestDuration: number;
  model?: string;
}

export interface NormalizedRemoteTask {
  taskId: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  rawStatus: string;
  videoUrl?: string;
  error?: string;
}

export interface VideoProvider {
  submit(payload: CprtMultimodalPayload): Promise<{ taskId: string }>;
  query(taskId: string): Promise<NormalizedRemoteTask>;
}

function clampDuration(value: number): number {
  return Math.max(4, Math.min(15, Math.ceil(value)));
}

export function buildMultimodalPayload(input: MultimodalPayloadInput): CprtMultimodalPayload {
  // content[] 顺序：文本指令 → 人物照片(reference_image) → 商品图片(reference_image)
  // → 参考视频片段(reference_video)。人物与商品的区分通过提示词约束，参考视频
  // 提供运镜/节奏/声音复刻。presenterMode 不再映射为 payload 字段（XG 无此字段）。
  const content: CprtContentItem[] = [
    { type: 'text', text: input.prompt },
    ...input.personUrls.map((url) => ({
      type: 'image_url' as const,
      image_url: { url },
      role: 'reference_image' as CprtContentRole
    })),
    ...input.productUrls.map((url) => ({
      type: 'image_url' as const,
      image_url: { url },
      role: 'reference_image' as CprtContentRole
    })),
    { type: 'video_url', video_url: { url: input.referenceVideoUrl }, role: 'reference_video' }
  ];
  return {
    model: input.model ?? 'XG-MASTER-VIDEO-2.5',
    content,
    generate_audio: true,
    ratio: input.ratio,
    duration: clampDuration(input.requestDuration)
  };
}

export function buildImageFallbackPayload(input: ImagePayloadInput): CprtMultimodalPayload {
  // §6 兜底：主模型（r2v）提交失败时改用首尾帧 i2v 兜底。XG-MASTER-VIDEO-2.5
  // 同时支持 r2v 与 i2v——i2v 模式下 content[] 用 image_url 的 first_frame/last_frame
  // 角色，且必须省略 ratio（火山："the output ratio follows the first-frame image"）。
  // 旧的 free-video-2.5-image-to-video 上游已失效（"上游返回的任务id为空"），已弃用。
  const content: CprtContentItem[] = [
    { type: 'text', text: input.prompt },
    { type: 'image_url', image_url: { url: input.firstFrameUrl }, role: 'first_frame' },
    ...(input.lastFrameUrl
      ? [{
          type: 'image_url' as const,
          image_url: { url: input.lastFrameUrl },
          role: 'last_frame' as CprtContentRole
        }]
      : [])
  ];
  return {
    model: input.model ?? 'XG-MASTER-VIDEO-2.5',
    content,
    generate_audio: true,
    duration: clampDuration(input.requestDuration)
  };
}

function normalizeStatus(value: unknown): NormalizedRemoteTask['status'] {
  const status = String(value ?? '').toUpperCase();
  if (status === 'SUCCEEDED' || status === 'SUCCESS') return 'SUCCESS';
  if (status === 'FAILED' || status === 'ERROR') return 'FAILED';
  if (status === 'RUNNING' || status === 'PROCESSING') return 'RUNNING';
  return 'QUEUED';
}

function safeErrorBody(body: unknown): string {
  if (body == null) return '未知上游错误';
  if (typeof body === 'string') return body.slice(0, 500);
  if (typeof body !== 'object') return '未知上游错误';
  const value = body as Record<string, unknown>;
  // CPRT/火山常返回 { error: { code, message, type } } 或多层嵌套上游错误串，
  // 直接读顶层 message 会拿不到，递归下钻到最内层的可读消息。
  const nested = value.error;
  if (nested && typeof nested === 'object') {
    const inner = safeErrorBody(nested);
    if (inner && inner !== '未知上游错误') return inner;
  }
  const direct = value.errorMessage ?? value.message ?? value.errorCode;
  if (typeof direct === 'string' && direct.length) return direct.slice(0, 500);
  return '未知上游错误';
}

export class CprtProvider implements VideoProvider {
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly config: { baseUrl: string; apiKey?: string },
    fetchImpl: typeof fetch = fetch
  ) {
    this.fetchImpl = fetchImpl;
  }

  private headers(): Record<string, string> {
    if (!this.config.apiKey) throw new Error('真实模式缺少 CPRT_API_KEY');
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };
  }

  async submit(payload: CprtMultimodalPayload): Promise<{ taskId: string }> {
    const response = await this.fetchImpl(`${this.config.baseUrl}/v1/chat/asyncTask`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload)
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw new Error(`智算谷创建任务失败（${response.status}）：${safeErrorBody(body)}`);
    const taskId = body.taskId ?? body.task_id ?? body.id;
    if (typeof taskId !== 'string' || taskId.length === 0) {
      throw new Error('智算谷创建响应缺少任务 ID');
    }
    return { taskId };
  }

  async query(taskId: string): Promise<NormalizedRemoteTask> {
    const response = await this.fetchImpl(`${this.config.baseUrl}/v1/chat/asyncTask/${encodeURIComponent(taskId)}`, {
      method: 'GET',
      headers: this.headers()
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw new Error(`智算谷查询任务失败（${response.status}）：${safeErrorBody(body)}`);
    const rawStatus = String(body.status ?? body.state ?? 'QUEUED');
    const results = Array.isArray(body.results) ? (body.results as Array<Record<string, unknown>>) : [];
    const result = results.find((item) => item.name === 'videoUrl' || item.outputType === 'mp4');
    const content = body.content && typeof body.content === 'object' ? (body.content as Record<string, unknown>) : undefined;
    const videoUrl = typeof result?.url === 'string'
      ? result.url
      : typeof content?.video_url === 'string'
        ? content.video_url
        : undefined;
    const error = normalizeStatus(rawStatus) === 'FAILED' ? safeErrorBody(body) : undefined;
    return {
      taskId: String(body.taskId ?? body.task_id ?? body.id ?? taskId),
      status: normalizeStatus(rawStatus),
      rawStatus,
      ...(videoUrl ? { videoUrl } : {}),
      ...(error ? { error } : {})
    };
  }
}
