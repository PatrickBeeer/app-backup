import {
  generateContent,
  extractImageFromResponse,
  extractJsonTextFromResponse,
  extractTextFromResponse,
  uploadAssetToCOSWithPresignedURL,
  type GeminiGenerateRequest,
} from './geminiProxyService';
import { AdPlan, type FaceSelectionPoint } from "../types";
import { DEFAULT_CPRT_MODEL } from '../shared/cprtContract';

const TEXT_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const VIDEO_MODEL = 'seedance-2.0-fast';
const VEO_MODEL = 'veo_3_1';
const GROK_VIDEO_MODEL = 'grok-video-3-pro';
const KLING_VIDEO_MODEL = import.meta.env.VITE_KLING_VIDEO_MODEL || 'kling-3.0';
const JIMENG_VIDEO_MODEL = import.meta.env.VITE_JIMENG_VIDEO_MODEL || 'jimeng_i2v_first_v30';
const GROK_FIXED_DURATION_SECONDS = 10;
const GROK_SIZE_BY_ASPECT_RATIO: Record<'16:9' | '9:16', '1080x720' | '720x1080'> = {
  '16:9': '1080x720',
  '9:16': '720x1080',
};
const COS_APP_ID = 'video-clone';
const VIDEO_GENERATION_TIMEOUT_MS = 6 * 60 * 1000;
const VIDEO_TASK_QUERY_TIMEOUT_MS = 60 * 1000;
const SEEDANCE_TASKS_URL = 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks';
const SEEDANCE_RESOLUTION = '720p';

// “动作必须按照视频”的最高优先裁决句，追加在所有带参考素材的提示词末尾。
// 即使创意分析 prompt 写了新动作，最终仍以参考视频的动作结构、手势顺序、
// 节拍与时序为准，仅允许手部接触/操作新产品方式的最小适配。
const ACTION_FOLLOW_PRIORITY =
  ' ACTION FIDELITY LOCK TAKES TOP PRIORITY / “动作必须按照视频”为最高优先级：若与任何创意描述、分镜或产品分析冲突，一律以本规则为准——人物动作结构、手势顺序、身体朝向、节拍与时序必须严格跟随参考视频，不得自创、增删、重排或改写动作，仅允许手部/肢体接触和操作产品的方式做最小适配。';

// 运镜与画面复刻约束（从 video-clone-seedance-v2/server/cprt.ts 的
// MOTION_AND_PROP_PRESERVATION_PROMPT 移植，适配 v3 的产品替换流程：
// 删去人物身份条款，把“手持物品必须原样保留”改为“手中物品为目标产品”）。
const CPRT_MOTION_AND_PROP_PRESERVATION = [
  '【运镜与画面复刻 · 必须逐帧一致】这是一次动作与镜头复刻。',
  '镜头运动：机位、焦距、景别、推/拉/摇/移/跟随/环绕、变焦与焦点变化的节奏必须与参考视频完全相同；',
  '禁止重新构图或裁切、禁止改变运镜速度与方向、禁止增删镜头或切换机位。',
  '镜头晃动必须同等复刻（重点）：参考视频晃得多剧烈，成片就要晃得多剧烈——',
  '手持抖动、走路起伏、奔跑颠簸、呼吸感的幅度与频率都要与参考视频对齐；',
  '严禁把画面「稳定化」、严禁削弱抖动幅度、严禁只保留轻微晃动、严禁输出平滑顺滑的镜头。',
  '构图对齐：人物与物体在画面中的位置、大小、朝向、与镜头的距离必须与参考视频逐帧一致；',
  '背景元素的移动速度与视差随镜头同步变化，人物运动轨迹（走位、转身、抬手）逐帧一致。',
  '手与物品的交互：握持位置、手指遮挡关系、拿起/涂抹/展示/放下的动作轨迹必须与参考视频逐帧一致；',
  '手中物品始终是上传的目标产品，其形状、颜色、材质、文字与 logo 与产品图完全一致，严禁恢复原道具、严禁物品消失、变形、漂浮、换色或数量变化，也禁止凭空冒出参考视频里没有的物品；',
  '手的数量与手指形态保持正常，禁止多指、少指、手指粘连或手部融化。',
  '场景与其余元素：家具、陈设、陪体人物（若存在）、光影走向、遮挡层次与参考视频一致，不要增删或重新布置。',
].join('');

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

export type VideoEngine = 'seedance2' | 'veo31' | 'grokv3' | 'kling' | 'jimeng' | 'cprt';

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

export type PortraitVoiceGender = 'female' | 'male';

export interface ProductPositionResult {
  x: number;
  y: number;
  confidence: number;
  frameIndex: number;
}

