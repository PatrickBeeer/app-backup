import {
  generateContent,
  extractImageFromResponse,
  extractJsonTextFromResponse,
  extractTextFromResponse,
  uploadAssetToCOSWithPresignedURL,
  type GeminiGenerateRequest,
} from '../../../shared_services/geminiProxyService';
import { AdPlan } from "../types";

const TEXT_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const VIDEO_MODEL = 'doubao-seedance-2-0-fast-260128';
const VEO_MODEL = 'veo_3_1';
const GROK_VIDEO_MODEL = 'grok-video-3-pro';
const GROK_FIXED_DURATION_SECONDS = 10;
const GROK_SIZE_BY_ASPECT_RATIO: Record<'16:9' | '9:16', '1080x720' | '720x1080'> = {
  '16:9': '1080x720',
  '9:16': '720x1080',
};
const COS_APP_ID = 's_selling-point-visual-video_v3';
const VIDEO_GENERATION_TIMEOUT_MS = 11 * 60 * 1000;
const SEEDANCE_TASKS_URL = 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks';
const SEEDANCE_RESOLUTION = '720p';

const PLAN_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    category: { type: 'string' },
    sellingPoints: {
      type: 'array',
      items: { type: 'string' },
    },
    storyboard: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          stage: { type: 'string' },
          description: { type: 'string' },
          overlayText: { type: 'string' },
          cameraMovement: { type: 'string' },
          duration: { type: 'string' },
        },
        required: ['stage', 'description', 'overlayText', 'cameraMovement', 'duration'],
      },
    },
    videoPrompt: { type: 'string' },
  },
  required: ['category', 'sellingPoints', 'storyboard', 'videoPrompt'],
} as const;

export type VideoEngine = 'seedance2' | 'veo31' | 'grokv3';

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

function isTransientVideoTaskNotFoundError(error: unknown): boolean {
  const message = String((error as any)?.message || '').toLowerCase();
  if (!message) {
    return false;
  }

  return (
    message.includes('task_not_exist') ||
    message.includes('task not exist') ||
    message.includes('task_not_ex')
  );
}

function isN1NTaskFailedError(error: unknown): boolean {
  const message = String((error as any)?.message || '').toLowerCase();
  return message.includes('n1n video task failed') || message.includes('video task failed');
}

function normalizeVeoPrompt(prompt: string): string {
  return String(prompt || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildVeoPromptVariants(prompt: string, aspectRatio: '16:9' | '9:16', durationSeconds: number): string[] {
  const normalized = normalizeVeoPrompt(prompt);
  const base = normalized || 'Professional cinematic product commercial.';
  const concise = `${base} STRICT CONSTRAINTS: THE VIDEO MUST BE EXACTLY ${durationSeconds} SECONDS LONG. NO TEXT, NO LOGOS, NO CAPTIONS. THE VIDEO MUST FULLY FILL THE ENTIRE ${aspectRatio} FRAME. ABSOLUTELY NO BLACK BARS. Professional cinematic quality.`;
  const trimmedConcise = concise.length > 700 ? `${concise.slice(0, 700)}...` : concise;
  const minimal = `Professional cinematic product commercial. Smooth camera movement. No text, no logos, no captions. Full-frame ${aspectRatio}. Exactly ${durationSeconds} seconds.`;

  if (trimmedConcise === minimal) {
    return [trimmedConcise];
  }

  return [trimmedConcise, minimal];
}

function parseVideoUrlFromText(text: string): string | null {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('data:video/') || /^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return extractVideoUrlFromPayload(parsed);
    } catch {
      return null;
    }
  }

  return null;
}

function extractVideoUrlFromPayload(payload: any): string | null {
  const directCandidates = [
    payload?.videoUrl,
    payload?.video_url,
    payload?.url,
    payload?.uri,
    payload?.content?.videoUrl,
    payload?.content?.video_url,
    payload?.data?.videoUrl,
    payload?.data?.video_url,
    payload?.result?.videoUrl,
    payload?.result?.video_url,
    payload?.result?.url,
    payload?.result?.uri,
    payload?.videos?.[0]?.url,
    payload?.videos?.[0]?.uri,
    payload?.generatedVideos?.[0]?.video?.url,
    payload?.generatedVideos?.[0]?.video?.uri,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  const candidates = payload?.candidates;
  if (!Array.isArray(candidates)) {
    return null;
  }

  for (const candidate of candidates) {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) {
      continue;
    }

    for (const part of parts) {
      const inlineData = part?.inlineData;
      if (inlineData?.data) {
        const mimeType = inlineData?.mimeType || 'video/mp4';
        return `data:${mimeType};base64,${inlineData.data}`;
      }

      const fileData = part?.fileData;
      const uriCandidate = fileData?.fileUri || fileData?.uri || fileData?.url;
      if (typeof uriCandidate === 'string' && uriCandidate.trim()) {
        return uriCandidate.trim();
      }

      const textUrl = parseVideoUrlFromText(part?.text || '');
      if (textUrl) {
        return textUrl;
      }
    }
  }

  return null;
}

