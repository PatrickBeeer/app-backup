/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import { ProductAnalysis, CopySuggestion, VisualStyleSuggestion } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function analyzeProduct(base64Image: string): Promise<ProductAnalysis> {
  const result = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: [
      {
        parts: [
          {
            inlineData: {
              data: base64Image.split(',')[1],
              mimeType: "image/jpeg",
            },
          },
          {
            text: "Analyze this e-commerce product image. Identify the product name, category, key features, and unique selling points for Xiaohongshu marketing. Also, provide a highly detailed 'visualDescription' including its exact shape, material, color hex codes (if identifiable), texture, and any unique branding marks. This visual description will be used to maintain 1:1 consistency in image generation.\n\nCRITICAL: You must also analyze how this specific product is typically photographed on Xiaohongshu. Provide 'xiaohongshuTrends' with two string fields (in Chinese):\n1. 'influencerStyle' (达人种草图): Specifically detail how top lifestyle influencers/KOLs shoot this category (e.g., if skincare: glowing skin close-ups/bathroom vanity; if bags: cafe OOTD/casual hand carrying; if clothes: mirror selfies/street snap; if food: picnic/dripping close-ups; if home decor: cozy warm bedroom/sunlight corner).\n2. 'sellerStyle' (卖货博主带货图): How e-commerce sellers shoot this (e.g., clean studio, direct product focus, comparative swatches, packaging details).",
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          category: { type: Type.STRING },
          features: { type: Type.ARRAY, items: { type: Type.STRING } },
          sellingPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
          description: { type: Type.STRING },
          visualDescription: { type: Type.STRING },
          xiaohongshuTrends: { 
            type: Type.OBJECT,
            properties: {
              influencerStyle: { type: Type.STRING },
              sellerStyle: { type: Type.STRING }
            },
            required: ["influencerStyle", "sellerStyle"]
          }
        },
        required: ["name", "category", "features", "sellingPoints", "description", "visualDescription", "xiaohongshuTrends"],
      },
    },
  });

  return JSON.parse(result.text || '{}');
}

export async function generateCopy(analysis: ProductAnalysis, referenceText?: string, coreSellingPoints?: string): Promise<CopySuggestion[]> {
  const referencePrompt = referenceText 
    ? `
# Reference / Imitation (仿写要求)
用户提供了以下参考文本，请务必仔细分析其**语言风格**、**排版结构**、**情绪基调**，并尽可能模仿该风格来创作本次的 3 个文案选项：
【参考文本开始】
${referenceText}
【参考文本结束】
` 
    : '';

  const coreSellingPointsPrompt = coreSellingPoints
    ? `
# Core Selling Points (核心卖点强调)
用户特别强调了以下核心优势、使用场景或痛点解决方案，请务必在文案中着重放大这些点，将其转化为极具情绪感染力的内容：
【核心内容开始】
${coreSellingPoints}
【核心内容结束】
`
    : '';

  const xiaohongshuTrendsPrompt = analysis.xiaohongshuTrends
    ? `
# Xiaohongshu Visual & Scenario Trends (小红书视觉与场景趋势)
系统已识别出该品类在小红书的爆款视觉趋势如下：
- 达人种草视觉/场景：${analysis.xiaohongshuTrends.influencerStyle}
- 卖货博主视觉/场景：${analysis.xiaohongshuTrends.sellerStyle}
【关键指令】：请务必将这些具体的“拍摄场景”（如浴室水雾、咖啡厅OOTD、对镜自拍）和“视觉氛围”巧妙融入到文案中。文案不仅仅要讲卖点，必须要有具体的“画面感”，让文案与小红书上该品类的典型爆款照片风格高度匹配，形成“图文合一”的强烈种草感。
`
    : '';

  const result = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `
# Role
你是一位拥有百万粉丝的小红书资深博主，是内容创作领域的“流量操盘手”。你极度擅长挖掘产品的情绪价值，能将任何枯燥的信息转化为极具感染力、画面感和社交属性的爆款笔记。

# Core Logic (小红书爆款底层逻辑)
1. **极度口语化与网感**：使用小红书高频词句式（如：“谁懂啊家人们”、“尊嘟绝了”、“被路人追着问”、“真香警告”、“狠狠拿捏了”）。语气必须完全是闺蜜间真诚疯狂的安利，绝不能有机器味、说教感或生硬的广告腔调。
2. **情绪价值拉满**：第一句话必须击中痛点、引发强烈共鸣或制造戏剧性反差。例如：“一直以为xx是智商税，直到遇见它...”。
3. **沉浸式场景与通感**：将枯燥的卖点翻译成具体的“爽感”画面。比如不说“吸汗透气”，而说“39度出门狂走一天，后背竟然还是干爽的”；不说“显瘦”，说“穿上立马纸片人，肉肉全隐身”。
4. **人设饱满生动**：设定一个具体的人物标签（如：抠门又挑剔的颜控、每天想多睡10分钟的早八打工人、追求质感的独居女孩），全程用第一人称极其真实的口吻分享。
${referencePrompt}${coreSellingPointsPrompt}${xiaohongshuTrendsPrompt}
# Task Flow
请根据以下输入的产品信息，生成 3 个不同风格（vibe）的小红书文案选项（例如：cute、professional、lifestyle、minimalist中任选3种）：
Product: ${analysis.name}
Features: ${analysis.features.join(', ')}
Selling Points: ${analysis.sellingPoints.join(', ')}

对于每个选项，请提供：
1. **爆款标题 (5个)**
   - 作为 \`titles\` 数组输出。必须包含：[数字/利益点] + [情绪词/反直觉结论] + [人群标签]
   - 示例：谁懂啊！这种[XX感]真的绝绝子！/ 救命！[XX]后悔没早买... / 答应我！[人群]闭眼入不踩雷！
2. **正文写作 (灵活灵动排版，沉浸式互动)**
   - 作为 \`content\` 输出。
   - **结构排版**：极其自然，打破死板的模版感和说明书感！不要生硬罗列卖点1/2/3。把它当作你在微信跟闺蜜狂敲键盘发出去的一连串消息。善用换行、空白留白、以及精准点缀的 Emoji（如 😭✨🔥🍠🛍️👀 等），控制极佳的阅读节奏。多用感叹号、省略号、甚至波浪号来传达充沛的真实情绪！
   - **核心内容**：把产品卖点完全揉碎进一个个具体的生活场景中，用“我”或者“身边人”的真实变化来侧面烘托产品，拉满种草力。
   - **评论区钩子**：在最末添加一句不着痕迹、极其自然的互动提问，就像随口一问（例如：底妆总是卡粉的姐妹举手看看？ / 你们平时出门包里必装的续命神器是啥？）。
3. **标签系统 (SEO)**
   - 作为 \`tags\` 数组输出。自动生成 5-10 个精准的热门标签。
    `,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            titles: { type: Type.ARRAY, items: { type: Type.STRING } },
            content: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            vibe: { type: Type.STRING, enum: ['cute', 'professional', 'lifestyle', 'minimalist'] },
          },
          required: ["titles", "content", "tags", "vibe"],
        },
      },
    },
  });

  return JSON.parse(result.text || '[]');
}

