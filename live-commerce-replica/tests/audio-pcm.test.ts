import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { decodeAudioToFloat32 } from '../src/media/audio-pcm.js';

const execFileAsync = promisify(execFile);

describe('decodeAudioToFloat32', () => {
  it('decodes media to 16 kHz mono floating-point samples without an output audio file', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'jingke-pcm-'));
    const inputPath = path.join(directory, 'tone.wav');
    try {
      await execFileAsync('ffmpeg', [
        '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.25',
        '-ar', '16000', '-ac', '1', '-y', inputPath
      ]);

      const samples = await decodeAudioToFloat32(inputPath, 'ffmpeg');

      expect(samples).toBeInstanceOf(Float32Array);
      expect(samples.length).toBeGreaterThanOrEqual(3900);
      expect(samples.length).toBeLessThanOrEqual(4100);
      expect(Array.from(samples).some((sample) => Math.abs(sample) > 0.01)).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