function cleanBase64(dataUrlOrBase64: string): string {
  return (dataUrlOrBase64 || '').replace(/^data:[^;]+;base64,/, '');
}

function inferMimeType(dataUrlOrBase64: string, fallback = 'image/jpeg'): string {
  const match = String(dataUrlOrBase64 || '').match(/^data:([^;]+);base64,/i);
  return match?.[1] || fallback;
}

function buildInlineImagePart(...inputs: Array<string | undefined>): { inlineData: { data: string; mimeType: string } } | null {
  for (const input of inputs) {
    const trimmed = String(input || '').trim();
    if (!trimmed) {
      continue;
    }

    const isDataUrl = /^data:[^;]+;base64,/i.test(trimmed);
    const looksLikeRawBase64 = /^[a-z0-9+/=\s]+$/i.test(trimmed) && trimmed.length > 128;
    if (!isDataUrl && !looksLikeRawBase64) {
      continue;
    }

    const data = isDataUrl ? cleanBase64(trimmed) : trimmed.replace(/\s+/g, '');
    if (!data) {
      continue;
    }

    return {
      inlineData: {
        data,
        mimeType: inferMimeType(trimmed),
      },
    };
  }

  return null;
}

function buildSystemInstruction(text: string): GeminiGenerateRequest['systemInstruction'] {
  return { parts: [{ text }] };
}

function parseJsonResponse<T>(response: any): T {
  const jsonText = extractJsonTextFromResponse(response).trim();
  return JSON.parse(jsonText) as T;
}

function pickFirstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function pickFirstArray<T>(...values: unknown[]): T[] {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value as T[];
    }
  }

  return [];
}

function normalizeShotDuration(duration: unknown, fallbackSeconds = 4): string {
  if (typeof duration === 'string' && duration.trim()) {
    return duration.trim();
  }

  if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) {
    return `${Math.round(duration)}s`;
  }

  return `${fallbackSeconds}s`;
}

function unwrapPlanPayload(payload: any): any {
  if (Array.isArray(payload)) {
    return { storyboard: payload };
  }

  let current = payload;
  const wrapperKeys = ['plan', 'data', 'result', 'output', 'analysis', 'response'];

  while (current && typeof current === 'object' && !Array.isArray(current)) {
    const storyboard = pickFirstArray(current.storyboard, current.storyboards, current.shots, current.scenes, current.items);
    if (
      storyboard.length > 0 ||
      Array.isArray(current.sellingPoints) ||
      Array.isArray(current.selling_points) ||
      typeof current.videoPrompt === 'string' ||
      typeof current.video_prompt === 'string'
    ) {
      return current;
    }

    const nextWrapper = wrapperKeys
      .map((key) => current?.[key])
      .find((candidate) => candidate && typeof candidate === 'object');

    if (!nextWrapper) {
      return current;
    }

    current = nextWrapper;
  }

  return current ?? payload;
}

function normalizePlan(plan: any, shotCount: number): AdPlan {
  const source = unwrapPlanPayload(plan);
  const storyboard = pickFirstArray<any>(
    source?.storyboard,
    source?.storyboards,
    source?.shots,
    source?.scenes,
    source?.items,
  ).slice(0, shotCount);
  const normalizedStoryboard = storyboard.map((shot, idx) => ({
    ...shot,
    stage: pickFirstString(shot?.stage, shot?.title, shot?.name, shot?.sellingPoint, shot?.selling_point) || `卖点${idx + 1}`,
    description: pickFirstString(
      shot?.description,
      shot?.visualDescription,
      shot?.visual_description,
      shot?.prompt,
      shot?.content,
      shot?.summary,
    ),
    overlayText: pickFirstString(shot?.overlayText, shot?.overlay_text, shot?.caption, shot?.text),
    cameraMovement: pickFirstString(shot?.cameraMovement, shot?.camera_movement, shot?.camera, shot?.movement) || '镜头平移',
    duration: normalizeShotDuration(shot?.duration ?? shot?.durationSeconds ?? shot?.duration_seconds),
  }));

  const sellingPoints = pickFirstArray<string>(source?.sellingPoints, source?.selling_points)
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  return {
    category: pickFirstString(source?.category, source?.productCategory, source?.product_category) || '产品展示',
    sellingPoints,
    storyboard: normalizedStoryboard,
    videoPrompt: pickFirstString(source?.videoPrompt, source?.video_prompt, source?.prompt),
  };
}

