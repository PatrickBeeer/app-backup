import { generateContent, extractImageFromResponse } from '../../../shared_services/geminiProxyService';
import { TryOnRequest } from '../types';

const GEMINI_TEXT_MODEL = 'gemini-3-flash-preview';
const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const VEO_VIDEO_MODEL = 'veo_3_1';

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
  'plain_studio': "A Minimalist style professional studio background. Pure white or light grey solid color. High-key lighting, soft shadows, clean and pure aesthetic.",
  'morandi_studio': "A high-end studio background with Morandi color tones (muted sage green, dusty pink, or grey-blue). Artistic, soft, and premium e-commerce look.",
  'podium_display': "A modern abstract podium or geometric block setup. The model stands near a clean architectural shape. Minimalist art direction.",
  'geometric_space': "A Minimalist style architectural space with simple geometric forms. White walls, sharp angles, soft diffused light.",
  'concrete_wall': "A Minimalist style background featuring a raw concrete wall. Industrial yet clean, cool tones, fashion editorial vibe.",
  'sunlight_window': "A Minimalist style indoor setting next to a large window. Sheer curtains, bright natural sunlight casting soft shadows on white walls.",
  'art_gallery': "A Luxury style art gallery background. Clean white walls, spot lighting, polished concrete or wood floors, upscale and elegant.",
  'luxury_hotel': "A Luxury style high-end hotel lobby background. Warm golden lighting, marble floors, expensive decor, sophisticated atmosphere.",
  'fashion_boutique': "Inside a high-end fashion boutique or walk-in closet. Blurred racks of clothes in the background, mirrors, premium warm lighting.",
  'marble_hall': "A Luxury style grand hall with polished marble walls and floors. Reflective surfaces, premium and expensive look.",
  'spiral_staircase': "A Luxury style background featuring a modern architectural spiral staircase. Elegant curves, premium materials, high-fashion setting.",
  'french_mansion': "A Luxury style French mansion interior. Boiserie wall moldings, high ceilings, elegant parquet floors, vintage luxury.",
  'city_street': "A Street style urban city background. Blurred city buildings, asphalt road, daylight, cool fashion snap vibe.",
  'brick_wall_alley': "A vintage brick wall background or clean alleyway. Texture-rich, hipster, casual street fashion vibe.",
  'neon_night': "A Street style cyberpunk or night city background. Neon lights, wet pavement, moody and cinematic.",
  'coffee_shop_exterior': "Outside a trendy street-corner cafe. Glass windows, outdoor seating, urban lifestyle vibe.",
  'rooftop': "A Street style city rooftop background. Skyline view in the distance, concrete parapet, open sky, urban freedom.",
  'skate_park': "A Street style concrete skate park background. Curves, ramps, harsh sunlight, energetic and sporty.",
  'sunny_grassland': "A Natural style open grassland background. Bright sunlight, blue sky, fresh green grass, freedom and freshness.",
  'flower_field': "A field of blooming flowers. Romantic, soft focus, spring atmosphere, dreamy colors.",
  'yacht_deck': "On the deck of a luxury yacht. Blue ocean background, white railings, bright sunlight, expensive vacation vibe.",
  'tennis_court': "A clean tennis court background. Green or clay surface, white lines, sporty and preppy fashion aesthetic.",
  'beach_resort': "A Natural style beach resort background. White sand, blue ocean, palm trees, sunny holiday vibe.",
  'quiet_forest': "A Natural style forest background. Tall trees, filtered sunlight (dappled light), deep greens, serene and organic.",
  'cozy_living_room': "A Lifestyle home background. Cozy modern living room, soft fabric sofa, warm lighting, relaxed atmosphere.",
  'bedroom_mirror': "A bedroom setting with a large floor mirror (implied selfie view or casual snap). Soft bed in background, messy-chic, intimate.",
  'modern_kitchen': "A Lifestyle modern kitchen background. Clean countertops, bright lighting, domestic and neat.",
  'balcony_plants': "A Lifestyle balcony background. Potted plants, outdoor furniture, sunlight, homey and fresh.",
  'afternoon_cafe': "A Lifestyle cafe interior. Wooden tables, blurred background of other tables, relaxed afternoon vibe.",
  'modern_office': "A Professional office background. Modern open-plan office, glass walls, blurred desks, business atmosphere.",
  'elevator_hall': "A modern office building elevator hall. Metallic textures, reflections, sharp business look.",
  'cbd_skyline': "A Professional background with a view of the CBD city skyline through a large office window. Success and ambition.",
};

