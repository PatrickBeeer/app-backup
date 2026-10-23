import { generateContent, extractImageBase64FromResponse } from '../../../shared_services/geminiProxyService';

const TASK_MODEL_MAP = {
  text_gen: 'gemini-3-flash-preview',
  image_gen: 'gemini-3.1-flash-image-preview',
  video_gen: 'veo_3_1',
} as const;

const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 1200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isRetryableGenerationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return [
    '429',
    '500',
    '502',
    '503',
    '504',
    'timeout',
    'network',
    'fetch',
    'temporarily',
  ].some((needle) => message.includes(needle));
}

async function withRetry<T>(factory: () => Promise<T>): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < MAX_RETRY_ATTEMPTS) {
    try {
      return await factory();
    } catch (error) {
      lastError = error;
      attempt += 1;

      if (attempt >= MAX_RETRY_ATTEMPTS || !isRetryableGenerationError(error)) {
        break;
      }

      const waitMs = BASE_RETRY_DELAY_MS * (2 ** (attempt - 1));
      await sleep(waitMs);
    }
  }

  throw lastError;
}

interface RefImageInfo {
  base64: string;
  mimeType: string;
}

export async function generateMockup(
  base64Image: string,
  mimeType: string,
  scenePrompt: string,
  aspectRatio: string,
  productType: string = 'wall',
  dimensions?: string,
  material?: string,
  smartRecognition: boolean = true,
  refImage?: RefImageInfo | null
): Promise<string> {
  let placementInstruction = '';
  switch (productType) {
    case 'standing':
      placementInstruction = "Render the design as a freestanding totem, pylon, or standing sign placed ON THE FLOOR/GROUND. It must have proper 3D depth, thickness, and a heavy base. Ensure the perspective matches the ground plane. Cast realistic contact shadows on the floor.";
      break;
    case 'outdoor':
      placementInstruction = "Render the design as a large-scale outdoor signage or billboard structure on a building facade or pole. It should look massive. Ensure the lighting direction matches the outdoor sun. Match the perspective of the building architecture perfectly.";
      break;
    case 'wall':
    default:
      placementInstruction = "Mount the design on the vertical surface (wall/glass) described in the scene. IMPORTANT: Align the perspective of the sign to match the angle of the wall exactly. If the wall is angled, the sign must be angled/distorted to fit naturally. Add subtle drop shadows to create depth.";
      break;
  }

  let extractionInstruction = smartRecognition
    ? "CRITICAL INSTRUCTION: The FIRST input image contains a design object. You MUST crop/extract ONLY the main design/logo/signage object from this FIRST image. IGNORE the original background of the first image. "
    : "Use the FIRST input image as the source design. ";

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { inlineData: { data: base64Image, mimeType } },
  ];

  let refImageInstruction = '';
  if (refImage) {
    parts.push({ inlineData: { data: refImage.base64, mimeType: refImage.mimeType } });
    refImageInstruction = "The SECOND image provided is a STYLE/SCENE REFERENCE. You must place the design extracted from the FIRST image into a scene that closely resembles the style, lighting, and environment of the SECOND image. Use the SECOND image to determine the background environment.";
  }

  let promptWithDetails = `${extractionInstruction} ${refImageInstruction} ${scenePrompt} ${placementInstruction}`;
  if (dimensions) promptWithDetails += ` The physical dimensions of the object should be perceived as approximately ${dimensions}.`;
  if (material) promptWithDetails += ` The object is constructed from ${material}. Render the texture and reflections of ${material} accurately.`;
  parts.push({ text: promptWithDetails });

  const response = await withRetry(() => generateContent({
    model: TASK_MODEL_MAP.image_gen,
    task: 'image_gen',
    contents: { parts },
    config: {
      imageConfig: { aspectRatio },
    },
    retry_attempt: MAX_RETRY_ATTEMPTS,
  }));

  const imageData = extractImageBase64FromResponse(response);
  if (!imageData) throw new Error("AI did not return an image. Please try a different scene or check the prompt.");
  return `data:image/png;base64,${imageData}`;
}