export async function detectProductPosition(productImage: string, videoFrameImages: string[]): Promise<ProductPositionResult> {
  const response = await generateContent({
    model: TEXT_MODEL,
    task: 'text_gen',
    billing_task: 'text_gen',
    contents: {
      parts: [
        { inlineData: { data: cleanBase64(productImage), mimeType: inferMimeType(productImage) } },
        ...videoFrameImages.slice(0, 3).map(frame => ({ inlineData: { data: cleanBase64(frame), mimeType: inferMimeType(frame) } })),
        {
          text: '第一张图是用户上传的目标产品，其余图片依次是爆款参考视频的关键帧。请选择原产品最清晰的一帧，识别该帧中应被目标产品替换的原产品。返回关键帧序号frameIndex（从0开始）以及原产品视觉中心的归一化坐标，左上角为(0,0)，右下角为(1,1)。如果有多个物品，选择与第一张产品在用途、包装、手持关系或画面角色上最对应的主要商品。只返回JSON。',
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          confidence: { type: 'number' },
          frameIndex: { type: 'number' },
        },
        required: ['x', 'y', 'confidence', 'frameIndex'],
      },
    },
  });
  const result = parseJsonResponse<Partial<ProductPositionResult>>(response);
  const clamp = (value: unknown, fallback: number) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.min(1, Math.max(0, numeric)) : fallback;
  };
  return {
    x: clamp(result.x, 0.5),
    y: clamp(result.y, 0.6),
    confidence: clamp(result.confidence, 0),
    frameIndex: Math.min(Math.max(0, videoFrameImages.length - 1), Math.max(0, Math.round(Number(result.frameIndex) || 0))),
  };
}

