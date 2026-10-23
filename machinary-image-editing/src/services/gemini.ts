import {
  generateContent,
  extractImageFromResponse,
  type GeminiGenerateRequest,
} from '../../../../shared_services/geminiProxyService';

const MODEL_BY_TASK = {
  text: 'gemini-3-flash-preview',
  image: 'gemini-3.1-flash-image-preview',
  video: 'veo_3_1',
} as const;

const MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2048;

type TaskKind = keyof typeof MODEL_BY_TASK;

function isPayloadTooLargeMessage(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes('413') || lower.includes('request entity too large') || lower.includes('payload too large');
}

function payloadTooLargeErrorMessage(): string {
  return '图片请求体过大（HTTP 413）。系统已尝试压缩图片，请进一步降低原图分辨率或裁剪后重试。';
}

function resolveModelForTask(task: TaskKind): string {
  return MODEL_BY_TASK[task];
}

function estimateBase64Bytes(base64Data: string): number {
  const padding = (base64Data.match(/=+$/)?.[0]?.length || 0);
  return Math.floor((base64Data.length * 3) / 4) - padding;
}

function toDataUrl(dataOrDataUrl: string, mimeType: string): string {
  if (dataOrDataUrl.startsWith('data:')) return dataOrDataUrl;
  return `data:${mimeType};base64,${dataOrDataUrl}`;
}

function splitDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const [head, base64] = dataUrl.split(',', 2);
  const mimeType = head?.split(';')[0]?.split(':')[1] || 'image/jpeg';
  return { mimeType, base64: base64 || '' };
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片解析失败'));
    img.src = dataUrl;
  });
}

async function compressLargeImage(dataOrDataUrl: string, inputMimeType: string): Promise<{ data: string; mimeType: string }> {
  const initialDataUrl = toDataUrl(dataOrDataUrl, inputMimeType);
  const initial = splitDataUrl(initialDataUrl);
  if (!initial.base64 || estimateBase64Bytes(initial.base64) <= MAX_INLINE_IMAGE_BYTES) {
    return { data: initial.base64, mimeType: initial.mimeType };
  }

  const img = await loadImage(initialDataUrl);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(img.width, img.height));
  const targetW = Math.max(1, Math.round(img.width * scale));
  const targetH = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { data: initial.base64, mimeType: initial.mimeType };
  }

  ctx.drawImage(img, 0, 0, targetW, targetH);

  const qualitySteps = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5];
  let bestData = initial.base64;
  for (const quality of qualitySteps) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const parsed = splitDataUrl(dataUrl);
    if (!parsed.base64) continue;
    bestData = parsed.base64;
    if (estimateBase64Bytes(parsed.base64) <= MAX_INLINE_IMAGE_BYTES) {
      return { data: parsed.base64, mimeType: 'image/jpeg' };
    }
  }

  return { data: bestData, mimeType: 'image/jpeg' };
}

