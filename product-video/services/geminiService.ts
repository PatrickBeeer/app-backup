import {
  generateContent as sharedGenerateContent,
  extractImageFromResponse,
  extractJsonTextFromResponse,
  extractTextFromResponse,
} from '../../../shared_services/geminiProxyService';
import { AdPlan, type AudienceOption, type Shot } from "../types";

const generateContent = (request: any) => sharedGenerateContent(request as any);

const TEXT_MODEL = 'gemini-3.6-flash';
const TEXT_GEN_TIMEOUT_MS = 180_000;
const IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const VIDEO_MODEL = 'doubao-seedance-2-0-fast-260128';
const VEO_MODEL = 'veo_3_1';
const GROK_VIDEO_MODEL = 'grok-video-3-pro';
const KLING_VIDEO_MODEL = import.meta.env.VITE_KLING_VIDEO_MODEL || 'kling-3.0';
const JIMENG_VIDEO_MODEL = import.meta.env.VITE_JIMENG_VIDEO_MODEL || 'jimeng_i2v_first_v30';
const GROK_FIXED_DURATION_SECONDS = 10;
const GROK_SIZE_BY_ASPECT_RATIO: Record<'16:9' | '9:16', '1080x720' | '720x1080'> = {
  '16:9': '1080x720',
  '9:16': '720x1080',
};
const VIDEO_GENERATION_TIMEOUT_MS = 6 * 60 * 1000;
const VIDEO_TASK_QUERY_TIMEOUT_MS = 60 * 1000;
const SEEDANCE_TASKS_URL = 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks';
const SEEDANCE_RESOLUTION = '720p';

const CAMERA_MOVEMENTS: Shot['cameraMovement'][] = ['Pan', 'Zoom', 'Orbit', 'Static'];

export type VideoEngine = 'seedance2' | 'veo31' | 'grokv3' | 'kling' | 'jimeng';

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

function buildSystemInstruction(text: string): { parts: Array<{ text: string }> } {
  return { parts: [{ text }] };
}

function parseJsonResponse<T>(response: any): T {
  const rawText = extractJsonTextFromResponse(response).trim();
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1] || '', rawText].map((value) => value.trim()).filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      const start = candidate.search(/[[{]/);
      if (start < 0) continue;
      const opener = candidate[start];
      const closer = opener === '{' ? '}' : ']';
      const end = candidate.lastIndexOf(closer);
      if (end <= start) continue;
      try {
        return JSON.parse(candidate.slice(start, end + 1)) as T;
      } catch {
        continue;
      }
    }
  }

  throw new Error('AI 返回的内容不是有效的 JSON。');
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

function normalizeCameraMovement(value: unknown): Shot['cameraMovement'] {
  const normalized = pickFirstString(value).toLowerCase();
  if (normalized.includes('zoom') || normalized.includes('推') || normalized.includes('拉')) return 'Zoom';
  if (normalized.includes('orbit') || normalized.includes('环绕') || normalized.includes('旋转')) return 'Orbit';
  if (normalized.includes('static') || normalized.includes('固定') || normalized.includes('静止')) return 'Static';
  if (normalized.includes('pan') || normalized.includes('平移') || normalized.includes('摇')) return 'Pan';
  return CAMERA_MOVEMENTS.includes(pickFirstString(value) as Shot['cameraMovement'])
    ? (pickFirstString(value) as Shot['cameraMovement'])
    : 'Pan';
}

function normalizeShot(shot: any, index: number): Shot {
  return {
    stage: pickFirstString(shot?.stage, shot?.title, shot?.name, shot?.scene) || `场景${index + 1}`,
    description: pickFirstString(
      shot?.description,
      shot?.visualDescription,
      shot?.visual_description,
      shot?.prompt,
      shot?.content,
      shot?.summary,
    ),
    overlayText: pickFirstString(shot?.overlayText, shot?.overlay_text, shot?.caption, shot?.text),
    cameraMovement: normalizeCameraMovement(shot?.cameraMovement ?? shot?.camera_movement ?? shot?.camera),
    duration: normalizeShotDuration(shot?.duration ?? shot?.durationSeconds ?? shot?.duration_seconds),
  };
}

