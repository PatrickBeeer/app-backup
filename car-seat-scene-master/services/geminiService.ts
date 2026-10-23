import { generateContent, extractImageFromResponse } from '../../../shared_services/geminiProxyService';
import { SceneCategory } from '../types';

const COMMON_PROMPT_RULES = `
**核心要求:**
1.  **车型选择:** 必须从奔驰、宝马、奥迪系列中选择，确保内饰风格和档次与坐垫产品保持一致。
2.  **场景识别:** 准确判断图片中是前排座椅还是后排座椅。
3.  **座椅布局:**
    *   如果图片是**前排**坐垫，生成的场景中必须清晰展示**两个**前排座椅。
    *   如果图片是**后排**坐垫，生成的场景中必须展示**完整的后排座位**（通常是一体式长椅）。
    *   绝对避免出现座位数量错误、布局不合理等基本错误。
4.  **无缝融合:** 确保坐垫完美地融入车内环境，光线、阴影和角度看起来自然、和谐。
5.  **产品保护:** 绝对不能改变坐垫本身的任何细节，包括外观、形状、颜色或纹理。
6.  **图片规格:** 最终输出的完整图片比例必须是 3:4，以符合中国主流电商平台的要求。
7.  **图片质量:** 生成的图片必须是高质量的，不包含任何水印、角标或模型生成的无关文本。
`;

const PROMPT_STANDARD_BASE = `请为这张汽车坐垫产品图生成一个真实的、高端的汽车内部环境作为背景。这是常规视角。`;
const PROMPT_CONVERTIBLE_BASE = `请为这张汽车坐垫产品图生成一个**敞篷车特效**图。需要将车辆设置为**不带车顶的敞篷状态**，背景是**时尚的街道或者摩登城市**，营造出一种高端、潮流的感觉。`;

export const DEFAULT_PROMPTS = {
  standard: PROMPT_STANDARD_BASE,
  convertible: PROMPT_CONVERTIBLE_BASE,
};

/**
 * 将文件转换为生成式 AI 所需的格式
 */
export const fileToGenerativePart = async (file: File): Promise<{ data: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // 移除 data URL 前缀 (例如 "data:image/jpeg;base64,")
      const base64Data = base64String.split(',')[1];
      resolve({
        data: base64Data,
        mimeType: file.type
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * 生成单张图片
 */
const generateSingleImage = async (
  imagePart: { data: string; mimeType: string },
  prompt: string
): Promise<string | null> => {
  try {
    // 在提示词中明确强调宽高比要求
    const enhancedPrompt = `${prompt}\n\n重要提示：生成的图片宽高比必须严格为 3:4，请确保构图和布局完全符合此比例要求。`;
    
    const response = await generateContent({
      model: 'gemini-3.1-flash-image-preview',
      task: 'image_gen',
      contents: {
        parts: [
          {
            inlineData: {
              data: imagePart.data,
              mimeType: imagePart.mimeType,
            },
          },
          {
            text: enhancedPrompt,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: '3:4', // 固定为 3:4 比例
        },
      },
    });

    const imageUrl = extractImageFromResponse(response);
    return imageUrl;
  } catch (error) {
    console.error('生成图片失败:', error);
    return null;
  }
};

/**
 * 生成多张图片（2张同风格，不同视角）
 */
export const generateImages = async (
  file: File,
  prompts: typeof DEFAULT_PROMPTS,
  category: SceneCategory
): Promise<string[]> => {
  try {
    const imagePart = await fileToGenerativePart(file);
    const basePrompt = prompts[category];
    
    // 生成2张不同视角的图片
    const fullPrompts = [
      `${basePrompt} ${COMMON_PROMPT_RULES}`,
      `${basePrompt} 请使用一个略微不同的视角或光照。 ${COMMON_PROMPT_RULES}`
    ];
    
    const promises = fullPrompts.map(prompt => generateSingleImage(imagePart, prompt));
    const results = await Promise.all(promises);
    
    // 过滤掉失败的生成
    return results.filter((url): url is string => url !== null);
  } catch (error) {
    console.error('生成图片失败:', error);
    throw error;
  }
};

