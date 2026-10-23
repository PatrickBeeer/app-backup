import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { extractOriginalAudio, restoreOriginalAudio, stripVideoAudio } from '../server/media';

function streams(file: string): Array<{ codec_type: string; codec_name: string }> {
  return JSON.parse(execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'stream=codec_type,codec_name', '-of', 'json', file,
  ], { encoding: 'utf8' })).streams;
}

test('reference video is silent for submission and original audio is restored without re-encoding video', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'clone-reference-audio-'));
  const source = path.join(dir, 'source.mp4');
  const silent = path.join(dir, 'silent.mp4');
  const audio = path.join(dir, 'original.m4a');
  const restored = path.join(dir, 'restored.mp4');
  try {
    execFileSync('ffmpeg', [
      '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=128x128:rate=24',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100',
      '-t', '2', '-c:v', 'libx264', '-c:a', 'aac', source,
    ]);
    await stripVideoAudio(source, silent);
    assert.deepEqual(streams(silent).map((stream) => stream.codec_type), ['video']);
    assert.equal(await extractOriginalAudio(source, audio), true);
    await restoreOriginalAudio(silent, audio, restored);
    const result = streams(restored);
    assert.deepEqual(result.map((stream) => stream.codec_type), ['video', 'audio']);
    assert.equal(result[0].codec_name, streams(source)[0].codec_name);
    assert.equal(execFileSync('ffmpeg', [
      '-v', 'error', '-i', silent, '-map', '0:v:0', '-f', 'md5', '-',
    ], { encoding: 'utf8' }), execFileSync('ffmpeg', [
      '-v', 'error', '-i', restored, '-map', '0:v:0', '-f', 'md5', '-',
    ], { encoding: 'utf8' }));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