function normalizeAudience(item: any, index: number): AudienceOption {
  return {
    id: pickFirstString(item?.id) || `audience-${index + 1}-${Date.now()}`,
    name: pickFirstString(item?.name, item?.audience, item?.人群) || `人群${index + 1}`,
    ageRange: pickFirstString(item?.ageRange, item?.age_range, item?.age),
    profile: pickFirstString(item?.profile, item?.画像, item?.description),
    painPoint: pickFirstString(item?.painPoint, item?.pain_point, item?.痛点),
    sellingPoint: pickFirstString(item?.sellingPoint, item?.selling_point, item?.卖点),
    sceneDirection: pickFirstString(item?.sceneDirection, item?.scene_direction, item?.场景方向),
  };
}

export interface AudienceAnalysisResult {
  productName: string;
  category: string;
  audiences: AudienceOption[];
}

export const analyzeProductAudiences = async (
  base64Image: string,
  customHint?: string,
): Promise<AudienceAnalysisResult> => {
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
          text: `识别图中的产品，推断它最可能卖给哪些人，为短视频广告筛选目标人群。
                ${customHint ? `用户补充了这些信息，请重点参考: "${customHint}"。` : ''}
                要求：
                1. 先判断产品品类、核心功能、价格带与使用场景，再推断人群。
                2. 给出 5 个差异化的候选人群，彼此在年龄、身份或消费动机上必须明显不同，不要重复。
                3. 每个人群必须写清楚：人群名称、年龄段、一句话画像、真实痛点、针对该人群最有效的产品卖点、建议的场景方向（发生什么时间、什么地点）。
                4. 痛点与卖点要具体到能直接拍成画面，不要写“提升生活品质”这类空话。
                5. 全部使用中文。
                返回JSON：{ "productName": string, "category": string, "audiences": Array<{ "name": string, "ageRange": string, "profile": string, "painPoint": string, "sellingPoint": string, "sceneDirection": string }> }`,
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      timeoutMs: TEXT_GEN_TIMEOUT_MS,
    },
    systemInstruction: buildSystemInstruction('你是一位资深消费品牌策略师，擅长从一张产品图反推真实的目标消费人群，并给出可以直接拍成广告的场景洞察。所有内容必须全部使用中文，只返回 JSON。'),
  });

  const parsed = parseJsonResponse<any>(response);
  const audiences = pickFirstArray<any>(parsed?.audiences, parsed?.人群)
    .map((item, index) => normalizeAudience(item, index))
    .filter((item) => item.name)
    .slice(0, 5);

  if (audiences.length === 0) {
    throw new Error('没有识别出可用的目标人群，请重试。');
  }

  return {
    productName: pickFirstString(parsed?.productName, parsed?.product_name) || '该产品',
    category: pickFirstString(parsed?.category, parsed?.productCategory) || '产品展示',
    audiences,
  };
};

