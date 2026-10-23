// All LLM calls route through the shared geminiProxyService → app-manager → api-manager,
// per repo convention. The browser holds no API keys. Mirrors backend/app/clients/openai_client.py.

import {
  generateContent,
  extractImageFromResponse,
  extractJsonTextFromResponse,
  type GeminiGenerateResponse,
} from '../../../../shared_services/geminiProxyService';
import {
  ANALYSIS_SYSTEM,
  COPY_SYSTEM,
  COVER_PLAN_SYSTEM,
  COVER_VISUAL_SYSTEM,
  TITLE_SYSTEM,
  coverPrompt,
} from './prompts';
import {
  analysisReportSchema,
  coverPlanSchema,
  generatedCopySchema,
  insightSectionOnlySchema,
  titlesSchema,
} from './schemas';
import type { Comment, CoverPlan, GeneratedCopy, Note, NoteSnapshot, Report, Insight } from '../types';

const TEXT_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-3.1-flash-image-preview';

const MAX_CONTENT_CHARS = 5000;
const MAX_COMMENTS = 20;

const RETRYABLE_IMAGE_ERROR = /(\b408\b|\b429\b|\b500\b|\b502\b|\b503\b|\b504\b|\b524\b|timeout|timed out|etimedout|econnreset|network)/i;
const IMAGE_MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function splitDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/s);
  if (!match) return { mimeType: 'image/jpeg', data: dataUrl };
  return { mimeType: match[1], data: match[2] };
}

function parseJson<T>(response: GeminiGenerateResponse): T {
  return JSON.parse(extractJsonTextFromResponse(response)) as T;
}

function isGatewayTimeout(error: unknown): boolean {
  return /timeout|timed out|524|proxy read timeout/i.test(String((error as Error)?.message || ''));
}

// ---- analyze (text-only, structured) ----
export async function analyze(note: NoteSnapshot, comments: Comment[]): Promise<Report> {
  const context = JSON.stringify({
    title: note.title,
    content: note.content.slice(0, MAX_CONTENT_CHARS),
    type: note.note_type,
    author: note.author,
    metrics: note.metrics,
    comments: comments.slice(0, MAX_COMMENTS).map((c) => c.content),
  });
  const response = await generateContent({
    model: TEXT_MODEL,
    task: 'text_gen',
    billing_task: 'link_analyze',
    systemInstruction: { parts: [{ text: ANALYSIS_SYSTEM }] },
    contents: { parts: [{ text: context }] },
    config: {
      responseMimeType: 'application/json',
      responseSchema: analysisReportSchema,
      temperature: 0.4,
    },
  });
  return parseJson<Report>(response);
}

// ---- enhance_cover_visual (vision, optional, non-blocking on timeout) ----
export async function enhanceCoverVisual(
  note: { title: string; note_type: string },
  sourceCoverDataUrl: string | null,
): Promise<Insight | null> {
  if (!sourceCoverDataUrl) return null;
  const context = JSON.stringify({
    title: note.title,
    type: note.note_type,
    instruction: '只分析首图或封面视觉，返回简短中文结论和画面证据。',
  });
  const { mimeType, data } = splitDataUrl(sourceCoverDataUrl);
  try {
    const response = await generateContent({
      model: TEXT_MODEL,
      task: 'text_gen',
      billing_task: 'text_gen',
      systemInstruction: { parts: [{ text: COVER_VISUAL_SYSTEM }] },
      contents: { parts: [{ text: context }, { inlineData: { mimeType, data } }] },
      config: {
        responseMimeType: 'application/json',
        responseSchema: insightSectionOnlySchema,
        temperature: 0.3,
      },
    });
    return parseJson<Insight>(response);
  } catch (error) {
    // Optional enrichment: a slow image route must never hold the report hostage.
    if (isGatewayTimeout(error)) return null;
    throw error;
  }
}

