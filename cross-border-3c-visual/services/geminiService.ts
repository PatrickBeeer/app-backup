import { generateContent, extractJsonTextFromResponse, extractImageBase64FromResponse } from '../../../shared_services/geminiProxyService';
import { VisualStyle, AspectRatio, PlanningResponse, TargetMarket } from '../types';

const marketLanguageMap: Record<TargetMarket, string> = {
  [TargetMarket.USA]: 'English',
  [TargetMarket.UK]: 'English',
  [TargetMarket.GERMANY]: 'German',
  [TargetMarket.JAPAN]: 'Japanese',
  [TargetMarket.FRANCE]: 'French',
};

/**
 * Maps target market to specific ethnicity requirements.
 * Per user request: Japan -> Japanese, all others -> Caucasian.
 */
const marketEthnicityMap: Record<TargetMarket, string> = {
  [TargetMarket.USA]: 'Caucasian American models',
  [TargetMarket.UK]: 'British Caucasian models',
  [TargetMarket.GERMANY]: 'German Caucasian models',
  [TargetMarket.JAPAN]: 'Japanese models',
  [TargetMarket.FRANCE]: 'French Caucasian models',
};

/**
 * Generates a 6-image visual strategy plan for an Amazon 3C product using Gemini 3 Pro.
 */
export const generateVisualPlan = async (
  base64Image: string,
  mimeType: string,
  style: VisualStyle,
  ratio: AspectRatio,
  market: TargetMarket
): Promise<PlanningResponse> => {
  const language = marketLanguageMap[market];
  const ethnicity = marketEthnicityMap[market];
  
  const styleDefinitions = {
    [VisualStyle.CYBERPUNK]: `
      Aesthetic: Top-tier tech media aesthetic (The Verge, Apple official website). Tech-aesthetic, Premium build quality, Sophisticated lighting.
      Color Palette: Space Gray (primary material tone) with Electric Blue / Cyan light accents on edges and LEDs.
      Environment: On a dark brushed metal surface OR Floating in a clean, neutral studio space.
      Lighting Setup: 
      - Cinematic Rim Lighting: Sharp highlights in Electric Blue / Cyan light to define the product silhouette and create a deep 3D effect.
      - Soft Diffused Side Light: Gentle illumination from the side to reveal fine material textures in Space Gray (brushed metal, matte textures).
      - Cyberpunk Accents: Tiny, strategic pin-lights of Cyan Blue and Warm Orange only on LEDs, ports, or tight crevices. NO full-screen color washes.
      - Subtle Caustic Reflections: Realistic light refraction on glass/metal surfaces.
      Camera: Realistic lens physics, shallow depth of field (f/1.8 to f/2.8), sharp focus on key textures.
    `,
    [VisualStyle.APPLE]: `
      Aesthetic: Minimalist Apple-style.
      Lighting: Soft, high-key ambient light, pure and clean shadows.
      Color: Monochromatic whites, silvers, and grays.
      Environment: Clean, empty space, minimalist geometric surfaces.
    `,
    [VisualStyle.COMMERCIAL]: `
      Aesthetic: High-end luxury commercial.
      Lighting: Warm ambient lighting, dramatic contrast, focused spotlights.
      Environment: Premium materials like dark walnut wood, brushed metals, leather.
    `
  };

  const imagePart = {
    inlineData: {
      data: base64Image,
      mimeType: mimeType,
    },
  };

  const textPart = {
    text: `
      As a world-class Amazon 3C visual planner, analyze the provided product image and generate a 6-image visual strategy.
      
      Target Market: ${market}
      Market Language: ${language}
      Target Model Ethnicity: ${ethnicity} (CRITICAL: Except for Japan, always use Caucasian models. For Japan, use Japanese models).
      Selected Style Base: ${style}
      Style Technical Specs: ${styleDefinitions[style]}
      Aspect Ratio: ${ratio}

      STRICT VISUAL RULES:
      1. Image 1 (Primary Lifestyle): MUST BE HIGHLY REALISTIC. 
         - Models: Use ${ethnicity}. Skin texture must be authentic with visible pores and natural imperfections.
         - Lighting: STRICTLY NO artificial "Cyberpunk" or "Electric Blue" light effects on humans or in the environment. Use natural daylight or professional studio softboxes.
         - Text: DO NOT include any overlayText for Image 1.
      2. Image 2: MUST be a Macro Shot. Intense close-up on product materials, craftsmanship, and textures (Space Gray brushed metal). Emphasize Rim Lighting and technical precision.
      3. Image 3 (Core USP / Internal Tech): Use this EXACT prompt prefix: "Close-up macro shot of the internal driver unit of the headphones, transparent tech aesthetic, highlighting the copper voice coils and high-quality diaphragm. Soft glowing blue circuit board accents in the background. Industrial engineering style, high precision, sharp focus, technical lighting, ".
      4. Image 4: Functional Details & Ports. Macro view of physical interfaces and buttons.
      5. Image 5 (Secondary Lifestyle/Context): Realistic usage by ${ethnicity}. Skin must have pores/texture. Background/Clothing can subtly match the theme, but lighting must remain natural. NO blue/cyan light washes on people.
      6. AI Prompt Engineering: Always include "hyper-realistic skin texture, visible pores, 8k resolution, authentic human photography, ${ethnicity}" for lifestyle shots.
      7. Typography Consistency: All marketing text in overlayText must follow a UNIFORM high-end, clean, minimalist sans-serif typography style (like SF Pro or Helvetica).
      8. Color Locking: For 3C Tech Style images (2,3,4,6), use "Space Gray" and "Electric Blue / Cyan light".

      Output must be in JSON format.
    `
  };

  const responseSchema = {
    type: "object",
    properties: {
      productName: { type: "string" },
      style: { type: "string" },
      strategies: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "integer" },
            title: { type: "string" },
            concept: { type: "string" },
            details: { type: "string" },
            aiPrompt: { type: "string" },
            overlayText: { type: "string", description: `Concise marketing copy in ${language}. Leave empty for Image 1.` },
          },
          required: ['id', 'title', 'concept', 'details', 'aiPrompt', 'overlayText']
        }
      }
    },
    required: ['productName', 'style', 'strategies']
  };

  const response = await generateContent({
    model: 'gemini-3-flash-preview',
    task: 'text_gen',
    contents: { parts: [imagePart, textPart] },
    config: {
      responseMimeType: 'application/json',
      responseSchema: responseSchema,
    },
  });

  const jsonText = extractJsonTextFromResponse(response);
  return JSON.parse(jsonText) as PlanningResponse;
};