export const generateAudienceStoryboard = async (
  base64Image: string,
  audience: AudienceOption,
  shotCount: number,
  category?: string,
  hasModel: boolean = true,
): Promise<AdPlan> => {
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
          text: `为这款产品设计面向「${audience.name}」的短视频广告场景脚本。
                人群画像：${audience.profile}
                年龄段：${audience.ageRange}
                真实痛点：${audience.painPoint}
                最有效的卖点：${audience.sellingPoint}
                场景方向：${audience.sceneDirection}
                人物要求：${hasModel
                  ? '每个场景都必须出现符合该人群特征的真人模特，人物身份、穿着、动作要自然真实。'
                  : '所有场景都不出现任何人物（包括手部和背影），只拍产品本身和环境，用空镜、特写和静物构图讲故事。'}
                ${hasModel
                  ? ''
                  : `片型要求（无模特，本条为最高优先级）：因为没有人物出镜，必须先判断「${audience.name}」这个人群平时最爱看、最容易看完并下单的是哪一种「无人出镜类短视频片型」。
                参考片型（不限于此，可自创更贴合该人群的片型）：ASMR 静音解压开箱、极简高级感产品特写、生活化场景空镜叙事、快节奏卡点剪辑、第一人称手持 POV、桌面静物延时/定格动画、治愈系慢生活氛围、极客参数测评特写、使用前后对比实验、微距纹理探索。
                判断依据：这个人群的年龄段、身份、审美偏好、内容消费习惯和购买动机（例如大学生吃快节奏与新鲜感，宝妈吃治愈与生活实拍，职场人吃极简高级感与效率感，成分党吃参数与实验对比）。
                必须在 JSON 中返回 "videoStyle"（片型名称，8 字以内）和 "videoStyleReason"（一句话说明这个人群为什么吃这一套，控制在 40 字内）。
                所有场景必须严格按这个片型来设计：镜头语言、剪辑节奏、景别切换、光线氛围、道具陈设、产品出现方式都要符合该片型，并且全程不出现任何人物。`}
                要求：
                1. 先用一段话写清楚整支片子的创意概念（concept），说明用什么情绪和故事打动这个人群。${hasModel ? '' : '概念中必须点明选中的片型，并说明该片型如何击中这个人群。'}
                2. 生成 ${shotCount} 个场景，按顺序构成一条完整的短视频：从痛点切入，到产品出现，到使用过程，最后到情绪满足或行动号召。
                3. 场景必须是这个人群真实会出现的地点和时刻${hasModel ? '，人物身份、穿着、环境细节都要符合该人群' : '，环境陈设、光线氛围、道具细节都要符合该人群的生活场景'}。
                4. 每个场景提供极其详细的画面描述（至少3-5句话），涵盖光影、材质纹理、${hasModel ? '人物动作、' : ''}产品出现方式和精准的镜头运动。
                5. 相邻场景之间要有视觉上的衔接逻辑（相似的运动方向、色彩或道具延续）。
                6. 每个场景的视频动作必须能在4秒内完成，内容紧凑。
                7. 品牌一致性：如果产品图上有明显的Logo或标志性设计，必须在描述中写明它的位置和呈现方式。
                8. 画面中严禁出现任何文字和字幕，但必须还原产品本身的Logo。
                9. 全部使用中文。
                返回JSON：{ "concept": string, "sellingPoints": string[], ${hasModel ? '"videoStyle": string, "videoStyleReason": string, ' : ''}"storyboard": Array<{ "stage": string, "description": string, "overlayText": string, "cameraMovement": string, "duration": string }>, "videoPrompt": string }
                其中 stage 填写场景名称（如「深夜加班」），cameraMovement 只能取 Pan、Zoom、Orbit、Static 之一，duration 形如 "4s"。`,
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      timeoutMs: TEXT_GEN_TIMEOUT_MS,
    },
    systemInstruction: buildSystemInstruction(
      hasModel
        ? '你是一位资深的商业广告导演，擅长把人群洞察翻译成可拍摄的场景脚本。你严格掌控4秒一个动作的节奏，画面真实可信、符合物理常识。所有内容必须全部使用中文，只返回 JSON。'
        : '你是一位资深商业广告导演，同时深谙短视频平台的内容偏好：你能在没有人物出镜的前提下，先判断目标人群最爱看的无人出镜类片型（ASMR开箱、极简高级感特写、生活空镜叙事、快节奏卡点、POV、延时定格、治愈慢生活、参数测评、对比实验、微距纹理等），再用该片型的镜头语言把产品讲透。你严格掌控4秒一个动作的节奏，画面真实可信、符合物理常识。所有内容必须全部使用中文，只返回 JSON。',
    ),
  });

  const parsed = parseJsonResponse<any>(response);
  const storyboard = pickFirstArray<any>(
    parsed?.storyboard,
    parsed?.storyboards,
    parsed?.scenes,
    parsed?.shots,
  )
    .map((shot, index) => normalizeShot(shot, index))
    .filter((shot) => shot.description)
    .slice(0, shotCount);

  if (storyboard.length === 0) {
    throw new Error('没有生成可用的场景，请重试。');
  }

  return {
    category: pickFirstString(parsed?.category) || category || '产品展示',
    audience,
    angle: pickFirstString(parsed?.angle, parsed?.角度) || `面向${audience.name}`,
    concept: pickFirstString(parsed?.concept, parsed?.创意概念),
    sellingPoints: pickFirstArray<string>(parsed?.sellingPoints, parsed?.selling_points)
      .map((item) => String(item || '').trim())
      .filter(Boolean),
    storyboard,
    videoPrompt: pickFirstString(parsed?.videoPrompt, parsed?.video_prompt, parsed?.prompt),
    videoStyle: hasModel ? undefined : pickFirstString(parsed?.videoStyle, parsed?.片型, parsed?.video_style) || undefined,
    videoStyleReason: hasModel
      ? undefined
      : pickFirstString(parsed?.videoStyleReason, parsed?.片型理由, parsed?.video_style_reason) || undefined,
  };
};

export interface ProductHighlight {
  label: string;
  value: string;
}

export interface ProductAnalysisResult {
  productName: string;
  category: string;
  productAnalysis: string;
  highlights: ProductHighlight[];
  audiences: AudienceOption[];
}

