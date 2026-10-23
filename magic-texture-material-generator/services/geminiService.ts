import { generateContent, extractJsonTextFromResponse, extractImageFromResponse } from '../../../shared_services/geminiProxyService';
import { AnalysisResult } from '../types';
import { enforceSeamlessness, generateNormalMapFromHeight, generateHeightMapFromDiffuse, generateRoughnessMapFromDiffuse, generateMetallicMapFromDiffuse } from '../utils/seamlessProcessor';

/**
 * Analyzes the reference image to extract style, material, and construct a prompt.
 */
export const analyzeReferenceImage = async (base64Image: string): Promise<AnalysisResult> => {
  const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');

  const prompt = `
    作为一位专业的数字材质艺术家，请分析这张图片。
    
    任务目标：提取视觉关键信息以辅助生成无缝贴图。
    
    重要指令：
    1. 描述材质时，请将其视为"无限延伸的平面表面"，而非具体的"物体"或"地板"。
    2. 忽略图片中的透视、边框或展示台，只关注纹理本身。
    
    请输出一个JSON对象，包含以下字段：
    1. visualStyle: 简短的视觉风格描述（如：赛博朋克, 极简主义, 工业废土）。
    2. material: 物理材质属性（如：拉丝金属, 粗糙混凝土, 丝绸）。
    3. elements: 画面中的关键纹理元素。
    4. colorPalette: 提取的主要颜色代码数组（Hex）。
    5. midjourneyPrompt: 一段英文描述，用于辅助生成模型理解图片内容。重点描述质感、光照和纹理细节。请使用 "Extreme Close-up", "Macro view", "Texture fill" 等词汇。
    6. chinesePrompt: 对应的中文材质描述。
    7. directorNote: 关于如何优化无缝平铺效果的简短建议。
  `;

  try {
    const response = await generateContent({
      model: 'gemini-3-flash-preview',
      task: 'text_gen',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            visualStyle: { type: "string" },
            material: { type: "string" },
            elements: { type: "string" },
            colorPalette: { type: "array", items: { type: "string" } },
            midjourneyPrompt: { type: "string" },
            chinesePrompt: { type: "string" },
            directorNote: { type: "string" },
          },
          required: ["visualStyle", "material", "midjourneyPrompt", "chinesePrompt"]
        }
      }
    });

    const jsonText = extractJsonTextFromResponse(response);
    return JSON.parse(jsonText) as AnalysisResult;
  } catch (error) {
    console.error("Analysis failed:", error);
    throw error;
  }
};

/**
 * Generates a seamless texture image based on a prompt AND/OR reference image.
 */
export const generateSeamlessTexture = async (prompt: string, referenceBase64?: string | null): Promise<string> => {
  const parts: any[] = [];

  if (referenceBase64) {
    const cleanBase64 = referenceBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
    parts.push({ 
      inlineData: { 
        mimeType: 'image/jpeg', 
        data: cleanBase64 
      } 
    });
  }

  const finalPrompt = `
    Generate a SINGLE, FULL-FRAME, SEAMLESS TEXTURE.
    
    User Description/Context: "${prompt}"

    VIEWPORT SETTINGS:
    - **ORTHOGRAPHIC VIEW**: Top-down, 90-degree angle. No perspective distortion.
    - **MACRO / CLOSE-UP**: Fill the entire canvas with the surface detail. Do not zoom out.
    - **INFINITE PLANE**: The texture represents a slice of an infinite surface.
    
    CRITICAL FORMAT RULES (STRICT COMPLIANCE REQUIRED):
    1. **NO 2x2 GRIDS**: Do NOT generate a grid, a sprite sheet, or a sampler. Output ONE single coherent image.
    2. **NO BORDERS**: The texture must touch all 4 edges of the canvas. No white frames, no black bars.
    3. **NO 3D OBJECTS**: Do not render a sphere, cube, or material ball.
    
    VISUAL STYLE RULES:
    1. **FLAT ALBEDO / DELIGHTED**: Pure material color only. Remove all baked lighting, shadows, highlights, and ambient occlusion.
    2. **STRICTLY SEAMLESS**: Perfect tiling on all axes (Top-Bottom, Left-Right).
    
    ${referenceBase64 ? 'INSTRUCTION: Use the input image as a STRICT STYLE REFERENCE (Color, Lighting, Material Finish) but generate the SUBJECT MATTER described in "User Description".' : ''}

    Keywords: Texture Map, Albedo, Flat Lay, Full Frame, Seamless Tile, Material Scan, Orthographic.
  `;

  parts.push({ text: finalPrompt });

  try {
    const response = await generateContent({
      model: 'gemini-3.1-flash-image-preview',
      task: 'image_gen',
      contents: { parts: parts },
      config: { 
        imageConfig: { 
          aspectRatio: "1:1" 
        } 
      }
    });

    const generatedImage = extractImageFromResponse(response);

    // Post-process the image to enforce mathematical seamlessness
    const seamlessImage = await enforceSeamlessness(generatedImage, 0.15);

    return seamlessImage;
  } catch (error) {
    console.error("Generation failed:", error);
    throw error;
  }
};

/**
 * Generates a PBR map (Normal, Height, or Roughness) based on the diffuse texture.
 * NOW PURELY CODE-BASED (Client-side)
 */
export const generatePBRMap = async (diffuseBase64: string, type: 'normal' | 'height' | 'roughness' | 'metallic', value?: number): Promise<string> => {
    try {
      if (type === 'height') {
        return await generateHeightMapFromDiffuse(diffuseBase64, value, 4);
      } 
      
      if (type === 'roughness') {
        return await generateRoughnessMapFromDiffuse(diffuseBase64, value);
      }

      if (type === 'metallic') {
        return await generateMetallicMapFromDiffuse(diffuseBase64, value);
      }

      if (type === 'normal') {
        const heightMapForNormal = await generateHeightMapFromDiffuse(diffuseBase64, 1.0, 1);
        return await generateNormalMapFromHeight(heightMapForNormal, 3.0);
      }

      throw new Error(`Unsupported map type: ${type}`);
    } catch (error) {
      console.error(`PBR Generation (${type}) failed:`, error);
      throw error;
    }
  };

