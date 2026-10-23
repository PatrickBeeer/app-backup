import {
  generateContent,
  extractImageFromResponse,
  uploadAssetToCOSWithPresignedURL,
} from '../../../../shared_services/geminiProxyService';
import type { VideoGenerationResult, VideoTaskQueryResult } from '../types';

const IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const VIDEO_MODEL_FAST = 'doubao-seedance-2-0-fast-260128';
const VIDEO_MODEL_PRO = 'doubao-seedance-2-0-260128';
const COS_APP_ID = 'glasses-video';
const VIDEO_GENERATION_TIMEOUT_MS = 11 * 60 * 1000;

export function resolveVideoModel(resolution: string): string {
  const res = String(resolution || '720p').trim().toLowerCase();
  return res === '1080p' ? VIDEO_MODEL_PRO : VIDEO_MODEL_FAST;
}

export function resolveVideoBillingTask(resolution: string): string {
  const res = String(resolution || '720p').trim().toLowerCase();
  return `seedance_${res}_per_second`;
}

function cleanBase64(dataUrlOrBase64: string): string {
  return (dataUrlOrBase64 || '').replace(/^data:[^;]+;base64,/, '');
}

function inferMimeType(dataUrlOrBase64: string, fallback = 'image/jpeg'): string {
  const match = String(dataUrlOrBase64 || '').match(/^data:([^;]+);base64,/i);
  return match?.[1] || fallback;
}

function buildSystemInstruction(text: string) {
  return { parts: [{ text }] };
}

const FRAMING_RULES: Record<string, string> = {
  '特写': '严格平视产品特写。85–100mm 镜头，镜头中心与模特双眼等高，光轴水平；不使用俯视、仰视或倾斜机位。眼镜位于画面正中央并占画面宽度约 60%–70%，完整呈现左右镜圈、鼻梁、铰链和前段镜腿；人物面部只保留必要的眉眼、鼻梁与上脸作为真实佩戴关系，视觉重点仅为眼镜产品。',
  '半身': '50mm 标准镜头，机位距离约 2.5 米；从头顶完整拍到腰部或大腿中部，头部只占画面高度 20%–30%；双肩、双臂、上装和腰线必须出现，环境占画面约 35%。',
  '全身': '35–50mm 镜头，机位距离约 5 米；从头顶完整拍到鞋底，上下均有留白；人物占画面高度约 70%，双腿与鞋完整可见。',
};

const PRODUCT_RULE = '参考图只用于识别同一副眼镜的外观，忽略参考图的白底、裁切、主体大小和特写构图。输出只出现这副眼镜。左右镜圈必须属于同一副实体产品并保持相同的结构设计、镜框高度、边缘弧度、材质和颜色；允许符合视角的自然透视差，但不允许左右款式、形状、厚度或连接结构不同。保持镜框与镜片宽高比、鼻梁、镜腿和铰链；按真实人脸尺度佩戴，镜框宽度自然对齐太阳穴。';

const OUTFIT_RULES: Record<string, string> = {
  outdoor: '场景穿搭：长袖轻量户外夹克、功能长裤和户外鞋。',
  street: '场景穿搭：剪裁利落的休闲西装外套、有领衬衫、长裤和皮鞋。',
  driving: '场景穿搭：有领长袖衬衫、轻薄驾驶夹克、长裤和便鞋。',
  fishing: '场景穿搭：长袖防晒衬衫、轻量钓鱼马甲、功能长裤和户外鞋。',
  climbing: '场景穿搭：长袖软壳外套、耐磨户外长裤和登山鞋。',
  hiking: '场景穿搭：长袖防风外套、徒步长裤和徒步鞋。',
};

const ASPECT_SIZE_MAP: Record<string, string> = {
  '3:4': '1536x2048',
  '1:1': '2048x2048',
  '9:16': '1152x2048',
  '16:9': '2048x1152',
};

function buildImagePrompt(prompt: string, framing: string, scene: string, aspectRatio: string): string {
  const outputSize = ASPECT_SIZE_MAP[aspectRatio] || '1536x2048';
  const framingRule = FRAMING_RULES[framing] || '';
  const outfitRule = OUTFIT_RULES[scene] || '场景穿搭：有领长袖上衣、长裤和鞋。';
  const modestyRule = `${outfitRule}衣领、袖口、上装下摆、裤腰与鞋履完整清晰。`;
  const drivingRule = scene === 'driving' ? '场景必须在真实轿车驾驶舱内：模特坐在驾驶位，方向盘位于身前，仪表台、车窗、驾驶座和车内光线可见，机位位于副驾驶侧或中控区域。' : '';
  const ratioRule = `画布严格为 ${aspectRatio}（${outputSize} 像素），构图不得改变画布比例。`;
  const compositionRule = framing ? `第一优先级构图：${framing}。${framingRule}参考眼镜图片不能影响相机距离或人物裁切。` : '';
  return `${compositionRule}\n${ratioRule}\n${PRODUCT_RULE}\n${drivingRule}\n${modestyRule}\n${prompt}\n再次确认：最终画面必须是${framing || '所选'}构图。`;
}

