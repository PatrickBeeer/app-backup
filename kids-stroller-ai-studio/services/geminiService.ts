import { generateContent, extractImageFromResponse } from "../../../shared_services/geminiProxyService";
import type { GeminiGenerateRequest } from "../../../shared_services/geminiProxyService";
import { AgeGroup, Ethnicity, AspectRatio, EditOptions, SceneStyle, CompositionRatio, ImageResolution } from "../types";

const MODEL_NAME = 'gemini-3.1-flash-image-preview';

function cleanBase64(imageBase64: string): { data: string; mimeType: string } {
  const data = imageBase64.split(',')[1] || imageBase64;
  const mimeType = (imageBase64.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*/)?.[1] || 'image/jpeg') as string;
  return { data, mimeType };
}

async function generateSingleImage(
  imageBase64: string,
  prompt: string,
  aspectRatio: AspectRatio,
  resolution: ImageResolution,
  seed: number
): Promise<string | null> {
  const { data, mimeType } = cleanBase64(imageBase64);
  const request: GeminiGenerateRequest = {
    model: MODEL_NAME,
    task: 'image_gen',
    contents: {
      parts: [
        { inlineData: { data, mimeType } },
        { text: prompt },
      ],
    },
    config: {
      imageConfig: { aspectRatio, imageSize: resolution },
      seed,
    },
  };
  const response = await generateContent(request);
  const url = extractImageFromResponse(response);
  return url;
}

const compositionInstructions: Record<CompositionRatio, string> = {
  [CompositionRatio.PRODUCT_FOCUS]: "构图要求：【产品特写 (Close-up)】。使用浅景深虚化背景，产品占据画面视觉中心，占比极大。重点展示产品细节。",
  [CompositionRatio.BALANCED]: "构图要求：【标准中景 (Medium Shot)】。产品与模特比例均衡。构建有层次的背景（前中后景），画面平衡。",
  [CompositionRatio.SCENE_FOCUS]: "构图要求：【广角全景 (Wide Angle)】。使用广角镜头展示宏大的环境空间。产品在画面中占比适中，强调空间感和纵深感，展现整体生活方式。"
};

const stylePrompts: Record<SceneStyle, [string, string]> = {
  [SceneStyle.WARM_INDOOR]: [
    "环境设定：Modern Luxury Home. 现代豪宅的宽敞客厅，落地窗外是明亮的城市或花园景色。室内使用米色和奶油色调，阳光透过白纱窗帘洒入，产生丁达尔效应。地板为高级人字拼木地板，背景有B&B Italia风格的沙发和艺术摆件，营造高品质家庭氛围。",
    "环境设定：Scandinavian Kids Room. 北欧极简风格的儿童房，空间通透，光线柔和。背景有定制的嵌入式收纳柜、羊毛地毯和设计感十足的木质玩具。色调温暖柔和，景深自然过渡。"
  ],
  [SceneStyle.OUTDOOR]: [
    "环境设定：Sunny Park Lane. 阳光明媚的高端公园步道，两旁是修剪整齐的草坪和郁郁葱葱的树木。阳光穿过树叶投下斑驳光影。使用 85mm 镜头压缩背景，营造梦幻的户外游玩氛围。",
    "环境设定：Modern Plaza. 现代艺术馆外的干净广场，背景是极简主义的混凝土或玻璃建筑，天空湛蓝。地面为平整的浅灰色石材，反射着天空的颜色。画面通透，具有时尚杂志大片的质感。"
  ],
  [SceneStyle.WHITE_STUDIO]: [
    "环境设定：Pure White Studio. 纯白无影棚背景。使用无缝背景纸。均匀柔和的影棚布光，消除生硬阴影，仅保留产品底部的自然接触阴影以体现接地感。画面极致干净、专业，完全聚焦于产品，适合亚马逊/天猫主图。",
    "环境设定：High Key Photography. 高调摄影风格。极简的白色空间，略带浅灰色的层次感。光线明亮通透，产品质感清晰。没有多余的道具干扰，视觉中心完全集中在产品上。"
  ],
  [SceneStyle.CUSTOM]: [
    "环境设定：Custom Creative Scene. 根据用户的【额外指令】生成。这是一个开放式命题，请根据用户的文字描述构建最匹配的场景。如果用户未提供详细指令，请默认创建一个极简的、有设计感的摄影棚环境，确保背景不喧宾夺主。",
    "环境设定：User Defined. 完全依据用户的自定义描述。保持光影专业，透视准确。如果描述模糊，则使用通用的高级商业摄影背景。"
  ],
};

