/// <reference types="vite/client" />
// Core service for the jade-main-image-app standalone app.
//
// Ports the prompt builders and the per-scene generation pipeline from the
// original Express server (src/server.ts), but routes Gemini through the API
// Manager (`shared_services/geminiProxyService`) and routes GPT Image 2 through
// a small BFF so no provider key is exposed to the browser.

import { generateContent } from '../../../shared_services/geminiProxyService';
import {
  AspectRatio,
  Audience,
  Dimensions,
  IdentityLock,
  ImageInput,
  Occupancy,
  RATIO_LABELS,
  Scene,
  Settings,
} from '../types';
import { cleanBase64 } from './imageProcessing';
import {
  fitRatio,
  loadGeneratedReference,
  loadStyleReference,
  makeClaspReference,
  readImageDimensions,
} from './imageProcessing';

const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const BFF_URL = (import.meta.env.VITE_BFF_URL || 'http://127.0.0.1:5051').replace(/\/$/, '');
const BFF_TIMEOUT_MS = 600_000;

// ---------------------------------------------------------------------------
// Scene + audience metadata (ported verbatim from server.ts).
// ---------------------------------------------------------------------------

export const scenes: Scene[] = [
  { id: '01', title: '黑色主图——第一眼看清产品', purpose: '商品列表首图、商城封面。', lens: '中长焦85–100mm；产品完整立起，本体小主体完整入画。', lighting: '大面积柔光箱、透射侧逆光与细长抛光高光。', composition: '产品与完整倒影形成一个视觉组，整体居中，四周大面积留白。', background: '干净无缝影棚背景。', shadow: '真实接触阴影和克制倒影。', feel: '专业珠宝摄影棚拍。', extra: '金扣、轮廓、雕刻与天然颜色必须和原图一致。' },
  { id: '02', title: '种水细节特写——证明产品质感', purpose: '展示种水、厚度和抛光质感。', lens: '100mm珠宝摄影，完整产品入画且四边保留安全留白。', lighting: '明亮柔和透射侧逆光，清晰展示内部层次。', composition: '20–30度三分之四侧前方角度，中轴竖直，不倾斜。', background: '简洁虚化背景。', shadow: '弱化接触阴影。', feel: '真实珠宝微距摄影。', extra: '禁止产品、金扣或底部出框。' },
  { id: '03', title: '金扣/工艺细节——表现工艺', purpose: '展示原金扣及连接工艺。', lens: '微距近拍，金扣与连接结构占画面75%–85%。', lighting: '低角度掠射光突出金属纹理，透射侧逆光让可见翡翠明亮通透。', composition: '金扣与连接处为唯一视觉中心，翡翠仅保留必要连接区域。', background: '极简珠宝台或绒布。', shadow: '弱化接触阴影。', feel: '真实工艺记录。', extra: '金扣仅以原图顶部细节为准；可见翡翠必须无棉絮、石纹、裂纹、黑点和杂质。' },
  { id: '04', title: '轻场景拍摄——东方高级感氛围', purpose: '现代东方轻场景商业图。', lens: '50–85mm，产品占画面50%–65%。', lighting: '明亮商业柔光、透射轮廓光与细长高光。', composition: '少量亚麻、石材或浅木元素，克制留白。', background: '浅木、石材或宣纸质感。', shadow: '自然柔和环境阴影。', feel: '现代东方珠宝商业大片。', extra: '不堆砌传统道具，翡翠必须通透有光泽。' },
  { id: '05', title: '人物佩戴主图——上身效果', purpose: '展示真实佩戴比例。', lens: '中焦人像，吊坠按真实尺寸佩戴，最多占可见上身高度1/7。', lighting: '高级珠宝广告柔光、轮廓光与受控高光。', composition: '保留锁骨、颈部和服装比例参照，吊坠高度约占可见锁骨至胸口区域10%–14%。', background: '干净简洁的商业人像背景。', shadow: '真实佩戴接触阴影。', feel: '高端珠宝广告人像。', extra: '挂绳、接触关系、景深和光向必须真实，禁止贴图感。' },
];

