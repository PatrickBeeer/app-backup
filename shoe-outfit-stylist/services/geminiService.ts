import type { ImageData, GenerationOptions } from "../types";
import { generateContent, extractImageFromResponse } from "../../../shared_services/geminiProxyService";

// 使用 gemini-3.1-flash-image-preview 模型（通过 NewAPI 服务）
const MODEL_NAME = 'gemini-3.1-flash-image-preview';

const cleanBase64 = (b64: string) => {
  return b64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
};

const getMimeType = (b64: string) => {
  const match = b64.match(/^data:image\/(png|jpeg|jpg|webp);base64,/);
  return match ? `image/${match[1]}` : 'image/jpeg';
};

const generateSingleImage = async (
  imageParts: any[],
  text: string,
  aspectRatio: GenerationOptions['aspectRatio'],
  seed: GenerationOptions['seed']
): Promise<string> => {
  console.log('[鞋子穿搭AI-服务层] generateSingleImage 调用 - 参数:', {
    aspectRatio,
    seed,
    imagePartsCount: imageParts.length,
    originalPromptLength: text.length
  });
  
  // 在提示词中明确强调宽高比要求（在开头和结尾都强调，确保严格遵守）
  // 使用多重强调和具体说明，确保模型严格遵守比例要求
  const aspectRatioEmphasisStart = `【⚠️ 强制要求 - 最高优先级】图片的宽高比必须严格为 ${aspectRatio}。这是最关键的约束条件，必须严格遵守。生成的图片必须是 ${aspectRatio} 比例，不允许有任何偏差。`;
  const aspectRatioEmphasisMiddle = `【重要提醒】请确保生成的图片宽高比严格为 ${aspectRatio}。构图、布局、画面裁剪都必须完全符合 ${aspectRatio} 的比例要求。`;
  const aspectRatioEmphasisEnd = `【最终确认 - 必须遵守】生成的图片宽高比必须严格为 ${aspectRatio}，不允许有任何偏差。如果比例不正确，图片将被视为失败。请确保构图、布局和画面裁剪完全符合 ${aspectRatio} 比例要求。`;
  const enhancedPrompt = `${aspectRatioEmphasisStart}\n\n${text}\n\n${aspectRatioEmphasisMiddle}\n\n${aspectRatioEmphasisEnd}`;
  const parts = [...imageParts, { text: enhancedPrompt }];
  
  // 确保 aspectRatio 是字符串类型
  const aspectRatioValue = String(aspectRatio);
  console.log('[鞋子穿搭AI-服务层] aspectRatio 值检查:', {
    original: aspectRatio,
    stringified: aspectRatioValue,
    type: typeof aspectRatio
  });
  
  const requestConfig = {
    model: MODEL_NAME,
    task: 'image_gen' as const,
    contents: { parts },
    config: {
      seed: seed,
      imageConfig: {
        aspectRatio: aspectRatioValue,
      },
    },
  };
  
  console.log('[鞋子穿搭AI-服务层] 准备发送 API 请求 - 完整 config:', JSON.stringify(requestConfig.config, null, 2));
  console.log('[鞋子穿搭AI-服务层] aspectRatio 通过 imageConfig 传递，值为:', aspectRatioValue);
  
  const response = await generateContent(requestConfig);

  const imageUrl = extractImageFromResponse(response);
  if (!imageUrl) {
    throw new Error('API 响应中未找到图片部分。');
  }

  return imageUrl;
};

export const generateShoeImage = async (
  imagesData: ImageData[],
  options: GenerationOptions
): Promise<string[]> => {
  console.log('[鞋子穿搭AI-服务层] generateShoeImage 调用 - 接收到的选项:', {
    aspectRatio: options.aspectRatio,
    generationType: options.generationType,
    seed: options.seed,
    imageCount: imagesData.length,
    customPromptLength: options.customPrompt.length
  });
  
  const imageParts = imagesData.map(imageData => {
    const base64Data = cleanBase64(imageData.base64);
    return {
      inlineData: {
        data: base64Data,
        mimeType: imageData.mimeType || getMimeType(imageData.base64),
      },
    };
  });
  
  const prompt1 = options.customPrompt;
  const prompt2 = `${options.customPrompt}\n\n请生成一张风格迥异的图片：尝试不同的背景、光照、构图和氛围。`;

  try {
    console.log('[鞋子穿搭AI-服务层] 开始并行生成两张图片，aspectRatio:', options.aspectRatio);
    const [result1, result2] = await Promise.all([
      generateSingleImage(imageParts, prompt1, options.aspectRatio, options.seed),
      generateSingleImage(imageParts, prompt2, options.aspectRatio, options.seed + 1),
    ]);
    console.log('[鞋子穿搭AI-服务层] 图片生成完成:', {
      result1Length: result1?.length || 0,
      result2Length: result2?.length || 0
    });
    return [result1, result2].filter((r): r is string => !!r);
  } catch (error) {
    console.error("调用 Gemini API 时出错:", error);
    throw new Error("生成图片失败。请查看控制台获取更多详情。");
  }
};

