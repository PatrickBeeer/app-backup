import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { createCloneVideoTask, getCloneVideoTask } from './kling';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('clone motion control submits directly to TokenDance without creating an element', async () => {
  const requests: Array<{ url: string; body: Record<string, any> }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return Response.json({ code: 0, data: { id: 'motion-123', status: 'submitted' } });
  };

  const task = await createCloneVideoTask({
    imageUrl: 'https://example.com/character.png',
    subjectImageUrls: ['https://example.com/extra.png'],
    referenceVideoUrl: 'https://example.com/motion.mp4',
    aspectRatio: '9:16',
    durationSeconds: 5,
    resolution: '720p',
    prompt: 'Keep the subject identity',
    videoDeploymentKey: 'motion_control',
  });

  assert.equal(task.taskId, 'motion-123');
  assert.equal(task.providerKind, 'motion_control');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://tokendance.space/gateway/kling/v1/motion-control');
  assert.equal(requests[0].body.model_name, 'kling-3.0');
  assert.deepEqual(requests[0].body.contents.slice(1), [
    { type: 'image', url: 'https://example.com/character.png' },
    { type: 'video', url: 'https://example.com/motion.mp4' },
  ]);
  assert.equal(requests[0].body.settings.audio, 'off');
});

test('clone motion control polls TokenDance and reads the resulting video', async () => {
  globalThis.fetch = async (input) => {
    assert.equal(String(input), 'https://tokendance.space/gateway/kling/v1/motion-control/motion-123');
    return Response.json({
      code: 0,
      data: [{
        id: 'motion-123',
        status: 'succeeded',
        outputs: [{ type: 'video', url: 'https://example.com/result.mp4' }],
      }],
    });
  };

  const task = await getCloneVideoTask('motion-123', 'motion_control');
  assert.equal(task.status, 'succeeded');
  assert.equal(task.videoUrl, 'https://example.com/result.mp4');
});
