import type { UserInput, GeneratedImage } from "../types";
import { fileToGenerativePart } from '../utils/fileUtils';
import { generateContent, extractTextFromResponse, extractImageFromResponse } from "../../../shared_services/geminiProxyService";
import { cacheGeneratedAsset } from "../../../shared_services/localGeneratedAssetCache";

const TEXT_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const IMAGE_MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableGenerationError(error: unknown): boolean {
  const message = String((error as any)?.message || '').toLowerCase();
  if (!message) {
    return false;
  }

  return (
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('524') ||
    message.includes('json') ||
    message.includes('unexpected end') ||
    message.includes('返回空响应') ||
    message.includes('网关错误') ||
    message.includes('bad gateway') ||
    message.includes('timeout') ||
    message.includes('unavailable')
  );
}

async function generateImageForAspectRatio(
  imageParts: any[],
  generatedPrompt: string,
  aspectRatio: string,
): Promise<string> {
  const textPart = {
    text: `Based on the provided product image(s), create a high-quality, photorealistic 3D rendered e-commerce promotional poster using the following detailed instructions. The poster should look like it was made with C4D or Blender.

    **CRITICAL RULE 1:** The product shown in the generated poster MUST be the exact same product from the user's uploaded image(s). Do not change its shape, color, branding, packaging, or any details. It should look like you took the original product photo and placed it into a new, beautifully rendered 3D scene.

    **CRITICAL RULE 2:** The final image must be clean, professional, and completely free of any extraneous text, watermarks, signatures, logos, corner markers, or any artifacts that are not part of the core poster design.

    **CRITICAL RULE 3:** The generated image aspect ratio must be strictly ${aspectRatio}. Please ensure the composition and layout fully comply with this aspect ratio requirement.

    Instructions:
    ${generatedPrompt}`
  };

  let lastError: unknown;
  for (let attempt = 0; attempt <= IMAGE_MAX_RETRIES; attempt += 1) {
    try {
      const imageResponse = await generateContent({
        model: IMAGE_MODEL,
        task: 'image_gen',
        billing_task: 'image_gen',
        contents: { parts: [...imageParts, textPart] },
        config: {
          imageConfig: {
            aspectRatio,
          },
        },
      });

      const url = extractImageFromResponse(imageResponse);
      if (!url) {
        throw new Error(`No image found in response for aspect ratio ${aspectRatio}.`);
      }
      if (!url.startsWith('data:image/')) {
        throw new Error(`Invalid image URL format for aspect ratio ${aspectRatio}.`);
      }
      cacheGeneratedAsset({ appId: 'promo-poster-designer-v2', source: url, provider: IMAGE_MODEL, title: aspectRatio });
      return url;
    } catch (error) {
      lastError = error;
      const shouldRetry = attempt < IMAGE_MAX_RETRIES && isRetryableGenerationError(error);
      if (!shouldRetry) {
        console.error(`生成图片失败 (${aspectRatio})，已重试 ${attempt} 次:`, error);
        throw error;
      }

      const delayMs = (attempt + 1) * 1000;
      console.log(`生成图片失败 (${aspectRatio})，${attempt + 1}/${IMAGE_MAX_RETRIES + 1} 次尝试，${delayMs}ms 后重试...`);
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`生成图片失败 (${aspectRatio})`);
}

const getMasterPrompt = (userInput: UserInput): string => `
# Role and Goal
You are a professional "E-commerce Visual Design Intelligent Assistant". Your sole purpose is to generate a detailed, creative, and effective prompt for creating a "Promotion Atmosphere Poster". This prompt will be used by a 3D rendering software like C4D, so it must be descriptive and specific.

## Core Task
Based on the user's input (product image context, titles), you must generate a poster creation prompt.

### Output Requirements
The generated prompt MUST follow this exact structure and include these three key sections:
1.  **Subject (Product):** How the product is presented.
2.  **Atmosphere (Background + Decoration):** The overall scene and mood.
3.  **Text (Main Title + Subtitle + Activity Time):** All textual elements on the poster.

## Detailed Instructions for Prompt Generation

### 1. Subject Description
- The product must be the hero. Place it in the center, make it look appealing.
- Describe a dynamic action: Is it splashing, floating, glowing, emerging from a gift box?
- Connect the action to the product's core attribute. Examples:
  - Drinks: cool, refreshing splashes, condensation.
  - Skincare: luxurious, glowing, smooth textures.
  - Food: lively, traditional, festive, ingredients floating around it.

### 2. Atmosphere Description
- **Background:** Choose a context-appropriate background. Examples: idyllic pasture for milk, snowy mountain for a winter drink, dreamy garden for perfume, bustling street for a snack. The background should be inspired by the main title and product.
- **Decorative Elements:** Add elements that enhance the theme. Examples: coupons, ribbons, gold coins, flower petals, ice cubes, balloons.
- **Lighting & Color:** Describe the lighting and color palette. Examples: high saturation, soft focus filter, dramatic lighting, specific color schemes.

### 3. Text Description
- **Main Title:** Positioned at the top. Describe a compelling font style. Examples: bold 3D text, elegant calligraphy, crystal texture. The text itself should be catchy and related to the promotion.
- **Subtitle:** Clearly state the secondary message. Place it on a ribbon, banner, or a distinct design element.
- **Footer Text:** Include any other relevant information to create context or urgency.

## Final Output Format
You MUST structure your final response using the following template. Do not add any extra explanations or conversational text. Just fill in the template.

**Template:**
\`使用C4D进行3D建模渲染，制作一张电商促销海报。画面中心展示{产品信息}，以{动态表现}形式呈现，突出{产品卖点}。背景构建{场景氛围}，环绕{装饰元素}，整体色调为{色彩方案}，运用{光效表现}。海报上方用{字体风格}大标题呈现"{主标题文案}"，下方副标题"{优惠信息}"，底部写"{活动时间/倒计时}"。整体营造{氛围关键词}，体现电商大促的张力。\`

---

## User's Input for Today's Task:
- **Main Title:** ${userInput.mainTitle}
- **Subtitle:** ${userInput.subtitle}
- **Other Information:** ${userInput.otherInfo}
- **(Note: The user has provided 1-3 product images which should inform your description of the product, but do not mention the image files themselves in the output.)**

Generate the prompt now.
`;

export interface ImageGenerationResult {
  aspectRatio: string;
  url: string | null;
  success: boolean;
  error?: string;
}

export const generatePromptAndImages = async (
  userInput: UserInput,
  onImageGenerated: (image: GeneratedImage) => void
): Promise<ImageGenerationResult[]> => {
  if (userInput.productImages.length === 0) {
    throw new Error('Product image is required.');
  }

  let generatedPrompt = '';
  try {
    const response = await generateContent({
      model: TEXT_MODEL,
      task: 'text_gen',
      billing_task: 'text_gen',
      contents: {
        parts: [{ text: getMasterPrompt(userInput) }],
      },
    });
    generatedPrompt = extractTextFromResponse(response);
    if (!generatedPrompt) {
      throw new Error('Failed to generate prompt. The response was empty.');
    }
  } catch (error: any) {
    console.error('生成提示词失败:', error);
    throw error;
  }

  const imageParts = await Promise.all(
    userInput.productImages.map((file) => fileToGenerativePart(file))
  );
  
  // Step 2: Generate images for each aspect ratio in parallel
  const imageGenerationPromises = userInput.aspectRatios.map(async (aspectRatio): Promise<ImageGenerationResult> => {
    try {
      const imageUrl = await generateImageForAspectRatio(imageParts, generatedPrompt, aspectRatio);

      if (!imageUrl) {
        throw new Error(`No image found for aspect ratio ${aspectRatio}.`);
      }

      // 通知 UI 更新
      onImageGenerated({ aspectRatio, url: imageUrl, loading: false });
      
      return {
        aspectRatio,
        url: imageUrl,
        success: true
      };
    } catch (error: any) {
      console.error(`Failed to generate image for aspect ratio ${aspectRatio}:`, error);
      const errorMessage = error.message || '生成失败';
      
      // 通知 UI 更新（失败状态）
      onImageGenerated({ aspectRatio, url: null, loading: false });
      
      return {
        aspectRatio,
        url: null,
        success: false,
        error: errorMessage
      };
    }
  });

  const results = await Promise.all(imageGenerationPromises);
  return results;
};
