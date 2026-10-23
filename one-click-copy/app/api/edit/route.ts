import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const ai = new GoogleGenAI({ 
      apiKey: process.env.GEMINI_API_KEY!,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const { image, editPrompt, maskImage, productConsistency } = await req.json();

    if (!image || !editPrompt) {
      return NextResponse.json({ error: "图片或指令缺失 (Missing image or prompt)" }, { status: 400 });
    }

    const consistencyInstruction = productConsistency ? " EXTREME PRODUCT CONSISTENCY: You MUST match the product's color, materials, and fine details 100% perfectly. No variations allowed." : "";

    const parts: any[] = [
      {
        inlineData: {
          mimeType: "image/png",
          data: image.split(',')[1] || image,
        },
      }
    ];

    if (maskImage) {
      parts.push({
        inlineData: {
          mimeType: "image/png",
          data: maskImage.split(',')[1] || maskImage,
        },
      });
      parts.push({
        text: `Modify the area indicated by the white mask in the image. Instruction: ${editPrompt}.${consistencyInstruction}
        CRITICAL STYLE REQUIREMENT: 
        1. Replace ONLY the text content or the specified object.
        2. IF TEXT: STRICTLY PRESERVE the original font typeface, color, size, kerning, and positioning.
        3. DO NOT add any borders, artifacts, or glow effects that weren't in the original.
        4. PRODUCT INTEGRITY: Replace the ENTIRE object including sub-parts (e.g. charging cases) to ensure no remnants of the old product remain. Match original textures and finish perfectly.
        Provide a new title and tagline in your response parts, prioritizing Chinese if possible.`,
      });
    } else {
      parts.push({
        text: `Edit this image based on the following instruction: ${editPrompt}.${consistencyInstruction}
        CRITICAL STYLE REQUIREMENT: 
        1. Maintain the original style, proportions, and lighting.
        2. IF CHANGING TEXT: You MUST strictly preserve the original font style, color, size, and layout. 
        3. PRODUCT REPLACEMENT: Complete all related object replacements. If a reference has multiple parts, ensure all parts are replaced to maintain consistency with the target product.
        4. COLOR ACCURACY: Respect the specific colors and materials of the target product reference exactly.
        Provide a new title and tagline in your response parts, prioritizing Chinese if possible.`,
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio: "1:1",
          imageSize: "1K"
        }
      }
    });

    let editedImageUrl = "";
    let copyText = "";
    if (response.candidates && response.candidates[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          editedImageUrl = `data:image/png;base64,${part.inlineData.data}`;
        } else if (part.text) {
          copyText = part.text;
        }
      }
    }

    if (!editedImageUrl) {
        return NextResponse.json({ error: "编辑失败，AI 未返回图片 (AI returned no image for edit)" }, { status: 500 });
    }

    let title = "微调成果";
    let tagline = "已完成局部精修合成";

    if (copyText) {
        const lines = copyText.split('\n').filter(l => l.trim());
        if (lines.length >= 1) title = lines[0].replace(/[#*:-]/g, '').trim();
        if (lines.length >= 2) tagline = lines[1].replace(/[#*:-]/g, '').trim();
    }

    return NextResponse.json({ 
        imageUrl: editedImageUrl,
        title,
        tagline
    });

  } catch (error: any) {
    console.error("Edit Error Details:", {
      message: error.message,
      stack: error.stack,
      cause: error.cause
    });
    
    let errorMessage = "编辑过程发生未知错误 (An unknown error occurred)";
    if (error.message.includes("fetch failed")) {
      errorMessage = "网络连接超时，请稍后重试 (Network timeout during edit)";
    }

    return NextResponse.json({ 
      error: errorMessage 
    }, { status: 500 });
  }
}
