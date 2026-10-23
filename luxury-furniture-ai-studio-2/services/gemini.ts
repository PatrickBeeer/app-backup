
import { generateContent, extractImageFromResponse } from '../../../shared_services/geminiProxyService';
import { SceneStyle, AspectRatio, ModelEthnicity, ModelAge, ImageSize } from "../types";
import { STYLE_OPTIONS } from "../constants";

// Helper function for exponential backoff delay
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * Internal helper to generate a single image with retry logic.
 */
const _generateSingleImage = async (
  modelName: string,
  parts: any[],
  aspectRatio: AspectRatio,
  imageSize: ImageSize,
  useHighResModel: boolean
): Promise<string> => {
  const maxRetries = 3;
  let lastError: any;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await generateContent({
        model: modelName,
        task: 'image_gen',
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio as any,
            ...(useHighResModel ? { imageSize: imageSize as any } : {})
          }
        }
      });

      const imageUrl = extractImageFromResponse(response) || '';

      if (!imageUrl) throw new Error("No image data returned from model");
      return imageUrl;
    } catch (error: any) {
      lastError = error;
      if (error?.status === 'UNAVAILABLE' || error?.message?.includes('503') || error?.message?.includes('429')) {
        console.warn(`Attempt ${attempt + 1} failed due to server demand. Retrying...`);
        await delay(Math.pow(2, attempt) * 1000 + Math.random() * 500); // Add jitter
        continue;
      }
      throw error;
    }
  }
  throw lastError;
};

/**
 * Generates two scene images in parallel.
 */
export const generateSceneImage = async (
  base64Image: string,
  styleId: SceneStyle,
  aspectRatio: AspectRatio,
  imageSize: ImageSize,
  withModel: boolean,
  modelEthnicity?: ModelEthnicity,
  modelAge?: ModelAge,
  refineInstructions?: string,
  fullPromptOverride?: string,
  referenceStyleImage?: string 
): Promise<string[]> => {
  const useHighResModel = imageSize === '2K' || imageSize === '4K';
  const modelName = useHighResModel ? 'gemini-3.1-flash-image-preview' : 'gemini-3.1-flash-image-preview';

  const style = STYLE_OPTIONS.find(s => s.id === styleId);
  
  let finalPrompt = "";

  if (fullPromptOverride) {
    finalPrompt = fullPromptOverride;
  } else {
    let modelInstruction = "";
    if (withModel) {
      const ethnicityStr = modelEthnicity === 'ASIAN' ? 'Asian' : modelEthnicity === 'WESTERN' ? 'Western/Caucasian' : 'international fashion';
      const ageStr = modelAge === 'YOUNG' ? 'young adult (20-30s)' : 'sophisticated middle-aged (40-50s)';
      modelInstruction = `Include a high-end ${ethnicityStr} model, ${ageStr}, naturally interacting with the furniture. The model should look stylish and professional.`;
    } else {
      modelInstruction = "Focus solely on the furniture, no people.";
    }

    const refinementPart = refineInstructions ? `\nADDITIONAL USER INSTRUCTIONS: ${refineInstructions}` : "";
    const styleSource = referenceStyleImage ? "Use the lighting, color palette, and environmental atmosphere provided in the SECOND image as a direct reference for the background." : `Environment Style: ${style?.prompt}.`;

    finalPrompt = `
      Task: E-commerce Product Scene Transformation.
      Product: Preserve the furniture item from the FIRST provided image exactly (shape, texture, and color).
      Style Reference: ${styleSource}
      Character: ${modelInstruction}
      ${refinementPart}
      Output Quality: Professional product catalog shoot, high-end commercial aesthetics (Tmall/JD style), realistic physics-based lighting and shadows.
    `.trim();
  }

  const parts: any[] = [
    {
      inlineData: {
        data: base64Image.split(',')[1],
        mimeType: 'image/png'
      }
    }
  ];

  if (referenceStyleImage) {
    parts.push({
      inlineData: {
        data: referenceStyleImage.split(',')[1],
        mimeType: 'image/png'
      }
    });
  }

  parts.push({ text: finalPrompt });

  // Call the single generation twice in parallel to get two distinct variations
  const results = await Promise.all([
    _generateSingleImage(modelName, parts, aspectRatio, imageSize, useHighResModel),
    _generateSingleImage(modelName, parts, aspectRatio, imageSize, useHighResModel)
  ]);

  return results;
};
