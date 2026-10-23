import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

import { inspectVideo, trimVideoToUpload } from './media';

const execFileAsync = promisify(execFile);

test('a reference trimmed to three seconds stays above the provider minimum', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-clone-trim-test-'));
  const sourcePath = path.join(tempDir, 'source.mp4');
  const resultPath = path.join(tempDir, 'result.mp4');
  const originalFetch = globalThis.fetch;
  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-f', 'lavfi', '-i', 'color=c=blue:s=720x720:r=25',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100',
      '-t', '3.5',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      sourcePath,
    ]);
    const sourceBytes = await fs.readFile(sourcePath);
    globalThis.fetch = async (input, init) => {
      if (String(input) === 'https://example.com/source.mp4') {
        return new Response(sourceBytes, { status: 200 });
      }
      assert.equal(String(input), 'https://example.com/upload');
      assert.equal(init?.method, 'PUT');
      await fs.writeFile(resultPath, Buffer.from(await new Response(init?.body).arrayBuffer()));
      return new Response(null, { status: 200 });
    };

    await trimVideoToUpload({
      sourceVideoUrl: 'https://example.com/source.mp4',
      targetDurationSeconds: 3,
      uploadUrl: 'https://example.com/upload',
    });
    const result = await inspectVideo(resultPath);
    assert.ok(result.durationSeconds !== null && result.durationSeconds >= 3.05);
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
