import { generateContent, extractImageFromResponse } from "../../../shared_services/geminiProxyService";

// Utility to convert a File object to a base64 string
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = (error) => reject(error);
  });
};

export const sceneDescriptions: { [key: string]: string } = {
  'Outdoor': '在风景优美的户外地点，如公园或海滩，时间为黄金时段。模特穿着时尚的工装、冲锋衣或运动服。',
  'Street': '在具有有趣建筑的现代化城市街道上。',
  'Driving': '正在驾驶或坐在一辆豪华敞篷车里。',
  'Fishing': '在宁静的湖边或河边钓鱼，风格时尚而放松。模特穿着时尚的工装、冲锋衣或运动服。',
  'Climbing': '正在进行户外攀岩，背景是壮丽的岩壁和自然风光。模特穿着专业的工装、冲锋衣或运动服。',
  'Hiking': '正在山间小径上徒步，周围是茂密的森林或开阔的山景。模特穿着专业的工装、冲锋衣或运动服。'
};

export const generateModelImage = async (
  file: File,
  prompt: string,
  aspectRatio: string,
  seed: string
): Promise<string[]> => {
  try {
    const base64Image = await fileToBase64(file);
    const numericSeed = parseInt(seed, 10);
    if (isNaN(numericSeed)) {
      throw new Error("随机种子必须是一个有效的数字。");
    }

    // 在提示词中明确强调宽高比要求（在开头和结尾都强调，确保严格遵守）
    // 使用更强烈的语言和重复强调，确保大模型严格遵守比例要求
    // 注意：prompt 中已经包含了 aspectRatio，这里再次强调以确保严格遵守
    const aspectRatioEmphasisStart = `【强制要求 - 最重要】图片宽高比必须严格为 ${aspectRatio}，这是最关键的约束条件，必须严格遵守。`;
    const aspectRatioEmphasisEnd = `【最终确认】生成的图片宽高比必须严格为 ${aspectRatio}，不允许有任何偏差。请确保构图、布局和画面裁剪完全符合此比例要求。如果比例不正确，图片将被视为失败。`;
    const enhancedPrompt = `${aspectRatioEmphasisStart}\n\n${prompt}\n\n${aspectRatioEmphasisEnd}`;
    
    // 为每张图片创建独立的请求对象，确保提示词完全一致
    // 使用相同的 enhancedPrompt，确保两张图片都收到相同的比例强调
    const createRequest = (seedValue: number) => ({
      model: "gemini-3.1-flash-image-preview",
      task: "image_gen" as const,
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image,
              mimeType: file.type,
            },
          },
          { text: enhancedPrompt },
        ],
      },
      config: {
        seed: seedValue,
        imageConfig: {
          aspectRatio: aspectRatio,
        },
      }
    });

    const request1 = createRequest(numericSeed);
    const request2 = createRequest(numericSeed + 1);

    // Generate two images in parallel
    const [response1, response2] = await Promise.all([
      generateContent(request1),
      generateContent(request2)
    ]);

    const imageUrl1 = extractImageFromResponse(response1);
    const imageUrl2 = extractImageFromResponse(response2);

    const validUrls = [imageUrl1, imageUrl2].filter((url): url is string => url !== null);

    if (validUrls.length < 2) {
      throw new Error("未能成功生成两张图片，请重试。");
    }

    return validUrls;
  } catch (error: any) {
    console.error("Error generating image with Gemini:", error);
    if (error instanceof Error && error.message.includes("API key")) {
      throw new Error("API密钥无效或已过期。请检查您的API密钥设置。");
    }
    throw new Error("生成图片失败。请稍后重试。");
  }
};

