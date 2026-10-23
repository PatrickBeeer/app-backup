import {
  extractImageFromResponse,
  extractTextFromResponse,
  generateContent,
  uploadAssetToCOSWithPresignedURL,
} from '../../../../shared_services/geminiProxyService';
import {
  createTaskQueueItem,
  queryTaskQueueVideo,
  recordTaskManagerObject,
  type QueryTaskQueueVideoResult,
  type TaskManagerTaskItem,
} from '../../../../services/taskManagerService';

const APP_ID = 'fitness-model';
const TEXT_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const VIDEO_MODEL = 'doubao-seedance-2-0-fast-260128';
const VIDEO_DURATION_SECONDS = 4;
const VIDEO_TASK_TIMEOUT_MS = 11 * 60 * 1000;

export interface AnalyzeImageRequest {
  image: string;
}

export interface GenerateFitnessImageRequest {
  productImages: string[];
  prompt: string;
  aspectRatio: string;
  imageSize: '1K' | '2K';
}

export interface EditFitnessImageRequest {
  image: string;
  prompt: string;
  aspectRatio: string;
  imageSize: '1K' | '2K';
}

export interface SubmitVideoRequest {
  image: string;
  prompt: string;
  aspectRatio: '9:16' | '16:9';
}

export interface VideoGenerationResult {
  taskId: string | null;
  status: string;
  videoUrl: string | null;
}

export interface VideoTaskQueryResult {
  taskId: string;
  status: string;
  videoUrl: string | null;
}

function stripDataUrlPrefix(input: string): string {
  return String(input || '').replace(/^data:[^;]+;base64,/i, '');
}

function detectMimeType(input: string, fallback = 'image/png'): string {
  const match = String(input || '').match(/^data:([^;]+);base64,/i);
  return match?.[1] || fallback;
}

function isHttpUrl(input: string): boolean {
  return /^https?:\/\//i.test(String(input || '').trim());
}

function dataUrlToBlob(dataUrl: string): Blob {
  const mimeType = detectMimeType(dataUrl, 'application/octet-stream');
  const base64 = stripDataUrlPrefix(dataUrl);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function normalizeVideoStatus(status: string, videoUrl?: string | null): 'queued' | 'running' | 'finished' | 'failed' {
  if (String(videoUrl || '').trim()) {
    return 'finished';
  }

  switch (String(status || '').trim().toLowerCase()) {
    case 'queued':
    case 'pending':
      return 'queued';
    case 'running':
    case 'processing':
    case 'in_progress':
      return 'running';
    case 'finished':
    case 'completed':
    case 'success':
    case 'succeeded':
      return 'finished';
    case 'failed':
    case 'error':
    case 'cancelled':
    case 'canceled':
      return 'failed';
    default:
      return 'running';
  }
}

function extractTaskId(payload: any): string | null {
  const candidates = [
    payload?.taskId,
    payload?.task_id,
    payload?.id,
    payload?.data?.taskId,
    payload?.data?.task_id,
    payload?.data?.id,
    payload?.result?.taskId,
    payload?.result?.task_id,
    payload?.result?.id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function extractVideoUrl(payload: any): string | null {
  const candidates = [
    payload?.videoUrl,
    payload?.video_url,
    payload?.url,
    payload?.uri,
    payload?.data?.videoUrl,
    payload?.data?.video_url,
    payload?.result?.videoUrl,
    payload?.result?.video_url,
    payload?.result?.url,
    payload?.result?.uri,
    payload?.videos?.[0]?.url,
    payload?.videos?.[0]?.uri,
    payload?.content?.video_url,
    payload?.content?.videoUrl,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function buildPrompt(prompt: string): string {
  return `Create a high-end commercial fitness model image.
Requirements:
1. Preserve the uploaded product exactly, including structure, texture, color, and branding details.
2. Place the product naturally on an athletic model with realistic anatomy, lighting, and fabric interaction.
3. Keep the result photorealistic and suitable for ecommerce marketing.
4. User direction: ${prompt || 'Create a premium fitness lifestyle commercial image.'}`;
}

export async function analyzeFitnessProductImage(request: AnalyzeImageRequest): Promise<string> {
  const response = await generateContent({
    model: TEXT_MODEL,
    task: 'text_gen',
    billing_task: 'text_gen',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: detectMimeType(request.image),
            data: stripDataUrlPrefix(request.image),
          },
        },
        {
          text: '请分析这张运动器材或运动穿戴产品图片，用简洁中文描述名称、颜色、材质、穿戴位置和关键卖点。只返回描述文本，不要额外解释。',
        },
      ],
    },
    systemInstruction: {
      parts: [
        {
          text: '你是电商产品分析助手，只输出适合继续做图片生成提示词的中文产品描述。',
        },
      ],
    },
  });

  return extractTextFromResponse(response).trim();
}

export async function generateFitnessImage(request: GenerateFitnessImageRequest): Promise<string> {
  const parts: Array<Record<string, unknown>> = request.productImages
    .filter((image) => String(image || '').trim())
    .map((image) => ({
      inlineData: {
        mimeType: detectMimeType(image),
        data: stripDataUrlPrefix(image),
      },
    }));

  parts.push({
    text: buildPrompt(request.prompt),
  });

  const response = await generateContent({
    model: IMAGE_MODEL,
    task: 'image_gen',
    billing_task: 'image_gen',
    contents: { parts },
    config: {
      imageConfig: {
        aspectRatio: request.aspectRatio,
        imageSize: request.imageSize,
      },
    },
    systemInstruction: {
      parts: [
        {
          text: 'You are a professional sports fashion photographer. Preserve the product exactly and output only a clean, photorealistic marketing image.',
        },
      ],
    },
  });

  const imageUrl = extractImageFromResponse(response);
  if (!imageUrl) {
    throw new Error('未能生成图片，请重试。');
  }

  return imageUrl;
}

export async function editFitnessImage(request: EditFitnessImageRequest): Promise<string> {
  const response = await generateContent({
    model: IMAGE_MODEL,
    task: 'image_gen',
    billing_task: 'image_gen',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: detectMimeType(request.image),
            data: stripDataUrlPrefix(request.image),
          },
        },
        {
          text: `Edit this ecommerce fitness model image. Keep the original product identity and overall realism. User edit request: ${request.prompt}`,
        },
      ],
    },
    config: {
      imageConfig: {
        aspectRatio: request.aspectRatio,
        imageSize: request.imageSize,
      },
    },
    systemInstruction: {
      parts: [
        {
          text: 'You are a professional retoucher for ecommerce fitness campaigns. Preserve the product and keep edits natural, clean, and realistic.',
        },
      ],
    },
  });

  const imageUrl = extractImageFromResponse(response);
  if (!imageUrl) {
    throw new Error('修改失败，请重试。');
  }

  return imageUrl;
}

