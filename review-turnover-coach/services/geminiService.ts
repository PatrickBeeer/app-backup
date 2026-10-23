import { generateContent, extractJsonTextFromResponse } from '../../../shared_services/geminiProxyService';
import { GenerationRequest, IssueType, ToneModifier, Language } from '../types';
import type { GeminiGenerateRequest } from '../../../shared_services/geminiProxyService';

const getSystemInstruction = (lang: Language) => `
你是一位名为“差评转化官”（Review Turnover Coach）的资深电商服务经理。
你的核心目标是帮助卖家生成针对差评的回复。

**核心禁令：**
- **禁止在回复开头介绍自己的身份**。不要说“我是服务经理”、“我是店长”或“我是差评转化官”。
- **禁止使用冷冰冰的官话套话**。
- **禁止盲目大包大揽赔罪**，要有理有据。
- **【极其重要】严禁提及“私信”、“私聊”、“已给您发消息”、“请查收私信”等相关表达**。回复必须面向公众展示透明、标准化的处理流程。

**输出语言要求：**
- **你必须使用 [${lang}] 语言输出回复(reply)和分析(analysis)**。即使输入的差评是其他语言，输出也必须是 [${lang}]。

**人设定位：**
1.  **角色**：亲切、耐心、专业且有温度的店铺代表。
2.  **核心转化逻辑**：向“围观”的潜在客户展示：我们的产品依然是优秀的，这次差评是一个可以解释的误会或意外。

**利用“产品信息”进行转化：**
- 识别产品卖点并巧妙织入回复。
- 目标：通过细节证明实力，打消路人顾虑。

**性格与写作风格：**
1.  亲切自然：避免僵硬辞令。
2.  耐心倾听：肯定反馈意愿。
3.  不卑不亢：引导买家通过官方客服渠道解决。
`;

const responseSchema = {
  type: "object",
  properties: {
    reply: {
      type: "string",
      description: "Generated response content.",
    },
    analysis: {
      type: "string",
      description: "Analysis of the response logic.",
    },
  },
  required: ["reply", "analysis"],
};

export const generateReviewResponse = async (
  request: GenerationRequest
): Promise<{ reply: string; analysis: string }> => {
  const prompt = `
    **Product Information**: "${request.productInfo || "Not provided"}"
    **Issue Type**: ${request.issueType}
    **Tone**: ${request.toneModifier || ToneModifier.FRIENDLY}
    **Buyer Review**: "${request.reviewText}"
    
    Please generate a response in [${request.language}].
    `;

  const response = await generateContent({
    model: "gemini-3-flash-preview",
    task: 'text_gen',
    contents: {
      parts: [{ text: prompt }],
    },
    config: {
      systemInstruction: {
        parts: [{ text: getSystemInstruction(request.language) }],
      },
      responseMimeType: "application/json",
      responseSchema: responseSchema,
      temperature: 0.7,
    },
  } as GeminiGenerateRequest);

  const parsed = JSON.parse(extractJsonTextFromResponse(response)) as {
    reply?: string;
    analysis?: string;
  };

  const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
  const analysis = typeof parsed.analysis === 'string' ? parsed.analysis.trim() : '';
  if (!reply || !analysis) {
    throw new Error('Model response missing reply or analysis fields');
  }

  return { reply, analysis };
};
