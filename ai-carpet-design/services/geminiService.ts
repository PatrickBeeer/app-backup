import { generateContent } from '../../../shared_services/geminiProxyService';
import { RoomStyle, AspectRatio, RugMaterial, ImageSize, InputType } from "../types";

export const GEMINI_TEXT_MODEL = 'gemini-3-flash-preview';
export const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
export const VEO_VIDEO_MODEL = 'veo_3_1';

const getMaterialDescription = (material: RugMaterial, customText?: string) => {
  if (material === RugMaterial.CUSTOM && customText) {
     return `特殊定制材质：${customText}。`;
  }
  switch (material) {
    case RugMaterial.WOOL: return "材质：高级羊毛，哑光质感，纤维厚实。";
    case RugMaterial.SILK: return "材质：奢华真丝，细腻流光。";
    case RugMaterial.JUTE: return "材质：天然黄麻，粗犷编织纹理。";
    case RugMaterial.SHAGGY: return "材质：高密度长绒，柔软蓬松。";
    case RugMaterial.COTTON: return "材质：亲肤棉麻，平纹干爽。";
    default: return "材质：科技纤维，平整防污。";
  }
};

const getStyleDetailedPrompt = (style: RoomStyle, isPanorama: boolean): string => {
  const basePrompt = {
    [RoomStyle.CREAMY_WIND]: "【奶油风】空间温润治愈，奶白色艺术漆，圆润家具，通透柔和的光影。",
    [RoomStyle.FRENCH_VINTAGE]: "【法式复古】石膏浮雕线条，人字拼地板，复古丝绒，优雅的艺术氛围。",
    [RoomStyle.MODERN_AMERICAN]: "【美式老钱】胡桃木家具，深色油蜡皮沙发，稳重经典的品质感。",
    [RoomStyle.BEDROOM]: "【高定卧房】床品细节丰富，光影宁静，强调休息空间的安稳感。",
    [RoomStyle.NURSERY]: "【温馨童房】马卡龙色彩，柔软家具边角，童趣且安全的氛围。",
    [RoomStyle.CUSTOM]: "【自定义场景】"
  }[style];

  if (isPanorama) {
    return `环境背景：${basePrompt}\n视角镜头：28mm广角俯拍。确保地毯作为画面的核心延伸，展现产品与空间的完整融合，地毯边缘与地面衔接极其自然。`;
  } else {
    return `环境背景：${basePrompt}\n视角镜头：85mm微距斜侧切。聚焦于地毯转角处的厚度感与材质肌理，家具支脚在毯面产生微微下陷的物理真实效果。`;
  }
};

export const constructPromptPair = (
  style: RoomStyle,
  rugMaterial: RugMaterial,
  advancedPrompt: string,
  inputType: InputType,
  hasReferenceImage: boolean,
  customStyleText = '',
  customMaterialText = ''
): string[] => {
  const materialInfo = getMaterialDescription(rugMaterial, customMaterialText);
  const trimmedCustomStyle = customStyleText.trim();
  const customStyleFallback = "【自定义场景】现代高端家居空间，保留真实自然光与清晰地毯材质细节。";
  const resolvedCustomStyle = trimmedCustomStyle || customStyleFallback;
  const inputInstruction = inputType === InputType.FLAT_DESIGN
    ? "【设计图转写实】将平面图渲染为带厚度和质感的真实地毯。"
    : "【实拍修正】保持图案一致，将其自然嵌入环境地面。";

  const commonHeader = `### 任务：地毯商业摄影级渲染（系列图一致性要求）
${inputInstruction}
${materialInfo}
构图：地毯平铺，家具腿部需产生精准的接触阴影，消除漂浮感。
${hasReferenceImage ? "【风格参考】严格克隆附件二的装修风格、光影和配色。" : ""}`;

  const commonFooter = `
要求：极致真实，杜绝塑料感。${advancedPrompt ? `\n【用户指令】：${advancedPrompt}` : ''}`;

  return [
    `${commonHeader}\n【视角A：空间展示】\n${style === RoomStyle.CUSTOM ? resolvedCustomStyle : getStyleDetailedPrompt(style, true)}\n${commonFooter}`,
    `${commonHeader}\n【视角B：材质细节】\n${style === RoomStyle.CUSTOM ? resolvedCustomStyle : getStyleDetailedPrompt(style, false)}\n${commonFooter}`
  ];
};

export const generateRugSceneFromPrompt = async (
  rugBase64: string,
  prompt: string,
  aspectRatio: AspectRatio,
  imageSize: ImageSize,
  referenceImageBase64: string | null,
  seed: number
): Promise<string> => {
  const isHighRes = imageSize === '2K';

  const parts: any[] = [
    { inlineData: { data: rugBase64, mimeType: 'image/jpeg' } }
  ];
  if (referenceImageBase64) {
    parts.push({ inlineData: { data: referenceImageBase64, mimeType: 'image/jpeg' } });
  }
  parts.push({ text: prompt });

  const response = await generateContent({
    model: GEMINI_IMAGE_MODEL,
    task: 'image_gen',
    contents: { parts },
    config: {
      imageConfig: { aspectRatio: aspectRatio as any, imageSize: isHighRes ? imageSize : undefined },
      seed: seed
    }
  });

  const part = response.candidates?.[0]?.content?.parts.find((p: any) => p.inlineData);
  if (part?.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
  throw new Error("生成失败，请重试");
};

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
  });
};
