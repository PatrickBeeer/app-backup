import { ProductFormData, StrategyResult } from "../types";
import { generateContent, extractJsonTextFromResponse } from "../../../shared_services/geminiProxyService";

const SYSTEM_INSTRUCTION = `
你是一位资深的电商策划总监，专为打造"超级单品"服务。你不仅精通文案转化，更深谙 SEO 搜索流量逻辑和 AI 视觉创作。

**核心升级逻辑：**
1.  **流量思维**：不仅要写文案，还要提供 SEO 关键词（核心词、长尾词、场景词），帮助商家获取搜索流量。
2.  **痛点打击**：分析竞品可能存在的"弱点/差评槽点"（基于品类通识），并将其转化为本品的"防守型卖点"。
3.  **AI 视觉落地**：为主图策划提供具体的 **Midjourney 英文提示词**，让策划方案能直接落地为视觉素材。

**输出要求：**
1. 严格按照 JSON Schema 输出，确保所有字段完整。
2. 所有文案内容必须严格遵守广告法，避免使用任何极限词、违禁词，如'最'、'第一'、'国家级'等。
`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    analysisSummary: { type: "string", description: "Market analysis. (In Chinese)" },
    differentiation: { type: "string", description: "Differentiation strategy. (In Chinese)" },
    competitorWeakness: { type: "string", description: "Analysis of potential competitor weaknesses or common negative reviews in this category. (In Chinese)" },
    styleAdvice: { 
      type: "array", 
      items: { type: "string" },
      description: "Visual style recommendations. (In Chinese)" 
    },
    seoStrategy: {
      type: "object",
      properties: {
        coreKeywords: { type: "array", items: { type: "string" }, description: "High volume search terms. (In Chinese)" },
        longTailKeywords: { type: "array", items: { type: "string" }, description: "High conversion long-tail terms. (In Chinese)" },
        scenarioKeywords: { type: "array", items: { type: "string" }, description: "Keywords for social media/scenarios. (In Chinese)" }
      },
      required: ["coreKeywords", "longTailKeywords", "scenarioKeywords"]
    },
    mainImages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          order: { type: "integer" },
          goal: { type: "string" },
          copy: { type: "string" },
          visualSuggestion: { type: "string", description: "Guidance for photographer. (In Chinese)" },
          mjPrompt: { type: "string", description: "High quality Midjourney prompt in English, including lighting, composition, style parameters (e.g. --ar 3:4 --v 6.0)." }
        },
        required: ["order", "goal", "copy", "visualSuggestion", "mjPrompt"]
      }
    },
    detailPage: {
      type: "array",
      items: {
        type: "object",
        properties: {
          screen: { type: "string", description: "Screen number or range, e.g., '1-2'. Only output numbers and hyphens." },
          content: { type: "string" },
          visualFocus: { type: "string" }
        },
        required: ["screen", "content", "visualFocus"]
      }
    },
    abTesting: {
      type: "array",
      items: {
        type: "object",
        properties: {
          location: { type: "string" },
          optionA: { type: "string" },
          optionB: { type: "string" },
          optionC: { type: "string" }
        },
        required: ["location", "optionA", "optionB"]
      }
    }
  },
  required: ["analysisSummary", "differentiation", "competitorWeakness", "styleAdvice", "seoStrategy", "mainImages", "detailPage", "abTesting"]
};

export const generateStrategy = async (data: ProductFormData): Promise<StrategyResult> => {
  const prompt = `
    请扮演超级单品策划专家。以下是产品信息：

    - **平台/场景**：${data.platform}
    - **品类**：${data.category}
    - **目标人群**：${data.targetAudience}
    - **价格/定位**：${data.priceRange} (${data.positioning})
    - **核心优势**：${data.advantages}
    - **竞品/对标**：${data.competitors || "未提供，请基于品类Top竞品进行模拟。"}
    - **品牌调性**：${data.brandStyle}

    任务：
    1. 分析市场并找出竞品常被诟病的痛点（Competitor Weakness）。
    2. 制定 SEO 关键词策略（大词、长尾、种草词）。
    3. 策划 5 张主图，并为每一张编写专业的 Midjourney 英文提示词（mjPrompt）。
    4. 规划 12-16 屏详情页逻辑 (屏数'screen'字段只返回数字, 例如 "1-2")。
    5. 提供 A/B 测试建议。
    
    所有中文内容请使用电商专业术语，mjPrompt 使用英文。
  `;

  try {
    const response = await generateContent({
      model: "gemini-3-flash-preview", // 纯文本任务，使用文本模型
      task: "text_gen",
      contents: {
        parts: [{ text: prompt }]
      },
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    const jsonText = extractJsonTextFromResponse(response);
    return JSON.parse(jsonText) as StrategyResult;
  } catch (error: any) {
    console.error('生成策略失败:', error);
    throw error;
  }
};