export async function createProductCreativePrompt(productImage: string, videoFrames: string[], creative = true): Promise<string> {
  const response = await generateContent({
    model: TEXT_MODEL,
    task: 'text_gen',
    billing_task: 'text_gen',
    contents: {
      parts: [
        { inlineData: { data: cleanBase64(productImage), mimeType: inferMimeType(productImage) } },
        ...videoFrames.slice(0, 3).map(frame => ({ inlineData: { data: cleanBase64(frame), mimeType: inferMimeType(frame) } })),
        {
          text: `第一张图是必须准确呈现的目标产品，其余图片来自同一条爆款参考视频。必须综合所有参考帧判断主体是否为拟人动物；只要任意帧出现直立或人类化坐姿、穿衣、前爪承担手的功能、人类式表情视线、或从事人类活动，就必须判定为拟人动物。拟人属性是最高优先级身份特征：输出必须保持相同物种、双足或人类化坐姿、身体比例、服装、面部表演，并始终用前爪作为手操作物品，禁止退化为普通四足动物、用嘴操作，或变成人类。首先识别参考主体是否正在拿取、操作或使用某个物品，并提取“接近物品→抓握或接触→持续操作→产生结果”的动作节拍。只要参考视频存在使用物品的动作，生成视频在对应时间段就必须出现上传产品的真实使用动作；不得只展示、摆放、注视或短暂拿着产品。动作必须按照视频：参考视频决定人物的身体动作结构、手势顺序、动作节拍、力度、节奏与时序，必须逐拍沿用，不得自创、增删、重排或改写动作；产品用途只决定手或前爪“如何接触、抓握与操作”该产品，只允许在接触/操作道具这一环节做最小适配，且不得改变该拍的动作目的、身体朝向、节奏与手部位置轨迹。第一步必须建立“产品使用契约”：识别产品类别、标准用途、使用对象、发生场景、正确握持或接触位置，以及从开始到完成的动作序列。书本必须被手或拟人动物前爪拿着阅读或翻页，视线落在书页；梳子必须由手或拟人动物前爪握住梳柄，梳齿接触头发或毛发并沿发丝移动，嘴、舌头和牙齿绝对禁止接触、叼住、舔舐或操作梳子；拖把必须由手或拟人动物前爪握杆，拖把头接触地面并往复清洁。禁止仅让产品出现在旁边、拿着不使用、使用错误身体部位。第二步识别参考视频主体的身份、物种、拟人程度、姿态、服装、神态、视线、手势节奏、身体动力和动作轨迹，并连同动作结构与节拍一起完整继承。第三步识别并彻底删除原道具，用目标产品取代原道具的功能角色：保留每一个原物品交互节拍的身体动作、节奏与时序，仅把手中道具替换为目标产品，并把抓握/接触/操作方式最小适配为该产品的正确用法。${creative ? '可创新场景和美术，但主体表演、动作结构、镜头职能、节奏和叙事骨架必须沿用。' : ''} 产品外形、比例、结构、材质、颜色、包装、Logo和标签必须稳定。生成同步自然声音、环境声和动作音效。返回JSON，其中subjectMode、anthropomorphicEvidence、requiredBodyMechanics、productCategory、canonicalUse、interactionTarget、gripOrContact、actionSequence、sourceObjectInteraction、actionBeatMapping、originalPropToRemove、forbiddenActions均为简短英文字符串，prompt为可直接生成视频的英文提示词。`,
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          subjectMode: { type: 'string' },
          anthropomorphicEvidence: { type: 'string' },
          requiredBodyMechanics: { type: 'string' },
          productCategory: { type: 'string' },
          canonicalUse: { type: 'string' },
          interactionTarget: { type: 'string' },
          gripOrContact: { type: 'string' },
          actionSequence: { type: 'string' },
          sourceObjectInteraction: { type: 'string' },
          actionBeatMapping: { type: 'string' },
          originalPropToRemove: { type: 'string' },
          forbiddenActions: { type: 'string' },
          prompt: { type: 'string' },
        },
        required: ['subjectMode', 'anthropomorphicEvidence', 'requiredBodyMechanics', 'productCategory', 'canonicalUse', 'interactionTarget', 'gripOrContact', 'actionSequence', 'sourceObjectInteraction', 'actionBeatMapping', 'originalPropToRemove', 'forbiddenActions', 'prompt'],
      },
    },
  });
  const result = parseJsonResponse<Record<string, string>>(response);
  const anthropomorphismLock = [
    `SUBJECT MODE: ${result.subjectMode || 'infer from all source frames'}`,
    `ANTHROPOMORPHIC EVIDENCE: ${result.anthropomorphicEvidence || 'check upright posture, clothing, hand-functioning forepaws, human expression and human activity'}`,
    `MANDATORY BODY MECHANICS: ${result.requiredBodyMechanics || 'preserve the source subject posture, limb roles and human-like performance exactly'}`,
    'ANTHROPOMORPHISM LOCK: if any source frame shows an animal acting like a person, every output frame must keep that same animal anthropomorphic. Preserve bipedal or human-like seated posture, clothing, body proportions, expressive gaze and hand-functioning forepaws. Never regress to an ordinary quadruped, animal mouth operation, or a human body.',
  ].join('. ');
  const contract = [
    `PRODUCT: ${result.productCategory || 'uploaded product'}`,
    `MANDATORY USE: ${result.canonicalUse || 'use it for its real-world intended purpose'}`,
    `INTERACTION TARGET: ${result.interactionTarget || 'the correct real-world target'}`,
    `GRIP/CONTACT: ${result.gripOrContact || 'physically correct contact'}`,
    `ACTION SEQUENCE: ${result.actionSequence || 'a complete, recognizable use action'}`,
    `SOURCE OBJECT INTERACTION: ${result.sourceObjectInteraction || 'detect every beat where the reference subject handles or uses an object'}`,
    `MANDATORY BEAT REPLACEMENT: ${result.actionBeatMapping || 'at every source object-use beat, actively use the uploaded product for its own canonical purpose'}`,
    `REMOVE FROM EVERY SHOT: ${result.originalPropToRemove || 'the original prop'}`,
    `FORBIDDEN: ${result.forbiddenActions || 'incorrect use, passive placement, and the original prop'}`,
  ].join('. ');
  const productSignals = `${result.productCategory || ''} ${result.canonicalUse || ''} ${result.interactionTarget || ''}`.toLowerCase();
  const deterministicUseRule = /comb|hairbrush|梳子|梳/.test(productSignals)
    ? 'NON-NEGOTIABLE COMB ACTION: a human hand, or the hand-functioning forepaw of an anthropomorphic animal, grips the comb handle throughout the action. The comb teeth visibly contact the subject\'s hair, fur, or another character\'s hair/fur, and that hand or forepaw draws the comb through the strands in repeated grooming strokes. The hair/fur reacts naturally. THE MOUTH STAYS AWAY FROM THE COMB: no licking, biting, chewing, carrying, gripping, touching, or operating the comb with the mouth, tongue, lips, muzzle, or teeth. The subject must not merely hold, display, read, tap, or look at the comb.'
    : /book|notebook|书本|图书|书/.test(productSignals)
      ? 'NON-NEGOTIABLE BOOK ACTION: the subject opens and reads the book, looks at the pages, and turns pages naturally. No phone, tablet, or original screen device may appear.'
      : /mop|拖把/.test(productSignals)
        ? 'NON-NEGOTIABLE MOP ACTION: the mop head remains in contact with the floor while the subject pushes and pulls it in clear cleaning strokes; the subject must not merely hold or display it.'
        : 'NON-NEGOTIABLE PRODUCT ACTION: visibly complete the product\'s canonical real-world use from correct grip/contact through recognizable action and result; passive holding or display is forbidden.';
  return [
    'HARD PRIORITY SPLIT: the source video/frames OWN THE ACTION (body motion, gesture order, action beats, force, timing and rhythm) and must be followed beat-by-beat; IMAGE 1 OWNS THE OBJECT. Replace the source prop with IMAGE 1 and adapt ONLY the hand/paw grip, contact and operation to that product’s canonical use—never rewrite, invent, add, remove, reorder, speed up or slow down the body actions, and never restore the original prop.',
    'IMAGE 1 is the exact target product. The source frames supply the character identity, exact anthropomorphism level, expression, pose, body action structure, gesture sequence, action beats, composition, camera, timing and rhythm.',
    anthropomorphismLock,
    contract,
    deterministicUseRule,
    String(result.prompt || '').trim(),
    'FINAL VALIDATION: keep the source video’s body action structure, gesture order, beats, timing and rhythm unchanged. At every source object-use beat the subject actively uses IMAGE 1 with physically correct grip/contact for that product, and the original prop is removed from every frame. A passive product appearance, passive holding, a self-invented action, or any reordered, added or changed body beat is invalid.',
  ].join(' ').slice(0, 2400);
}