export const analyzeProduct = async (base64Image: string, shotCount: number, customSellingPoints?: string): Promise<AdPlan> => {
  const response = await generateContent({
    model: TEXT_MODEL,
    task: 'text_gen',
    billing_task: 'plan_analysis',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: cleanBase64(base64Image),
          },
        },
        {
          text: `识别该产品并为短视频广告创建一个专业的“卖点可视化”分镜方案。
                ${customSellingPoints ? `用户指定了以下核心卖点，请优先并重点体现这些内容: "${customSellingPoints}"。` : ''}
                要求：
                1. 策划方案应完全聚焦于展示产品的“核心卖点”。
                2. 生成${shotCount}个独立的分镜，每个分镜必须代表一个独立且具体的产品核心卖点。
                3. **品牌一致性**：如果产品图上有明显的品牌Logo、标志性图案或独特设计，请在分镜描述中明确写出这些元素的存在和位置，确保视觉的一致性。
                4. 特别注意：相邻分镜之间需要设计平滑的视觉转场（例如：通过相同的运动路径、相似的构图或色彩流转）。在视觉描述中明确指出转场逻辑。
                5. 严格时长控制：每个分镜对应的视频动作必须在4秒内完成。内容必须紧凑，节奏明快。
                6. 对于每个镜头，提供极其详细的视觉“描述”（至少3-5句话），涵盖光影、材质纹理、微距特写和精准的镜头运动。
                7. 物理真实性：确保所有分镜中的物体摆放符合物理常识。
                重要：描述内容必须全部使用中文。
                关键点：生成的视频画面中严禁出现任何文字或字幕，但必须还原产品本身的Logo或标志。
                返回一个JSON对象：{ category, sellingPoints: string[], storyboard: Array<{ stage, description, overlayText, cameraMovement, duration }>, videoPrompt }。
                其中 "stage" 字段请填写具体的卖点名称。`,
        },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: PLAN_RESPONSE_SCHEMA,
    },
    systemInstruction: buildSystemInstruction("你是一位资深的商业广告导演，擅长通过极致的视觉语言展示产品卖点。你能够精准掌控镜头节奏，确保每个分镜视频时长严格控制在4秒。所有返回的文字内容必须全部使用中文。严禁在视觉描述中包含任何文字生成指令。在构思画面时，必须严格遵守物理规律，确保场景构图真实自然。"),
  });

  const parsed = parseJsonResponse<any>(response);
  const normalized = normalizePlan(parsed, shotCount);
  if (normalized.storyboard.length === 0) {
    throw new Error('analysis returned no storyboard items');
  }
  return normalized;
};

export const generateShotImage = async (
  description: string, 
  overlayText: string,
  cameraMovement: string, 
  productBase64: string, 
  aspectRatio: '9:16' | '16:9',
  billingTask: string = 'shot_image'
): Promise<string> => {
  const prompt = `Create a high-end commercial storyboard frame for the product.
                 SCENE DESCRIPTION: ${description}.
                 CAMERA: ${cameraMovement}.
                 STRICT CONSTRAINTS: 
                 - **BRAND INTEGRITY**: If the reference product image has a visible LOGO, BRAND MARKING, or signature pattern, you MUST accurately replicate and feature it in the generated image to maintain visual identity.
                 - ABSOLUTELY NO TEXT ON SCREEN (except for logos naturally found on the product). NO OVERLAYS. NO SUBTITLES. 
                 - FILL THE ENTIRE ${aspectRatio} FRAME COMPLETELY. EDGE-TO-EDGE.
                 - NO BLACK BARS, NO LETTERBOXING.
                 - THE IMAGE MUST OCCUPY 100% OF THE CANVAS.
                 - CINEMATIC LIGHTING, HYPER-REALISTIC textures.
                 - PHYSICAL GROUNDING: Ensure all objects follow realistic physics and spatial logic.`;
  
  const response = await generateContent({
    model: IMAGE_MODEL,
    task: 'image_gen',
    billing_task: billingTask,
    contents: {
      parts: [
        { inlineData: { data: cleanBase64(productBase64), mimeType: inferMimeType(productBase64) } },
        { text: prompt },
      ],
    },
    config: { 
      imageConfig: { aspectRatio: aspectRatio } 
    },
    systemInstruction: buildSystemInstruction(`You are a professional commercial photographer. Generate clean, text-free commercial images that perfectly fill the requested ${aspectRatio} aspect ratio. Ensure zero margins or black borders.`),
  });

  const imageUrl = extractImageFromResponse(response);
  if (imageUrl) {
    return imageUrl;
  }
  throw new Error("图片生成失败。");
};

