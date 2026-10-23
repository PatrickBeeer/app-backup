import { GenerationType } from '../types';
import { fileToGenerativePart } from '../utils/fileUtils';
import { generateContent, extractImageFromResponse } from '../../../shared_services/geminiProxyService';
import { cacheGeneratedAsset } from '../../../shared_services/localGeneratedAssetCache';

const basePrompts = {
  [GenerationType.Model]: `Generate a photorealistic lifestyle image for an e-commerce website. [CHILD_DESCRIPTION] is sleeping comfortably in a cozy, well-lit bed, resting their head on THIS pillow. The focus should be on the child's peaceful sleep and the comfort of the pillow. The pillow's design, color, and shape must be preserved exactly as in the original image. The overall mood should be warm, safe, and inviting.`,
  [GenerationType.Scene]: `Generate a photorealistic scene for an e-commerce website. Place THIS pillow in a beautifully styled, modern children's bedroom. The pillow should be the centerpiece, perhaps placed on a neatly made bed or a stylish chair in a reading nook. The room should be bright, clean, and aspirational for parents. The pillow's design, color, and shape must be preserved exactly as in the original image. Avoid showing any people.`,
};

export async function generateImage(
  file: File, 
  type: GenerationType, 
  modelAge: string, 
  modelEthnicity: string, 
  aspectRatio: string,
  seed: string
): Promise<string[]> {
  const imagePart = await fileToGenerativePart(file);
  
  let prompt = basePrompts[type];

  if (type === GenerationType.Model) {
    const ageMapping: { [key: string]: string } = {
        '0-3岁': 'between 0-3 years old',
        '3-5岁': 'between 3-5 years old',
        '6-8岁': 'between 6-8 years old',
        '9-12岁': 'between 9-12 years old',
        '12-15+岁': '12-15 years old or older'
    };
    const ethnicityMapping: { [key: string]: string } = {
        '亚洲人': 'of East Asian descent',
        '白种人': 'of Caucasian descent',
        '非洲裔': 'of African descent',
        '拉丁裔': 'of Latino/Hispanic descent'
    };
    
    let childDescription = "A happy child";
    let modelDetails = [];
    if (ageMapping[modelAge]) {
        modelDetails.push(`${ageMapping[modelAge]}`);
    }
     if (ethnicityMapping[modelEthnicity]) {
        modelDetails.push(`${ethnicityMapping[modelEthnicity]}`);
    }

    if (modelDetails.length > 0) {
      childDescription += ` (${modelDetails.join(', ')})`;
    }
    
    prompt = prompt.replace('[CHILD_DESCRIPTION]', childDescription);
  }

  const generateSingleImage = async (seedValue: number): Promise<string> => {
    const response = await generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: {
        parts: [
          imagePart,
          { text: prompt }
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio,
        },
        seed: seedValue,
      },
    });

    const imageUrl = extractImageFromResponse(response);
    if (!imageUrl) {
      throw new Error('No image data found in the API response.');
    }

    cacheGeneratedAsset({ appId: 'pillow-maternal-model-scene', source: imageUrl, provider: 'gemini-3.1-flash-image-preview', title: type });
    return imageUrl;
  };

  try {
    const baseSeed = parseInt(seed, 10) || Math.floor(Math.random() * 1000000);
    const imagePromises = [
      generateSingleImage(baseSeed),
      generateSingleImage(baseSeed + 1)
    ];
    const results = await Promise.all(imagePromises);
    return results;

  } catch (error) {
    console.error("Error generating image:", error);
    throw new Error("生成图片失败。请查看控制台获取更多信息。");
  }
}