export async function createProductActionReferenceImage(
  productImage: string,
  subjectFrames: string[],
  usagePrompt: string,
  aspectRatio: '16:9' | '9:16',
): Promise<string> {
  const response = await generateContent({
    model: IMAGE_MODEL,
    task: 'image_gen',
    billing_task: 'image_gen',
    contents: {
      parts: [
        { inlineData: { data: cleanBase64(productImage), mimeType: inferMimeType(productImage) } },
        ...subjectFrames.slice(0, 3).map(frame => ({ inlineData: { data: cleanBase64(frame), mimeType: inferMimeType(frame) } })),
        {
          text: `IMAGE 1 is the exact target product. IMAGES 2 onward are different frames of the same reference-video subject and must be considered together. First lock the subject's maximum observed anthropomorphism. If any source image shows an animal upright, sitting like a person, wearing clothing, using forepaws as hands, making human-like expressions, or performing a human activity, the output MUST preserve all those anthropomorphic traits simultaneously. Keep the exact animal species and identity, bipedal or human-like seated posture, torso and limb proportions, clothing, expressive face and coordinated hand-functioning forepaws. Never output an ordinary quadruped, a pet-like pose, mouth-operated tools, or a human body. Create one photorealistic action-anchor frame. If the source shows the subject using an object, replace that interaction with visibly active and correct use of IMAGE 1; do not merely place, display, look at or passively hold it. Preserve the source interaction's energy and performance while changing its function to IMAGE 1's canonical use. For a comb: show the hand-functioning forepaw wrapped around the handle, the comb teeth inserted into hair or fur, and an active grooming stroke. Keep the mouth clearly separated from the product; no licking, biting, carrying or mouth-gripping. Remove every original prop. Preserve IMAGE 1 geometry, color, material, logo and details. No captions or watermarks. Usage contract: ${usagePrompt.slice(0, 1000)}`,
        },
      ],
    },
    config: { imageConfig: { aspectRatio } },
    systemInstruction: buildSystemInstruction('Create a realistic action-reference frame. Correct product use and the reference character anthropomorphism are hard constraints.'),
  });

  const imageUrl = extractImageFromResponse(response);
  if (!imageUrl) throw new Error('未生成产品使用动作基准图。');
  return imageUrl;
}