export const analyzeProductAndAudiences = async (
  base64Image: string,
): Promise<ProductAnalysisResult> => {
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
          text: `识别图中的产品，先做产品分析，再推断它适合卖给哪些人。
                要求：
                1. 产品分析（productAnalysis）：用一段话说明品类、核心功能、价格带、使用场景、主打卖点，以及与竞品的差异点。
                2. 推断 5 个差异化的目标人群，彼此在年龄、身份或消费动机上必须明显不同。
                3. 每个人群写清：人群名称、年龄段、一句话画像、真实痛点、对该人群最有效的卖点、建议的场景方向（发生什么时间、什么地点）。
                4. 痛点与卖点要具体到能直接拍成画面。
                5. 全部使用中文。
                返回JSON：{ "productName": string, "category": string, "productAnalysis": string, "highlights": Array<{ "label": string, "value": string }>, "audiences": Array<{ "name": string, "ageRange": string, "profile": string, "painPoint": string, "sellingPoint": string, "sceneDirection": string }> }
                其中 highlights 用 4-6 个结构化要点概括产品：label 为短标签（例如“核心功能”“价格带”“使用场景”“主打卖点”“差异点”），value 为一句话说明。`,
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      timeoutMs: TEXT_GEN_TIMEOUT_MS,
    },
    systemInstruction: buildSystemInstruction('你是一位资深消费品牌策略师，擅长从一张产品图反推产品卖点与真实的目标消费人群。所有内容必须全部使用中文，只返回 JSON。'),
  });

  const parsed = parseJsonResponse<any>(response);
  const audiences = pickFirstArray<any>(parsed?.audiences, parsed?.人群)
    .map((item, index) => normalizeAudience(item, index))
    .filter((item) => item.name)
    .slice(0, 5);

  const highlights = pickFirstArray<any>(parsed?.highlights, parsed?.要点)
    .map((item) => ({
      label: pickFirstString(item?.label, item?.标签) || '',
      value: pickFirstString(item?.value, item?.内容, item?.说明) || '',
    }))
    .filter((item) => item.label && item.value)
    .slice(0, 6);

  return {
    productName: pickFirstString(parsed?.productName, parsed?.product_name) || '该产品',
    category: pickFirstString(parsed?.category) || '产品展示',
    productAnalysis: pickFirstString(parsed?.productAnalysis, parsed?.产品分析),
    highlights,
    audiences,
  };
};

export interface VideoScriptsResult {
  productName: string;
  category: string;
  scripts: AdPlan[];
}

