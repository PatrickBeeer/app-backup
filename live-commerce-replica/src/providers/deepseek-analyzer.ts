import { z } from 'zod';
import { buildCopyPrompt } from '../core/prompts.js';
import type { AnalysisDraft, ProjectAnalyzer } from '../services/project-service.js';
import { simplifyChinese } from '../text/simplified-chinese.js';

const responseSchema = z.object({
  summary: z.string().min(1),
  script: z.array(z.object({
    start: z.number().nonnegative(),
    end: z.number().positive(),
    text: z.string().min(1)
  })),
  warnings: z.array(z.string()).default([])
});

function stripFence(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}

export class DeepSeekAnalyzer implements ProjectAnalyzer {
  constructor(
    private readonly config: { baseUrl: string; apiKey?: string; model: string },
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async analyze(input: Parameters<ProjectAnalyzer['analyze']>[0]): Promise<AnalysisDraft> {
    if (!this.config.apiKey) throw new Error('缺少 DEEPSEEK_API_KEY');
    const prompt = buildCopyPrompt({
      product: input.project.product,
      shots: input.shots,
      speechSegments: input.speechSegments,
      referenceTranscript: input.referenceTranscript,
      duration: input.duration
    });
    const requestBody = JSON.stringify({
      model: this.config.model,
      messages: [
        { role: 'system', content: '你是商品短视频口播改写器，只输出 JSON。' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' },
      max_tokens: 4096
    });

    let response: Response | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      response = await this.fetchImpl(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: requestBody
      });
      if (response.ok) break;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === 1) throw new Error(`DeepSeek 文案生成失败（${response.status}）`);
    }

    const body = (await response!.json().catch(() => ({}))) as Record<string, unknown>;
    const choices = Array.isArray(body.choices) ? body.choices as Array<Record<string, unknown>> : [];
    const message = choices[0]?.message as Record<string, unknown> | undefined;
    if (typeof message?.content !== 'string') throw new Error('DeepSeek 文案生成未返回文本');
    const parsed = responseSchema.parse(JSON.parse(stripFence(message.content)));
    if (input.speechSegments.length > 0 && parsed.script.length !== input.speechSegments.length) {
      throw new Error('DeepSeek 口播数量与语音段落不一致');
    }

    return {
      summary: parsed.summary,
      script: parsed.script.map((line, index) => {
        const segment = input.speechSegments[index];
        return {
          id: `line-${index + 1}`,
          start: segment?.start ?? line.start,
          end: segment?.end ?? line.end,
          text: simplifyChinese(line.text),
          source: 'llm' as const
        };
      }),
      overlays: [],
      warnings: parsed.warnings
    };
  }
}