export async function detectPortraitVoiceGender(base64Image: string): Promise<PortraitVoiceGender> {
  const imagePart = buildInlineImagePart(base64Image);
  if (!imagePart) throw new Error('无法读取上传的人像图片。');
  const response = await generateContent({
    model: TEXT_MODEL,
    task: 'text_gen',
    billing_task: 'text_gen',
    contents: {
      parts: [
        imagePart,
        {
          text: '判断图片中目标人物适合的说话声线。若人物视觉呈现为女性，返回 female；若视觉呈现为男性，返回 male。只返回 JSON。',
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: { voiceGender: { type: 'string', enum: ['female', 'male'] } },
        required: ['voiceGender'],
      },
    },
  });
  const result = parseJsonResponse<{ voiceGender?: string }>(response);
  return result.voiceGender === 'male' ? 'male' : 'female';
}

function isTransientVideoTaskNotFoundError(error: unknown): boolean {
  const message = String((error as any)?.message || '').toLowerCase();
  if (!message) {
    return false;
  }

  return (
    message.includes('task_not_exist') ||
    message.includes('task not exist') ||
    message.includes('task_not_ex') ||
    message.includes('not_found') ||
    message.includes('任务不存在')
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
    billing_task: 'text_gen',
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
    billing_task: 'image_gen',
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
  engine: VideoEngine = 'kling',
  billingTask?: string,
  referenceVideoHasFace = false,
  referenceVideoFaceSelection?: FaceSelectionPoint | null,
  referenceVideoHeadSelectionPoints?: FaceSelectionPoint[],
  resolution: '480p' | '720p' | '1080p' = '1080p',
  productImage?: string,
  referenceVideoProductSelection?: FaceSelectionPoint,
  audienceTag?: string,
  replacementMode: 'face' | 'product' = 'face',
  productCreative = false,
  referenceFrameImages: string[] = [],
  productActionAnchor?: string,
  cprtModel?: string,
  realPersonMode?: boolean,
): Promise<VideoGenerationResult> => {
  if (engine === 'kling' || engine === 'jimeng') {
    const model = engine === 'kling' ? KLING_VIDEO_MODEL : JIMENG_VIDEO_MODEL;
    const imagePart = buildInlineImagePart(referenceImage, base64Image);
    const referenceSubjectRule = referenceVideo
      ? referenceVideoHasFace
        ? (imagePart
          ? 'The uploaded face image is the authoritative target identity. Replace the original face in the reference video with this target face while preserving the reference body motion, pose, timing, expression rhythm, and camera movement. Do not retain the original person\'s facial identity.'
          : 'Preserve the reference body motion, pose, timing, and camera movement, but replace the original identity with a new fictional adult face.')
        : (imagePart
          ? 'Use the uploaded face image as the target character identity. Follow only the usable motion, timing, composition, and camera movement from the reference video; do not treat the face image as a product.'
          : 'Follow the usable motion, timing, composition, and camera movement from the reference video with a fictional adult character.')
      : (imagePart
        ? 'Use the uploaded face image as the authoritative identity for the person throughout the entire video. Preserve the face shape, key features, hairstyle, and overall likeness consistently.'
        : 'Create a fictional adult character with a stable, consistent face throughout the video.');
    const productRule = replacementMode === 'product'
      ? productCreative
        ? 'First infer the uploaded product’s category, real-world purpose, correct usage, physical construction, material, key selling points and suitable presentation context. Build every new action and scene around that product truth. Make the product the visual hero and preserve it as one rigid, immutable object in every frame: exact silhouette, width-height-depth proportions, component count, material, color, package structure, logo, label layout and visible text. Never stretch, squash, bend, melt, inflate, shrink, split, merge or redesign it. Preserve the reference video’s viral narrative grammar: opening hook, functional shot order, action causality, reveal timing, demonstration beats, benefit close-ups, transition logic, emotional escalation and payoff. Each new shot must serve the same narrative function and timing relationship as its reference counterpart, while its concrete action and setting must be appropriate for this specific product. Freely reinvent art direction only when it supports the product’s purpose. Keep all people anatomically realistic and all hand-product interactions physically believable.'
        : 'Replace only the selected source product with the uploaded target product. Treat the target as one rigid, immutable object in every frame. Preserve its exact silhouette, width-height-depth proportions, component count, material, color, package structure, logo, label layout, and visible text. Never stretch, squash, bend, melt, inflate, shrink, split, merge or redesign it. Keep the original product position, scale, orientation, hand grip, motion path, lighting, reflections, shadows, focus, motion blur, and foreground occlusion. Do not alter hands or fingers.'
      : 'Preserve every original product, package, label, logo, and held object unchanged.';
    const audienceRule = audienceTag ? `The presentation should remain visually appropriate for the ${audienceTag} audience without adding text or changing the source scene.` : '';
    const modelSafePrompt = engine === 'kling' && referenceVideo
      ? replacementMode === 'product'
        ? productCreative
          ? `${productRule} ${audienceRule} PRODUCT-SPECIFIC CREATIVE ANALYSIS: ${prompt} Treat the source video as a structural storyboard, not a visual location lock. The setting and art direction may change, but every replacement action must match the uploaded product’s actual use and selling points. Do not lose, reorder or weaken the hook, action chain, shot purposes, product reveal, demonstration beats, transition timing or final payoff. Product geometry is a frame-by-frame hard constraint with zero tolerance for deformation or identity drift. Produce a coherent, premium, realistic commercial video and preserve the reference video's original sound. Avoid random shots, broken narrative causality, copied captions, watermarks, broken hands, impossible product contact, unstable logos, unreadable labels, product morphing, or abrupt transitions.`
          : `${productRule} ${audienceRule} ${prompt} Preserve the already-replaced person's face, identity, hairstyle, expression, mouth movement, body, clothing, hands, fingers, background, camera movement, cuts, pacing, and sound unchanged. Treat every pixel outside the selected product as locked source footage. Preserve exact hand grip and foreground-background occlusion.`
        : `Replace the selected facial identity and hairstyle in the reference video with the identity and hairstyle from the uploaded portrait. ${productRule} ${audienceRule} ${prompt} Match face shape, features, hairline, hair color, haircut, length, volume, parting, bangs, and curls. Render real individual hair strands, flyaways, natural roots, soft self-shadowing, source-matched highlights, and physically plausible hair motion. Match the source video's facial performance, perspective, lighting, shadows, motion blur, sensor noise, color grade, and compression. Preserve pores, fine lines, subtle blemishes, asymmetry, and natural non-uniform skin highlights. No beauty filtering, smoothing, waxy skin, CGI appearance, wig-like hair, plastic hair, sharpened boundaries, flicker, morphing, or identity drift. Treat every pixel outside the selected head as locked source footage. Preserve ears where not covered, neck, body, hands, fingers, clothing, products, props, background, camera movement, cuts, pacing, and original sound unchanged.`
      : replacementMode === 'product'
        ? `${productRule} ${audienceRule} ${prompt} Preserve the reference video's structural storyboard and timing logic while making the concrete visuals clearly new. Maintain photorealism, stable product identity, natural hands and physically plausible movement. Use clean direct cuts when needed; no random narrative deviations, unnatural morphs, captions, overlays, extra logos, or watermarks.`
        : `${prompt}. ${referenceSubjectRule} Maintain natural facial anatomy, realistic skin texture, stable identity, and physically plausible body movement. Prevent face flicker, identity drift, warping, extra limbs, and abrupt appearance changes. Use clean direct cuts when a cut is needed; do not use unnatural morphs, dissolves, or distorted transitions. No captions, overlays, logos, or watermarks.`;
    const contents: Array<Record<string, unknown>> = [{ text: modelSafePrompt }];
    if (imagePart) {
      contents.push(imagePart);
    }

    const payload: any = await generateContent({
      model,
      task: 'video_gen',
      billing_task: 'video_gen',
      contents: { parts: contents },
      config: {
        provider: engine,
        aspectRatio,
        resolution,
        durationSeconds: engine === 'jimeng' || engine === 'kling' ? (durationSeconds >= 8 ? 10 : 5) : durationSeconds,
        ...(referenceVideo ? { referenceVideo } : {}),
        referenceVideoHasFace,
        ...(referenceVideoFaceSelection ? { referenceVideoFaceSelection } : {}),
        ...(referenceVideoHeadSelectionPoints?.length ? { referenceVideoHeadSelectionPoints } : {}),
        ...(referenceVideoProductSelection ? { referenceVideoProductSelection } : {}),
        ...(audienceTag ? { audienceTag } : {}),
        replacementMode,
        productCreative,
        submitOnly: true,
        timeoutMs: VIDEO_GENERATION_TIMEOUT_MS,
      },
    });

    const taskId = payload?.id || payload?.task_id || payload?.taskId || payload?.data?.id || payload?.data?.task_id || payload?.data?.taskId || null;
    const status = String(payload?.status || payload?.data?.status || payload?.result?.status || 'queued').trim();
    const videoUrl = extractVideoUrlFromPayload(payload);
    if (videoUrl || (typeof taskId === 'string' && taskId.trim())) {
      return { taskId: typeof taskId === 'string' && taskId.trim() ? taskId.trim() : null, status, videoUrl };
    }
    throw new Error(`${engine === 'kling' ? '可灵' : '即梦'}视频生成失败：未返回任务ID`);
  }

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
          task: 'video_gen' as any,
          billing_task: 'video_gen',
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

  if (engine === 'cprt') {
    // CPRT master-video（v2 同款）：完整参考视频直接交给模型复刻动作与运镜，
    // 不使用关键帧与动作基准图。提示词 = 创意分析结果 + 动作跟随裁决 + 运镜复刻约束。
    const cprtContent: Array<Record<string, unknown>> = [
      {
        type: 'text',
        text: `${prompt}${ACTION_FOLLOW_PRIORITY} ${CPRT_MOTION_AND_PROP_PRESERVATION}`,
      },
    ];
    const productImageURL = String(base64Image || '').trim();
    if (productImageURL) {
      cprtContent.push({
        type: 'image_url',
        image_url: { url: productImageURL },
        role: 'reference_image',
      });
    }
    const cprtReferenceVideoURL = String(referenceVideo || '').trim();
    if (cprtReferenceVideoURL) {
      cprtContent.push({
        type: 'video_url',
        video_url: { url: cprtReferenceVideoURL },
        role: 'reference_video',
      });
    }

    const payload: any = await generateContent({
      model: cprtModel || DEFAULT_CPRT_MODEL,
      task: 'video_gen' as any,
      billing_task: 'video_gen',
      contents: { content: cprtContent },
      config: {
        provider: 'cprt',
        model: cprtModel || DEFAULT_CPRT_MODEL,
        resolution,
        aspectRatio,
        durationSeconds,
        realPersonMode,
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
    const status = String(payload?.status || payload?.data?.status || payload?.result?.status || 'queued').trim();
    const videoUrl = extractVideoUrlFromPayload(payload);
    if (videoUrl || (typeof taskId === 'string' && taskId.trim())) {
      return {
        taskId: typeof taskId === 'string' && taskId.trim() ? taskId.trim() : null,
        status,
        videoUrl,
      };
    }
    throw new Error('CPRT 视频生成失败：未返回任务ID');
  }

  const enhancedPrompt = `${prompt}. 
                          STRICT CONSTRAINTS:
                          - THE VIDEO MUST BE EXACTLY ${durationSeconds} SECONDS LONG.
                          - NO TEXT, NO LOGOS, NO CAPTIONS. 
                          - THE VIDEO MUST FULLY FILL THE ENTIRE ${aspectRatio} FRAME. 
                          - ABSOLUTELY NO BLACK BARS. 
                          - THE SHOT MUST BE EDGE-TO-EDGE FULLSCREEN COVERAGE. 
                          - Professional cinematic quality.`;

  const prepareReference = async (input: string | undefined): Promise<string | null> => {
    const trimmed = String(input || '').trim();
    if (!trimmed) {
      return null;
    }
    return /^(https?:\/\/|data:)/i.test(trimmed) ? trimmed : null;
  };

  const content: Array<Record<string, unknown>> = [];

  const preparedActionAnchor = productCreative ? await prepareReference(productActionAnchor) : null;
  const semanticActionFrames = productCreative
    ? (await Promise.all(referenceFrameImages.slice(0, preparedActionAnchor ? 2 : 3).map(frame => prepareReference(frame)))).filter((frame): frame is string => Boolean(frame))
    : [];
  // Prefer extracted keyframes over the full reference video: they carry the action
  // beats/poses and timing while keeping identity/composition stable. Per the product
  // policy, the character's actions must still follow the source video; only the
  // hand-to-product contact is allowed to adapt to the new product.
  const referenceVideoURL = semanticActionFrames.length ? null : await prepareReference(referenceVideo);
  const hasReferenceMedia = Boolean(referenceVideoURL || preparedActionAnchor || semanticActionFrames.length);

  content.push({
    type: 'text',
    text: hasReferenceMedia
      ? preparedActionAnchor
        ? `HIGHEST-PRIORITY ANTHROPOMORPHISM LOCK: inspect IMAGE 2 and every source keyframe together. If any of them shows an animal upright, seated like a person, clothed, using forepaws as hands, making human-like expressions, or performing a human activity, the entire output MUST keep the same animal at that exact anthropomorphic level in every frame. Preserve bipedal or human-like seated posture, torso and limb proportions, clothing, expressive gaze, facial performance and coordinated hand-functioning forepaws. Never regress to an ordinary quadruped, pet-like behavior, mouth-operated tools, or a human body. MATERIAL ROLES: IMAGE 1 is the exact target product. IMAGE 2 is the mandatory product-operation anchor showing the same anthropomorphic character correctly operating IMAGE 1; it defines ONLY how the hands/paws contact and operate IMAGE 1, not the body choreography. ACTION FIDELITY LOCK / 动作必须按照视频：the source keyframes are the sole authority for the action—replicate beat-by-beat the body motion, gesture order, body orientation, pose progression, action start/end, timing and rhythm, keeping the same action-chain order, energy, gaze, performance and camera language. Do not invent, add, remove, reorder, slow down or speed up any action; every corresponding beat MUST still show active use of IMAGE 1 rather than display, placement, looking or passive holding. The ONLY permitted deviation is the hand/paw-to-prop contact/operation, which may be minimally adapted to IMAGE 1's real-world use (guided by IMAGE 2) without changing that beat's purpose, facing, rhythm or hand-position trajectory; large body motion, stance, footwork, gaze, expression and camera language must still follow the source exactly. The held object in every beat must be IMAGE 1; never restore the original prop's appearance. For hand-operated products, only the hand-functioning forepaws may operate them; mouth, tongue, lips, muzzle and teeth must stay separated. Remaining images preserve identity, anthropomorphism, expression, composition and visual language. ${enhancedPrompt}${ACTION_FOLLOW_PRIORITY}`
        : semanticActionFrames.length
          ? `MATERIAL ROLES AND PRIORITY: 图片1 / IMAGE 1 is the exact target product and controls ONLY the object identity plus how the hands contact/operate it. 图片2至图片${semanticActionFrames.length + 1} / IMAGES 2-${semanticActionFrames.length + 1} are source-video keyframes and are the sole authority for the action: replicate beat-by-beat their body motion, gesture sequence, body orientation, pose progression, action beats, timing and rhythm, and keep the same action-chain order, energy, camera language and visual language. ACTION FIDELITY LOCK / 动作必须按照视频：the character must perform the SAME actions as the source video; do not invent, add, remove, reorder, slow down or speed up any body action. Only the hand-to-prop contact/operation may be minimally adapted to IMAGE 1's canonical real-world use, without changing that beat's action purpose, facing, rhythm or hand-position trajectory. The held object must always be IMAGE 1 (never restore the original prop's appearance), while subject identity, anthropomorphism, facial expression, composition and framing remain consistent. ${enhancedPrompt}${ACTION_FOLLOW_PRIORITY}`
        : `MATERIAL ROLES AND PRIORITY: 视频1 / VIDEO 1 is the authoritative action reference: the character's body actions, gestures, body orientation, pose progression, motion paths, action beats, timing, rhythm and camera language must follow VIDEO 1 beat-by-beat. ACTION FIDELITY LOCK / 动作必须按照视频：replicate the SAME action chain and performance as VIDEO 1; do not invent, add, remove, reorder, slow down or speed up any action. 图片1 / IMAGE 1 is the exact target product, so the held object in every corresponding beat must be IMAGE 1 (never the original prop). The ONLY permitted deviation is the hand-to-prop contact/operation, which may be minimally adapted to IMAGE 1's canonical real-world use without changing that beat's action purpose, facing, rhythm or hand-position trajectory; large body motion, stance, footwork, gaze, facial expression, anthropomorphism, composition and camera movement still follow VIDEO 1 exactly. ${enhancedPrompt}${ACTION_FOLLOW_PRIORITY}`
      : enhancedPrompt,
  });

  const firstFrameURL = await prepareReference(referenceImage || base64Image);
  if (firstFrameURL) {
    content.push({
      type: 'image_url',
      image_url: { url: firstFrameURL },
      role: hasReferenceMedia ? 'reference_image' : 'first_frame',
    });
  }

  const lastFrameURL = await prepareReference(lastFrameImage);
  if (lastFrameURL) {
    content.push({
      type: 'image_url',
      image_url: { url: lastFrameURL },
      role: hasReferenceMedia ? 'reference_image' : 'last_frame',
    });
  }

  if (preparedActionAnchor) {
    content.push({
      type: 'image_url',
      image_url: { url: preparedActionAnchor },
      role: 'reference_image',
    });
  }

  for (const frameUrl of semanticActionFrames) {
    content.push({
      type: 'image_url',
      image_url: { url: frameUrl },
      role: 'reference_image',
    });
  }

  if (referenceVideoURL) {
    content.push({ type: 'video_url', video_url: { url: referenceVideoURL }, role: 'reference_video' });
  }

  const payload: any = await generateContent({
    model: VIDEO_MODEL,
    task: 'video_gen' as any,
    billing_task: 'video_gen',
    contents: { content },
    config: {
      provider: 'seedance2',
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
          provider: model === KLING_VIDEO_MODEL ? 'kling' : model === JIMENG_VIDEO_MODEL ? 'jimeng' : undefined,
          taskId: trimmedTaskId,
          timeoutMs: VIDEO_TASK_QUERY_TIMEOUT_MS,
        } as any,
      } as any);
    } catch (error) {
      if (isTransientVideoTaskNotFoundError(error) && model !== KLING_VIDEO_MODEL) {
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

  if (engine === 'kling') {
    return queryPromptModelTask(KLING_VIDEO_MODEL);
  }

  if (engine === 'jimeng') {
    return queryPromptModelTask(JIMENG_VIDEO_MODEL);
  }

  if (engine === 'cprt') {
    // CPRT 查询结果直接来自 BFF submitOrQueryCprt 的查询分支：
    // {taskId, status, videoUrl, errorMessage}。failed 时抛出上游错误信息，
    // 便于前端映射「真人素材审核未通过」等场景。
    const payload: any = await generateContent({
      model: DEFAULT_CPRT_MODEL,
      task: 'video_task_query' as any,
      contents: {},
      config: {
        provider: 'cprt',
        taskId: trimmedTaskId,
        timeoutMs: VIDEO_TASK_QUERY_TIMEOUT_MS,
      } as any,
    } as any);

    const status = String(payload?.status || payload?.data?.status || 'unknown').trim();
    if (status === 'failed') {
      throw new Error(String(payload?.errorMessage || payload?.data?.errorMessage || 'CPRT 视频生成失败'));
    }
    const videoUrl = extractVideoUrlFromPayload(payload);
    return {
      taskId: trimmedTaskId,
      status,
      videoUrl,
    };
  }

  let payload: any;
  try {
    payload = await generateContent({
      model: VIDEO_MODEL,
      task: 'video_task_query' as any,
      contents: {},
      config: {
        provider: 'seedance2',
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
