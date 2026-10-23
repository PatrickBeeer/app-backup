import { describe, expect, it } from 'vitest';
import { evaluateProbe } from '../src/media/quality.js';

describe('evaluateProbe', () => {
  it('requires review when generated duration is too short or audio is missing', () => {
    const report = evaluateProbe(
      { duration: 4.1, hasVideo: true, hasAudio: false, width: 720, height: 1280, fps: 30 },
      { duration: 5, ratio: '9:16' }
    );

    expect(report.passed).toBe(false);
    expect(report.issues).toEqual(['片段时长不足', '缺少原生音轨']);
  });

  it('passes a decodable 720p clip that covers the expected duration', () => {
    const report = evaluateProbe(
      { duration: 6.08, hasVideo: true, hasAudio: true, width: 1280, height: 720, fps: 30 },
      { duration: 6, ratio: '16:9' }
    );

    expect(report).toEqual(expect.objectContaining({ passed: true, score: 100, issues: [], semanticStatus: 'pending' }));
  });

  it('flags wrong orientation even when the dimensions are otherwise 720p', () => {
    const report = evaluateProbe(
      { duration: 6, hasVideo: true, hasAudio: true, width: 1280, height: 720, fps: 30 },
      { duration: 6, ratio: '9:16' }
    );

    expect(report.issues).toContain('画幅或分辨率不符合项目设置');
  });
});
