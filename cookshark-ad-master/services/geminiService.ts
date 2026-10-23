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

const sceneDescriptions: { [key: string]: string } = {
  'Outdoor': '在风景优美的户外地点，如公园或海滩，时间为黄金时段。',
  'Street': '在具有有趣建筑的现代化城市街道上。',
  'Driving': '正在驾驶或坐在一辆豪华敞篷车里。',
  'Fishing': '在宁静的湖边或河边钓鱼，风格时尚而放松。',
  'Climbing': '正在进行户外攀岩，背景是壮丽的岩壁和自然风光。',
  'Hiking': '正在山间小径上徒步，周围是茂密的森林或开阔的山景。'
};

export const generateModelImage = async (file: File, gender: string, scene: string, aspectRatio: string): Promise<string[]> => {
  const base64Image = await fileToBase64(file);
  const sceneDescription = sceneDescriptions[scene] || '在高端时尚环境中。';

  const basePrompt = `请创作一张逼真的时尚广告图片。图片中要有一位时尚的${gender === 'Female' ? '女性' : '男性'}模特，年龄在20多岁末或30多岁初，具有别致、精致的欧美外观。模特需要自信地佩戴所提供的太阳镜。场景应为${sceneDescription}光线应专业，突出模特的特征和太阳镜的细节。整体氛围应优雅、酷炫且令人向往。`;
  
  // 在提示词中明确强调宽高比要求
  const enhancedPrompt = `${basePrompt}\n\n重要提示：生成的图片宽高比必须严格为 ${aspectRatio}，请确保构图和布局完全符合此比例要求。`;

  const parts = [
    {
      inlineData: {
        data: base64Image,
        mimeType: file.type,
      },
    },
    { text: enhancedPrompt },
  ];

  try {
    // Generate two images.
    const [response1, response2] = await Promise.all([
      generateContent({
        model: "gemini-3.1-flash-image-preview",
        task: "image_gen",
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio,
          },
        }
      }),
      generateContent({
        model: "gemini-3.1-flash-image-preview",
        task: "image_gen",
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio,
          },
        }
      })
    ]);
    
    const imageUrl1 = extractImageFromResponse(response1);
    const imageUrl2 = extractImageFromResponse(response2);
    
    const validUrls = [imageUrl1, imageUrl2].filter((url): url is string => url !== null);

    if (validUrls.length < 2) {
      throw new Error("未能成功生成两张图片，请重试。");
    }

    return validUrls;
  } catch (error: any) {
    console.error('生成模特图片失败:', error);
    throw error;
  }
};
