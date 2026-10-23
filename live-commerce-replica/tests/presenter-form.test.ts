import { describe, expect, it } from 'vitest';
import { presenterFormState } from '../public/presenter-form.js';

describe('presenterFormState', () => {
  it('allows a generated presenter at the 15-second boundary', () => {
    expect(presenterFormState(15, 'generated')).toEqual({
      mode: 'generated',
      forced: false,
      requiresPhotos: false,
      message: '模型将自动生成一位明确成年的带货人物'
    });
  });

  it('forces reference presenter mode above 15 seconds', () => {
    expect(presenterFormState(15.001, 'generated')).toEqual({
      mode: 'reference',
      forced: true,
      requiresPhotos: true,
      message: '视频超过 15 秒，需要指定模特以保持分段人物一致'
    });
  });

  it('keeps reference presenter mode optional within 15 seconds', () => {
    expect(presenterFormState(12, 'reference')).toEqual({
      mode: 'reference',
      forced: false,
      requiresPhotos: true,
      message: '上传 1–5 张同一位成年模特照片'
    });
  });
});
