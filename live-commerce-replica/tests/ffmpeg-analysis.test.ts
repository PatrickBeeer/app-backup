import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildSingleFrameArgs,
  detectShots,
  detectSpeechSegments,
  extractRepresentativeFrames,
  probeVideo,
  sliceGenerationUnit
} from '../src/media/ffmpeg.js';

function makeReferenceVideo(outputPath: string): void {
  execFileSync('ffmpeg', [
    '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=0x26374a:s=360x640:r=15:d=8',
    '-f', 'lavfi', '-i', 'color=c=0x543148:s=360x640:r=15:d=8',
    '-f', 'lavfi', '-i', 'color=c=0x274c3e:s=360x640:r=15:d=8',
    '-f', 'lavfi', '-i', 'color=c=0x574b2d:s=360x640:r=15:d=8',
    '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000:duration=32',
    '-filter_complex', '[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0[v]',
    '-map', '[v]', '-map', '4:a', '-t', '32', '-c:v', 'libx264', '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-shortest', outputPath
  ]);
}

describe('FFmpeg analysis pipeline', () => {
  it('uses a single full-range JPEG encoder thread for FFmpeg 8 compatibility', () => {
    const args = buildSingleFrameArgs('input.mp4', 2, 'output.jpg', 3);

    expect(args).toContain('yuvj420p');
    expect(args.slice(args.indexOf('-threads'), args.indexOf('-threads') + 2)).toEqual(['-threads', '1']);
  });

  it('extracts JPEG frames while shot and speech analysis run concurrently', async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'jingke-analysis-'));
    const reference = path.join(tempDir, 'reference.mp4');
    makeReferenceVideo(reference);
    const probe = await probeVideo(reference);

    const [shots, speech, frames] = await Promise.all([
      detectShots(reference, probe.duration),
      detectSpeechSegments(reference, probe.duration),
      extractRepresentativeFrames(reference, path.join(tempDir, 'frames'), probe.duration, 8)
    ]);

    expect(shots.length).toBeGreaterThanOrEqual(1);
    expect(speech.length).toBeGreaterThan(0);
    expect(frames).toHaveLength(8);
  }, 30_000);

  it('preserves the original audio when creating a reference unit', async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'jingke-reference-unit-'));
    const reference = path.join(tempDir, 'reference.mp4');
    const unitPath = path.join(tempDir, 'unit.mp4');
    makeReferenceVideo(reference);

    await sliceGenerationUnit(reference, {
      id: 'unit-1', start: 0, end: 6, duration: 6, requestDuration: 6,
      shotIds: [], scriptLineIds: []
    }, unitPath);

    const unitProbe = await probeVideo(unitPath);
    expect(unitProbe.hasVideo).toBe(true);
    expect(unitProbe.hasAudio).toBe(true);
  }, 30_000);

  it('upscales sub-threshold reference clips to satisfy XG-MASTER r2v min pixel count', async () => {
    // XG-MASTER-VIDEO-2.5 (doubao-seedance-2-5 r2v) rejects reference videos whose
    // total pixel count < 407696. A 360×640 source (230400px) must be upscaled.
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'jingke-upscale-'));
    const reference = path.join(tempDir, 'reference.mp4');
    const unitPath = path.join(tempDir, 'unit.mp4');
    makeReferenceVideo(reference); // 360×640 = 230400px

    await sliceGenerationUnit(reference, {
      id: 'unit-1', start: 0, end: 6, duration: 6, requestDuration: 6,
      shotIds: [], scriptLineIds: []
    }, unitPath);

    const unitProbe = await probeVideo(unitPath);
    const pixels = unitProbe.width * unitProbe.height;
    expect(pixels).toBeGreaterThanOrEqual(407696);
    expect(unitProbe.width % 2).toBe(0);
    expect(unitProbe.height % 2).toBe(0);
  }, 30_000);
});
