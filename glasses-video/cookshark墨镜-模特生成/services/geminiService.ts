import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.GEMINI_IMAGE_API_KEY || process.env.API_KEY;
const API_BASE_URL = process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com';

if (!API_KEY) {
  throw new Error("API_KEY environment variable is not set.");
}

const ai = new GoogleGenAI({
  apiKey: API_KEY,
  httpOptions: {
    baseUrl: API_BASE_URL,
    apiVersion: 'v1beta',
  },
});
const model = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image-preview";

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

const extractImageUrl = (response: any): string | null => {
    for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
            const base64String = part.inlineData.data;
            const mimeType = part.inlineData.mimeType;
            return `data:${mimeType};base64,${base64String}`;
        }
    }
    return null;
}

export const generateModelImage = async (file: File, prompt: string, aspectRatio: string, seed: string): Promise<string[]> => {
  try {
    const base64Image = await fileToBase64(file);
    const numericSeed = parseInt(seed, 10);
    if (isNaN(numericSeed)) {
      throw new Error("随机种子必须是一个有效的数字。");
    }
    
    const baseRequest = {
        model: model,
        contents: {
            parts: [
                {
                    inlineData: {
                        data: base64Image,
                        mimeType: file.type,
                    },
                },
                { text: prompt },
            ],
        },
        config: {
            imageConfig: {
                aspectRatio: aspectRatio,
            },
        }
    };
    
    const request1 = { ...baseRequest, config: { ...baseRequest.config, seed: numericSeed } };
    const request2 = { ...baseRequest, config: { ...baseRequest.config, seed: numericSeed + 1 } };
    
    // Generate two images in parallel
    const [response1, response2] = await Promise.all([
        ai.models.generateContent(request1),
        ai.models.generateContent(request2)
    ]);
    
    const imageUrl1 = extractImageUrl(response1);
    const imageUrl2 = extractImageUrl(response2);
    
    const validUrls = [imageUrl1, imageUrl2].filter((url): url is string => url !== null);

    if (validUrls.length < 2) {
        throw new Error("未能成功生成两张图片，请重试。");
    }

    return validUrls;

  } catch (error) {
    console.error("Error generating image with Gemini:", error);
    if (error instanceof Error && /401|403|invalid token|unauthorized|api key/i.test(error.message)) {
         throw new Error("API密钥无效或已过期。请检查您的API密钥设置。");
    }
    throw new Error("生成图片失败。请稍后重试。");
  }
};