/**
 * Generates an individual image using gemini-3.1-flash-image-preview based on a strategy prompt.
 */
export const generateImageFromPrompt = async (
  prompt: string,
  ratio: AspectRatio,
  referenceImage?: { base64: string; mimeType: string },
  overlayText?: string,
  isLifestyle: boolean = false
): Promise<string> => {
  const parts: any[] = [];
  
  if (referenceImage) {
    parts.push({
      inlineData: {
        data: referenceImage.base64,
        mimeType: referenceImage.mimeType
      }
    });
  }
  
  // Enforce high-end uniform typography
  const textContent = overlayText ? `Include the text "${overlayText}" naturally in a high-end, uniform minimalist sans-serif typography style (like Apple's SF Pro) within the composition. The typography must be consistent across all images in the set. ` : '';
  
  const lifestyleRules = isLifestyle ? 
    `STRICT LIFESTYLE RULES: 
     1. Human skin must be highly detailed with visible pores, fine lines, and natural texture. No beauty filters.
     2. Absolutely NO artificial neon, blue, or cyan light effects on the people or skin. 
     3. Lighting must be natural daylight or clean neutral studio light. 
     4. Maintain natural skin tones, do not tint the face. Ensure ethnicity matches the prompt exactly.` : 
    `TECH STYLE RULES: You may use sophisticated tech-aesthetic lighting like electric blue or cyan rim lights.`;

  parts.push({
    text: `Strict Consistency: Maintain the exact product design, materials, and colors from the reference image.
    Photography Aesthetic: Cinematic Commercial Photography. Avoid generic AI look. Use realistic lens effects like shallow depth of field.
    ${lifestyleRules}
    Composition rules: ${textContent}Strictly follow this technical prompt for lighting and environment: ${prompt}`
  });

  const response = await generateContent({
    model: 'gemini-3.1-flash-image-preview',
    task: 'image_gen',
    contents: { parts },
    config: {
      imageConfig: {
        aspectRatio: ratio === AspectRatio.SQUARE ? "1:1" : "3:4" 
      }
    }
  });

  const imageData = extractImageBase64FromResponse(response);
  if (!imageData) {
    throw new Error("No image data found in response");
  }

  return `data:image/png;base64,${imageData}`;
};