export const generateVideoScripts = async (
  base64Image: string,
  hasModel: boolean,
  scriptCount: number = 3,
  shotCount: number = 1,
  durationSeconds: number = 4,
  analysis?: ProductAnalysisResult,
): Promise<VideoScriptsResult> => {
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
          text: `识别图中的产品，直接为它创作 ${scriptCount} 个风格迥异、完整可拍的短视频广告脚本。
                人物要求：${hasModel
                  ? '每个脚本都要出现符合目标人群特征的真人模特，人物身份、穿着、动作自然真实。'
                  : '所有脚本都不出现任何人物（包括手部和背影），只拍产品与环境，用空镜、特写和静物构图讲故事。'}
                ${analysis
                  ? `产品分析结论：${analysis.productAnalysis}
                目标人群（请据此设计差异化脚本，紧扣真实卖点与痛点，不要凭空编造产品功能）：
                ${analysis.audiences
                  .map(
                    (a, i) =>
                      `${i + 1}. ${a.name}（${a.ageRange}）— 痛点：${a.painPoint}；主打卖点：${a.sellingPoint}；场景方向：${a.sceneDirection}`,
                  )
                  .join('\n')}`
                  : '如果图中没有明确的产品分析，请根据画面合理推断品类与卖点。'}
                视频时长：约 ${durationSeconds} 秒。
                要求：
                1. 每个脚本必须有明确且互不相同的创意角度（angle），例如：痛点直击、使用场景种草、情感共鸣、对比反差、开箱体验等，不要重复。
                2. 每个脚本先用一段话写清创意概念（concept），说明用什么情绪和故事打动观众。
                3. 每个脚本只能包含 1 个场景（storyboard 数组必须有且仅有 1 个元素）。这一个场景要独立自主地讲完一整支短视频：开场吸引 → 产品出现/使用 → 情绪满足或行动号召，全部在一个镜头里紧凑表达，严禁拆成多个场景。
                4. ${scriptCount} 个脚本各自的那个场景在视觉上必须彼此完全不同：环境、时间段、光线氛围、镜头角度、产品使用方式、人物状态（如有模特）至少要有明显差异，绝对不能雷同。
                5. 该场景提供极其详细的画面描述（至少3-5句话），涵盖光影、材质纹理、人物动作（如有）、产品出现方式和镜头运动。
                6. 描述中的动作节奏、镜头长度和画面信息量必须匹配 ${durationSeconds} 秒的时长：时长越长，动作越丰富、可包含更多镜头变化与细节层次；时长越短，动作越紧凑单一、只聚焦一个核心瞬间。
                7. 品牌一致性：产品图上的 Logo 或标志性设计必须在描述中写明位置和呈现方式。
                8. 画面中严禁出现任何文字和字幕，但必须还原产品本身的 Logo。
                9. 全部使用中文。
                返回JSON：{ "productName": string, "category": string, "scripts": Array<{ "angle": string, "concept": string, "sellingPoints": string[], "storyboard": Array<{ "stage": string, "description": string, "overlayText": string, "cameraMovement": string, "duration": string }>, "videoPrompt": string }> }
                其中 stage 填写场景名称，cameraMovement 只能取 Pan、Zoom、Orbit、Static 之一，duration 固定为 "${durationSeconds}s"。scripts 数组必须恰好包含 ${scriptCount} 个脚本，每个脚本的 storyboard 只能有 1 个场景。`,
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      timeoutMs: TEXT_GEN_TIMEOUT_MS,
    },
    systemInstruction: buildSystemInstruction('你是一位获奖无数的商业广告导演，擅长为同一产品设计多个截然不同的创意方向。你严格掌控4秒一个动作的节奏，画面真实可信、符合物理常识。所有内容必须全部使用中文，只返回 JSON。'),
  });

  const parsed = parseJsonResponse<any>(response);
  const scriptsSource = pickFirstArray<any>(parsed?.scripts, parsed?.脚本, parsed?.plans);

  const scripts: AdPlan[] = scriptsSource
    .map((item, scriptIndex) => {
      const storyboard = pickFirstArray<any>(
        item?.storyboard,
        item?.storyboards,
        item?.scenes,
        item?.shots,
      )
        .map((shot, index) => normalizeShot(shot, index))
        .filter((shot) => shot.description)
        .slice(0, 1)
        .map((shot) => ({ ...shot, duration: `${durationSeconds}s` }));
      if (storyboard.length === 0) return null;
      return {
        category: pickFirstString(parsed?.category) || '产品展示',
        audience: null,
        angle: pickFirstString(item?.angle, item?.角度, item?.title, item?.name) || `脚本${scriptIndex + 1}`,
        concept: pickFirstString(item?.concept, item?.创意概念),
        sellingPoints: pickFirstArray<string>(item?.sellingPoints, item?.selling_points)
          .map((value) => String(value || '').trim())
          .filter(Boolean),
        storyboard,
        videoPrompt: pickFirstString(item?.videoPrompt, item?.video_prompt, item?.prompt),
      } satisfies AdPlan;
    })
    .filter((item): item is AdPlan => Boolean(item))
    .slice(0, scriptCount);

  if (scripts.length === 0) {
    throw new Error('没有生成可用的脚本，请重试。');
  }

  return {
    productName: pickFirstString(parsed?.productName, parsed?.product_name) || '该产品',
    category: pickFirstString(parsed?.category) || '产品展示',
    scripts,
  };
};

