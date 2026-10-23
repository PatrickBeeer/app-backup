import { GeneratedImage, AspectRatio } from "../types";
import { generateContent, extractImageFromResponse } from "../../../shared_services/geminiProxyService";

// 使用 gemini-3.1-flash-image-preview 模型（通过 NewAPI 服务）
const MODEL_NAME = 'gemini-3.1-flash-image-preview';
const IMAGE_TASK = 'image_gen';

/**
 * Encodes a file to Base64
 */
export const fileToGenerativePart = async (file: File): Promise<{ data: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data url prefix (e.g. "data:image/jpeg;base64,")
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
 * Generates a single scene image based on input product images and configuration.
 */
const generateSingleScene = async (
  imageParts: { data: string; mimeType: string }[],
  scenarioPrompt: string,
  aspectRatio: AspectRatio
): Promise<string | null> => {
  try {
    // Defaulting to High Quality/Photorealistic prompt instructions
    const qualityPrompt = 'Output requirements: 8k resolution, ultra-detailed, photorealistic masterpiece, professional commercial photography, sharp focus, cinematic lighting.';

    const prompt = `
      You are an expert product photographer for Joyoung (九阳), a premium kitchen appliance brand.
      
      Task:
      Take the product(s) shown in the input image(s) and generate a lifestyle image placed in the following setting: ${scenarioPrompt}.
      
      Guidelines:
      1. Visually Integrity: Preserve the exact visual identity, color, and key features of the product(s) from the input(s).
      2. Composition: The product(s) must be the main subject.
      3. Brand Vibe: Professional, warm, and inviting (Joyoung brand style).
      4. Perspective: Natural and physically accurate for the scene.
      5. ${qualityPrompt}
      6. Output ONLY the image.
      7. IMPORTANT: The generated image aspect ratio must be strictly ${aspectRatio}. Please ensure the composition and layout fully comply with this aspect ratio requirement.
    `;

    const contentsParts: any[] = imageParts.map(part => ({
      inlineData: {
        data: part.data,
        mimeType: part.mimeType,
      },
    }));

    contentsParts.push({ text: prompt });

    const response = await generateContent({
      model: MODEL_NAME,
      task: IMAGE_TASK,
      billing_task: IMAGE_TASK,
      contents: { parts: contentsParts },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio,
        },
      }
    });

    const imageUrl = extractImageFromResponse(response);
    return imageUrl;

  } catch (error) {
    console.error("Error generating scene:", error);
    return null;
  }
};

/**
 * Orchestrates the generation of multiple scenes
 */
export const generateProductScenes = async (
  files: File[],
  scenarios: { id: string; promptSuffix: string; title: string }[],
  options: {
    customDetails?: string;
    aspectRatio: AspectRatio;
  }
): Promise<GeneratedImage[]> => {
  
  // Convert all files to base64
  const imageParts = await Promise.all(files.map(file => fileToGenerativePart(file)));

  // Run all generations in parallel
  const promises = scenarios.map(async (scene) => {
    let finalPrompt = scene.promptSuffix;
    
    // Append custom details if provided
    if (options.customDetails && options.customDetails.trim()) {
      finalPrompt += ` Important Note: The scene must also include: ${options.customDetails}.`;
    }

    const imageUrl = await generateSingleScene(
      imageParts, 
      finalPrompt, 
      options.aspectRatio
    );

    if (!imageUrl) return null;
    
    return {
      id: scene.id,
      url: imageUrl,
      scenario: scene.title,
      prompt: finalPrompt,
      aspectRatio: options.aspectRatio
    } as GeneratedImage;
  });

  const results = await Promise.all(promises);
  
  // Filter out any failed generations
  return results.filter((img): img is GeneratedImage => img !== null);
};

