import { describe, expect, it } from 'vitest';
import { DeepSeekAnalyzer } from '../src/providers/deepseek-analyzer.js';
import type { Project } from '../src/core/types.js';

const project: Project = {
  id: 'project-1',
  name: '短袖套装',
  ratio: '9:16',
  presenterMode: 'generated',
  referenceVideo: 'reference.mp4',
  personPhotos: [],
  productImages: ['short-sleeve.jpg'],
  product: {
    name: '棉麻短袖套装',
    price: '121 元',
    sellingPoints: ['透气'],
    specifications: ['短袖'],
    requiredClaims: [],
    forbiddenClaims: ['长袖']
  },
  status: 'DRAFT',
  createdAt: '2026-08-13T00:00:00.000Z',
  updatedAt: '2026-08-13T00:00:00.000Z'
};

const successBody = {
  id: 'chat-1',
  object: 'chat.completion',
  created: 1,
  model: 'deepseek-v4-flash',
  choices: [{
    index: 0,
    finish_reason: 'stop',
    message: {
      role: 'assistant',
      content: JSON.stringify({
        summary: '短袖套裝口播',
        script: [{ start: 0, end: 4, text: '這款短袖棉麻套裝穿起來很透氣' }],
        warnings: []
      })
    }
  }],
  usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 }
};

function analysisInput() {
  return {
    frames: ['frame.jpg'],
    project,
    shots: [{ id: 'shot-1', start: 0, end: 4 }],
    speechSegments: [{ id: 'speech-1', start: 0, end: 4 }],
    referenceTranscript: [{ id: 'speech-1', start: 0, end: 4, text: '姐妹们这件长袖真的很显瘦' }],
    duration: 4
  };
}

describe('DeepSeekAnalyzer', () => {
  it('generates timed product copy through JSON mode without sending images', async () => {
    let requestBody: Record<string, unknown> | undefined;
    const analyzer = new DeepSeekAnalyzer(
      { baseUrl: 'https://api.deepseek.com', apiKey: 'test-key', model: 'deepseek-v4-flash' },
      async (_url, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify(successBody), { status: 200 });
      }
    );

    const result = await analyzer.analyze(analysisInput());

    expect(result.script).toEqual([{
      id: 'line-1', start: 0, end: 4, text: '这款短袖棉麻套装穿起来很透气', source: 'llm'
    }]);
    expect(requestBody).toEqual(expect.objectContaining({
      model: 'deepseek-v4-flash',
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' }
    }));
    const serializedMessages = JSON.stringify(requestBody?.messages);
    expect(serializedMessages).toContain('棉麻短袖套装');
    expect(serializedMessages).toContain('长袖');
    expect(serializedMessages).toContain('姐妹们这件长袖真的很显瘦');
    expect(serializedMessages).toContain('商品事实优先级最高');
    expect(serializedMessages).toContain('模仿句式');
    expect(serializedMessages).not.toContain('image_url');
    expect(serializedMessages).not.toContain('frame.jpg');
  });

  it('retries one transient server failure before returning copy', async () => {
    const responses = [
      new Response(JSON.stringify({ message: 'busy' }), { status: 503 }),
      new Response(JSON.stringify(successBody), { status: 200 })
    ];
    let calls = 0;
    const analyzer = new DeepSeekAnalyzer(
      { baseUrl: 'https://api.deepseek.com', apiKey: 'test-key', model: 'deepseek-v4-flash' },
      async () => {
        calls += 1;
        return responses.shift()!;
      }
    );

    const result = await analyzer.analyze(analysisInput());

    expect(result.script[0]?.text).toContain('短袖');
    expect(calls).toBe(2);
  });
});
