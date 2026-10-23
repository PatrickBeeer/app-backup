import { generateContent, extractImageFromResponse } from '../../../shared_services/geminiProxyService';
import { ImageData, AspectRatio, ProductType, StylePreset } from '../types';
import { extractCleanBase64 } from '../utils/imageUtils';

const getStyleDescription = (preset: StylePreset): string => {
  switch (preset) {
    case 'japanese_wood':
      return `Japanese Natural/Wood Style. Emphasize bright natural sunlight, soft cream/beige textures, and a calm atmosphere with pale oak and warm whites.`;
    case 'minimalist':
      return `Modern Minimalist Style. Clean architectural lines, monochromatic forms, and muted colors.`;
    case 'scandinavian':
      return `Scandinavian Style. Bright, airy, and cozy with light birch tones and soft fabric textures.`;
    case 'bohemian':
      return `Bohemian Style. Natural textures like rattan, earthy terracotta tones, and warm ambient lighting.`;
    case 'modern':
      return `Modern Luxury Style. High-contrast sophisticated setting with marble, metallic accents, and dramatic lighting.`;
    default:
      return "";
  }
};

const getProductDescription = (type: ProductType): string => {
  switch (type) {
    case 'crib': return 'baby crib';
    case 'stroller': return 'baby stroller';
    case 'splicing_bed': return 'baby splicing bed';
    case 'platform_bed': return 'baby platform bed';
    case 'walker': return 'baby walker';
    case 'toy': return 'baby toy';
    case 'other': return 'baby furniture';
    default: return 'baby product';
  }
};