// ---- plan_cover (vision on source cover) ----
export async function planCover(title: string, sourceCoverDataUrl: string): Promise<CoverPlan> {
  const { mimeType, data } = splitDataUrl(sourceCoverDataUrl);
  const response = await generateContent({
    model: TEXT_MODEL,
    task: 'text_gen',
    billing_task: 'text_gen',
    systemInstruction: { parts: [{ text: COVER_PLAN_SYSTEM }] },
    contents: {
      parts: [
        { text: `新标题：${title}\n分析原封面的主体、构图、配色、标题位置、文字符号、强调方式与换行规律。` },
        { inlineData: { mimeType, data } },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: coverPlanSchema,
      temperature: 0.3,
    },
  });
  return parseJson<CoverPlan>(response);
}

// ---- titles (6 candidates) ----
export async function titles(report: Report, brief: string, sourceTitle: string): Promise<string[]> {
  const userText =
    `爆款拆解：${JSON.stringify(report)}\n用户需求：${brief}\n` +
    `禁止模仿的原帖标题：${sourceTitle}\n` +
    `必须换用不同措辞、不同句式和不同创意切入点。\n` +
    `先在心里判断目标读者为什么会点开，再输出6个可直接发布的标题；不要解释。`;
  const response = await generateContent({
    model: TEXT_MODEL,
    task: 'text_gen',
    billing_task: 'text_gen',
    systemInstruction: { parts: [{ text: TITLE_SYSTEM }] },
    contents: { parts: [{ text: userText }] },
    config: {
      responseMimeType: 'application/json',
      responseSchema: titlesSchema,
      temperature: 0.85,
    },
  });
  const parsed = parseJson<{ titles: string[] }>(response);
  return Array.isArray(parsed.titles) ? parsed.titles : [];
}

// ---- copy (body + tags + optional video_script) ----
export async function copy(
  report: Report,
  brief: string,
  title: string,
  isVideo: boolean,
  sourceTitle = '',
  sourceContent = '',
  rewriteFeedback = '',
): Promise<GeneratedCopy> {
  const userText =
    `标题：${title}\n需求：${brief}\n是否视频：${isVideo}\n` +
    `拆解：${JSON.stringify(report)}\n` +
    `禁止仿写的原帖标题：${sourceTitle}\n` +
    `禁止仿写的原帖正文：${sourceContent.slice(0, 6000)}\n` +
    `重写反馈：${rewriteFeedback || '无'}\n` +
    `输出必须与原帖在措辞、句序、段落组织、案例和表达路径上明显不同。`;
  const response = await generateContent({
    model: TEXT_MODEL,
    task: 'text_gen',
    billing_task: 'text_gen',
    systemInstruction: { parts: [{ text: COPY_SYSTEM }] },
    contents: { parts: [{ text: userText }] },
    config: {
      responseMimeType: 'application/json',
      responseSchema: generatedCopySchema,
      temperature: 0.85,
    },
  });
  const parsed = parseJson<GeneratedCopy>(response);
  // Normalize: image notes must have null video_script.
  if (!isVideo) parsed.video_script = null;
  return {
    body: parsed.body || '',
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    video_script: Array.isArray(parsed.video_script) ? parsed.video_script : null,
  };
}

// ---- coverImage (text-to-image) ----
async function executeImageWithRetry(action: () => Promise<GeminiGenerateResponse>): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= IMAGE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await action();
      const url = extractImageFromResponse(response);
      if (!url) throw new Error('AI未返回图片数据。');
      return url;
    } catch (error) {
      lastError = error;
      if (!RETRYABLE_IMAGE_ERROR.test(String((error as Error)?.message || '')) || attempt === IMAGE_MAX_ATTEMPTS) {
        throw error;
      }
      const backoff = Math.min(1200 * 2 ** (attempt - 1), 5000);
      await sleep(backoff + Math.floor(Math.random() * 300));
    }
  }
  throw lastError;
}

export async function coverImage(title: string, visualReference: string, brief: string): Promise<string> {
  const prompt = coverPrompt(title, brief, visualReference);
  return executeImageWithRetry(() =>
    generateContent({
      model: IMAGE_MODEL,
      task: 'image_gen',
      billing_task: 'image_gen',
      contents: { parts: [{ text: prompt }] },
      config: {
        imageConfig: { aspectRatio: '9:16' },
      },
    }),
  );
}

// Re-export for orchestration typing convenience.
export type { Note };
