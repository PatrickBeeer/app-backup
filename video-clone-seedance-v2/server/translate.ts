// 副作用导入：确保 .env（LLM_TRANSLATE_* 等配置）在任何入口下都被加载。
import './config';

import { bailianSpeechLanguageLabel } from '../shared/speechContract';
import { RequestValidationError } from './validation';

/**
 * 台词自动翻译：走「OpenAI 兼容 chat/completions」协议，
 * 当前接 147ai（https://147ai.com/v1），换成火山方舟或别的中转也只需改 .env。
 */

const SYSTEM_PROMPT = [
  '你是资深电商短视频口播台词译员，负责把带货/测评视频的原台词翻译成目标语言，供 TTS 配音后让视频人物对口型。',
  '硬性要求：',
  '1. 只输出翻译后的台词本身，不要任何解释、注释、音标、原文对照或前后缀说明。',
  '2. 用目标语言里真人出镜口播会说的口语，不要书面翻译腔、不要生硬直译。',
  '3. 品牌名、产品名、成分名、型号、数字、货币与单位原样保留（例如 HLA、玻尿酸、3ml、¥199）。',
  '4. 译文的朗读时长要尽量贴近原台词：目标语言若明显更啰嗦就精简压缩，禁止扩写、加戏或新增原文没有的信息。',
  '5. 保留原台词的情绪、语气、卖点、促销信息与行动号召（如"点击下方链接"）。',
  '6. 用自然的逗号/句号表达停顿，不要用列表、项目符号、括号或引号。',
  '7. 原文若有口误、重复或口头禅，按自然口播整理通顺即可，不必逐字对应。',
  '8. 不要添加任何原文没有的句子，也不要删掉原文的核心信息。',
].join('\n');

export type TranslateScriptInput = {
  /** 原台词（ASR 识别结果或用户手填）。 */
  text: string;
  /** 目标语言代码，如 en-US / ja-JP。 */
  targetLanguage: string;
};

function resolveConfig() {
  const baseUrl = String(
    process.env.LLM_TRANSLATE_BASE_URL || 'https://147ai.com/v1',
  ).replace(/\/$/, '');
  const apiKey = String(process.env.LLM_TRANSLATE_API_KEY || '').trim();
  const model = String(process.env.LLM_TRANSLATE_MODEL || '').trim();
  const parsedTemperature = Number(process.env.LLM_TRANSLATE_TEMPERATURE ?? '0.3');
  return {
    baseUrl,
    apiKey,
    model,
    temperature: Number.isFinite(parsedTemperature) ? parsedTemperature : 0.3,
  };
}

export function isTranslateConfigured(): boolean {
  const { apiKey, model } = resolveConfig();
  return Boolean(apiKey && model);
}

/** 把模型输出洗成干净的台词：去掉代码块、包裹引号与「译文：」这类前缀。 */
export function normalizeTranslatedText(raw: string): string {
  let text = String(raw || '').trim();
  text = text.replace(/^```[a-zA-Z0-9_-]*\s*/, '').replace(/```\s*$/, '').trim();
  text = text.replace(/^(译文|翻译结果|翻译|translation)\s*[:：]\s*/i, '').trim();
  const quotePairs: Array<[string, string]> = [['"', '"'], ["'", "'"], ['“', '”'], ['「', '」']];
  for (const [open, close] of quotePairs) {
    if (text.length > 1 && text.startsWith(open) && text.endsWith(close)) {
      text = text.slice(1, -1).trim();
      break;
    }
  }
  return text;
}

/** 把台词翻译成目标语言，返回可直接送 TTS 的译文。 */
export async function translateScript(input: TranslateScriptInput): Promise<string> {
  const text = String(input.text || '').trim();
  if (!text) {
    throw new RequestValidationError('缺少待翻译的台词原文。', 400);
  }

  const { baseUrl, apiKey, model, temperature } = resolveConfig();
  if (!apiKey || !model) {
    throw new RequestValidationError(
      [
        '自动翻译尚未配置：请在项目根目录 .env 中填写 LLM_TRANSLATE_API_KEY 和 LLM_TRANSLATE_MODEL',
        '（用火山方舟时 LLM_TRANSLATE_BASE_URL 默认为 https://ark.cn-beijing.volces.com/api/v3，模型名填方舟的接入点 ID；用 147ai/Gemini 等中转时把 base URL 换成对应网关地址）。',
        '也可以直接在「AI 换声 / 换语言」面板里手动填写目标语言台词。',
      ].join(''),
      503,
    );
  }

  const targetLabel = bailianSpeechLanguageLabel(input.targetLanguage);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `目标语言：${targetLabel}（${input.targetLanguage}）\n原台词：${text}\n请只输出翻译后的台词。`,
        },
      ],
    }),
  });

  const raw = await response.text();
  let payload: Record<string, any> = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    throw new RequestValidationError(
      `翻译接口返回了非 JSON 响应（HTTP ${response.status}）：${raw.slice(0, 200)}`,
      502,
    );
  }

  if (!response.ok) {
    const message = String(payload?.error?.message || payload?.message || raw.slice(0, 200));
    throw new RequestValidationError(`翻译接口报错（HTTP ${response.status}）：${message}`, 502);
  }

  const content = normalizeTranslatedText(
    String(
      payload?.choices?.[0]?.message?.content
      ?? payload?.data?.choices?.[0]?.message?.content
      ?? '',
    ),
  );
  if (!content) {
    throw new RequestValidationError('翻译接口没有返回有效译文，请手动填写台词后重试。', 502);
  }

  return content;
}
