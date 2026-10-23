import { generateContent, extractJsonTextFromResponse } from '../../../shared_services/geminiProxyService';
import type { GeminiGenerateRequest } from '../../../shared_services/geminiProxyService';
import type { MarketingStrategyResult } from '../types';

const randomSeeds = [
  '侧重实用功能与性价比',
  '侧重情感共鸣与送礼场景',
  '侧重痛点反转与急迫性',
  '侧重生活方式与精致感',
];

const responseSchema = {
  type: 'object',
  properties: {
    painPoints: { type: 'array', items: { type: 'string' } },
    sellingPoints: { type: 'array', items: { type: 'string' } },
    keywords: {
      type: 'object',
      properties: {
        traffic: { type: 'array', items: { type: 'string' } },
        content: { type: 'array', items: { type: 'string' } },
        longTail: { type: 'array', items: { type: 'string' } },
      },
      required: ['traffic', 'content', 'longTail'],
    },
    operationsChecklist: { type: 'array', items: { type: 'string' } },
    videoScript: {
      type: 'object',
      properties: {
        hook: { type: 'string' },
        body: { type: 'string' },
        cta: { type: 'string' },
      },
      required: ['hook', 'body', 'cta'],
    },
  },
  required: ['painPoints', 'sellingPoints', 'keywords', 'operationsChecklist', 'videoScript'],
};

export async function generateMarketingStrategy(
  theme: string,
  product: string,
  targetAudience: string
): Promise<MarketingStrategyResult> {
  const seed = randomSeeds[Math.floor(Math.random() * randomSeeds.length)];
  const prompt = `
作为一名深耕电商行业10年的资深运营专家，请针对以下选品场景提供一份全方位的电商运营锦囊。
本次方案生成风格要求：${seed}。

场景主题：${theme}
推荐产品：${product}
目标人群：${targetAudience}

请输出高质量的JSON格式内容，包含：
1. 痛点分析 (3个核心点)
2. 核心卖点建议 (3个差异化卖点)
3. 电商关键词矩阵：
   - 流量词：高搜索量、大类目词
   - 种草词：强意愿、内容导向词、痛点解决词
   - 长尾词：精准成交词、细分场景词
4. 商家运营执行清单 (3个关键落地动作)
5. 短视频拍摄脚本大纲 (包含：黄金开头、反转/方案内容、结尾行动号召)
`;

  const response = await generateContent({
    model: 'gemini-3-flash-preview',
    task: 'text_gen',
    contents: { parts: [{ text: prompt }] },
    config: {
      responseMimeType: 'application/json',
      responseSchema,
    },
  } as GeminiGenerateRequest);

  const jsonText = extractJsonTextFromResponse(response);
  return JSON.parse(jsonText) as MarketingStrategyResult;
}
