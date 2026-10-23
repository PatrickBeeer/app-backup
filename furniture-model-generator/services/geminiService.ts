import { generateContent, extractImageFromResponse } from '../../../shared_services/geminiProxyService';
import type { ModelOptions } from '../types';

const MODEL_IDS = {
  text: 'gemini-3-flash-preview',
  image: 'gemini-3.1-flash-image-preview',
  video: 'veo_3_1',
} as const;

/**
 * 将文件转换为 base64
 */
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * 生成单张图片
 */
const generateSingleImage = async (
  base64Image: string,
  mimeType: string,
  furnitureType: string,
  options: ModelOptions,
  variationPrompt: string = ''
): Promise<string> => {
  const model = MODEL_IDS.image;
  
  let modelPromptSegment = '';
  const ethnicity = options.ethnicity;
  const article = ['Asian'].includes(ethnicity) ? 'an' : 'a';

  if (options.age.includes('family')) {
    modelPromptSegment = `${article} ${ethnicity} family with a young child`;
  } else if (options.age.includes('child')) {
    const genderWord = options.gender === 'a boy' ? 'young boy' : 'young girl';
    modelPromptSegment = `${article} ${ethnicity} ${genderWord} (around 5-10 years old)`;
  } else if (options.gender.includes('couple')) {
    modelPromptSegment = `${article} ${ethnicity} couple (man and woman) who are ${options.age}`;
  } else {
    modelPromptSegment = `${article} ${ethnicity} ${options.gender.replace('a ', '')} who is ${options.age}`;
  }

  const prompt = `
    You are an expert photo editor for an e-commerce furniture store. 
    Your task is to realistically add a model to this product image.
    **Crucially, you MUST NOT change the original furniture, background, or any other object in the image in any way.**
    Only add the specified person.
    The furniture in the image is a ${furnitureType}.
    Add ${modelPromptSegment}.
    The model should be ${options.pose}.
    The model's overall clothing and appearance should be ${options.style}.
    Place the model naturally in the scene, interacting with or positioned realistically near the furniture. 
    Ensure the added model's lighting, shadows, perspective, and scale perfectly match the original image to create a photorealistic and seamless composition.
    The final image should look like a real photograph.
    ${variationPrompt}
    Return only the modified image.
  `;

  const response = await generateContent({
    model: model,
    task: 'image_gen',
    contents: {
      parts: [
        {
          inlineData: {
            data: base64Image,
            mimeType: mimeType,
          },
        },
        {
          text: prompt,
        },
      ],
    },
    config: {},
  });

  const imageUrl = extractImageFromResponse(response);
  if (!imageUrl) {
    throw new Error('API 响应中未找到图片数据。');
  }

  // 返回 base64 数据（不含 data URL 前缀）
  const base64Data = imageUrl.split(',')[1];
  return base64Data;
};

/**
 * 为家具图片添加模特（生成2张）
 */
export const addModelToImage = async (
  imageFile: File,
  furnitureType: string,
  options: ModelOptions
): Promise<string[]> => {
  const base64Image = await fileToBase64(imageFile);

  // 并行生成2张图片
  const promise1 = generateSingleImage(base64Image, imageFile.type, furnitureType, options);
  const promise2 = generateSingleImage(
    base64Image,
    imageFile.type,
    furnitureType,
    options,
    "Create a slightly different variation of the pose or model's expression."
  );

  const results = await Promise.all([promise1, promise2]);
  
  if (results.length < 2 || !results[0] || !results[1]) {
    throw new Error('生成图片失败：未能生成完整的2张图片。');
  }

  return results;
};

