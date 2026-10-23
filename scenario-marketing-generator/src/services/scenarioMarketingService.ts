import {extractTextFromResponse, generateContent} from '../../../../shared_services/geminiProxyService';

const TEXT_MODEL = 'gemini-3-flash-preview';

export interface GenerateScenarioMarketingInput {
  productText?: string;
  imageDataUrl?: string;
  targetAudience?: string;
}

function stripDataUrlPrefix(input: string): string {
  return String(input || '').replace(/^data:[^;]+;base64,/i, '');
}

function detectMimeType(input: string, fallback = 'image/png'): string {
  const match = String(input || '').match(/^data:([^;]+);base64,/i);
  return match?.[1] || fallback;
}

function buildPrompt(input: GenerateScenarioMarketingInput): string {
  const productText = String(input.productText || '').trim();
  const targetAudience = String(input.targetAudience || '').trim();

  return [
    '你是一名资深营销策划与电商内容顾问，擅长把产品卖点转化为具体、鲜活、可传播的消费买点。',
    '',
    '任务目标：',
    '1. 识别产品的客观卖点、参数或视觉特征。',
    '2. 将这些卖点改写成以生活场景、用户感受、痛点解决和情绪价值为核心的买点表达。',
    '3. 输出适合直接交付给运营、投放或内容团队的中文 Markdown 方案。',
    '',
    '输出要求：',
    '- 全部使用简体中文。',
    '- 先给一个吸引人的方案标题。',
    '- 再给一个 2-4 句的整体概述。',
    '- 然后按条目输出 4-8 个“场景化买点”。',
    '- 每个条目尽量包含：场景标题、对应人群痛点、转化后的买点表达、适合传播的话术角度。',
    '- 如果输入信息不足，可以基于图片和文本做合理推断，但不要编造明显不可信的硬参数。',
    '',
    `产品文本信息：${productText || '未提供，请结合上传图片尽量分析产品类型、材质、结构、用途与潜在卖点。'}${targetAudience ? `\n目标人群：${targetAudience}` : ''}`,
  ].join('\n');
}

export async function generateScenarioMarketingPlan(input: GenerateScenarioMarketingInput): Promise<string> {
  const productText = String(input.productText || '').trim();
  const imageDataUrl = String(input.imageDataUrl || '').trim();

  if (!productText && !imageDataUrl) {
    throw new Error('请提供产品信息或图片。');
  }

  const parts: Array<Record<string, unknown>> = [];

  if (imageDataUrl) {
    parts.push({
      inlineData: {
        mimeType: detectMimeType(imageDataUrl),
        data: stripDataUrlPrefix(imageDataUrl),
      },
    });
  }

  parts.push({
    text: buildPrompt(input),
  });

  const response = await generateContent({
    model: TEXT_MODEL,
    task: 'text_gen',
    billing_task: 'text_gen',
    contents: {parts},
    systemInstruction: {
      parts: [
        {
          text: '你输出的是可直接用于电商营销策划的中文 Markdown 内容，重点是把卖点转成具体使用场景下的买点。',
        },
      ],
    },
    config: {
      temperature: 0.7,
    },
  });

  return extractTextFromResponse(response).trim();
}
