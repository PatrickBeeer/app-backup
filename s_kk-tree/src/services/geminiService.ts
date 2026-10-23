import {
  generateContent,
  extractJsonTextFromResponse,
  extractTextFromResponse,
  extractImageBase64FromResponse,
} from '../../../../shared_services/geminiProxyService';

const IMAGE_GEN_MODEL = "gemini-3.1-flash-image-preview";
const TEXT_GEN_MODEL = "gemini-3-flash-preview";
const BILLING_TASK_TEXT = "text_gen";
const BILLING_TASK_IMAGE = "image_gen";

async function withRetry<T>(fn: () => Promise<T>, maxRetries: number = 3, initialDelay: number = 1000): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const message = String(error?.message || "");
      const errorStr = JSON.stringify(error);
      const isRetryable =
        message.includes("503") ||
        message.includes("502") ||
        message.includes("504") ||
        message.includes("524") ||
        message.includes("UNAVAILABLE") ||
        message.includes("high demand") ||
        message.includes("timeout") ||
        message.includes("Gateway Time-out") ||
        message.includes("Bad Gateway") ||
        error?.status === "UNAVAILABLE" ||
        errorStr.includes("503") ||
        errorStr.includes("502") ||
        errorStr.includes("504") ||
        errorStr.includes("524") ||
        errorStr.includes("UNAVAILABLE") ||
        errorStr.includes("timeout");

      if (isRetryable && i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        console.warn(`Gemini transient error. Retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`, error);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export interface GenerationParams {
  aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
  resolution: "1K" | "2K" | "4K" | "720p" | "1080p";
  scene: string;
  cameraAngle: string;
  ageRange: string;
  modelCount: number;
  modelAction: string;
  modelExpression: string;
  composition: string;
  interactionEnhanced: boolean;
  globalPrompt: string;
  productImages: string[]; // array of base64
  propImages: string[]; // array of base64
  skuModelImage?: string; // For SKU shot mode
  referenceImage?: string; // The specific result image to vary from
  maskImage?: string; // base64 mask for inpainting
  isRefinement?: boolean; // Flag to indicate a local fine-tuning task
  isVariation?: boolean; // Flag to indicate generating variations of the same model/scene
  seed?: number;
  mode?: 'real-shot' | 'model-transfer' | 'sku-shot' | 'main-image' | 'xiaohongshu' | 'resize';
  targetColors?: string[]; // For SKU shot
  xiaohongshuTopic?: string; // For Xiaohongshu mode
  skuAngle?: string; // For SKU shot mode: 正面, 侧面, 背面
  mainImagePrompts?: string[]; // For Main Image mode
  mainImageModelImages?: string[]; // For Main Image mode
  mainImageModelCounts?: number[]; // For Main Image mode (per scheme)
  mainImageCameraAngles?: string[]; // For Main Image mode (per scheme)
  mainImageModelActions?: string[]; // For Main Image mode (per scheme)
}

export interface GeneratedImage {
  id: string;
  url: string;
  type: "product" | "model" | "xiaohongshu";
  prompt: string;
  caption?: string; // For Xiaohongshu posts
  params: GenerationParams; // Store params for "more like this"
}

export interface GenerationHooks {
  onImage?: (image: GeneratedImage, index: number) => void;
}

export interface ProductAnalysis {
  function: string;
  suggestedScene: string;
  suggestedClothing: string;
  hasWhistle: boolean;
  hasHood: boolean;
  isHat: boolean;
  isSunHat: boolean;
  isSunProtectionClothing: boolean;
}

export async function analyzeProduct(productImages: string[]): Promise<ProductAnalysis> {
  if (productImages.length === 0) {
    return { function: "General clothing", suggestedScene: "Outdoor park", suggestedClothing: "Casual sports wear", hasWhistle: false, hasHood: false, isHat: false, isSunHat: false, isSunProtectionClothing: false };
  }

  const prompt = `Analyze these product images for children's clothing. 
  1. Identify the primary function (e.g., sun protection, winter warmth, waterproof, sports performance).
  2. Suggest an ideal outdoor/sports scene that matches this function.
  3. Suggest what other clothing the child should wear to match this scene while incorporating the product.
  4. Detect if there is a whistle (usually green or small accessory on a lanyard) in the product images.
  5. Detect if the primary product (e.g., jacket, hoodie, sun protection shirt) has a HOOD.
  6. Detect if the product is a HAT or HEADWEAR (e.g., sun hat, bucket hat, cap).
  7. Specifically detect if it is a SUN HAT (遮阳帽).
  8. Detect if the product is SUN PROTECTION CLOTHING (防晒衣).
  Return the result in JSON format with keys: "function", "suggestedScene", "suggestedClothing", "hasWhistle" (boolean), "hasHood" (boolean), "isHat" (boolean), "isSunHat" (boolean), "isSunProtectionClothing" (boolean).`;

  const parts: any[] = [{ text: prompt }];
  for (const img of productImages) {
    parts.push({
      inlineData: {
        data: img.split(",")[1],
        mimeType: "image/png"
      }
    });
  }

  try {
    const response = await withRetry(() => generateContent({
      model: TEXT_GEN_MODEL,
      task: BILLING_TASK_TEXT,
      billing_task: BILLING_TASK_TEXT,
      contents: { parts },
      config: { responseMimeType: "application/json" }
    }));

    let text = '';
    try {
      text = extractJsonTextFromResponse(response as any);
    } catch {
      text = extractTextFromResponse(response as any) || '{}';
    }

    return JSON.parse(text || "{}") as ProductAnalysis;
  } catch (e) {
    console.error("Product analysis error:", e);
    return { function: "General clothing", suggestedScene: "Outdoor park", suggestedClothing: "Casual sports wear", hasWhistle: false, hasHood: false, isHat: false, isSunHat: false, isSunProtectionClothing: false };
  }
}

export async function detectModelInImage(image: string): Promise<boolean> {
  const prompt = "Does this image contain a human model (person)? Answer only 'true' or 'false'.";
  const parts = [
    { text: prompt },
    {
      inlineData: {
        data: image.split(",")[1],
        mimeType: "image/png"
      }
    }
  ];

  try {
    const response = await withRetry(() => generateContent({
      model: TEXT_GEN_MODEL,
      task: BILLING_TASK_TEXT,
      billing_task: BILLING_TASK_TEXT,
      contents: { parts }
    }));

    const text = extractTextFromResponse(response as any).toLowerCase();
    return text.includes("true");
  } catch (e) {
    console.error("Model detection error:", e);
    return false;
  }
}

export async function detectModelCount(images: string[]): Promise<number> {
  if (images.length === 0) return 1;

  const prompt = `Analyze the provided image(s) and count the total number of human models visible across all images. 
  - If there is only one image and it contains multiple people, count them all.
  - If there are multiple images, count the total number of unique models if possible, or just the total count of people across images.
  - Return ONLY a single integer representing the count.`;

  const parts: any[] = [{ text: prompt }];
  for (const img of images) {
    parts.push({
      inlineData: {
        data: img.split(",")[1],
        mimeType: "image/png"
      }
    });
  }

  try {
    const response = await withRetry(() => generateContent({
      model: TEXT_GEN_MODEL,
      task: BILLING_TASK_TEXT,
      billing_task: BILLING_TASK_TEXT,
      contents: { parts }
    }));

    const countText = extractTextFromResponse(response as any).trim();
    const count = parseInt(countText);
    return isNaN(count) ? 1 : count;
  } catch (e) {
    console.error("Model count detection error:", e);
    return 1;
  }
}

export async function generateKocotreeVisuals(
  params: GenerationParams,
  count: number = 2,
  hooks: GenerationHooks = {}
): Promise<GeneratedImage[]> {
  const { scene, cameraAngle, ageRange, modelCount, modelAction, modelExpression, composition, interactionEnhanced, globalPrompt, aspectRatio, resolution, productImages, propImages, maskImage, isRefinement, seed, mode, referenceImage, skuModelImage, targetColors, xiaohongshuTopic, skuAngle } = params;
  const { onImage } = hooks;
  
  // Intercept local inpainting (refinement) tasks early
  if (isRefinement && referenceImage) {
    const results: GeneratedImage[] = [];
    for (let i = 0; i < count; i++) {
      const imageUrl = await generateSingleImage(
        globalPrompt || "Refine the image.",
        aspectRatio,
        resolution,
        [], // NO product images to avoid confusing the model
        [], // NO prop images
        seed ? seed + i : undefined,
        maskImage,
        referenceImage,
        [], // NO model images
        isRefinement
      );
      const image: GeneratedImage = {
        id: `refined-${i}-${Date.now()}`,
        url: imageUrl,
        type: "product",
        prompt: globalPrompt,
        params
      };
      results.push(image);
      onImage?.(image, i);
    }
    return results;
  }

  // Intercept variation generation tasks early
  if (params.isVariation && referenceImage) {
    const results: GeneratedImage[] = [];
    const variationPoses = [
      "standing with a different dynamic posture, looking slightly away",
      "sitting naturally, relaxed expression",
      "leaning slightly with a different hand gesture, engaging with the camera",
      "walking or moving slightly, capturing a candid moment"
    ];

    for (let i = 0; i < count; i++) {
      const currentPose = variationPoses[i % variationPoses.length];

      const imageUrl = await generateSingleImage(
        currentPose,
        aspectRatio,
        resolution,
        [], // NO product images to avoid confusing the model
        [], // NO prop images
        seed ? seed + i : undefined,
        undefined, // no mask
        referenceImage,
        [], // NO model images
        false, // not refinement
        true // isVariation
      );
      const image: GeneratedImage = {
        id: `variation-${i}-${Date.now()}`,
        url: imageUrl,
        type: "product",
        prompt: currentPose,
        params
      };
      results.push(image);
      onImage?.(image, i);
    }
    return results;
  }

  if (mode === 'sku-shot') {
    const results: GeneratedImage[] = [];
    
    // Model Action Mapping for SKU Shot
    const actionMap: Record<string, string> = {
      "自然律动": "Natural movement: running, spinning, hair flying in the wind, walking moments, and skirt swaying.",
      "探索交互": "Exploration and interaction: leaning against architectural elements or trees, touching flowers and grass, using light and shadow for coverage.",
      "生活化/日常": "Lifestyle and daily: simulating natural states with minimal posing. Adjusting clothing edges, drinking water, shading eyes from the sun, and a relaxed, loose posture.",
      "情绪故事感": "Emotional storytelling and innocent moments: capturing natural, pure expressions of childhood. Focus on narrativity and genuine emotions like curiosity, focus, surprise, or a thoughtful gaze."
    };

    // Model Expression Mapping for SKU Shot
    const expressionMap: Record<string, string> = {
      "躲猫猫式萌动": "peeking through hands, shy but happy smile, sparkling eyes, hiding behind hat brim, playful interaction, catchlight in eyes",
      "纯真仰头大笑": "head tilted back 45 degrees, eyes closed laughing, sun-dappled face, extreme joy, arms spread wide, high-key outdoor lighting",
      "好奇发现瞬间": "surprised mouth slightly open, focusing on ground, curiosity in eyes, leaning forward, reaching out hand to touch grass",
      "搞怪调皮鬼脸": "scrunched-up nose, squinting eyes, funny mischievous grin, chubby cheeks, soft baby skin",
      "默认表情": "natural, spontaneous facial expressions"
    };

    const actionDescription = actionMap[modelAction] || actionMap["自然律动"];
    const expressionDescription = expressionMap[modelExpression] || expressionMap["默认表情"];

    const basePrompt = `SKU Real-Shot Task:
    1. Take the provided model image (skuModelImage) as the base for the person's identity.
    2. The shot MUST be a CLOSE-UP (近景), focusing on the upper body and the clothing details.
    3. The shooting angle is ${skuAngle || '正面'}.
    4. Change the COLOR and PATTERN of the primary clothing item to match the provided PRODUCT COLOR REFERENCE image.
    5. CRITICAL: Maintain the EXACT SAME STYLE, CUT, and DESIGN of the clothing as seen in the skuModelImage. ONLY the color/pattern should change. The clothing must remain consistent across all generated variations.
    6. Maintain the EXACT same model identity as the skuModelImage. If the angle is different from the reference image, generate the model from that perspective (e.g., if angle is '背面', show the model from the back).
    7. Pose/Action: ${actionDescription}.
    8. Facial Expression: ${expressionDescription}.
    9. Aesthetic: Natural, real-life photo aesthetic (自然实拍). Ensure the fabric texture and lighting are consistent, professional, and realistic. Avoid strange or artificial lighting.
    10. Scene: ${scene}.
    11. Additional Instructions: ${globalPrompt}.
    12. SINGLE MODEL ONLY: There MUST be ONLY ONE child model in the entire image. PROHIBITED: Do not generate multiple models, groups of children, or any other people in the background.
    13. NO text, NO logos, NO watermarks.`;

    for (let i = 0; i < productImages.length; i++) {
      const colorRefImage = productImages[i];
      const variationPrompt = `${basePrompt} Use the provided product image as the EXACT color and pattern reference for the clothing. Ensure the transition looks natural and high-end.`;
      // Pass the specific color reference image as the only product image for this generation
      const imageUrl = await generateSingleImage(variationPrompt, aspectRatio, resolution, [colorRefImage], [], seed ? seed + i : undefined, undefined, skuModelImage);
      const image: GeneratedImage = {
        id: `sku-shot-${i}-${Date.now()}`,
        url: imageUrl,
        type: "model",
        prompt: variationPrompt,
        params: { ...params, productImages: [colorRefImage] }
      };
      results.push(image);
      onImage?.(image, i);
    }
    return results;
  }

  if (mode === 'main-image') {
    const results: GeneratedImage[] = [];
    const { scene, globalPrompt, aspectRatio, resolution, productImages, seed, maskImage, interactionEnhanced } = params;
    
    let finalPrompts = params.mainImagePrompts;

    if (!finalPrompts || finalPrompts.length < 4) {
      // 1. Analyze the product from the model images (which contain the product being worn)
      const analysis = await analyzeProduct(productImages);
      
      // 2. Detect model count from uploaded model images
      const detectedCount = await detectModelCount(params.mainImageModelImages || []);
      
      const basePrompt = `E-commerce Scene Generation Task:
      1. Theme: ${analysis.function}.
      2. Scene: ${scene}.
      3. Model & Scene: Generate ${detectedCount} child model(s) in a high-end, professional scene. 
      4. CRITICAL: The models MUST have DIFFERENT poses, actions, and expressions from any provided reference images to avoid direct replication of the posture.
      5. CRITICAL: The model(s) and the product(s) they are wearing MUST be the EXACT same as shown in the uploaded reference images. The product is the hero and must be clearly visible and accurately represented.
      6. Aesthetic: High-end, professional, clean, commercial photography. Natural, real-life photo aesthetic (自然实拍). 
      7. Lighting: Use soft, natural lighting and realistic shadows. PROHIBITED: Avoid any artificial, "fake", or over-processed lighting effects. The lighting must look completely natural and authentic.
      8. NO text, NO logos, NO watermarks, NO UI elements, NO graphic overlays. The image must be a pure photograph.
      9. Additional Instructions: ${globalPrompt}.`;

      finalPrompts = [
        // Image 1: Lifestyle atmosphere
        `${basePrompt} Image 1: A high-end lifestyle shot focusing on the atmosphere and the model's natural interaction with the environment.`,
        
        // Image 2: Dynamic movement
        `${basePrompt} Image 2: A shot capturing dynamic movement and energy, showing the model in a natural, active state within the scene.`,
        
        // Image 3: Emotional storytelling
        `${basePrompt} Image 3: An emotional and storytelling shot, focusing on the model's expression and the mood of the environment.`,
        
        // Image 4: Fashion-forward composition
        `${basePrompt} Image 4: A fashion-forward composition with a focus on style and high-end commercial appeal.`
      ];
    }

    for (let i = 0; i < count; i++) {
      const currentModelCount = params.mainImageModelCounts?.[i % 4] || params.modelCount || 1;
      const currentCameraAngle = params.mainImageCameraAngles?.[i % 4] || params.cameraAngle || "近景";
      const currentModelAction = params.mainImageModelActions?.[i % 4] || params.modelAction || "自然律动";
      
      const configPrompt = `
      - Model Count: ${currentModelCount} model(s). ${currentModelCount > 1 && params.interactionEnhanced ? 'Ensure natural interaction between models.' : ''}
      - Camera Perspective: ${currentCameraAngle}.
      - Model Action: ${currentModelAction}.
      `;
      
      const promptWithConfig = `${finalPrompts[i % finalPrompts.length]}\n${configPrompt}`;
      
      const imageUrl = await generateSingleImage(promptWithConfig, aspectRatio, resolution, productImages, [], seed ? seed + i : undefined, maskImage, undefined, params.mainImageModelImages);
      const image: GeneratedImage = {
        id: `main-image-${i}-${Date.now()}`,
        url: imageUrl,
        type: "product",
        prompt: promptWithConfig,
        params
      };
      results.push(image);
      onImage?.(image, i);
    }
    return results;
  }

  if (mode === 'resize') {
    const results: GeneratedImage[] = [];
    const basePrompt = `Image Resizing and Outpainting Task:
    1. Take the provided image (productImages[0]) as the source.
    2. Adjust the aspect ratio to ${aspectRatio}.
    3. If the new aspect ratio is wider or taller than the original, OUTPAINT (extend) the background naturally to fill the new dimensions.
    4. Maintain the EXACT same subject, lighting, and style as the original image. Ensure the lighting remains natural and realistic (自然实拍).
    5. The subject (e.g., model or product) should be centered or positioned aesthetically in the new frame.
    6. Ensure a seamless transition between the original content and the newly generated background.
    7. NO text, NO logos, NO watermarks.
    8. Additional Instructions: ${globalPrompt}.`;

    for (let i = 0; i < count; i++) {
      const imageUrl = await generateSingleImage(basePrompt, aspectRatio, resolution, productImages, [], seed ? seed + i : undefined);
      const image: GeneratedImage = {
        id: `resize-${i}-${Date.now()}`,
        url: imageUrl,
        type: "product",
        prompt: basePrompt,
        params
      };
      results.push(image);
      onImage?.(image, i);
    }
    return results;
  }


  if (mode === 'model-transfer') {
    const results: GeneratedImage[] = [];
    
    const actions = ["自然律动", "探索交互", "生活化/日常", "情绪故事感"];
    const expressions = ["躲猫猫式萌动", "纯真仰头大笑", "好奇发现瞬间", "搞怪调皮鬼脸", "默认"];

    const basePrompt = `Model Transfer and Scene Integration Task:
    1. Take the child model's identity, facial features, and appearance from the provided model reference images (productImages).
    2. Integrate this specific model into the provided scene reference images (propImages).
    3. CRITICAL: The model MUST wear the EXACT SAME clothing and product shown in the scene reference images (propImages). DO NOT replace the clothing with what the model is wearing in the productImages. The goal is to change the model's identity while PRESERVING the product and the scene.
    4. The product (clothing, accessories) from the scene (propImages) MUST NOT be eliminated, altered, or removed. It must remain the focal point of the image.
    ${referenceImage ? "5. Use the provided referenceImage as a visual guide for how the model should look in the scene, maintaining consistency with this specific result." : ""}
    ${maskImage ? "6. The provided maskImage highlights the 'coating position' (涂膜位置) where the new model should be placed. Focus the integration on this specific region. The new model MUST be wearing the product that is currently at that 'coating position' in the scene. The product's shape, color, and texture must be perfectly preserved." : "7. If there is already a model in the scene, REPLACE them with the new model while maintaining the original pose, lighting, and perspective, and keeping the original clothing."}
    8. If there is NO model in the scene, BLEND the new model naturally into the environment, ensuring they are wearing the product intended for that scene.
    9. Aesthetic: Natural, real-life photo aesthetic (自然实拍). High-end, professional commercial photography. Use soft, natural lighting; avoid strange or artificial light effects.
    10. Camera Perspective: ${cameraAngle}.
    11. Composition: ${composition}.
    12. Additional Instructions: ${globalPrompt}.
    13. NO text, NO logos, NO watermarks.
    14. CRITICAL: The output MUST be the model fully integrated into the scene, WEARING THE PRODUCT. The product must look exactly like it does in the original scene image. PROHIBITED: Do not simply recreate the user's uploaded model photo.`;

    for (let i = 0; i < count; i++) {
      // If generating more than 1, vary the action and expression
      const currentAction = count > 1 ? actions[i % actions.length] : modelAction;
      const currentExpression = count > 1 ? expressions[i % expressions.length] : modelExpression;

      const variationPrompt = `${basePrompt} 
      Variation ${i + 1}: 
      - Action: ${currentAction}.
      - Expression: ${currentExpression}.
      ${referenceImage ? "CRITICAL: The model's pose and facial expression MUST be DIFFERENT from the provided referenceImage. Use the referenceImage ONLY as a guide for the model's appearance and the scene's lighting/composition. Change the model's body position, arm placement, and facial emotion to match the requested Action and Expression." : ""}
      Ensure a seamless and realistic integration of the model into the scene with this specific pose and expression.`;
      
      const imageUrl = await generateSingleImage(
        variationPrompt, 
        aspectRatio, 
        resolution, 
        productImages, 
        propImages, 
        seed ? seed + i : undefined, 
        maskImage,
        referenceImage
      );

      const image: GeneratedImage = {
        id: `model-transfer-${i}-${Date.now()}`,
        url: imageUrl,
        type: "model",
        prompt: variationPrompt,
        params: { ...params, modelAction: currentAction, modelExpression: currentExpression }
      };
      results.push(image);
      onImage?.(image, i);
    }
    return results;
  }

  // Analyze product first to get context
  const analysis = await analyzeProduct(productImages);
  
  const results: GeneratedImage[] = [];
  
  // Gender distribution logic
  let genderLogic = "";
  let countConstraint = "";
  if (modelCount === 1) {
    genderLogic = "exactly ONE Caucasian child model (either a boy or a girl)";
    countConstraint = "There MUST be ONLY ONE child in the entire image. NO other people, NO other children.";
  } else if (modelCount === 2) {
    genderLogic = "two Caucasian child models (one boy and one girl)";
    countConstraint = "There MUST be exactly TWO children in the image.";
  } else if (modelCount === 3) {
    genderLogic = "three Caucasian child models (two boys and one girl)";
    countConstraint = "There MUST be exactly THREE children in the image.";
  }

  // Camera Angle Mapping
  const cameraAngleMap: Record<string, string> = {
    "平视视角": "eye-level, straight-on, classic commercial perspective, intimate interaction, emphasizing realism",
    "侧拍视角": "side-view, profile shot, capturing the dynamic silhouette",
    "活力仰拍": "low-angle, wide angle lens, 24mm, dramatic perspective, dramatic worm's-eye view, looking up from a low position to make the child models appear heroic, tall, and powerful, increasing visual impact",
    "动感斜拍": "subtle dutch angle, slight 5-degree tilt, slanted horizon, high energy action capture, diagonal composition to increase movement, suitable for extreme sports and dynamic snapshots",
    "俯拍视角": "high-angle, bird's-eye view, looking down from above to create a playful, cute, and dynamic perspective",
    "背面视角": "back-view, rear perspective, capturing the model from behind to emphasize the back design of the clothing and create an atmospheric, storytelling mood"
  };
  const englishCameraAngle = cameraAngleMap[cameraAngle] || cameraAngle;
  
  // Composition Mapping
  const compositionMap: Record<string, string> = {
    "全景": "full shot, wide shot, capturing the entire scene and the model's full body from head to toe, emphasizing the environment and the complete outfit",
    "中景": "medium shot, knee-up shot, focusing on the model from the knees up, emphasizing movement, posture, and the primary clothing items",
    "近景": "close-up shot, chest-up shot, focusing on the model from the chest up, emphasizing facial expressions, fabric textures, and intricate details of the clothing"
  };
  const englishComposition = compositionMap[composition] || compositionMap["中景"];

  // Model Action Mapping
  const actionMap: Record<string, string> = {
    "自然律动": "Natural movement: running, spinning, hair flying in the wind, walking moments, and skirt swaying. Emphasize the interaction between the body and space to break any stiffness.",
    "探索交互": `Exploration and interaction: leaning against architectural elements or trees, touching flowers and grass, using light and shadow for coverage. ${params.propImages.length === 0 ? "The model MUST interact with the PRIMARY product (the clothing) itself: adjusting the hood, touching the fabric texture, holding the hem, or playing with the zipper." : "The model should interact with the provided props."} The model is part of the scene.`,
    "生活化/日常": "Lifestyle and daily: simulating natural states with minimal posing. Adjusting clothing edges, drinking water, shading eyes from the sun, and a relaxed, loose posture.",
    "情绪故事感": "Emotional storytelling and innocent moments: capturing natural, pure expressions of childhood. Focus on narrativity and genuine emotions like curiosity, focus, surprise, or a thoughtful gaze. The goal is to tell a story through the model's expression and interaction with the environment."
  };
  const actionDescription = actionMap[modelAction] || actionMap["自然律动"];

  // Model Expression Mapping
  const expressionMap: Record<string, { prompt: string; negative?: string }> = {
    "躲猫猫式萌动": {
      prompt: "peeking through hands, shy but happy smile, sparkling eyes, hiding behind hat brim, playful interaction, catchlight in eyes",
      negative: "deformed fingers, extra digits, missing fingers, fused fingers, distorted hands"
    },
    "纯真仰头大笑": {
      prompt: "head tilted back 45 degrees, eyes closed laughing, sun-dappled face, extreme joy, arms spread wide, high-key outdoor lighting, natural jawline structure",
      negative: "deformed jaw, double chin, distorted neck, unnatural chin structure"
    },
    "好奇发现瞬间": {
      prompt: "surprised mouth slightly open, focusing on ground, curiosity in eyes, leaning forward, reaching out hand to touch grass, storytelling atmosphere, clear eye focus on the subject of discovery",
      negative: "dull eyes, blank stare, cross-eyed, unfocused gaze"
    },
    "搞怪调皮鬼脸": {
      prompt: "scrunched-up nose, squinting eyes, funny mischievous grin, chubby cheeks, soft baby skin, candid lifestyle photography",
      negative: "over-sharpened face, deep wrinkles, aged facial features, adult-like face, heavy skin texture"
    },
    "默认": {
      prompt: "natural, spontaneous facial expressions",
      negative: "deformed fingers, extra digits, missing fingers, fused fingers, distorted hands, deformed jaw, double chin, distorted neck, unnatural chin structure, dull eyes, blank stare, cross-eyed, unfocused gaze, over-sharpened face, deep wrinkles, aged facial features, adult-like face, heavy skin texture"
    }
  };

  const selectedExpression = expressionMap[modelExpression] || expressionMap["默认"];
  const expressionPrompt = selectedExpression.prompt;
  const expressionNegative = selectedExpression.negative ? `, ${selectedExpression.negative}` : "";

  const modelCountInteraction = (modelCount > 1 && interactionEnhanced)
    ? "The models MUST interact with each other naturally: holding hands, jumping together, sharing a playful moment, or sharing glances. To create visual depth, position the models dynamically, such as one model in front and the other slightly behind. Their interaction should feel authentic, emotional, and heartwarming, capturing the genuine bond of childhood friendship."
    : (modelCount > 1 ? "The models should be positioned naturally in the scene, appearing together without necessarily direct physical interaction, maintaining a high-fashion editorial distance." : "");

  const hatLogic = analysis.isHat 
    ? `The child model(s) MUST be wearing the ${analysis.isSunHat ? 'sun hat' : 'hat'} shown in the product images at all times. The hat is a critical part of the outfit and must be clearly visible and properly worn on the head.`
    : "";

  const zipperLogic = analysis.isSunProtectionClothing
    ? "The PRIMARY product is SUN PROTECTION CLOTHING (防晒衣). CRITICAL REQUIREMENT: The zipper MUST be FULLY CLOSED and zipped up to the top (禁止拉开拉链). The garment MUST be worn properly to demonstrate its full sun protection functionality. This is a key brand requirement."
    : "";

  const functionalContext = analysis.isSunProtectionClothing
    ? "The scene should emphasize a bright, sunny outdoor environment where sun protection is essential. The lighting should be vibrant and clear, highlighting the lightweight and breathable nature of the fabric while showing the model is well-protected from the sun."
    : `The scene should highlight the product's primary function: ${analysis.function}. The atmosphere and lighting should reinforce this purpose.`;

  // Use user-selected scene
  const finalScene = scene;

  const beachExpressiveness = (finalScene === '阳光沙滩' && modelAction !== '生活化/日常')
    ? "The models MUST exhibit STRONG expressiveness (极强的表现力). Their poses should be dynamic, high-tension, and full of energy. Facial expressions should be intense, joyful, or deeply emotive, capturing a high-fashion editorial presence that commands attention. NO stiff or passive looks."
    : "";

  const modelDescription = `${genderLogic} aged ${ageRange}. ${countConstraint} ${hatLogic} ${zipperLogic} The models MUST be captured in ${actionDescription}. ${modelCountInteraction} ${beachExpressiveness} ${expressionPrompt}. Authentic, spontaneous facial expressions are key. Avoid static, posed looks. For multiple models, EACH child MUST have a unique and distinct pose; they should NOT be standing or moving in an identical way. The models should feel like they are authentically in the ${scene} environment, capturing the true spirit of childhood in a high-end editorial style. Focus on capturing the model's tension and high-fashion expression through ${englishComposition}.`;
  const styleDescription = `Cinematic lighting with a high-end magazine editorial aesthetic inspired by Vogue Kids. Incorporate a subtle film grain texture for a timeless, high-quality feel. Use a sophisticated bokeh effect to softly blur the background waves and elements, making the subject and the clothing texture pop with extreme clarity and transparency. The lighting should be soft, natural, and wrap around the models to highlight the delicate fabric details. The shot MUST be captured from a ${englishCameraAngle} perspective, which is the core requirement for this composition. Focus on a ${englishComposition} to emphasize the model's dynamic tension and high-fashion presence.`;
  
  // Conditional Styling Logic for Socks and Shoes
  let socksShoesLogic = "";
  if (finalScene === '阳光沙滩') {
    socksShoesLogic = `
    - Footwear Logic: 
      1. The models MUST wear high-quality crew socks with bold stripes (条纹长袜) and chunky thick-soled sandals (厚底凉鞋).
      2. This combination is essential for outdoor safety and maintains the brand's high-end styling (保持品牌的高端穿搭调性).
    - Socks: High-quality crew socks with bold, colorful stripes that complement the primary product's color.
    - Shoes: High-end, chunky thick-soled sandals in muted tones (white, cream, grey-blue).`;
  } else {
    // For non-beach scenes (Grassland, Snow, Rooftop)
    socksShoesLogic = `
    - Socks: Clean, high-quality solid color cotton socks or subtle textured socks that match the Morandi color palette.
    - Shoes: High-end leather loafers, clean white sneakers, or stylish outdoor boots depending on the scene's vibe. For grassland, prefer clean white sneakers or soft leather loafers.`;
  }

  // Prop Logic
  const propLogic = propImages.length > 0 
    ? `The models MUST interact with the EXACT props shown in the uploaded prop reference images. These props (e.g., cameras, umbrellas, toys) should be integrated naturally into the scene and the model's action.`
    : "";

  // Hood Logic
  const hoodLogic = analysis.hasHood 
    ? "The model MUST wear the hood of the primary product on their head. This is a critical requirement to showcase the sun protection functionality of the hood. Ensure the hood framing is clear and stylish."
    : "NO random sun hats, NO extra headwear unless specified in the global prompt.";

  // Refined Styling Logic: Based on reference image (Grid shirts, tank tops, striped socks, chunky sandals)
  const stylingLogic = `The secondary styling must strictly follow the aesthetic of the provided reference image:
  - Tops: Incorporate white shirts with thin green grid patterns, soft pink tank tops, and white tees with contrasting blue chest pockets.
  - Bottoms: Use light, refreshing colors like mint green shorts, crisp white skirts, and sky blue shorts.
  ${socksShoesLogic}
  - Accessories: ${analysis.hasWhistle ? 'Include a small green whistle on a lanyard worn around the neck for a playful, adventurous touch.' : 'NO whistles, NO lanyards.'} ${hoodLogic}
  ${propLogic}
  The overall color palette should be high-brightness and low-saturation (Morandi tones), ensuring a clean, breathable, and premium vacation look.`;

  let clothingLogic = `The PRIMARY clothing item (e.g., the shirt, dress, or jacket) MUST be the EXACT product shown in the uploaded reference images. This product is the absolute hero. All secondary styling MUST complement this hero product using the specified lightweight fabrics and the specific styling elements (grid patterns, socks, shoes, accessories) to create a cohesive, luxury commercial look. ${stylingLogic}`;

  if (finalScene === '阳光沙滩') {
    clothingLogic = `${clothingLogic} For the beach, emphasize the airy linen texture and the refreshing Morandi tones against the deep blue sea. The styling should feel effortless, high-fashion, and adventurous.`;
  }

  const basePrompt = `Professional commercial photography for KKtree children's clothing, Vogue Kids style. NO text, NO logos, NO watermarks, NO animals, NO pets. 
  Camera Perspective: ${englishCameraAngle.toUpperCase()}. This is a ${englishCameraAngle} shot.
  Composition: ${englishComposition.toUpperCase()}.
  Models: ${modelDescription}
  Style: ${styleDescription}. ${functionalContext}
  Composition Detail: Action-oriented ${englishComposition}, perfectly framed with a sense of movement and model tension. EACH model in a unique pose. NO wide-angle or far shots unless it's a full shot.
  Scene: ${finalScene}. ${finalScene === '阳光沙滩' ? 'An exceptionally clean and minimalist beach scene. A vast, pristine sky blue sky (天蓝色) meeting a crystal-clear, calm sea. The water is transparent and pure. No clutter, just the pure essence of a bright coastal day. High image transparency and absolute clarity.' : ''} ${finalScene === '绿意草地' ? 'A vast, lush green meadow with soft, vibrant grass. NO beach, NO sea, NO water, NO sand. The environment is purely a green field under a clear sky.' : ''}
  Clothing Context: ${clothingLogic}
  Product Color Integrity: The models MUST wear the product in the EXACT colors and styles shown in the uploaded reference images. The product is the focal point.
  Color Logic: Use a diverse palette of high-key, low-saturation colors (creamy blue, mint green, sunset pink, dusty sage) to ensure a clean, high-contrast, and transparent look.
  Details: ${globalPrompt}.`;

  // Action-specific pose sets to prevent theme leakage
  const actionPoses: Record<string, string[]> = {
    "自然律动": [
      "High-energy action shot of the children holding hands and running through shallow deep blue water with extreme expressiveness, splashing with exuberant laughter, water droplets frozen in mid-air",
      "Dynamic, high-tension moment of the children jumping joyfully together on the wet sand, capturing a peak moment of energy and movement",
      "Spontaneous, expressive action shot of the children kicking the water playfully together, wide-eyed with pure excitement and wonder",
      "Candid, dynamic movement shot capturing the children spinning or twirling together with high energy, showing the breathability and natural wrinkles of the fabric",
      "Action-oriented editorial pose on a coastal rock with strong model tension, children interacting naturally as the wind catches the light fabric",
      "Playful, high-energy interaction with the gentle waves, children running along the shoreline together with a sense of pure freedom and joy"
    ],
    "探索交互": [
      "Children leaning gracefully together against a weathered coastal rock or tree with an expressive, storytelling gaze, sharing a moment of quiet discovery",
      "Children kneeling on the sand together to examine a seashell with intense curiosity and expressive facial details",
      "Standing together amidst tall grass or coastal flowers, interacting with the environment and each other with strong editorial presence",
      "Using props like vintage cameras together with focused, expressive shared interaction, capturing a high-fashion storytelling moment",
      "Sitting together on a wooden pier or a rock, dangling feet, sharing a quiet but deeply expressive conversation",
      "Walking slowly along a path together with a sense of wonder, one child pointing out something interesting with an expressive gesture"
    ],
    "生活化/日常": [
      "Children sitting relaxed together on a beach towel or a bench, sharing a lighthearted, natural moment",
      "Standing together, one child pointing at the distance while the other shades their eyes, a natural daily interaction",
      "Sharing a water bottle or a small snack together, looking at each other with relaxed, authentic expressions",
      "One child helping the other adjust their clothing, a candid and authentic moment of daily care",
      "Leaning back together with eyes closed, enjoying the sun, a moment of shared relaxation",
      "Walking slowly and thoughtfully together, sharing a quiet and serene moment"
    ],
    "情绪故事感": [
      "A shared moment of intense, cute curiosity (呆萌好奇), children leaning forward together with highly expressive faces to look at something small on the ground",
      "Focused, expressive thinking together (专注思考), children sitting quietly side by side, looking thoughtfully at the landscape with deep emotion",
      "A casual, spontaneous but highly expressive glance back (不经意的回眸) from both children while walking away together",
      "Shared, dramatic surprised expression (惊讶张嘴), children reacting together with strong facial expressions to a splash of water or a sudden discovery",
      "A moment of shared vulnerability or comfort with deep emotional resonance, one child gently comforting the other with a supportive, expressive look",
      "A shared, serene but deeply expressive gaze into the distance, capturing a moment of quiet wonder and collective storytelling depth"
    ]
  };

  const currentPoses = actionPoses[modelAction] || actionPoses["自然律动"];

  let caption = "";
  if (mode === 'xiaohongshu') {
    caption = await generateXiaohongshuCaption(analysis.function, productImages);
  }

  // Generate variations
  for (let i = 0; i < count; i++) {
    const pose = currentPoses[i % currentPoses.length];
      
    let variationPrompt = `${basePrompt} Variation ${i + 1}: The child model(s) in a ${pose} in the ${finalScene} scene. The action MUST strictly follow the ${modelAction} theme and avoid any high-energy running or playing if not specified. Negative Constraints: ${expressionNegative}`;
    
    if (mode === 'xiaohongshu') {
      const hoodRequirement = analysis.isSunProtectionClothing ? "CRITICAL: If the product is sun protection clothing (防晒衣), it MUST have a hood (帽子) in the generated image. Prohibit images without a hood." : "";
      variationPrompt = `Xiaohongshu (Little Red Book) Post Generation:
      ${variationPrompt}
      Xiaohongshu Specifics:
      1. Style: Aesthetic, clean, "ins style", high-transparency, vibrant colors, atmospheric. Natural, real-life photo aesthetic (自然实拍). Use soft, natural lighting; avoid strange or artificial light effects.
      2. The image should feel like a genuine "user-generated" high-quality lifestyle photo that would go viral on Xiaohongshu.
      3. ${hoodRequirement}
      `;
    }

    const imageUrl = await generateSingleImage(variationPrompt, aspectRatio, resolution, productImages, propImages, seed ? seed + i : undefined);

    const image: GeneratedImage = mode === 'xiaohongshu'
      ? {
        id: `xiaohongshu-${i}-${Date.now()}`,
        url: imageUrl,
        type: "xiaohongshu",
        prompt: variationPrompt,
        caption,
        params
      }
      : {
        id: `visual-${i}-${Date.now()}`,
        url: imageUrl,
        type: "model",
        prompt: variationPrompt,
        params
      };

    results.push(image);
    onImage?.(image, i);
  }

  return results;
}

async function generateSingleImage(
  prompt: string, 
  aspectRatio: string, 
  resolution: string, 
  productImages: string[], 
  propImages: string[], 
  seed?: number, 
  maskImage?: string, 
  referenceImage?: string,
  modelImages?: string[],
  isRefinement?: boolean,
  isVariation?: boolean
): Promise<string> {
  const parts: any[] = [{ text: prompt }];

  // Limit images to prevent payload size issues and improve stability
  const limitedProductImages = productImages.slice(0, 3);
  const limitedPropImages = propImages.slice(0, 3);
  const limitedModelImages = modelImages?.slice(0, 3);
  
  if (referenceImage) {
    parts.push({
      inlineData: {
        data: referenceImage.split(",")[1],
        mimeType: "image/png"
      }
    });
  }

  if (limitedModelImages) {
    for (const img of limitedModelImages) {
      parts.push({
        inlineData: {
          data: img.split(",")[1],
          mimeType: "image/png"
        }
      });
    }
  }

  for (const img of limitedProductImages) {
    parts.push({
      inlineData: {
        data: img.split(",")[1],
        mimeType: "image/png"
      }
    });
  }

  for (const img of limitedPropImages) {
    parts.push({
      inlineData: {
        data: img.split(",")[1],
        mimeType: "image/png"
      }
    });
  }

  if (maskImage) {
    parts.push({
      inlineData: {
        data: maskImage.split(",")[1],
        mimeType: "image/png"
      }
    });
    // Update prompt for inpainting
    parts[0].text = `Edit the provided image. Only modify the area indicated by the white part of the second image (the mask). Instruction: ${prompt}. Do not change anything outside the masked area. Keep the original image's background, lighting, and unmasked subjects exactly the same.`;
  } else if (isRefinement && referenceImage) {
    // Update prompt for general refinement without mask
    parts[0].text = `Edit the provided image. Instruction: ${prompt}. Do not generate a new image. Only modify the image according to the instruction, keeping everything else exactly the same.`;
  } else if (isVariation && referenceImage) {
    // Update prompt for variation generation
    parts[0].text = `Edit the provided image. Change the model's pose, expression, and camera angle to: ${prompt}. Do not generate a new model. Keep the model's identity and clothing exactly the same. You can change the background perspective or specific location within the same environment type to match the requested camera angle and pose.`;
  }

  const response = await withRetry(() => generateContent({
    model: IMAGE_GEN_MODEL,
    task: BILLING_TASK_IMAGE,
    billing_task: BILLING_TASK_IMAGE,
    contents: { parts },
    config: {
      seed: seed,
      imageConfig: {
        aspectRatio: aspectRatio as any,
        imageSize: resolution as any
      }
    }
  }));

  const candidate = (response as any).candidates?.[0];
  if (!candidate) {
    throw new Error("模型未返回候选结果。这通常是由于触发了安全过滤器或请求参数有误。");
  }

  if (candidate.finishReason === 'SAFETY') {
    throw new Error("生成被安全过滤器拦截。请尝试修改提示词或上传更合规的图片。");
  }

  const imageBase64 = extractImageBase64FromResponse(response as any);
  if (imageBase64) {
    return `data:image/png;base64,${imageBase64}`;
  }

  // If no image, check if there's text (refusal or explanation)
  try {
    const textResponse = extractTextFromResponse(response as any);
    if (textResponse) {
      throw new Error(`模型拒绝生成图像: ${textResponse}`);
    }
  } catch (e) {
    // response.text might throw if blocked or empty
  }

  throw new Error("图像生成失败：模型未返回有效的图像数据。");
}

async function generateXiaohongshuCaption(topic: string, productImages: string[]): Promise<string> {
  const prompt = `Generate an engaging Xiaohongshu (Little Red Book) caption for OUTDOOR PRODUCTS (户外产品).
  Topic: ${topic}
  The caption should include:
  1. A catchy title with emojis that appeals to outdoor enthusiasts.
  2. 3-4 short paragraphs of enthusiastic, lifestyle-oriented body text emphasizing functionality, style, and the outdoor experience.
  3. A list of 5-8 relevant hashtags (e.g., #小红书种草 #户外穿搭 #露营装备 #户外生活).
  Language: Chinese.
  Return ONLY the text of the caption.`;

  const parts: any[] = [{ text: prompt }];
  if (productImages.length > 0) {
    parts.push({
      inlineData: {
        data: productImages[0].split(",")[1],
        mimeType: "image/png"
      }
    });
  }

  try {
    const response = await withRetry(() => generateContent({
      model: TEXT_GEN_MODEL,
      task: BILLING_TASK_TEXT,
      billing_task: BILLING_TASK_TEXT,
      contents: { parts }
    }));

    return extractTextFromResponse(response as any) || "";
  } catch (e) {
    console.error("Caption generation error:", e);
    return "✨ 发现超可爱的童装穿搭！\n\n今天给宝贝穿上这套衣服，简直是整条街最靓的仔。面料舒服，设计感满满，爱了爱了！\n\n#小红书种草 #童装穿搭 #高颜值童装";
  }
}