export async function generateProductScenes(
  imageBase64: string,
  ageGroup: AgeGroup,
  ethnicity: Ethnicity,
  aspectRatio: AspectRatio,
  resolution: ImageResolution,
  sceneStyle: SceneStyle,
  compositionRatio: CompositionRatio,
  productSize: string,
  customPrompt: string,
  seed: number
): Promise<string[]> {
  const compPrompt = compositionInstructions[compositionRatio] ?? compositionInstructions[CompositionRatio.BALANCED];
  let sizeInstruction = "";
  if (productSize?.trim()) {
    sizeInstruction = `【尺寸参考】产品实际尺寸描述：${productSize}。请严格参考此尺寸来构建产品与环境、产品与模特（${ageGroup}儿童）之间的比例关系。不要把产品变得过大或过小，确保物理逻辑真实。`;
  }

  const basePrompt = `
    任务：基于上传的产品图片生成专业的电商生活场景图。
    【核心指令：严格保持产品一致性与角度】
    1. **绝对不修改产品细节**：上传图片中的产品（童车/玩具）是唯一基准。严禁改变产品的颜色、形状、结构、材质、Logo或任何设计特征。
    2. **角度锁定 (CRITICAL)**：**必须完全保留输入图片中产品的原始拍摄角度和透视关系**。不要旋转产品，不要改变相机的拍摄高度。请依据产品原本的角度，构建符合透视逻辑的背景。
    3. **融合要求**：将产品自然地融入背景中，光影方向要与产品原本的光影（如果有）协调。使用光线追踪级别的光影渲染，确保产品在环境中有真实的投影和反光。
    ${sizeInstruction}
    【人物与氛围】
    - 模特：一个快乐的${ethnicity}儿童，年龄段为${ageGroup}。
    - 互动：儿童在产品旁边或坐在产品上（仅当产品角度适合坐姿时），动作要配合产品原本的角度。
    - 风格：顶级商业摄影，8K 分辨率，极度清晰锐利。
    【构图控制】
    ${compPrompt}
  `;

  const selectedStylePrompts = stylePrompts[sceneStyle] ?? stylePrompts[SceneStyle.OUTDOOR];
  let prompt1 = `${basePrompt} ${selectedStylePrompts[0]}`;
  let prompt2 = `${basePrompt} ${selectedStylePrompts[1]}`;
  if (customPrompt) {
    const customInstruction = ` 用户额外指令（请在上述环境基础中融入此要求，优先满足）：${customPrompt}`;
    prompt1 += customInstruction;
    prompt2 += customInstruction;
  }

  const results = await Promise.all([
    generateSingleImage(imageBase64, prompt1, aspectRatio, resolution, seed),
    generateSingleImage(imageBase64, prompt2, aspectRatio, resolution, seed),
  ]);
  return results.filter((url): url is string => url != null);
}

export async function refineProductScene(
  originalImageBase64: string,
  options: EditOptions,
  aspectRatio: AspectRatio
): Promise<string> {
  const modifications: string[] = [];
  if (options.lighting !== 'default') {
    const m: Record<string, string> = { warm: "使用暖色调阳光，营造温馨午后氛围", cool: "使用清冷明亮的自然光，色温偏冷", studio: "使用专业影棚布光，高亮、清晰、无杂乱阴影" };
    modifications.push(`光照调整：${m[options.lighting]}`);
  }
  if (options.blur !== 'default') {
    const m: Record<string, string> = { strong: "背景处理：大幅度虚化背景（大光圈效果，f/1.8），产生迷人的光斑，极大突出前景产品", sharp: "背景处理：背景清晰锐利（小光圈效果，f/11），展示更多环境细节和纹理" };
    modifications.push(m[options.blur]);
  }
  if (options.color !== 'default') {
    const m: Record<string, string> = { vivid: "色彩风格：提高饱和度，色彩鲜艳活泼，对比度增强", soft: "色彩风格：降低饱和度，柔和的莫兰迪色系，低对比度，高级灰质感" };
    modifications.push(m[options.color]);
  }
  if (options.customPrompt) modifications.push(`额外指令：${options.customPrompt}`);

  const prompt = `
    任务：基于输入图片进行精细化调整（Image Editing）。
    【严格限制】
    1. **产品主体绝对不变**：完全保留画面中童车/玩具的所有细节、角度、透视和结构。不要重新生成产品，只调整环境和氛围。
    2. **构图保持**：保持原图的人物姿态和构图结构。
    【调整内容】
    ${modifications.join('\n')}
    请输出一张调整后的高品质电商图。
  `;

  const randomSeed = Math.floor(Math.random() * 2000000000);
  const result = await generateSingleImage(originalImageBase64, prompt, aspectRatio, '2K', randomSeed);
  if (!result) throw new Error("图片微调失败，请重试。");
  return result;
}
