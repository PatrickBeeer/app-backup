import { generateContent, extractJsonTextFromResponse, extractTextFromResponse } from '../../../shared_services/geminiProxyService';
import type { GeminiGenerateRequest } from '../../../shared_services/geminiProxyService';
import type { AnalysisResult } from '../types';

const SYSTEM_INSTRUCTION = `你是一个拥有500万粉丝的小红书爆文操盘手，同时也是顶级 AI 绘画专家，精通 Midjourney 和 即梦 (Jimeng)。
你必须使用中文进行诊断和编写实拍 SOP。所有的分析结果、步骤说明、建议都必须是简体中文。`;

const PROMPT = `
请对这张小红书封面进行深度拆解，输出要求如下（所有中文内容必须使用简体中文）：

1. 【毒舌诊断】：犀利指出视觉钩子、配色方案和构图逻辑。
2. 【手机实拍SOP】：提供低成本复刻方案。包括布光、道具、执行步骤和氛围词。
3. 【AI绘画咒语】：请为不同平台生成一段完整的、高质量的提示词。
   - **Midjourney 咒语**：必须是英文。包含：主体描述、环境背景、光影氛围(如 Cinematic lighting)、相机参数(如 Shot on 35mm lens)、以及后缀参数(--ar 3:4 --v 6.0 --stylize 250)。
   - **即梦 Jimeng 咒语**：必须是中文。采用描述性长句，融合核心主体、环境细节、光影色彩和画面质感标签。

请严格按照以下 JSON 格式输出。
`;

const JSON_REPAIR_PROMPT = [
  '你是严格的 JSON 格式化器。',
  '请把输入内容转换成完全合法、可解析的 JSON，并严格匹配给定 schema。',
  '规则：',
  '1) 只输出 JSON，不要输出解释、markdown 或代码块。',
  '2) 尽量保持原始语义和语言（中文）。',
  '3) 缺失字段请基于上下文补全为简洁合理的值。',
  'INPUT:',
].join('\n');

const responseSchema = {
  type: 'object',
  properties: {
    toxicDiagnosis: {
      type: 'object',
      properties: {
        whyViral: { type: 'string' },
        mustCopy: { type: 'array', items: { type: 'string' } },
        optimization: { type: 'string' },
      },
      required: ['whyViral', 'mustCopy', 'optimization'],
    },
    mobileSop: {
      type: 'object',
      properties: {
        lighting: { type: 'string' },
        props: { type: 'array', items: { type: 'string' } },
        steps: { type: 'array', items: { type: 'string' } },
        vibe: { type: 'string' },
      },
      required: ['lighting', 'props', 'steps', 'vibe'],
    },
    aiPrompts: {
      type: 'object',
      properties: {
        midjourney: { type: 'string' },
        jimeng: { type: 'string' },
      },
      required: ['midjourney', 'jimeng'],
    },
  },
  required: ['toxicDiagnosis', 'mobileSop', 'aiPrompts'],
};

function extractBalancedJsonValue(text: string): string {
  const source = String(text || '');
  if (!source.trim()) {
    return '';
  }

  const objectStart = source.indexOf('{');
  const arrayStart = source.indexOf('[');
  let start = -1;
  if (objectStart >= 0 && arrayStart >= 0) {
    start = Math.min(objectStart, arrayStart);
  } else if (objectStart >= 0) {
    start = objectStart;
  } else if (arrayStart >= 0) {
    start = arrayStart;
  }

  if (start < 0) {
    return '';
  }

  const opening = source[start];
  const expectedClosing = opening === '{' ? '}' : ']';
  const stack: string[] = [expectedClosing];
  let inString = false;
  let escaped = false;

  for (let i = start + 1; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      stack.push('}');
      continue;
    }
    if (ch === '[') {
      stack.push(']');
      continue;
    }
    if ((ch === '}' || ch === ']') && stack.length > 0 && stack[stack.length - 1] === ch) {
      stack.pop();
      if (stack.length === 0) {
        return source.slice(start, i + 1).trim();
      }
    }
  }

  return '';
}