export async function persistGeneratedImageTask(options: {
  imageUrl: string;
  imageIndex: number;
  prompt: string;
  aspectRatio: string;
  equipmentDesc: string;
}): Promise<string> {
  const blob = dataUrlToBlob(options.imageUrl);
  const upload = await uploadAssetToCOSWithPresignedURL(blob, {
    fileName: `fitness-model-${Date.now()}-${options.imageIndex + 1}.png`,
    objectPath: `standalone/${APP_ID}/generated_images`,
    appID: APP_ID,
    camAppID: APP_ID,
  });

  const persistedUrl =
    String(upload.url || '').trim() ||
    String(upload.signed_url || '').trim() ||
    String(upload.public_url || '').trim() ||
    options.imageUrl;

  let objectRecord: Awaited<ReturnType<typeof recordTaskManagerObject>> | null = null;
  try {
    objectRecord = await recordTaskManagerObject({
      bucket_name: String(upload.bucket_name || '').trim(),
      region: String(upload.region || '').trim(),
      object_key: String(upload.object_key || '').trim(),
      url: persistedUrl,
      size_bytes: blob.size,
      mime_type: blob.type || 'image/png',
    });
  } catch (error) {
    console.warn(`[${APP_ID}] image object record failed, continue with queue item`, error);
  }

  try {
    await createTaskQueueItem({
      source_app_id: APP_ID,
      item_type: 'image_link',
      status: 'finished',
      payload: {
        title: `Fitness Model 图片 ${options.imageIndex + 1}`,
        name: `Fitness Model 图片 ${options.imageIndex + 1}`,
        image_url: persistedUrl,
        url: persistedUrl,
        object_id: objectRecord?.object_id,
        object_key: upload.object_key,
        bucket: upload.bucket_name,
        region: upload.region,
        mime_type: blob.type || 'image/png',
        size_bytes: blob.size,
        shot_index: options.imageIndex,
        aspect_ratio: options.aspectRatio,
        description: options.prompt,
        equipment_desc: options.equipmentDesc,
      },
    });
  } catch (error) {
    console.warn(`[${APP_ID}] image queue item failed`, error);
  }

  return persistedUrl;
}

