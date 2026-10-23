import { TryOnRequest } from "../types";
import { generateContent, extractImageFromResponse } from "../../../shared_services/geminiProxyService";

export const generateTryOn = async (request: TryOnRequest): Promise<string> => {
  const { clothingImage, modelImage, garmentCategory, backgroundStyle, aspectRatio, isProductFocus, customPrompt } = request;

  const parts: any[] = [];

  // Define category-specific styling instructions
  const categoryInstructions: Record<string, string> = {
    'tops': "The input image is a Top. Dress the model in this exact top. You must GENERATE matching bottoms (pants, skirt, or shorts) and shoes that perfectly complement the style of the top.",
    'bottoms': "The input image is a Bottom (Pants/Skirt). Dress the model in these exact bottoms. You must GENERATE a matching top (shirt, blouse, or t-shirt) and shoes to complete the outfit.",
    'outerwear': "The input image is Outerwear (Jacket/Coat). Dress the model in this exact outerwear. CRITICAL: You must GENERATE a stylish inner top and matching bottoms that coordinate with the jacket. Do not leave the model bare underneath unless it's a closed coat.",
    'dresses': "The input image is a full-body Dress or Suit. Dress the model in this exact item. Focus on generating matching shoes and accessories.",
    'outfits': "The input image is a complete Outfit/Set (Top + Bottoms + Accessories like shoes/bags/glasses). Dress the model in ALL these items exactly as shown. Preserve the entire look and coordination found in the input image. Do not replace the main items, but ensure they fit naturally on the model.",
  };

  // Define background instructions
  const backgroundInstructions: Record<string, string> = {
    'studio': "A clean, professional e-commerce studio background. Neutral colors (white or light grey). Soft, even lighting to highlight product details.",
    'urban': "A stylish blurred city street background. Natural daylight, street-style fashion photography vibe.",
    'nature': "A soft outdoor nature background (park or garden). Natural sunlight, fresh and organic vibe.",
    'luxury': "A high-end luxury interior or boutique background. Elegant lighting, sophisticated atmosphere.",
    'beach': "A sunny beach or resort background. Bright, vacation vibe.",
  };

  // Define Framing/Camera instructions based on focus mode
  let framingInstruction = "CAMERA: Full body shot showing the complete outfit including shoes. The model should be fully visible within the frame.";
  if (isProductFocus) {
    if (garmentCategory === 'tops' || garmentCategory === 'outerwear') {
      framingInstruction = "CAMERA: Medium shot / Waist-up portrait. Focus intensely on the upper body and the details of the clothing item. Crop slightly below the waist. Do not show the full legs.";
    } else if (garmentCategory === 'bottoms') {
      framingInstruction = "CAMERA: Medium shot / Waist-down. Focus intensely on the lower body, pants/skirt and shoes. Crop at the waist. Do not show the model's face or upper chest.";
    } else if (garmentCategory === 'dresses' || garmentCategory === 'outfits') {
      framingInstruction = "CAMERA: Three-quarter shot (Knees up). Focus on the outfit details and fabric texture.";
    }
  }

  const styleInstruction = categoryInstructions[garmentCategory] || "Generate a complete outfit based on the input.";
  const envInstruction = backgroundInstructions[backgroundStyle] || backgroundInstructions['studio'];

  let prompt = "";

  if (modelImage) {
    // Add Model Image First
    const modelBase64 = modelImage.base64Data.includes(',') ? modelImage.base64Data.split(',')[1] : modelImage.base64Data;
    parts.push({
      inlineData: {
        mimeType: modelImage.mimeType,
        data: modelBase64,
      },
    });

    // Add Clothing Image Second
    const clothingBase64 = clothingImage.base64Data.includes(',') ? clothingImage.base64Data.split(',')[1] : clothingImage.base64Data;
    parts.push({
      inlineData: {
        mimeType: clothingImage.mimeType,
        data: clothingBase64,
      },
    });

    prompt = customPrompt || `
      Act as a professional fashion stylist and photo editor.
      
      Input 1: Target Model.
      Input 2: Clothing Item (Category: ${garmentCategory}).
      
      Goal: Dress the model in the clothing item from Input 2 while generating a cohesive, stylish look for an e-commerce listing.

      Instructions:
      1. FIT: Place the clothing (Input 2) naturally on the model (Input 1), preserving the model's pose and body shape.
      2. STYLING: ${styleInstruction} Ensure the colors and textures of the generated parts match the uploaded item perfectly.
      3. ENVIRONMENT: If the original model background is cluttered, replace it with: ${envInstruction}. If the original background is good, keep it but improve lighting.
      4. FRAMING: ${framingInstruction}
      5. QUALITY: Photorealistic, high-resolution, correct fabric physics (folds, drapes).
    `;
  } else {
    // Only Clothing Image
    const clothingBase64 = clothingImage.base64Data.includes(',') ? clothingImage.base64Data.split(',')[1] : clothingImage.base64Data;
    parts.push({
      inlineData: {
        mimeType: clothingImage.mimeType,
        data: clothingBase64,
      },
    });

    prompt = customPrompt || `
      Act as a professional fashion photographer and stylist.
      
      Input 1: Clothing Item (Category: ${garmentCategory}).
      
      Goal: Generate a stunning model photo showcasing this product for an online store.
      
      Instructions:
      1. MODEL: Generate a diverse, professional fashion model with a natural pose suitable for e-commerce.
      2. CLOTHING: The model MUST wear the exact item from Input 1. Texture, pattern, and logo must be preserved.
      3. STYLING (CRITICAL): ${styleInstruction} The generated items must color-coordinate with the input item to create a fashionable look.
      4. ENVIRONMENT: Place the model in: ${envInstruction}
      5. LIGHTING: Professional studio or outdoor lighting depending on the environment.
      6. FRAMING: ${framingInstruction}
    `;
  }

  // 在提示词中明确强调宽高比要求
  const enhancedPrompt = `${prompt}\n\n重要提示：生成的图片宽高比必须严格为 ${aspectRatio}，请确保构图和布局完全符合此比例要求。`;
  
  // Append the text prompt
  parts.push({ text: enhancedPrompt });

  try {
    // 虚拟试穿需要图像输入和输出，使用支持图像的模型
    // 注意：如果后续需要更高质量的图像生成，可以考虑使用 gemini-3.1-flash-image-preview
    const response = await generateContent({
      model: 'gemini-3.1-flash-image-preview',
      task: 'image_gen',
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio,
        },
      }
    });

    const imageUrl = extractImageFromResponse(response);
    if (!imageUrl) {
      throw new Error("No image data found in the response.");
    }

    return imageUrl;
  } catch (error: any) {
    console.error("生成试穿图片失败:", error);
    throw error;
  }
};
