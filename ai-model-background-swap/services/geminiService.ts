import { generateContent, extractImageFromResponse } from '../../../shared_services/geminiProxyService';
import { ContentPart, AspectRatio } from '../types';

const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';

// Helper function to decode base64 for display purposes (not for API, API expects raw base64)
export const toBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]); // Extract base64 part
    reader.onerror = (error) => reject(error);
  });
};

export interface GenerateContentResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text?: string;
        inlineData?: {
          mimeType: string;
          data: string;
        };
      }>;
    };
  }>;
  text?: string;
}

export const generateEditedImage = async (
  parts: ContentPart[],
  aspectRatio: AspectRatio = AspectRatio.SQUARE,
  modelName: string = GEMINI_IMAGE_MODEL
): Promise<GenerateContentResponse> => {
  try {
    const response = await generateContent({
      model: modelName,
      task: 'image_gen',
      contents: { parts: parts },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio,
        },
      },
    });

    return response;
  } catch (error) {
    console.error("Error generating image:", error);
    throw error;
  }
};

/**
 * Extracts image URLs from the Gemini API response.
 * @param response The GenerateContentResponse from Gemini.
 * @returns An array of base64 image URLs.
 */
export const extractImageUrls = (response: GenerateContentResponse): string[] => {
  const imageUrls: string[] = [];
  if (response.candidates && response.candidates.length > 0) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
        imageUrls.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
      }
    }
  }
  
  // 如果没有找到图片，尝试使用 extractImageFromResponse
  if (imageUrls.length === 0) {
    const url = extractImageFromResponse(response as any);
    if (url) {
      imageUrls.push(url);
    }
  }
  
  return imageUrls;
};