export interface TryOnImageOptions {
  prompt: string;
  framing: string;
  scene: string;
  aspectRatio: string;
  productImages: string[];
  seed?: number;
}

export async function generateTryOnImage(options: TryOnImageOptions): Promise<string> {
  const { prompt, framing, scene, aspectRatio, productImages, seed } = options;
  const modelPrompt = buildImagePrompt(prompt, framing, scene, aspectRatio);

  const parts: Array<Record<string, unknown>> = [];

  for (const image of productImages.slice(0, 9)) {
    const trimmed = String(image || '').trim();
    if (!trimmed.startsWith('data:image/')) continue;
    parts.push({
      inlineData: {
        data: cleanBase64(trimmed),
        mimeType: inferMimeType(trimmed),
      },
    });
  }

  parts.push({ text: modelPrompt });

  const response = await generateContent({
    model: IMAGE_MODEL,
    task: 'image_gen',
    billing_task: 'image_gen',
    contents: { parts },
    config: {
      imageConfig: { aspectRatio },
      ...(seed !== undefined ? { seed } : {}),
    },
    systemInstruction: buildSystemInstruction('You are a professional commercial photographer specializing in eyewear product photography. Generate clean, text-free commercial images that perfectly fill the requested aspect ratio. Ensure zero margins or black borders.'),
  } as any);

  const imageUrl = extractImageFromResponse(response);
  if (imageUrl) {
    return imageUrl;
  }
  throw new Error('图片生成失败：未返回可用图片');
}

async function uploadReferenceImage(dataUrl: string, fallbackName: string): Promise<string | null> {
  const trimmed = String(dataUrl || '').trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (!/^data:/i.test(trimmed)) return null;

  const mimeMatch = trimmed.match(/^data:([^;]+);base64,/i);
  const mimeType = mimeMatch?.[1] || 'application/octet-stream';
  const raw = cleanBase64(trimmed);
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  const upload = await uploadAssetToCOSWithPresignedURL(new Blob([bytes], { type: mimeType }), {
    fileName: `${fallbackName}.png`,
    appID: COS_APP_ID,
    objectPath: `standalone/${COS_APP_ID}/seedance_refs`,
  });

  return upload.url || upload.signed_url || upload.public_url || null;
}

export async function generateVideo(
  prompt: string,
  imageDataUrls: string[],
  ratio: '9:16' | '16:9',
  duration: number,
  resolution: string = '720p',
  billingTask?: string,
): Promise<VideoGenerationResult> {
  const enhancedPrompt = `${prompt}
STRICT CONSTRAINTS:
- THE VIDEO MUST BE EXACTLY ${duration} SECONDS LONG.
- NO TEXT, NO LOGOS, NO CAPTIONS.
- THE VIDEO MUST FULLY FILL THE ENTIRE ${ratio} FRAME.
- ABSOLUTELY NO BLACK BARS.
- Professional cinematic quality.`;

  const content: Array<Record<string, unknown>> = [];
  content.push({ type: 'text', text: enhancedPrompt });

  for (const dataUrl of imageDataUrls.slice(0, 9)) {
    const uploadedUrl = await uploadReferenceImage(dataUrl, 'reference_image');
    if (uploadedUrl) {
      content.push({
        type: 'image_url',
        image_url: { url: uploadedUrl },
        role: 'reference_image',
      });
    }
  }

  const effectiveBillingTask = billingTask || resolveVideoBillingTask(resolution);
  const videoModel = resolveVideoModel(resolution);

  const payload: any = await generateContent({
    model: videoModel,
    task: 'video_gen_submit' as any,
    billing_task: effectiveBillingTask,
    contents: { content },
    config: {
      resolution,
      aspectRatio: ratio,
      durationSeconds: duration,
      submitOnly: true,
      timeoutMs: VIDEO_GENERATION_TIMEOUT_MS,
    } as any,
    billing: {
      video: {
        seconds: duration,
      },
    },
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
    'unknown',
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
}

export async function queryVideoTaskProgress(taskId: string): Promise<VideoTaskQueryResult> {
  const trimmedTaskId = String(taskId || '').trim();
  if (!trimmedTaskId) {
    throw new Error('任务ID不能为空');
  }

  let payload: any;
  try {
    payload = await generateContent({
      model: VIDEO_MODEL_FAST,
      task: 'video_task_query' as any,
      contents: {},
      config: {
        taskId: trimmedTaskId,
        timeoutMs: VIDEO_GENERATION_TIMEOUT_MS,
      } as any,
    } as any);
  } catch (error) {
    const message = String((error as any)?.message || '').toLowerCase();
    if (
      message.includes('task_not_exist') ||
      message.includes('task not exist') ||
      message.includes('task_not_ex')
    ) {
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
    'unknown',
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
}
