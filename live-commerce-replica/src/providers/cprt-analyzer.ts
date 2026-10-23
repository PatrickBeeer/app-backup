import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { buildAnalysisPrompt } from '../core/prompts.js';
import type { ProjectAnalyzer, AnalysisDraft } from '../services/project-service.js';

const responseSchema = z.object({
  summary: z.string().min(1),
  script: z.array(z.object({
    start: z.number().nonnegative(),
    end: z.number().positive(),
    text: z.string().min(1)
  })),
  overlays: z.array(z.object({
    start: z.number().nonnegative(),
    end: z.number().positive(),
    text: z.string(),
    xPercent: z.number().min(0).max(100),
    yPercent: z.number().min(0).max(100),
    fontSize: z.number().min(12).max(120),
    color: z.string(),
    outlineColor: z.string(),
    backgroundColor: z.string().optional()
  })).default([]),
  warnings: z.array(z.string()).default([])
});

function mediaType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function stripFence(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}

export class CprtAnalyzer implements ProjectAnalyzer {
  constructor(
    private readonly config: { baseUrl: string; apiKey?: string; model: string },
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async analyze(input: Parameters<ProjectAnalyzer['analyze']>[0]): Promise<AnalysisDraft> {
    if (!this.config.apiKey) throw new Error('缺少 CPRT_API_KEY');
    const prompt = buildAnalysisPrompt({
      product: input.project.product,
      shots: input.shots,
      speechSegments: input.speechSegments,
      duration: input.duration
    });
    const images = await Promise.all(input.frames.slice(0, 8).map(async (filePath) => ({
      type: 'image_url',
      image_url: { url: `data:${mediaType(filePath)};base64,${(await readFile(filePath)).toString('base64')}` }
    })));
    const response = await this.fetchImpl(`${this.config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, ...images] }]
      })
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw new Error(`结构分析失败（${response.status}）`);
    const choices = Array.isArray(body.choices) ? body.choices as Array<Record<string, unknown>> : [];
    const message = choices[0]?.message as Record<string, unknown> | undefined;
    if (typeof message?.content !== 'string') throw new Error('结构分析未返回文本');
    const parsed = responseSchema.parse(JSON.parse(stripFence(message.content)));
    return {
      summary: parsed.summary,
      script: parsed.script.map((line, index) => ({ ...line, id: `line-${index + 1}`, source: 'llm' as const })),
      overlays: parsed.overlays.map((overlay, index) => ({
        id: `overlay-${index + 1}`,
        start: overlay.start,
        end: overlay.end,
        text: overlay.text,
        xPercent: overlay.xPercent,
        yPercent: overlay.yPercent,
        fontSize: overlay.fontSize,
        color: overlay.color,
        outlineColor: overlay.outlineColor,
        ...(overlay.backgroundColor ? { backgroundColor: overlay.backgroundColor } : {})
      })),
      warnings: parsed.warnings
    };
  }
}