export const generateVideo = async (
  prompt: string, 
  base64Image: string, 
  aspectRatio: '16:9' | '9:16',
  referenceImage?: string,
  lastFrameImage?: string,
  referenceVideo?: string,
  durationSeconds: number = 4,
  engine: VideoEngine = 'seedance2',
  billingTask?: string
): Promise<VideoGenerationResult> => {
  if (engine === 'veo31' || engine === 'grokv3') {
    const effectiveDurationSeconds = engine === 'grokv3' ? GROK_FIXED_DURATION_SECONDS : durationSeconds;
    const promptVariants = buildVeoPromptVariants(prompt, aspectRatio, effectiveDurationSeconds);
    const model = engine === 'grokv3' ? GROK_VIDEO_MODEL : VEO_MODEL;
    const grokSize = engine === 'grokv3' ? GROK_SIZE_BY_ASPECT_RATIO[aspectRatio] : undefined;
    let lastError: unknown;

    for (const promptVariant of promptVariants) {
      try {
        const imagePart = buildInlineImagePart(referenceImage, base64Image);
        const parts: Array<Record<string, unknown>> = [
          {
            text: promptVariant,
          },
        ];
        if (imagePart) {
          parts.push(imagePart);
        }

        const payload: any = await generateContent({
          model,
          task: 'video_gen_submit' as any,
          billing_task: billingTask,
          contents: {
            parts,
          },
          config: {
            aspectRatio,
            durationSeconds: effectiveDurationSeconds,
            ...(grokSize ? { size: grokSize } : {}),
            submitOnly: true,
            timeoutMs: VIDEO_GENERATION_TIMEOUT_MS,
          } as any,
        } as any);

        const taskId =
          payload?.id ||
          payload?.task_id ||
          payload?.taskId ||
          payload?.data?.id ||
          payload?.data?.task_id ||
          payload?.data?.taskId ||
          payload?.result?.id ||
          payload?.result?.task_id ||
          payload?.result?.taskId ||
          null;

        const status = String(
          payload?.status ||
          payload?.data?.status ||
          payload?.result?.status ||
          'unknown'
        ).trim();

        const videoUrl = extractVideoUrlFromPayload(payload);
        if (videoUrl) {
          return {
            taskId: typeof taskId === 'string' && taskId.trim() ? taskId.trim() : null,
            status,
            videoUrl,
          };
        }

        if (typeof taskId === 'string' && taskId.trim()) {
          return {
            taskId: taskId.trim(),
            status: status || 'queued',
            videoUrl: null,
          };
        }

        throw new Error('视频生成失败：未返回可播放地址');
      } catch (error) {
        lastError = error;
        if (!isN1NTaskFailedError(error)) {
          throw error;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('视频生成失败');
  }

  const enhancedPrompt = `${prompt}. 
                          STRICT CONSTRAINTS:
                          - THE VIDEO MUST BE EXACTLY ${durationSeconds} SECONDS LONG.
                          - NO TEXT, NO LOGOS, NO CAPTIONS. 
                          - THE VIDEO MUST FULLY FILL THE ENTIRE ${aspectRatio} FRAME. 
                          - ABSOLUTELY NO BLACK BARS. 
                          - THE SHOT MUST BE EDGE-TO-EDGE FULLSCREEN COVERAGE. 
                          - Professional cinematic quality.`;

  const uploadReference = async (input: string | undefined, fallbackName: string): Promise<string | null> => {
    const trimmed = String(input || '').trim();
    if (!trimmed) {
      return null;
    }

    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }

    if (!/^data:/i.test(trimmed)) {
      return null;
    }

    const mimeMatch = trimmed.match(/^data:([^;]+);base64,/i);
    const mimeType = mimeMatch?.[1] || 'application/octet-stream';
    const raw = cleanBase64(trimmed);
    const binary = atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    const extension = mimeType.includes('video') ? 'mp4' : 'png';
    const upload = await uploadAssetToCOSWithPresignedURL(new Blob([bytes], { type: mimeType }), {
      fileName: `${fallbackName}.${extension}`,
      appID: COS_APP_ID,
      objectPath: `standalone/${COS_APP_ID}/seedance_refs`,
    });

    return upload.url || upload.signed_url || upload.public_url || null;
  };

  const content: Array<Record<string, unknown>> = [];

  const referenceVideoURL = await uploadReference(referenceVideo, 'reference_video');
  const hasReferenceMedia = Boolean(referenceVideoURL);

  content.push({
    type: 'text',
    text: hasReferenceMedia
      ? `${enhancedPrompt} Use the uploaded image and video as multimodal reference guidance when possible.`
      : enhancedPrompt,
  });

  const firstFrameURL = await uploadReference(referenceImage || base64Image, 'first_frame');
  if (firstFrameURL) {
    content.push({
      type: 'image_url',
      image_url: { url: firstFrameURL },
      role: hasReferenceMedia ? 'reference_image' : 'first_frame',
    });
  }

  const lastFrameURL = await uploadReference(lastFrameImage, 'last_frame');
  if (lastFrameURL) {
    content.push({
      type: 'image_url',
      image_url: { url: lastFrameURL },
      role: hasReferenceMedia ? 'reference_image' : 'last_frame',
    });
  }

  if (referenceVideoURL) {
    content.push({ type: 'video_url', video_url: { url: referenceVideoURL }, role: 'reference_video' });
  }

  const payload: any = await generateContent({
    model: VIDEO_MODEL,
    task: 'video_gen_submit' as any,
    billing_task: billingTask,
    contents: { content },
    config: {
      resolution: SEEDANCE_RESOLUTION,
      aspectRatio,
      durationSeconds,
      submitOnly: true,
      timeoutMs: VIDEO_GENERATION_TIMEOUT_MS,
    } as any,
  } as any);

  const taskId =
    payload?.id ||
    payload?.task_id ||
    payload?.taskId ||
    payload?.data?.id ||
    payload?.data?.task_id ||
    payload?.data?.taskId ||
    payload?.result?.id ||
    payload?.result?.task_id ||
    payload?.result?.taskId ||
    null;

  const status = String(
    payload?.status ||
    payload?.data?.status ||
    payload?.result?.status ||
    'unknown'
  ).trim();

  const possibleUrl =
    payload?.video_url ||
    payload?.videoUrl ||
    payload?.url ||
    payload?.uri ||
    payload?.content?.video_url ||
    payload?.content?.videoUrl ||
    payload?.data?.video_url ||
    payload?.data?.videoUrl ||
    payload?.result?.video_url ||
    payload?.result?.videoUrl ||
    payload?.result?.url ||
    payload?.result?.uri ||
    payload?.videos?.[0]?.url ||
    payload?.videos?.[0]?.uri;

  if (typeof possibleUrl === 'string' && possibleUrl.trim()) {
    return {
      taskId: typeof taskId === 'string' && taskId.trim() ? taskId.trim() : null,
      status,
      videoUrl: possibleUrl.trim(),
    };
  }

  if (typeof taskId === 'string' && taskId.trim()) {
    return {
      taskId: taskId.trim(),
      status: status || 'queued',
      videoUrl: null,
    };
  }

  throw new Error('视频生成失败：未返回可播放地址');
};

export const queryVideoTaskProgress = async (taskId: string, engine: VideoEngine = 'seedance2'): Promise<VideoTaskQueryResult> => {
  const trimmedTaskId = String(taskId || '').trim();
  if (!trimmedTaskId) {
    throw new Error('任务ID不能为空');
  }

  const queryPromptModelTask = async (model: string): Promise<VideoTaskQueryResult> => {
    let payload: any;
    try {
      payload = await generateContent({
        model,
        task: 'video_task_query' as any,
        contents: {},
        config: {
          taskId: trimmedTaskId,
          timeoutMs: VIDEO_GENERATION_TIMEOUT_MS,
        } as any,
      } as any);
    } catch (error) {
      if (isTransientVideoTaskNotFoundError(error)) {
        return {
          taskId: trimmedTaskId,
          status: 'queued',
          videoUrl: null,
        };
      }
      throw error;
    }

    const status = String(
      payload?.status ||
      payload?.data?.status ||
      payload?.result?.status ||
      'unknown'
    ).trim();

    return {
      taskId: trimmedTaskId,
      status,
      videoUrl: extractVideoUrlFromPayload(payload),
    };
  };

  if (engine === 'veo31') {
    return queryPromptModelTask(VEO_MODEL);
  }

  if (engine === 'grokv3') {
    return queryPromptModelTask(GROK_VIDEO_MODEL);
  }

  let payload: any;
  try {
    payload = await generateContent({
      model: VIDEO_MODEL,
      task: 'video_task_query' as any,
      contents: {},
      config: {
        taskId: trimmedTaskId,
        timeoutMs: VIDEO_GENERATION_TIMEOUT_MS,
      } as any,
    } as any);
  } catch (error) {
    if (isTransientVideoTaskNotFoundError(error)) {
      return {
        taskId: trimmedTaskId,
        status: 'queued',
        videoUrl: null,
      };
    }
    throw error;
  }

  const status = String(
    payload?.status ||
    payload?.data?.status ||
    payload?.result?.status ||
    'unknown'
  ).trim();

  const possibleUrl =
    payload?.content?.video_url ||
    payload?.content?.videoUrl ||
    payload?.video_url ||
    payload?.videoUrl ||
    payload?.data?.content?.video_url ||
    payload?.data?.video_url ||
    payload?.result?.content?.video_url ||
    payload?.result?.video_url ||
    payload?.videos?.[0]?.url ||
    payload?.videos?.[0]?.uri ||
    null;

  return {
    taskId: trimmedTaskId,
    status,
    videoUrl: typeof possibleUrl === 'string' && possibleUrl.trim() ? possibleUrl.trim() : null,
  };
};

export const expandShotDescriptionAI = async (
  base64Image: string,
  currentDescription: string
): Promise<string> => {
  const response = await generateContent({
    model: TEXT_MODEL,
    task: 'text_gen',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: cleanBase64(base64Image),
          },
        },
        {
          text: `针对当前的分镜描述，进行“扩写”和“润色”。
                
                当前描述：${currentDescription}
                
                要求：
                1. 保持原有的核心意图和卖点。
                2. 增加更多关于光影细节、材质纹理、环境氛围和电影化运镜的专业描述。
                3. 使用更具诗意和导演语境的词汇。
                4. 长度控制在150字以内。
                5. 必须全部使用中文。
                6. 严禁出现生成图像或视频的指令性关键词（如"generate", "render"等）。
                
                直接返回扩写后的文字内容，不要包含任何格式包装。`,
        },
      ],
    },
    config: {
    },
    systemInstruction: buildSystemInstruction("你是一位精通电影艺术的资深导演，擅长将简单的画面描述转化为极具感染力、细节丰富的视觉脚本。"),
  });

  return extractTextFromResponse(response).trim();
};