export async function suggestVisualStyles(analysis: ProductAnalysis): Promise<VisualStyleSuggestion[]> {
  const result = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: [
      {
        parts: [
          {
            text: `Based on this product analysis, suggest 4 highly aesthetic Xiaohongshu photography scenes that form a UNIFIED SERIES (consistent vibe, lighting, and color palette).

    Product: ${analysis.name}
    Category: ${analysis.category}
    Visual Details: ${analysis.visualDescription}
    
    CRITICAL REQUIREMENTS:
    1. AESTHETIC: MUST strongly exhibit "小红书风" (Xiaohongshu/Little Red Book viral aesthetic). This means highly curated lifestyle photography, "网红感" (influencer vibe), soft film-like or creamy lighting, beautiful props, and clean modern compositions.
    2. SERIES FEEL: All 4 scenes must share a similar color story or theme (e.g., all "Soft Sunlit Creamy", or all "Cyber Nocturnal", or all "Natural Minimalist").
    3. LANGUAGE: The "name" and "description" fields in the response MUST be in CHINESE.
    4. CATEGORY SPECIFIC XIAOHONGSHU TROPES: 
       - Skincare/Body (护肤/洗护): Extreme close-up of glowing skin with the product (怼脸发光肌), highly aesthetic bathroom vanity shots (氛围感浴室), smeared texture swatches on hand/face (抹开的质地).
       - Bags/Accessories (包包/配饰): Cafe OOTD placed on chair casually (咖啡厅OOTD随便放), mirror selfie holding bag (对镜自拍), casual hand carrying close-up (随性手拎特写).
       - Clothing/Apparel (服饰): Aesthetic street snap (氛围感街拍), stylish mirror selfie OOTD (对镜OOTD), fabric/detail macro with soft lighting (质感局部特写).
       - Shoes (鞋类): POV top-down looking at feet (俯拍视角), sitting on stairs/cafe floor with crossed legs (坐在咖啡厅/阶梯随性展示).
       - Food/Drinks (美食/饮品): Mouth-watering dripping/stretching close-up (诱人特写/拉丝/爆浆), picnic or afternoon tea setup with nice props (野餐/下午茶氛围), holding food taking a casual selfie (拿着食物偏日常感).
       - Home/Decor/Fragrance (家居/香氛): Cozy warm bedroom desk (温馨卧室桌面), sunlight coming through window (绝美光影窗边), lazy pajama vibe holding it (睡衣慵懒感).
       - Makeup/Lipsticks (彩妆/口红): Extreme close-up of glossy lips (唇部涂抹特写), hand holding multiple tubes (多支手心特写), model's partial face with swatches on hand (脸上半部分出镜+手背试色).
       - Digital/Tech (数码): Cozy desktop setup (温馨桌面改造), hand holding item casually in cafe (咖啡厅随性拿着).
       - DYNAMIC AI TREND ANALYSIS:
         - Influencer Insight: ${analysis.xiaohongshuTrends?.influencerStyle || 'N/A'}
         - Seller Insight: ${analysis.xiaohongshuTrends?.sellerStyle || 'N/A'}
       - IMPORTANT: Determine the exact category and strict apply its specific Xiaohongshu trope! Also integrate the DYNAMIC AI TREND ANALYSIS to ensure the scenes are perfectly hyper-tailored to the specific product uploaded.
    5. MODELS: Every scene MUST feature a human model holding or wearing the product. If the face or part of the face is visible, the model MUST look exactly like a top-tier Chinese beauty/fashion influencer (中国顶流网红脸): young Gen Z Asian female, extremely delicate and refined features, Douyin-style "pure desire" (纯欲) or "sweet cool" (甜酷) makeup, flawless skin with soft highlighting, and highly trendy styling.
    6. PARTIAL FACE: The model's FULL face must NOT be visible. Use creative angles: showing only the hands, shoulders, chin, side profile, or cropping the eyes out.
    7. NO TEXT: The image must have ZERO text, letters, or numbers.
    8. IMAGE PROMPT: Provide an English text-to-image prompt (scenePrompt) for each. The prompt MUST include aesthetic keywords like "Xiaohongshu viral style, Chinese beauty influencer (网红) model, Gen Z Asian girl with delicate face and light Douyin makeup, PLOG style, OOTD, everyday lifestyle setting, candid POV shot, shot on mirrorless camera or CCD, highly curated, soft creamy natural lighting, trendy and cozy aesthetic mood".
    
    Scenes should be:
    - Scene 1: Main Series Theme (High-end/Lifestyle)
    - Scene 2: Detail Focus (Macro/Action)
    - Scene 3: Environment Context (Wider shot)
    - Scene 4: Emotional/Atmospheric (Creative angle)
    
    For each, provide a text-to-image prompt (scenePrompt) that describes the product IDENTICALLY and places it in the new environment with the model.`
          }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            scenePrompt: { type: Type.STRING },
          },
          required: ["id", "name", "description", "scenePrompt"],
        },
      },
    },
  });

  return JSON.parse(result.text || '[]');
}