export const audiences: Record<Audience, { label: string; model: string; mood: string; anchor: string }> = {
  young_woman: { label: '年轻女性 · 清透现代东方', model: '气质干净的东亚年轻女性（18–25岁）', mood: '清透、轻盈、现代东方；米白、奶油、浅木、浅石材，明亮柔光与自然窗光。', anchor: '图1、图2为米白奶油浅木浅石材的现代东方风格，明亮自然窗光、留白充足、简洁高级。' },
  mature_woman: { label: '成熟女性 · 暖金新中式', model: '优雅知性的东亚女性（30–45岁）', mood: '暖象牙白、茶褐、浅暖灰与少量香槟金，温润克制。', anchor: '暖金新中式：温润石材、哑光丝绸、柔和侧上主光；禁止堆砌龙凤祥云和浓重传统道具。' },
  young_man: { label: '年轻男性 · 冷感建筑极简', model: '清爽利落的东亚年轻男性（20–30岁）', mood: '石墨灰、冷白、钛银、浅混凝土，低饱和建筑感。', anchor: '冷感建筑极简：几何石材、细砂玻璃或极简金属台面，冷白柔光与窄条轮廓光。' },
  mature_man: { label: '成熟男性 · 收藏级深色陈列', model: '沉稳得体的东亚男性（30–45岁）', mood: '黑曜石、深胡桃木、深墨绿，收藏级深色陈列。', anchor: '收藏级深色陈列：深色台面、精准顶部柔光、黑卡控光，暗部仍保留翡翠透光和工艺细节。' },
  no_model: { label: '不露人物 · 博物馆级产品档案', model: '不出现人物、手部、颈部或任何肢体', mood: '雾白、浅灰、微暖石材，产品档案摄影。', anchor: '博物馆级产品档案：无人物、无叙事道具，均匀柔光与精确微弱轮廓光，清晰呈现形制和工艺。' },
};

export const audienceHints: Record<Audience, string> = {
  young_woman: '清透、轻盈、现代东方；图1/2使用米白、奶油、浅木或浅石材，明亮柔光、自然窗光、留白多且产品偏大。',
  mature_woman: '暖金新中式：暖象牙白、茶褐、香槟金点缀，温润克制；05 图为东亚成熟女性真实佩戴。',
  young_man: '冷感建筑极简：石墨灰、冷白、钛银、浅混凝土，利落低饱和；05 图为东亚年轻男性真实佩戴。',
  mature_man: '收藏级深色陈列：黑曜石、深胡桃木、深墨绿，精准轮廓光与深色质感；05 图为东亚成熟男性真实佩戴。',
  no_model: '博物馆级产品档案：雾白、浅灰、微暖石材，无人物无肢体，专注形制与工艺。',
};

const identityLock = `【产品身份锁定】必须保持上传图片中同一件真实翡翠：轮廓、长宽厚比例、雕刻、孔位、金扣、镶嵌、绿色分布、深浅色区域和天然色根不得改变。必须清除棉絮、石纹、裂纹、黑点、脏点、灰尘、划痕、崩口、橘皮和杂质。允许改变背景、布光、镜头距离、构图和接触阴影；不允许把翡翠修成不同种水、不同颜色或不同器型。`;

function dimensionText(dimensions?: Partial<Dimensions>): string {
  if (!dimensions || !dimensions.width || !dimensions.height || !dimensions.depth) return '';
  const width = Number(dimensions.width);
  const height = Number(dimensions.height);
  const depth = Number(dimensions.depth);
  if (![width, height, depth].every(v => Number.isFinite(v) && v > 0 && v <= 1000)) return '';
  return `【真实产品尺寸】宽${width}mm，高${height}mm，厚${depth}mm。尺寸用于校验实物比例和人物佩戴尺度，严禁改变实物长宽厚。`;
}

interface BuildPromptArgs {
  lock: IdentityLock | null;
  audience: Audience;
  ratio: AspectRatio;
  occupancy: Occupancy;
  extra?: string;
  scenePrompt?: string;
  dimensions?: Partial<Dimensions>;
  hasPrevious: boolean;
}