export const generateVideo = async (
  prompt: string,
  base64Image: string,
  aspectRatio: '16:9' | '9:16',
  referenceImage?: string,
  lastFrameImage?: string,
  durationSeconds: number = 4,
  engine: VideoEngine = 'seedance2',
  billingTask?: string,
  resolution: '720p' | '1080p' = '1080p',
  audienceTag?: string,
): Promise<VideoGenerationResult> => {
  if (engine === 'kling' || engine === 'jimeng') {
    const model = engine === 'kling' ? KLING_VIDEO_MODEL : JIMENG_VIDEO_MODEL;
    const imagePart = buildInlineImagePart(referenceImage, base64Image);
    const audienceRule = audienceTag ? `The presentation should remain visually appropriate for the ${audienceTag} audience without adding text or changing the source scene.` : '';
    const modelSafePrompt = `${prompt}. ${imagePart
      ? 'Use the uploaded image as the authoritative reference for the product and the person appearing in the video. Preserve face shape, key features, hairstyle, and overall likeness consistently.'
      : 'Create a fictional adult character with a stable, consistent face throughout the video.'} ${audienceRule} Maintain natural facial anatomy, realistic skin texture, stable identity, and physically plausible body movement. Prevent face flicker, identity drift, warping, extra limbs, and abrupt appearance changes. Use clean direct cuts when a cut is needed; do not use unnatural morphs, dissolves, or distorted transitions. No captions, overlays, logos, or watermarks.`;
    const contents: Array<Record<string, unknown>> = [{ text: modelSafePrompt }];
    if (imagePart) {
      contents.push(imagePart);
    }

    const payload: any = await generateContent({
      model,
      task: 'video_gen_submit',
      contents: { parts: contents },
      config: {
        provider: engine,
        aspectRatio,
        resolution,
        durationSeconds: engine === 'jimeng' || engine === 'kling' ? (durationSeconds >= 8 ? 10 : 5) : durationSeconds,
        ...(audienceTag ? { audienceTag } : {}),
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

  // The local Ark proxy forwards assets to the Ark API inline, so public URLs
  // and Base64 data URLs are both accepted without a separate upload step.
  const toArkAssetUrl = (input: string | undefined, fallbackMimeType: string): string | null => {
    const trimmed = String(input || '').trim();
    if (!trimmed) {
      return null;
    }

    if (/^https?:\/\//i.test(trimmed) || /^data:/i.test(trimmed)) {
      return trimmed;
    }

    if (/^[a-z0-9+/=\s]+$/i.test(trimmed) && trimmed.length > 128) {
      return `data:${fallbackMimeType};base64,${trimmed.replace(/\s+/g, '')}`;
    }

    return null;
  };

  const content: Array<Record<string, unknown>> = [{ type: 'text', text: enhancedPrompt }];

  const firstFrameURL = toArkAssetUrl(referenceImage || base64Image, 'image/jpeg');
  if (firstFrameURL) {
    content.push({
      type: 'image_url',
      image_url: { url: firstFrameURL },
      role: 'first_frame',
    });
  }

  const lastFrameURL = toArkAssetUrl(lastFrameImage, 'image/jpeg');
  if (lastFrameURL) {
    content.push({
      type: 'image_url',
      image_url: { url: lastFrameURL },
      role: 'last_frame',
    });
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
      timeoutMs: TEXT_GEN_TIMEOUT_MS,
    },
    systemInstruction: buildSystemInstruction("你是一位精通电影艺术的资深导演，擅长将简单的画面描述转化为极具感染力、细节丰富的视觉脚本。"),
  });

  return extractTextFromResponse(response).trim();
};

export const regenerateShotDescription = async (
  base64Image: string,
  currentStage: string,
  audience?: AudienceOption | null,
): Promise<{ description: string; cameraMovement: string; overlayText: string }> => {
  const audienceRule = audience
    ? `目标人群是「${audience.name}」（${audience.ageRange}），痛点：${audience.painPoint}，主打卖点：${audience.sellingPoint}。场景必须发生在这个人群真实会出现的地点与时刻，人物身份与穿着要符合该人群。`
    : '';
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
          text: `针对场景“${currentStage}”，重新生成一个专业的导演描述。
                ${audienceRule}
                要求：
                1. 视觉描述必须极其详细（至少3-5句话），涵盖光影、材质纹理、人物动作、产品出现方式和精准的镜头运动。
                2. 物理真实性：确保物体摆放符合物理常识，画面构图真实自然。
                3. 严格时长控制：视频动作必须在4秒内完成。
                4. 严禁出现任何文字、Logo或字幕。
                5. 全部使用中文。
                返回一个JSON对象：{ description, cameraMovement, overlayText }，其中 cameraMovement 只能取 Pan、Zoom、Orbit、Static 之一。`,
        },
      ],
    },
    config: {
      responseMimeType: "application/json",
      timeoutMs: TEXT_GEN_TIMEOUT_MS,
    },
    systemInstruction: buildSystemInstruction("你是一位资深的商业广告导演分析师。所有返回的文字内容必须全部使用中文，只返回 JSON。"),
  });

  return parseJsonResponse<{ description: string; cameraMovement: string; overlayText: string }>(response);
};
