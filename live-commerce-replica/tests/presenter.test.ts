import { describe, expect, it } from 'vitest';
import { resolvePresenterMode } from '../src/core/presenter.js';

describe('resolvePresenterMode', () => {
  it('keeps an explicit generated presenter mode', () => {
    expect(resolvePresenterMode({ presenterMode: 'generated', personPhotos: ['ignored.jpg'] })).toBe('generated');
  });

  it('treats a legacy project with person photos as reference mode', () => {
    expect(resolvePresenterMode({ personPhotos: ['person.jpg'] })).toBe('reference');
  });

  it('treats a legacy project without person photos as generated mode', () => {
    expect(resolvePresenterMode({ personPhotos: [] })).toBe('generated');
  });
});