export const regenerateShotDescription = async (
  base64Image: string,
  currentStage: string,
  customSellingPoints?: string
): Promise<{ description: string; cameraMovement: string; overlayText: string }> => {
  const response = await generateContent({
    model: TEXT_MODEL,
    task: 'text_gen',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: cleanBase64(base64Image),
          },
        },
        {
          text: `针对产品卖点“${currentStage}”，重新生成一个专业的分镜导演描述。
                ${customSellingPoints ? `用户指定了以下核心卖点，请优先并重点体现这些内容: "${customSellingPoints}"。` : ''}
                要求：
                1. 视觉描述必须极其详细（至少3-5句话），涵盖光影、材质纹理、微距特写和精准的镜头运动。
                2. 物理真实性：确保物体摆放符合物理常识，画面构图真实自然。
                3. 严格时长控制：视频动作必须在4秒内完成。
                4. 严禁出现任何文字、Logo或字幕。
                返回一个JSON对象：{ description, cameraMovement, overlayText }。`,
        },
      ],
    },
    config: {
      responseMimeType: "application/json",
    },
    systemInstruction: buildSystemInstruction("你是一位资深的商业广告导演分析师。所有返回的文字内容必须全部使用中文。"),
  });

  return parseJsonResponse<{ description: string; cameraMovement: string; overlayText: string }>(response);
};