export async function generateStyledImage(prompt: string, referenceImage?: string, customPrompt?: string): Promise<string> {
  const seedString = Math.random().toString(36).substring(7);
  
  // Strengthened consistency instructions
  const consistencyInstruction = `
    MANDATORY: PIXEL-PERFECT PRODUCT CONSISTENCY. 
    You MUST identically reproduce the product from the reference image. 
    Maintain EXACT color hex codes, material textures (e.g., leather grain, metallic shine), and silhouette/shape. 
    Do NOT modify the product's physical identity. 
    The background and environment can change, but the product itself must be a 1:1 match.
    AESTHETIC MANDATE: The final image MUST strongly embody the "Xiaohongshu (Little Red Book) viral influencer seeding (小红书达人种草) aesthetic". This means: extremely photorealistic, PLOG/OOTD style, shot on a mirrorless camera or CCD, highly curated everyday lifestyle setting (like a trendy cafe, cozy bedroom, or aesthetic street), candid or POV angle, beautiful soft natural lighting, and a very strong "influencer vibe" (网红氛围感). It should look exactly like a viral lifestyle recommendation post by a top Chinese beauty/fashion influencer. If a model is visible, specify "top Chinese Gen Z beauty influencer (网红脸), extremely delicate aesthetic features, Douyin pure desire makeup (纯欲妆), flawless skin, stylish Chinese/Korean fashion". For makeup/lipsticks, ensure rich juicy/glossy textures (水光唇) and highly realistic skin texture with smudged soft swatches.
    The resulting image must NOT contain any text, watermarks, letters, or branding text on the background or product.
  `.trim();

  const finalPrompt = `${consistencyInstruction} Base Scene: ${prompt}. ${customPrompt ? `User Adjustment: ${customPrompt}.` : ''} Random seed: ${seedString}.`;
  
  const parts: any[] = [{ text: finalPrompt }];
  
  if (referenceImage) {
    parts.push({
      inlineData: {
        data: referenceImage.split(',')[1],
        mimeType: "image/jpeg"
      }
    });
  }

  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: [{ parts }],
    config: {
      imageConfig: {
        aspectRatio: "3:4",
      },
    },
  });

  if (result.candidates?.[0]?.content?.parts) {
    for (const part of result.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  }
  
  throw new Error("No image generated");
}

