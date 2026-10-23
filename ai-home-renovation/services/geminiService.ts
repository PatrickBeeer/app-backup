import { generateContent, extractImageFromResponse, extractTextFromResponse } from '../../../shared_services/geminiProxyService';
import { GeneratedResult } from '../types';

export const GEMINI_TEXT_MODEL = 'gemini-3-flash-preview';
export const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
export const VEO_VIDEO_MODEL = 'veo_3_1';

const cleanBase64 = (b64: string) => b64.replace(/^data:image\/\w+;base64,/, '');

const getClosestAspectRatio = (width: number, height: number): string => {
  const targetRatio = width / height;
  const supportedRatios = [
    { label: '1:1', value: 1 },
    { label: '3:4', value: 0.75 },
    { label: '4:3', value: 1.3333 },
    { label: '9:16', value: 0.5625 },
    { label: '16:9', value: 1.7777 },
  ];

  const closest = supportedRatios.reduce((prev, curr) => {
    return Math.abs(curr.value - targetRatio) < Math.abs(prev.value - targetRatio) ? curr : prev;
  });

  return closest.label;
};

export const generateRenovationImage = async (
  roughBase64: string,
  styleBase64: string,
  width: number,
  height: number,
  userPrompt = ''
): Promise<GeneratedResult> => {
  void GEMINI_TEXT_MODEL;
  void VEO_VIDEO_MODEL;

  const aspectRatio = getClosestAspectRatio(width, height);

  const promptText = `
  Role: Expert Architectural Visualizer specializing in specific Virtual Staging and Renovation.
  
  Task: Renovate the unfinished room shown in the FIRST image (target) by applying the design style, materials, and furniture aesthetic from the SECOND image (reference).
  
  CRITICAL GEOMETRY & STRUCTURE CONSTRAINTS (MUST FOLLOW):
  1. **ABSOLUTE ANGLE PRESERVATION**: The output image MUST have the EXACT same camera angle, focal length, and perspective as the FIRST image. Do not zoom in, zoom out, or rotate the view.
  2. **STRUCTURAL INTEGRITY**: Do NOT move, resize, or delete any walls, windows, doors, pillars, or beams. The physical skeleton of the room must remain identical to the first image.
  3. **PERSPECTIVE MATCHING**: All added flooring, wall treatments, and furniture must perfectly align with the vanishing points and perspective lines of the original unfinished room.
  4. **ASPECT RATIO**: The output image MUST maintain the exact aspect ratio of the FIRST image (${width}x${height}). Do not crop significantly.
  
  DESIGN & STYLING INSTRUCTIONS:
  1. **Style Transfer**: Analyze the SECOND image for color palette, textures (wood, marble, fabric), and lighting mood. Apply these faithfully to the first room.
  2. **Realistic Staging**: Furnish the empty space logically based on its inferred function (e.g., living room, bedroom). Furniture sizes must be realistic relative to the room scale.
  3. **Lighting Consistency**: Respect the natural light sources (windows) visible in the first image. Enhance the lighting to match the 'vibe' of the style reference, but do not contradict the physical window placements.
  
  ${userPrompt ? `Additional User Requirement: ${userPrompt}` : ''}
  
  Output: A single high-quality, photorealistic architectural render of the finished room from the exact original viewpoint.
  `;

  const response = await generateContent({
    model: GEMINI_IMAGE_MODEL,
    task: 'image_gen',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: cleanBase64(roughBase64),
          },
        },
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: cleanBase64(styleBase64),
          },
        },
        { text: promptText },
      ],
    },
    config: {
      imageConfig: {
        aspectRatio,
        imageSize: '1K',
      },
    },
  });

  const imageUrl = extractImageFromResponse(response);
  let description = '';
  try {
    description = extractTextFromResponse(response);
  } catch {
    // Text is optional for image responses.
  }

  if (!imageUrl) {
    throw new Error('未能生成装修效果图，请稍后重试。');
  }

  return {
    imageUrl,
    description: description.trim() || undefined,
  };
};

export const generateMultiAngleGrid = async (renovatedImageBase64: string): Promise<string> => {
  const promptText = `
  Role: Expert Architectural Photographer and Visualizer.
  
  Task: Based on the provided interior design image, generate a **2x2 Grid / Collage** image showing 4 different perspectives/details of this exact same room to create an immersive tour experience.
  
  Grid Layout Specification:
  - Top-Left: A Wide-Angle Shot from a different corner (showing more context).
  - Top-Right: A Close-Up Detail Shot of the key furniture or material texture.
  - Bottom-Left: A Low-Angle or Eye-Level view focusing on the depth of the room.
  - Bottom-Right: An Alternative Angle showing the relationship between elements (e.g., from the doorway).
  
  Constraints:
  - **Consistency**: You MUST use the EXACT same style, colors, furniture, and lighting as the input image. It is the SAME room.
  - **Format**: The output must be a single image divided into 4 quadrants (2x2 grid).
  - **Quality**: Photorealistic, high definition.
  
  Output: A single 2x2 grid image.
  `;

  const response = await generateContent({
    model: GEMINI_IMAGE_MODEL,
    task: 'image_gen',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: 'image/png',
            data: cleanBase64(renovatedImageBase64),
          },
        },
        { text: promptText },
      ],
    },
    config: {
      imageConfig: {
        aspectRatio: '1:1',
        imageSize: '1K',
      },
    },
  });

  const imageUrl = extractImageFromResponse(response);
  if (!imageUrl) {
    throw new Error('生成多角度视图失败，请重试。');
  }

  return imageUrl;
};