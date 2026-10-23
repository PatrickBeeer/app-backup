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

    const { referenceImage, productImage, prompt, aspectRatio, imageSize, productConsistency } = await req.json();

    if (!referenceImage || !productImage) {
      return NextResponse.json({ error: "图片缺失 (Missing images)" }, { status: 400 });
    }

    const consistencyInstruction = productConsistency ? " EXTREME VISUAL CONSISTENCY: You MUST match the product in Image 2 exactly—if the earhooks are black, they MUST be black in the result. If there are multiple parts (like case + earphones), replace ALL matching parts from Image 1." : "";

    // Process reference image part
    const refImagePart = {
      inlineData: {
        mimeType: "image/png",
        data: referenceImage.split(',')[1] || referenceImage,
      },
    };

    // Process product image part
    const prodImagePart = {
      inlineData: {
        mimeType: "image/png",
        data: productImage.split(',')[1] || productImage,
      },
    };

    const textPart = {
      text: `任务：将图1中的核心产品（包括其所有配件、底座、包装或组合部分）完整替换为图2中的产品。${consistencyInstruction}
要求：
1. 视觉一致性：必须百分之百还原图2产品的颜色、材质、颜色分布和外观细节。严禁改变产品本身的配色方案（例如：挂钩颜色、金属光泽等必须与实拍图完全一致）。
2. 完整替换：如果图1中的原产品是组合形式（例如耳机+充电仓），必须将整个组合完全移除并替换为图2的产品。不要在背景中留下原产品的任何残余配件。
3. 实拍质感：确保图2产品的实拍光泽、金属感或材质地在合成后得到完美保留，避免产生“AI生成感”。
4. 风格继承：继承图1的光影、背景、构图和整体美学风格。
5. 自然融合：将图2中的产品放置在图1中原产品相同的位置和角度。确保合成后的光影、遮挡和反射效果真实自然。
6. 用户辅助提示词：${prompt || "专业摄影，极简风格，高质量合成"}。

请返回一部分图片数据，以及一部分文本说明（包含为该合成资产设计的中文标题和一段营销文案，每行一项）。`,
    };

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: { 
        parts: [refImagePart, prodImagePart, textPart] 
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio || "1:1",
          imageSize: "1K"
        }
      }
    });

    let generatedImageUrl = "";
    let copyText = "";

    if (response.candidates && response.candidates[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          generatedImageUrl = `data:image/png;base64,${part.inlineData.data}`;
        } else if (part.text) {
          copyText = part.text;
        }
      }
    }

    if (!generatedImageUrl) {
        return NextResponse.json({ error: "模型未返回图片数据 (AI generated no image output)" }, { status: 500 });
    }

    // Attempt to parse title and tagline from copyText
    let title = "合成资产";
    let tagline = "VisionCanvas AI 精修生成";

    if (copyText) {
        // Find title and tagline, prioritizing Chinese if possible
        const lines = copyText.split('\n').filter(l => l.trim());
        if (lines.length >= 1) title = lines[0].replace(/[#*:-]/g, '').trim();
        if (lines.length >= 2) tagline = lines[1].replace(/[#*:-]/g, '').trim();
    }

    return NextResponse.json({ 
        imageUrl: generatedImageUrl,
        title,
        tagline
    });

  } catch (error: any) {
    console.error("Generation Error Details:", {
      message: error.message,
      stack: error.stack,
      cause: error.cause
    });
    
    let errorMessage = "生成过程发生未知错误 (An unknown error occurred)";
    if (error.message.includes("fetch failed")) {
      errorMessage = "网络连接超时，请尝试降低分辨率或稍后重试 (Network timeout, please try lower resolution)";
    }

    return NextResponse.json({ 
      error: errorMessage 
    }, { status: 500 });
  }
}