// Define Pose Instructions
const poseInstructions: Record<string, string> = {
  'standing_basic': "Pose: Standing straight, facing the camera naturally. Arms relaxed by sides. Standard e-commerce model pose.",
  'standing_crossed_arms': "Pose: Standing confident with arms crossed. Powerful and professional stance.",
  'standing_hands_pocket': "Pose: Standing with one or both hands in pockets. Casual, cool, and relaxed vibe.",
  'leaning_wall': "Pose: Leaning casually against a wall. Relaxed posture, one leg slightly bent. Effortless style.",
  'walking': "Pose: Walking towards the camera or slightly to the side. Dynamic movement, hair flowing, clothes in motion.",
  'running': "Pose: Running or jogging motion. High energy, athletic posture (suitable for sportswear).",
  'sitting_stool': "Pose: Sitting elegantly on a high stool. Legs crossed or extended to show shoes/pants.",
  'sitting_chair': "Pose: Sitting comfortably in a chair or armchair. Relaxed lifestyle pose.",
  'sitting_floor': "Pose: Sitting on the floor/ground. Casual, youthful, legs crossed or extended.",
  'looking_back': "Pose: Turning back to look at the camera over the shoulder. Highlights the back of the garment or side profile.",
  'side_profile': "Pose: Standing in side profile. showcasing the silhouette of the outfit from the side.",
  'dynamic_fashion': "Pose: High-fashion dynamic pose. Angular limbs, expressive movement, editorial magazine style.",
};

// Define Photography Settings Instructions
const timeInstructions: Record<string, string> = {
  'default': "Time of Day: Appropriate for the scene (usually daytime).",
  'morning': "Time of Day: Early morning. Cool, soft, bluish light. Fresh atmosphere.",
  'noon': "Time of Day: High noon. Bright, direct, hard sunlight. Strong shadows.",
  'sunset': "Time of Day: Golden hour/Sunset. Warm, golden, directional light. Romantic and soft.",
  'night': "Time of Day: Nighttime. Dark background, artificial lighting sources, moody.",
};

const lightingInstructions: Record<string, string> = {
  'natural': "Lighting: Natural daylight. Soft, even distribution, resembling outdoor sun.",
  'studio': "Lighting: Professional studio strobe lighting. Balanced fill, rim light, and key light. Clean and commercial.",
  'cinematic': "Lighting: Cinematic lighting. Moody, high contrast, interesting color grading, storytelling atmosphere.",
  'dramatic': "Lighting: Dramatic/Hard lighting. Strong shadows, high contrast, bold look (Chiaroscuro).",
  'soft': "Lighting: Soft/Diffused lighting. Large softbox aesthetic, flattering on skin, low contrast, gentle.",
};

const qualityInstructions: Record<string, string> = {
  'realistic': "Image Style: Ultra-Realistic / RAW Photography. Look like a high-end DSLR photo without excessive filtering. Sharp details, natural skin texture.",
  'editorial': "Image Style: High Fashion Editorial / Magazine. Polished, retouched perfection, glamorous, high-end commercial aesthetic.",
  'lifestyle': "Image Style: Candid Lifestyle / Social Media. Relaxed, slightly imperfect, natural 'snapshot' vibe, authentic.",
  'film': "Image Style: Analog Film Photography. Fine grain, vintage color science (Kodak/Portra style), artistic and nostalgic.",
  'xiaohongshu': "Image Style: Xiaohongshu / Red Note Aesthetic. CRITICAL: Render the model with 'Cold White Skin' tone (Cool-toned pale skin, 冷白皮). Apply a soft 'Influencer Beauty Filter' aesthetic. High-key lighting, vibrant but slightly desaturated background colors to pop the subject. Flawless, smooth skin texture. Trendy, engaging social media vibe.",
};

// Define Model Descriptions
const ethnicityMap: Record<string, string> = {
  'asian': 'East Asian',
  'caucasian': 'Caucasian/White',
  'black': 'Black/African descent',
  'latino': 'Hispanic/Latino',
  'southeast_asian': 'Southeast Asian',
  'mixed': 'Mixed race',
};

const ageMap: Record<string, string> = {
  'teen': 'Young adult (approx 18-20 years old)',
  '20s': 'Adult (approx 20-29 years old)',
  '30s': 'Adult (approx 30-39 years old)',
  '40s': 'Mature adult (approx 40-49 years old)',
};

const bodyShapeMap: Record<string, string> = {
  'slim': 'Slim, very slender fashion model physique',
  'standard': 'Standard, well-proportioned fit body',
  'athletic': 'Athletic, toned, and defined musculature (fitness model)',
  'curvy': 'Curvy, hourglass figure with accentuated hips and bust',
  'pear': 'Pear-shaped body type (wider hips)',
  'plus_size': 'Plus-size, full-figured model',
  'muscular': 'Strong, muscular physique',
  'petite': 'Petite, smaller frame',
  'tall': 'Tall, statuesque long-legged frame',
};

