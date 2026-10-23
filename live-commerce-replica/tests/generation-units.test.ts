import { describe, expect, it } from 'vitest';
import { buildGenerationUnits } from '../src/core/generation-units.js';
import type { Shot } from '../src/core/types.js';

function shots(values: Array<[number, number]>): Shot[] {
  return values.map(([start, end], index) => ({ id: `shot-${index + 1}`, start, end }));
}

describe('buildGenerationUnits', () => {
  it('keeps a reference within the model limit in one generation unit', () => {
    const units = buildGenerationUnits(shots([[0, 1.8], [1.8, 4.2], [4.2, 7.5], [7.5, 10]]), 10);

    expect(units.map((unit) => [unit.start, unit.end, unit.requestDuration])).toEqual([
      [0, 10, 10]
    ]);
  });

  it('splits a long uncut shot while leaving a legal tail', () => {
    const units = buildGenerationUnits(shots([[0, 34]]), 34);

    expect(units.map((unit) => [unit.start, unit.end, unit.requestDuration])).toEqual([
      [0, 15, 15],
      [15, 30, 15],
      [30, 34, 4]
    ]);
  });

  it('covers every instant exactly once and associates intersecting source shots', () => {
    const units = buildGenerationUnits(shots([[0, 3], [3, 17], [17, 22]]), 22);

    expect(units[0]?.start).toBe(0);
    expect(units.at(-1)?.end).toBe(22);
    for (let index = 1; index < units.length; index += 1) {
      expect(units[index]?.start).toBe(units[index - 1]?.end);
    }
    expect(units.every((unit) => unit.duration >= 4 && unit.duration <= 15)).toBe(true);
    expect(units.flatMap((unit) => unit.shotIds)).toContain('shot-2');
  });

  it('pads a reference shorter than the model request minimum without changing its source timeline', () => {
    const units = buildGenerationUnits(shots([[0, 3.9]]), 3.9);

    expect(units.map((unit) => [unit.start, unit.end, unit.duration, unit.requestDuration])).toEqual([
      [0, 3.9, 3.9, 4]
    ]);
  });
});
