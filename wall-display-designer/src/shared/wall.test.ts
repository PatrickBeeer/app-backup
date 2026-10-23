import { describe, expect, it } from 'vitest';
import {
  buildRenderPrompt,
  buildDesignPrompt,
  createDefaultProject,
  findTextOpeningConflicts,
  fitRect,
  getLockedOpenings
} from './wall';

describe('wall geometry', () => {
  it('fits a millimeter wall into a stable preview rectangle', () => {
    const result = fitRect({ widthMm: 11400, heightMm: 5000 }, 900, 420);
    expect(result.width).toBeCloseTo(900);
    expect(result.height).toBeCloseTo(394.7368421052632);
    expect(result.scale).toBeCloseTo(0.07894736842105263);
  });

  it('marks doors and service boxes as locked openings', () => {
    const project = createDefaultProject();
    expect(getLockedOpenings(project).map((opening) => opening.label)).toEqual([
      '中央双开门',
      '左侧检修口',
      '右侧电箱'
    ]);
  });

  it('keeps default text zones away from locked openings', () => {
    expect(findTextOpeningConflicts(createDefaultProject())).toEqual([]);
  });
});

describe('render prompt generation', () => {
  it('creates a flat design prompt before the render prompt', () => {
    const project = createDefaultProject();
    const prompt = buildDesignPrompt(project);

    expect(prompt).toContain('flat elevation design drawing');
    expect(prompt).toContain('伊金霍洛旗全域视联态势感知项目');
    expect(prompt).toContain('do not cover');
    expect(prompt).toContain('design approval');
    expect(prompt).toContain('Design style reference');
    expect(prompt).toContain(project.designReference);
  });

  it('describes exact mask constraints and user copy', () => {
    const project = createDefaultProject();
    const prompt = buildRenderPrompt(project);

    expect(prompt).toContain('伊金霍洛旗全域视联态势感知项目');
    expect(prompt).toContain('do not cover');
    expect(prompt).toContain('after the approved flat design');
    expect(prompt).toContain('中央双开门');
    expect(prompt).toContain('11400mm wide and 5000mm high');
    expect(prompt).toContain('Programmatically typeset Chinese text zones');
  });
});