function extractJsonFromLooseText(text: string): string {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return '';
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]?.trim()) {
    const fenced = fencedMatch[1].trim();
    const balancedFenced = extractBalancedJsonValue(fenced);
    return balancedFenced || fenced;
  }

  const balanced = extractBalancedJsonValue(trimmed);
  if (balanced) {
    return balanced;
  }

  return trimmed;
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error ?? 'unknown error');
}

function parseJsonResponse(response: unknown, label: string): unknown {
  const candidates: string[] = [];

  try {
    const strictText = extractJsonTextFromResponse(response as any).trim();
    if (strictText) {
      candidates.push(strictText, extractJsonFromLooseText(strictText));
    }
  } catch {
    // Fall through to loose text parsing.
  }

  try {
    const looseText = extractTextFromResponse(response as any);
    if (looseText?.trim()) {
      candidates.push(extractJsonFromLooseText(looseText), looseText.trim());
    }
  } catch {
    // No text candidates.
  }

  const deduped = Array.from(new Set(candidates.filter(Boolean)));
  let lastError: unknown = new Error('empty json candidates');
  for (const candidate of deduped) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === 'string') {
        try {
          return JSON.parse(parsed);
        } catch {
          return parsed;
        }
      }
      return parsed;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`${label} 返回格式异常: ${normalizeErrorMessage(lastError)}`);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => asString(item)).filter(Boolean);
}

function normalizeAnalysisResult(value: unknown): AnalysisResult {
  const root = asRecord(value);
  const toxicDiagnosis = asRecord(root.toxicDiagnosis);
  const mobileSop = asRecord(root.mobileSop);
  const aiPrompts = asRecord(root.aiPrompts);

  return {
    toxicDiagnosis: {
      whyViral: asString(toxicDiagnosis.whyViral),
      mustCopy: asStringArray(toxicDiagnosis.mustCopy),
      optimization: asString(toxicDiagnosis.optimization),
    },
    mobileSop: {
      lighting: asString(mobileSop.lighting),
      props: asStringArray(mobileSop.props),
      steps: asStringArray(mobileSop.steps),
      vibe: asString(mobileSop.vibe),
    },
    aiPrompts: {
      midjourney: asString(aiPrompts.midjourney),
      jimeng: asString(aiPrompts.jimeng),
    },
  };
}

function extractBestEffortText(response: unknown): string {
  try {
    const strictText = extractJsonTextFromResponse(response as any).trim();
    if (strictText) {
      return strictText;
    }
  } catch {
    // Fall through to loose text parsing.
  }

  try {
    const looseText = extractTextFromResponse(response as any).trim();
    if (looseText) {
      return looseText;
    }
  } catch {
    // No usable text.
  }

  return '';
}

async function parseAnalysisResponseWithRepair(response: unknown): Promise<AnalysisResult> {
  try {
    return normalizeAnalysisResult(parseJsonResponse(response, '封面分析'));
  } catch (parseError) {
    const sourceText = extractBestEffortText(response);
    if (!sourceText) {
      throw parseError;
    }

    console.warn('[xiaohongshu-cover-breakdown] parse failed, attempting JSON repair fallback.', parseError);
    const repairResponse = await generateContent({
      model: 'gemini-3-flash-preview',
      task: 'text_gen',
      billing_task: 'text_gen',
      contents: {
        parts: [
          {
            text: `${JSON_REPAIR_PROMPT}\n${sourceText}`,
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema,
      },
    } as GeminiGenerateRequest);

    return normalizeAnalysisResult(parseJsonResponse(repairResponse, '封面分析修复'));
  }
}

export async function analyzeCoverImage(base64Image: string): Promise<AnalysisResult> {
  const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

  const response = await generateContent({
    model: 'gemini-3-flash-preview',
    task: 'text_gen',
    billing_task: 'text_gen',
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
        { text: PROMPT },
      ],
    },
    config: {
      systemInstruction: {
        parts: [
          {
            text: SYSTEM_INSTRUCTION,
          },
        ],
      },
      responseMimeType: 'application/json',
      responseSchema,
    },
  } as GeminiGenerateRequest);

  return parseAnalysisResponseWithRepair(response);
}
