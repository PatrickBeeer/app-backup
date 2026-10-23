import { describe, expect, it } from 'vitest';
import { buildAss } from '../src/core/ass.js';
import type { Project } from '../src/core/types.js';

const project: Project = {
  id: 'p1', name: '字幕测试', ratio: '9:16', referenceVideo: 'reference.mp4',
  personPhotos: [], productImages: [],
  product: { name: '水杯', price: '', sellingPoints: [], specifications: [], requiredClaims: [], forbiddenClaims: [] },
  status: 'READY_TO_RENDER', createdAt: '', updatedAt: '',
  analysis: {
    probe: { duration: 8, width: 1080, height: 1920, fps: 30, hasVideo: true, hasAudio: true },
    shots: [], speechSegments: [], generationUnits: [], summary: '', degraded: false, warnings: [],
    script: [{ id: 'line-1', start: 1.25, end: 3.5, text: '一杯{刚好}\n随手带走', source: 'llm' }],
    overlays: [{
      id: 'overlay-1', start: 0, end: 2, text: '新品 99 元', xPercent: 50, yPercent: 18,
      fontSize: 48, color: '#FFE45C', outlineColor: '#111111'
    }]
  }
};

describe('buildAss', () => {
  it('renders timed dialogue and positioned overlays while escaping ASS control text', () => {
    const ass = buildAss(project);

    expect(ass).toContain('[Script Info]');
    expect(ass).toContain('Dialogue: 0,0:00:01.25,0:00:03.50,Subtitle');
    expect(ass).toContain('一杯\\{刚好\\}\\N随手带走');
    expect(ass).toContain('\\pos(360,230)');
    expect(ass).toContain('新品 99 元');
  });
});