export const generateTryOn = async (request: TryOnRequest): Promise<string> => {
  const { 
    clothingImage, 
    modelImage, 
    garmentCategory, 
    backgroundStyle, 
    aspectRatio, 
    isProductFocus,
    timeOfDay,
    lighting,
    imageQuality,
    modelEthnicity,
    modelAge,
    modelBodyShape,
    modelPose,
    customPrompt 
  } = request;

  const parts: any[] = [];

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
  const envInstruction = backgroundInstructions[backgroundStyle] || backgroundInstructions['plain_studio'];
  const poseInst = poseInstructions[modelPose] || poseInstructions['standing_basic'];
  
  const timeInst = timeInstructions[timeOfDay] || timeInstructions['default'];
  const lightInst = lightingInstructions[lighting] || lightingInstructions['natural'];
  const qualityInst = qualityInstructions[imageQuality] || qualityInstructions['realistic'];

  let prompt = "";

  if (modelImage) {
    // Add Model Image First
    parts.push({
      inlineData: {
        mimeType: modelImage.mimeType,
        data: modelImage.base64Data,
      },
    });

    // Add Clothing Image Second
    parts.push({
      inlineData: {
        mimeType: clothingImage.mimeType,
        data: clothingImage.base64Data,
      },
    });

    prompt = customPrompt || `
      Act as a professional fashion stylist and photo editor.
      
      Input 1: Target Model.
      Input 2: Clothing Item (Category: ${garmentCategory}).
      
      Goal: Dress the Target Model (Input 1) in the clothing item from Input 2 while generating a cohesive, stylish look for an e-commerce listing.

      Instructions:
      1. GARMENT FIDELITY (EXTREMELY IMPORTANT): The clothing item from Input 2 must be rendered EXACTLY as is.
         - STRICTLY PRESERVE structural details: collars, sleeves, cuffs, buttons, zippers, pockets, and seams must match the input image 100%.
         - STRICTLY PRESERVE pattern and logo: Do not distort, remove, or change any prints, logos, or patterns.
         - STRICTLY PRESERVE texture and material: If it's denim, silk, wool, etc., render it with the correct physics and light reflection.
         - Do NOT change the cut or design of the garment.
      2. IDENTITY PRESERVATION (CRITICAL): You MUST preserve the facial features, identity, hair, and skin tone of the Target Model from Input 1. The result MUST look exactly like the same person.
      3. FIT & POSE: Place the clothing (Input 2) naturally on the model (Input 1), preserving the model's original body shape. ${modelPose !== 'standing_basic' ? 'NOTE: Since a specific custom model is provided, try to adapt the pose if possible, but prioritize the original model image pose if drastic changes would distort identity.' : ''}
      4. STYLING: ${styleInstruction} Ensure the colors and textures of the generated parts match the uploaded item perfectly.
      5. ENVIRONMENT: ${envInstruction} (Replace the original background).
      6. PHOTOGRAPHY SETTINGS:
         - ${timeInst}
         - ${lightInst}
         - ${qualityInst}
      7. FRAMING: ${framingInstruction}
      8. QUALITY: Photorealistic, high-resolution, correct fabric physics (folds, drapes).
    `;
  } else {
    // Only Clothing Image
    const ethnicityDesc = ethnicityMap[modelEthnicity] || 'diverse';
    const ageDesc = ageMap[modelAge] || 'young adult';
    const bodyDesc = bodyShapeMap[modelBodyShape] || 'standard';

    parts.push({
      inlineData: {
        mimeType: clothingImage.mimeType,
        data: clothingImage.base64Data,
      },
    });

    prompt = customPrompt || `
      Act as a professional fashion photographer and stylist.
      
      Input 1: Clothing Item (Category: ${garmentCategory}).
      
      Goal: Generate a stunning model photo showcasing this product for an online store.
      
      Instructions:
      1. GARMENT FIDELITY (EXTREMELY IMPORTANT): The clothing item from Input 1 must be worn by the model EXACTLY as is.
         - STRICTLY PRESERVE structural details: collars, sleeves, cuffs, buttons, zippers, pockets, and seams must match the input image 100%.
         - STRICTLY PRESERVE pattern and logo: Do not distort, remove, or change any prints, logos, or patterns.
         - STRICTLY PRESERVE texture and material: If it's denim, silk, wool, etc., render it with the correct physics and light reflection.
         - Do NOT change the cut or design of the garment.
      2. MODEL: Generate a professional fashion model.
         - Ethnicity: ${ethnicityDesc}
         - Age: ${ageDesc}
         - Body Shape: ${bodyDesc}
         - Pose: ${poseInst}
         - Skin Tone: ${imageQuality === 'xiaohongshu' ? 'Cold White Skin tone (Pale, Cool-toned)' : 'Natural lighting skin tone'}.
      3. STYLING (CRITICAL): ${styleInstruction} The generated items must color-coordinate with the input item to create a fashionable look.
      4. ENVIRONMENT: Place the model in: ${envInstruction}
      5. PHOTOGRAPHY SETTINGS:
         - ${timeInst}
         - ${lightInst}
         - ${qualityInst}
      6. FRAMING: ${framingInstruction}
    `;
  }

  // 在提示词中明确强调宽高比要求
  const enhancedPrompt = `${prompt}\n\n重要提示：生成的图片宽高比必须严格为 ${aspectRatio}，请确保构图和布局完全符合此比例要求。`;
  
  // Append the text prompt
  parts.push({ text: enhancedPrompt });

  try {
    const response = await generateContent({
      model: GEMINI_IMAGE_MODEL,
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
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

