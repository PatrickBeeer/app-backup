import { describe, expect, it } from 'vitest';
import { buildFallbackScript } from '../src/core/script.js';
import type { ProductBrief, SpeechSegment } from '../src/core/types.js';

const product: ProductBrief = {
  name: '便携保温杯',
  price: '99 元',
  sellingPoints: ['316 不锈钢', '单手开盖', '长效保温'],
  specifications: ['500mL'],
  requiredClaims: ['食品接触级材质'],
  forbiddenClaims: ['全网最低价']
};

const segments: SpeechSegment[] = [
  { id: 'speech-1', start: 0.5, end: 3.5 },
  { id: 'speech-2', start: 4, end: 7 },
  { id: 'speech-3', start: 7.5, end: 11 }
];

describe('buildFallbackScript', () => {
  it('creates one timed line per detected speech segment using only product facts', () => {
    const lines = buildFallbackScript(segments, product);

    expect(lines).toHaveLength(3);
    expect(lines.map((line) => [line.start, line.end])).toEqual([[0.5, 3.5], [4, 7], [7.5, 11]]);
    expect(lines.map((line) => line.text).join('')).toContain('便携保温杯');
    expect(lines.map((line) => line.text).join('')).toContain('316 不锈钢');
    expect(lines.map((line) => line.text).join('')).not.toContain('全网最低价');
    expect(lines.every((line) => line.source === 'fallback')).toBe(true);
  });

  it('creates a usable speech timeline when silence detection returns nothing', () => {
    const lines = buildFallbackScript([], product, 12);

    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines[0]?.start).toBe(0);
    expect(lines.at(-1)?.end).toBe(12);
  });
});