export function buildPrompt(scene: Scene, args: BuildPromptArgs): string {
  const audience = audiences[args.audience] || audiences.young_woman;
  const occupancy =
    args.occupancy === 'small'
      ? '产品完整外接框高度必须占画面25%–35%，显著缩小并四边保留留白。'
      : args.occupancy === 'large'
      ? '产品完整外接框高度必须占画面65%–78%，完整入画且不裁切。'
      : '';
  const previous =
    args.hasPrevious && occupancy
      ? '第一张输入是刚生成的旧成片，必须在该照片上重构产品比例、保持场景和机位，不能沿用旧尺寸；下一张输入仅用于产品身份核对。'
      : '';
  const noModelOverride =
    scene.id === '05' && args.audience === 'no_model' ? '图5不出现人物或肢体，只做无人物博物馆级产品陈列。' : '';
  const sceneOne =
    scene.id === '01'
      ? '【图1小主体构图】产品与完整倒影是一个整体，必须小主体、完整入画、上下左右大量留白。产品不得铺满画面、不得贴边。构图参考图只学习主体比例、倒影和留白，不复制参考产品。'
      : '';
  const clasp =
    scene.id === '03'
      ? '【图3金扣锁】金扣与连接工艺占画面75%–85%，其形状、颜色、镶石、孔位与连接方式必须逐项和上传图一致。可见翡翠必须无瑕疵、边缘透亮、水润有真实细长高光。'
      : '';
  return `你是顶级珠宝电商摄影师，生成真实单反/中画幅商业摄影，不是AI概念图。\n${identityLock}\n${dimensionText(args.dimensions)}\n【场景】${scene.title}\n目的：${scene.purpose}\n镜头：${scene.lens}\n布光：${scene.lighting}\n构图：${scene.composition}\n背景：${scene.background}\n阴影：${scene.shadow}\n感觉：${scene.feel}\n额外：${scene.extra}\n【人群风格】${audience.label}。${audience.mood}\n${audience.anchor}\n${noModelOverride}\n${occupancy}\n${previous}\n${sceneOne}\n${clasp}\n【身份描述】${JSON.stringify(args.lock || {})}\n【统一要求】翡翠以透射侧逆光、轮廓光与细长真实高光呈现真实通透光泽；禁止过曝、塑料感、发灰、发闷。输出${RATIO_LABELS[args.ratio] || '正方形1:1'}满画幅摄影，不要文字、边框或水印。${args.extra ? `\n【全部图片附加要求】${args.extra}` : ''}${args.scenePrompt ? `\n【本图独立提示词】${args.scenePrompt}` : ''}`;
}

export function occupancyCorrection(occupancy: Occupancy): string {
  const target = occupancy === 'small' ? '25%–35%' : '65%–78%';
  return `这是一次严格的构图比例校正。第一张输入是产品比例错误的成片。保持背景、光线、色彩、机位和产品身份不变，但产品完整外接框必须调整为画面高度${target}。当前产品大小是错误的，禁止沿用。必须完整入画、留出安全边距，不得裁切、变形或改变金扣和翡翠。`;
}

export const scene03Retouch = `这是图3的局部商业修图。第一张为金扣工艺成片，保留金扣的每一处形状、镶石、孔位、连接关系、背景和机位。仅对可见翡翠做无瑕疵修图：完全清除棉絮、石纹、裂纹、黑点、脏点、灰尘、划痕、崩口、橘皮和杂质；用真实透射侧逆光、微弱轮廓光和细长抛光高光让翡翠水润通透。不得改变天然颜色、色根、雕刻、厚度或种水。`;

// ---------------------------------------------------------------------------
// Identity lock (client-side — no LLM, mirrors server.ts /api/lock).
// ---------------------------------------------------------------------------

export async function buildIdentityLock(
  mainImage: ImageInput,
  references: ImageInput[]
): Promise<IdentityLock> {
  const dims = await readImageDimensions(mainImage.image);
  return {
    overall: '以主图及同一产品的多角度参考图共同作为产品身份基准',
    sourceDimensions: dims ? `${dims.width}x${dims.height}` : '未知',
    referenceImageCount: Math.min(6, references.length + 1),
    identityRule:
      '轮廓、比例、雕刻、金扣与天然颜色分布以全部输入图为准；所有可见瑕疵必须在成片中清除',
  };
}

// ---------------------------------------------------------------------------
// Model calls.
// ---------------------------------------------------------------------------

function extractInlineImage(response: any): string | null {
  const parts = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const part of parts) {
    const data = part?.inlineData?.data || part?.inline_data?.data;
    if (typeof data === 'string' && data.length > 200) return cleanBase64(data);
  }
  return null;
}

/**
 * Call Gemini 3.1 Flash Image through the API Manager (`llm-generate`). The
 * shared service handles auth fallback, token retry, and credit deduction.
 * Sends `task: 'image_gen'` + `billing_task: 'image_gen'` so app-manager
 * resolves pricing without hitting "app pricing rule not found".
 *
 * Retries up to 5 times with backoff, mirroring the original server.ts loop.
 */
