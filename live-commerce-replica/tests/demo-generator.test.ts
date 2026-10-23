import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { probeVideo } from '../src/media/ffmpeg.js';
import { DemoGenerator } from '../src/services/demo-generator.js';
import type { GenerationUnit, Project } from '../src/core/types.js';

describe('DemoGenerator', () => {
  it('creates a playable native-audio preview clip', async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'jingke-demo-'));
    const output = path.join(tempDir, 'demo.mp4');
    const project = {
      ratio: '9:16'
    } as Project;
    const unit = {
      id: 'unit-1', start: 0, end: 0.6, duration: 0.6, requestDuration: 4, shotIds: [], scriptLineIds: []
    } as GenerationUnit;

    await new DemoGenerator().generate(project, unit, output);
    const probe = await probeVideo(output);

    expect(probe.hasVideo).toBe(true);
    expect(probe.hasAudio).toBe(true);
    expect([probe.width, probe.height]).toEqual([720, 1280]);
  }, 20_000);
});
