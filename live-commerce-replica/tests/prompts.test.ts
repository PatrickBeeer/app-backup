import { describe, expect, it } from 'vitest';
import { buildUnitPrompt } from '../src/core/prompts.js';
import type { GenerationUnit, Project } from '../src/core/types.js';

const unit: GenerationUnit = {
  id: 'unit-1', start: 0, end: 6, duration: 6, requestDuration: 6,
  shotIds: ['shot-1', 'shot-2'], scriptLineIds: ['line-1', 'line-2']
};

const project: Project = {
  id: 'project-1', name: '保温杯复刻', ratio: '9:16', presenterMode: 'reference', referenceVideo: 'reference.mp4',
  personPhotos: ['p1.jpg', 'p2.jpg', 'p3.jpg'], productImages: ['sku.jpg'],
  product: {
    name: '便携保温杯', price: '99 元', sellingPoints: ['316 不锈钢'], specifications: ['500mL'],
    requiredClaims: ['食品接触级材质'], forbiddenClaims: ['全网最低价']
  },
  status: 'READY_TO_CONFIRM', createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z',
  analysis: {
    probe: { duration: 30, width: 1080, height: 1920, fps: 30, hasVideo: true, hasAudio: true },
    shots: [], speechSegments: [], generationUnits: [unit], overlays: [], summary: '参考片', degraded: false, warnings: [],
    script: [
      { id: 'line-1', start: 0.2, end: 2.8, text: '先看这款便携保温杯', source: 'llm' },
      { id: 'line-2', start: 3, end: 5.8, text: '采用316 不锈钢', source: 'llm' }
    ]
  }
};

describe('buildUnitPrompt', () => {
  it('includes exact new dialogue and protects identity, product facts, timing and text rendering', () => {
    const prompt = buildUnitPrompt(project, unit);

    expect(prompt).toContain('先看这款便携保温杯');
    expect(prompt).toContain('采用316 不锈钢');
    expect(prompt).toContain('参考视频只用于动作');
    expect(prompt).toContain('不要沿用参考视频中的人物身份');
    expect(prompt).toContain('禁止在画面中生成任何可读文字');
    expect(prompt).toContain('使用参考视频中说话人的音色、声线、口音、语气、语速和情绪');
    expect(prompt).toContain('完全忽略其文字语义和旧商品信息');
    expect(prompt).toContain('必须按下方时间轴逐字朗读新口播');
    expect(prompt).not.toContain('不要克隆参考人物的声音');
    expect(prompt).toContain('全网最低价');
    expect(prompt).toContain('6.000 秒');
  });

  it('asks Seedance to create a clearly adult presenter when no identity photos are supplied', () => {
    const generatedPresenterProject: Project = {
      ...project,
      presenterMode: 'generated',
      personPhotos: []
    };

    const prompt = buildUnitPrompt(generatedPresenterProject, unit);

    expect(prompt).toContain('生成一位明确年满 18 岁');
    expect(prompt).toContain('不得沿用参考视频中的人物身份');
  });
});
