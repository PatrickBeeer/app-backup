import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { probeVideo } from '../src/media/ffmpeg.js';
import { renderFinal } from '../src/media/render.js';
import type { GenerationJob, Project } from '../src/core/types.js';

function makeClip(outputPath: string, color: string): void {
  execFileSync('ffmpeg', [
    '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=360x640:r=30:d=0.6`,
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=0.6',
    '-t', '0.6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', outputPath
  ]);
}

describe('renderFinal', () => {
  it('normalizes accepted clips, concatenates them and burns an ASS track', async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'jingke-render-'));
    const first = path.join(tempDir, 'first.mp4');
    const second = path.join(tempDir, 'second.mp4');
    makeClip(first, '0x223344');
    makeClip(second, '0x442233');
    const project: Project = {
      id: 'p1', name: 'render', ratio: '9:16', referenceVideo: '', personPhotos: [], productImages: [],
      product: { name: '', price: '', sellingPoints: [], specifications: [], requiredClaims: [], forbiddenClaims: [] },
      status: 'READY_TO_RENDER', createdAt: '', updatedAt: '',
      analysis: {
        probe: { duration: 1.2, width: 360, height: 640, fps: 30, hasVideo: true, hasAudio: true },
        shots: [], speechSegments: [], overlays: [], summary: '', degraded: false, warnings: [],
        script: [{ id: 'line-1', start: 0, end: 1.1, text: '演示字幕', source: 'fallback' }],
        generationUnits: [
          { id: 'unit-1', start: 0, end: 0.6, duration: 0.6, requestDuration: 4, shotIds: [], scriptLineIds: [] },
          { id: 'unit-2', start: 0.6, end: 1.2, duration: 0.6, requestDuration: 4, shotIds: [], scriptLineIds: [] }
        ]
      }
    };
    const jobs: GenerationJob[] = [first, second].map((outputPath, index) => ({
      id: `job-${index + 1}`, projectId: 'p1', unitId: `unit-${index + 1}`, provider: 'demo',
      status: 'ACCEPTED', attempt: 1, maxAttempts: 2, accepted: true, issues: [], outputPath,
      createdAt: '', updatedAt: ''
    }));
    const output = path.join(tempDir, 'final.mp4');

    await renderFinal({ project, jobs, outputPath: output, workDir: path.join(tempDir, 'work') });
    const probe = await probeVideo(output);

    expect(probe.hasVideo).toBe(true);
    expect(probe.hasAudio).toBe(true);
    expect([probe.width, probe.height]).toEqual([720, 1280]);
    expect(probe.duration).toBeGreaterThanOrEqual(1.1);
  }, 30_000);
});