export async function retouchImage(
  image: string, 
  mimeType: string, 
  size: string = "1:1", 
  resolution: string = "1K",
  intensity: number = 80,
  isRefinement: boolean = false
) {
  const prepared = await compressLargeImage(image, mimeType || 'image/jpeg');

  const prompt = isRefinement 
    ? `As a world-class 3D CGI Artist, you are provided with a PREVIOUSLY RETOUCHED image of an industrial machine.
    
    TASK: Fine-tune the METALLIC INTENSITY of this image to exactly ${intensity}/100.
    
    STRICT RULE: ABSOLUTE STRUCTURAL PRESERVATION
    - YOU ARE FORBIDDEN FROM CHANGING THE GEOMETRY, SHAPE, OR POSITION of any components.
    - Every screw, gear, wire, and mechanical detail must remain in its exact original location.
    - DO NOT simplify or remove complex internal layouts.
    
    METALLIC ADJUSTMENT:
    - If intensity is low (e.g., 0-30), transition to a subtle, matte brushed finish. Reduce specular highlights and contrast, but DO NOT blur or lose structural detail.
    - If intensity is high (e.g., 70-100), transition to an extreme mirror-polish with brilliant highlights and deep contrast.
    - ABSOLUTELY PRESERVE the background and all non-metallic areas.
    
    Output ONLY the adjusted image. No text.`
    : `As a world-class 3D CGI Artist and Industrial Product Photographer, perform a "Nuclear Reflection Removal & Re-Rendering" on this product.

  CRITICAL RULE #1: STRUCTURAL INTEGRITY (ABSOLUTE PRIORITY)
  - YOU ARE FORBIDDEN FROM CHANGING THE GEOMETRY, SHAPE, OR POSITION of any internal or external components.
  - Every screw, gear, wire, dial, and mechanical detail must remain in its exact original location and proportion.
  - DO NOT simplify or remove complex internal layouts.

  CORE OBJECTIVE: GLOBAL METALLIC RE-RENDERING
  - EVERY METALLIC SURFACE (both OUTER panels and INTERNAL components) must be rendered with a high-end METALLIC texture.
  - METALLIC INTENSITY: ${intensity}/100. 
    * If intensity is low (e.g., 20), use a subtle, matte brushed finish.
    * If intensity is high (e.g., 100), use an extreme mirror-polish with brilliant highlights and deep contrast.
  - REMOVE ALL ENVIRONMENTAL REFLECTIONS (GREEN floor, YELLOW lines, BROWN walls, etc.) from ALL surfaces, including the internal ones.
  - Replace these reflections with PURE, NEUTRAL studio gradients (Silver, Gray, White).
  - The goal is to make the entire machine (inside and out) look like it was photographed in a pure white studio, or rendered in high-end 3D software.

  TECHNICAL SPECIFICATIONS:
  - TARGET ASPECT RATIO: ${size}
  - TARGET RESOLUTION: ${resolution} (Ensure maximum sharpness).

  STRICT MANDATORY CONSTRAINTS (ZERO TOLERANCE):
  1. NUCLEAR REFLECTION REMOVAL (GLOBAL):
     - Identify and OBLITERATE all environmental color contamination (Green, Yellow, Brown, etc.) from every metallic part of the machine.
     - This applies to the bottom panels AND any visible internal mechanisms.
     - NO TRACE of the original environment should remain on any metallic surface.

  2. EXTREME SPECULAR HIGHLIGHTS (3D POP):
     - Create razor-sharp, brilliant white highlight lines along all metallic edges and curves (internal and external).
     - The product must "pop" with powerful 3D volume and a premium metallic sheen.

  3. MIRROR-POLISHED FINISH:
     - All metallic components (handles, cylinders, internal gears, etc.) must be polished to a mirror-like, noise-free finish.

  4. PROFESSIONAL DETAIL SHARPENING:
     - Sharpen all details (internal and external) to a professional level.
     - Every thread, bolt, and dial must be crystal clear.

  5. PURE STUDIO BACKGROUND:
     - Place the product on a pure white background with a soft, realistic contact shadow.

  Output ONLY the retouched image. No text.`;

  const requestBody: GeminiGenerateRequest = {
    model: resolveModelForTask('image'),
    task: 'image_gen' as const,
    billing_task: 'image_gen' as const,
    tier: 'normal' as const,
    contents: {
      parts: [
        {
          inlineData: {
            data: prepared.data,
            mimeType: prepared.mimeType,
          },
        },
        {
          text: prompt,
        },
      ],
    },
    config: {
      imageConfig: {
        aspectRatio: size,
        imageSize: resolution,
      },
    },
  };

  try {
    const response = await generateContent(requestBody);
    const imageUrl = extractImageFromResponse(response);
    if (!imageUrl) {
      throw new Error('No image returned from AI');
    }
    return imageUrl;
  } catch (error) {
    const rawMessage = String((error as Error)?.message || error || '');
    if (isPayloadTooLargeMessage(rawMessage)) {
      throw new Error(payloadTooLargeErrorMessage());
    }
    console.error("Retouch error:", error);
    throw error;
  }
}