export const geminiService = {
  async identifyProduct(productImage: ImageData): Promise<ProductType> {
    const prompt = `Identify the baby product: 'crib', 'stroller', 'walker', 'toy', 'splicing_bed', 'platform_bed', 'other'. Respond with ONLY the keyword.`;
    const imagePart = { 
      inlineData: { 
        mimeType: productImage.mimeType, 
        data: extractCleanBase64(productImage)
      } 
    };
    
    try {
      const response = await generateContent({
        model: 'gemini-3-flash-preview',
        task: 'text_gen',
        contents: { 
          parts: [imagePart, { text: prompt }] 
        },
        config: { 
          temperature: 0.1 
        }
      });
      
      const text = response.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
      const res = text?.trim().toLowerCase() as ProductType;
      return ['crib', 'stroller', 'walker', 'toy', 'splicing_bed', 'platform_bed', 'other'].includes(res) ? res : 'other';
    } catch {
      return 'other';
    }
  },

  async removeBackground(productImage: ImageData, productType: ProductType): Promise<ImageData> {
    const prompt = `Extract the **${getProductDescription(productType)}** onto a pure solid white background. Keep all original textures and design details. Output the cutout image.`;
    const imagePart = { 
      inlineData: { 
        mimeType: productImage.mimeType, 
        data: extractCleanBase64(productImage)
      } 
    };
    
    try {
      const response = await generateContent({
        model: 'gemini-3.1-flash-image-preview',
        task: 'image_gen',
        contents: { 
          parts: [imagePart, { text: prompt }] 
        },
      });
      
      const imageUrl = extractImageFromResponse(response);
      if (imageUrl) {
        // extractImageFromResponse 返回完整的 data URL，需要转换为 ImageData
        const base64Data = imageUrl.split(',')[1];
        return { 
          base64: imageUrl, 
          mimeType: 'image/png' 
        };
      }
    } catch (e) {
      console.error('Remove background failed:', e);
    }
    return productImage;
  },

  async analyzeModelImage(imageData: ImageData): Promise<string> {
    const prompt = `Perform a rigorous identity and grooming analysis for EXACT CHARACTER CLONING. 
    1. Identify all humans: Map the Adult AND the Baby.
    2. Forensic Mapping for BOTH:
       - Adult: Map exact facial geometry, eye shape/color, and critical grooming (hairstyle, hair length, hair texture, hair color, and parting).
       - Baby: Map face shape, eye features, skin tone, and exact hair appearance (thinning/thickness, color).
    This exact identity and hairstyle from this image (BOTH adult and baby) MUST be cloned into the final output with 100% fidelity.`;
    
    const imagePart = { 
      inlineData: { 
        mimeType: imageData.mimeType, 
        data: extractCleanBase64(imageData)
      } 
    };
    
    try {
      const response = await generateContent({
        model: 'gemini-3-flash-preview',
        task: 'text_gen',
        contents: { 
          parts: [imagePart, { text: prompt }] 
        },
        config: { 
          temperature: 0.1 
        }
      });
      
      const text = response.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
      return text?.trim() || "Identifiable human features and hairstyles.";
    } catch {
      return "Standard human characteristics and hair.";
    }
  },

  async reverseEngineerPromptFromReferenceImage(imageData: ImageData): Promise<string> {
    const prompt = `You are an expert at describing image composition, pose, and background for AI image generation. 
    Strictly analyze the provided image and generate a detailed prompt focusing on:
    1.  **Human Posture:** Describe the exact skeletal pose, body language, and limb arrangement of all people (adults and babies). Be specific about their interaction.
    2.  **Background Environment:** Identify key architectural elements (windows, doors, wall textures, floor materials), furniture layout (excluding the main product), and overall room structure.
    3.  **Lighting:** Describe the direction, type (natural, artificial), and intensity of light.
    4.  **Overall Composition:** Detail the camera angle, perspective, and general framing.
    
    CRITICAL:
    - Focus ONLY on the physical pose, background layout, and lighting.
    - IGNORE specific human faces/identities.
    - IGNORE hairstyles.
    - IGNORE the specific main product/furniture shown (if any).
    - Generate a concise, clear, and actionable prompt suitable for AI image generation, without conversational filler.`;
    
    const imagePart = { 
      inlineData: { 
        mimeType: imageData.mimeType, 
        data: extractCleanBase64(imageData)
      } 
    };
    
    try {
      const response = await generateContent({
        model: 'gemini-3-flash-preview',
        task: 'text_gen',
        contents: { 
          parts: [imagePart, { text: prompt }] 
        },
        config: { 
          temperature: 0.7 
        }
      });
      
      const text = response.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
      return text?.trim() || "";
    } catch (e: any) {
      console.error("Error analyzing reference image:", e);
      throw new Error("AI analysis failed: " + (e.message || "Unknown error"));
    }
  },

  async generateStyledProductImage(
    productImage: ImageData,
    modelImage: ImageData | null,
    styleReferenceImage: ImageData | null,
    aspectRatio: AspectRatio,
    stylePreset: StylePreset,
    productType: ProductType,
    userPrompt: string,
    referenceImagePrompt: string,
  ): Promise<string[]> {
    const cleanProduct = await this.removeBackground(productImage, productType);
    const faceAnalysis = await (modelImage ? this.analyzeModelImage(modelImage) : Promise.resolve(""));

    const requestParts: any[] = [
      { 
        inlineData: { 
          mimeType: cleanProduct.mimeType, 
          data: extractCleanBase64(cleanProduct)
        } 
      }
    ];
    
    if (modelImage) {
      requestParts.push({ 
        inlineData: { 
          mimeType: modelImage.mimeType, 
          data: extractCleanBase64(modelImage)
        } 
      });
    }
    
    if (styleReferenceImage) {
      requestParts.push({ 
        inlineData: { 
          mimeType: styleReferenceImage.mimeType, 
          data: extractCleanBase64(styleReferenceImage)
        } 
      });
    }

    const basePrompt = `
      [STRICT PRODUCT IDENTITY - ZERO DEVIATION]:
      - Use [PRODUCT IMAGE] as the EXCLUSIVE blueprint for the furniture item.
      - **Geometry:** Maintain the exact 3D shape, proportions, and structural design. No adding, removing, or morphing of rails, legs, or panels.
      - **Material:** Preserve the specific wood grain, metal finish, or fabric weave exactly as shown. 
      - **Texture:** Do not smooth or "AI-enhance" the original textures. If the wood has a specific pattern, it must be pixel-perfect.
      - **Integrity:** The product in the final scene must be indistinguishable from the physical item in [PRODUCT IMAGE].

      [SUBJECT CLONING - EXCLUSIVE IDENTITY & HAIRSTYLE]:
      - MANDATORY: Clone the human identities (Faces/Features/Ethnicity) and HAIRSTYLES of BOTH the adult AND the baby EXCLUSIVELY from [MODEL IMAGE].
      - 100% precision for hair texture, length, styling, and facial structure.
      - The baby in the final image must be an identical clone (Face and Hair) of the baby in [MODEL IMAGE].
      - The adult in the final image must be an identical clone (Face and Hair) of the adult in [MODEL IMAGE].
      - Identity Profile: ${faceAnalysis}
      - FORBIDDEN: Do NOT use ANY physical features, faces, or hairstyles from the people in [POSE REFERENCE].

      [STRICT POSE & SCENE CLONING]:
      - If [POSE REFERENCE] is provided, use its exact physical interaction and skeletal pose for the people.
      - Apply "${getStyleDescription(stylePreset)}" to define the scene's aesthetic atmosphere without altering the product's color or material.
      ${referenceImagePrompt ? `\n[AI REFERENCE PROMPT]: ${referenceImagePrompt}` : ''}

      [TECHNICAL]:
      - Output: A single high-fidelity commercial photography image.
      - Professional studio lighting that highlights the product's true textures.
      - 8K resolution, sharp focus on the product.
      - Aspect ratio: ${aspectRatio}.
      ${userPrompt ? `\n[CUSTOM INSTRUCTIONS]: ${userPrompt}` : ""}
    `;

    try {
      const response = await generateContent({
        model: 'gemini-3.1-flash-image-preview',
        task: 'image_gen',
        contents: { 
          parts: [
            ...requestParts, 
            { 
              text: basePrompt + `\nCreative Variation: Hyper-realistic commercial photography with extreme focus on material texture and product geometry. Ensure 100% product material, shape and identity fidelity.` 
            }
          ] 
        },
        config: { 
          imageConfig: { 
            aspectRatio, 
            imageSize: "1K" 
          } 
        }
      });
      
      const imageUrl = extractImageFromResponse(response);
      if (!imageUrl) {
        throw new Error("Render failed.");
      }
      return [imageUrl];
    } catch (e: any) {
      throw new Error(e.message || "Engine error during generation.");
    }
  }
};