export async function callGemini(
  prompt: string,
  main: ImageInput,
  references: ImageInput[]
): Promise<string> {
  const parts: any[] = [{ text: prompt }, { inlineData: { mimeType: main.mime || 'image/png', data: cleanBase64(main.image) } }];
  for (const image of references) {
    parts.push({ inlineData: { mimeType: image.mime || 'image/png', data: cleanBase64(image.image) } });
  }

  let lastError = '未知错误';
  for (const delayMs of [0, 5000, 10000, 20000, 30000]) {
    if (delayMs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    try {
      const response = await generateContent({
        model: GEMINI_IMAGE_MODEL,
        task: 'image_gen',
        billing_task: 'image_gen',
        contents: { parts },
        config: { temperature: 1 },
      });
      const found = extractInlineImage(response);
      if (found) return found;
      lastError = 'Gemini 未返回图像';
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`调用 Gemini 多次重试仍失败：${lastError}`);
}

/**
 * Call GPT Image 2 through the small BFF so the provider key stays server-side.
 * The BFF owns `GPT_API_KEY`; the browser only sends prompt + image + ratio.
 */
export async function callGptImage(
  prompt: string,
  main: ImageInput,
  ratio: AspectRatio
): Promise<string> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), BFF_TIMEOUT_MS);
  try {
    const response = await fetch(`${BFF_URL}/api/gpt-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        imageBase64: cleanBase64(main.image),
        mime: main.mime || 'image/png',
        ratio,
      }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body?.error || `GPT Image 2 HTTP ${response.status}`);
    }
    const image = body?.image;
    if (typeof image === 'string' && image.length > 200) return cleanBase64(image);
    throw new Error('GPT Image 2 未返回图像');
  } finally {
    window.clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Per-scene generation pipeline (mirrors generateJob() in server.ts).
// ---------------------------------------------------------------------------

export interface GenerateSceneArgs {
  scene: Scene;
  mainImage: ImageInput;
  productImages: ImageInput[];
  lock: IdentityLock | null;
  settings: Settings;
  occupancy: Occupancy;
  scenePrompt?: string;
  previous?: ImageInput | null; // previously generated result for this scene
  styleRef?: ImageInput | null;
}

export interface GenerateSceneResult {
  base64: string; // final PNG base64 (post fitRatio)
}

export async function generateScene(args: GenerateSceneArgs): Promise<GenerateSceneResult> {
  const { scene, mainImage, productImages, lock, settings, occupancy, scenePrompt, previous, styleRef } = args;
  const usePreviousRef = Boolean(previous && (occupancy !== 'standard' || scenePrompt));
  const prompt = buildPrompt(scene, {
    lock,
    audience: settings.audience,
    ratio: settings.size,
    occupancy,
    extra: settings.extra_prompt,
    scenePrompt,
    dimensions: settings.dimensions,
    hasPrevious: usePreviousRef,
  });

  let main: ImageInput = usePreviousRef && previous ? previous : mainImage;
  const refs: ImageInput[] = [];
  if (main === previous) refs.push(mainImage);
  refs.push(...productImages);
  if (scene.id === '01' && styleRef) refs.push(styleRef);
  if (scene.id === '03') {
    const clasp = await makeClaspReference(mainImage.image);
    if (clasp) refs.push(clasp);
  }

  let result =
    settings.model === 'gptimage'
      ? await callGptImage(prompt, main, settings.size)
      : await callGemini(prompt, main, refs);

  // Occupancy correction pass (Gemini only, when a previous result is being
  // re-shaped to a different product framing).
  if (settings.model !== 'gptimage' && previous && occupancy !== 'standard') {
    const correctionRefs: ImageInput[] = [mainImage, ...productImages];
    if (scene.id === '01' && styleRef) correctionRefs.push(styleRef);
    result = await callGemini(
      occupancyCorrection(occupancy),
      { image: result, mime: 'image/png' },
      correctionRefs
    );
  }

  // Scene 03 retouch pass (Gemini only).
  if (settings.model !== 'gptimage' && scene.id === '03') {
    try {
      const clasp = await makeClaspReference(mainImage.image);
      const retouchRefs: ImageInput[] = [mainImage, ...productImages];
      if (clasp) retouchRefs.push(clasp);
      result = await callGemini(scene03Retouch, { image: result, mime: 'image/png' }, retouchRefs);
    } catch {
      // Keep the usable first-pass result on retouch failure.
    }
  }

  const png = await fitRatio(result, settings.size, settings.quality, scene.id === '01');
  return { base64: png };
}

/** Reload a previously generated PNG (object URL → base64) for refinement. */
export async function previousFromBase64(base64: string): Promise<ImageInput | null> {
  return loadGeneratedReference(base64);
}

export { loadStyleReference };