async function uploadVideoReferenceFrame(image: string): Promise<string | null> {
  if (isHttpUrl(image)) {
    return String(image || '').trim() || null;
  }

  const blob = dataUrlToBlob(image);
  const upload = await uploadAssetToCOSWithPresignedURL(blob, {
    fileName: `fitness-model-video-frame-${Date.now()}.png`,
    objectPath: `standalone/${APP_ID}/video_refs`,
    appID: APP_ID,
    camAppID: APP_ID,
  });

  return (
    String(upload.url || '').trim() ||
    String(upload.signed_url || '').trim() ||
    String(upload.public_url || '').trim() ||
    null
  );
}

export async function submitFitnessVideoTask(request: SubmitVideoRequest): Promise<VideoGenerationResult> {
  const referenceImageUrl = await uploadVideoReferenceFrame(request.image);
  if (!referenceImageUrl) {
    throw new Error('视频首帧上传失败，请重试。');
  }

  const payload: any = await generateContent({
    model: VIDEO_MODEL,
    task: 'video_gen_submit' as any,
    billing_task: 'video_gen',
    contents: {
      content: [
        {
          type: 'text',
          text: `${request.prompt || 'Create a premium fitness commercial motion clip.'}
Requirements:
- Keep the product identity unchanged.
- Produce a dynamic ecommerce commercial motion clip.
- No text, subtitles, or watermarks.
- Full-frame ${request.aspectRatio} composition.
- Exactly ${VIDEO_DURATION_SECONDS} seconds.`,
        },
        {
          type: 'image_url',
          image_url: { url: referenceImageUrl },
          role: 'first_frame',
        },
      ],
    },
    config: {
      resolution: '720p',
      aspectRatio: request.aspectRatio,
      durationSeconds: VIDEO_DURATION_SECONDS,
      submitOnly: true,
      timeoutMs: VIDEO_TASK_TIMEOUT_MS,
    } as any,
  } as any);

  return {
    taskId: extractTaskId(payload),
    status: String(payload?.status || payload?.data?.status || payload?.result?.status || 'queued').trim() || 'queued',
    videoUrl: extractVideoUrl(payload),
  };
}

export async function createFitnessVideoQueueTask(options: {
  imageIndex: number;
  prompt: string;
  previewUrl: string;
  aspectRatio: '9:16' | '16:9';
  generation: VideoGenerationResult;
}): Promise<TaskManagerTaskItem> {
  return createTaskQueueItem({
    source_app_id: APP_ID,
    item_type: 'video_task',
    status: normalizeVideoStatus(options.generation.status, options.generation.videoUrl),
    payload: {
      title: `Fitness Model 视频 ${options.imageIndex + 1}`,
      name: `Fitness Model 视频 ${options.imageIndex + 1}`,
      task_id: options.generation.taskId,
      taskId: options.generation.taskId,
      query_status: options.generation.status,
      model: VIDEO_MODEL,
      engine: 'seedance2',
      video_url: options.generation.videoUrl,
      videoUrl: options.generation.videoUrl,
      prompt: options.prompt,
      duration_seconds: VIDEO_DURATION_SECONDS,
      shot_index: options.imageIndex,
      preview_url: options.previewUrl,
      aspect_ratio: options.aspectRatio,
    },
  });
}

export async function queryFitnessVideoQueueTask(taskID: number): Promise<QueryTaskQueueVideoResult> {
  return queryTaskQueueVideo(taskID);
}

export async function queryFitnessVideoTaskProgress(taskId: string): Promise<VideoTaskQueryResult> {
  const trimmedTaskId = String(taskId || '').trim();
  if (!trimmedTaskId) {
    throw new Error('任务ID不能为空');
  }

  const payload: any = await generateContent({
    model: VIDEO_MODEL,
    task: 'video_task_query' as any,
    contents: {},
    config: {
      taskId: trimmedTaskId,
      timeoutMs: VIDEO_TASK_TIMEOUT_MS,
    } as any,
  } as any);

  return {
    taskId: trimmedTaskId,
    status: String(payload?.status || payload?.data?.status || payload?.result?.status || 'unknown').trim() || 'unknown',
    videoUrl: extractVideoUrl(payload),
  };
}
