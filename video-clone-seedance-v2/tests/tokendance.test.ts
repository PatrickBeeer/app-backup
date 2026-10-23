import assert from 'node:assert/strict';
import test from 'node:test';

import { config } from '../server/config';
import { createMultimodalVideoTask, getMultimodalVideoTask } from '../server/cprt';
import { parseStartCloneInput } from '../server/validation';
import { calculateVideoPointCost } from '../shared/pricing';

test('Tokendance Mini is selectable and priced like CPRT Mini', () => {
  const input = parseStartCloneInput({
    model: 'tokendance-seedance-2.0-mini',
    resolution: '720p',
    durationSeconds: 5,
    ratio: '9:16',
    prompt: '将参考视频中的人物替换成参考图片中的人物。',
    referenceVideoUrl: 'https://example.com/reference.mp4',
    imageUrls: ['https://example.com/portrait.png'],
  });
  assert.equal(input.model, 'tokendance-seedance-2.0-mini');
  assert.equal(
    calculateVideoPointCost(input.model, input.resolution, input.durationSeconds),
    calculateVideoPointCost('master-video-s2-0-mini', input.resolution, input.durationSeconds),
  );
});

test('Tokendance submits direct references without asset review and polls its own endpoint', async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = config.tokendanceApiKey;
  const oldUrl = config.tokendanceBaseUrl;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  config.tokendanceApiKey = 'mock-token';
  config.tokendanceBaseUrl = 'https://tokendance.example/gateway/ark/v3';
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('http://127.0.0.1:7777/event')) return new Response('', { status: 200 });
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify(init?.method === 'POST'
      ? { id: 'provider-task-1', status: 'queued' }
      : { status: 'succeeded', content: { video_url: 'https://example.com/generated.mp4' } }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const created = await createMultimodalVideoTask({
      model: 'tokendance-seedance-2.0-mini',
      resolution: '720p',
      durationSeconds: 5,
      ratio: '9:16',
      prompt: '替换人物身份',
      imageUrls: ['https://example.com/portrait.png'],
      videoUrls: ['https://example.com/silent.mp4'],
      realPersonMode: true,
      voiceReplacement: {
        enabled: true,
        language: 'en-US',
        audioUrl: 'https://example.com/speech.mp3',
      },
    });
    assert.equal(created.taskId, 'tokendance:provider-task-1');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://tokendance.example/gateway/ark/v3/generations/tasks');
    assert.equal(new Headers(requests[0].init?.headers).get('Authorization'), 'Bearer mock-token');
    const body = JSON.parse(String(requests[0].init?.body));
    assert.equal(body.model, 'seedance-2.0-mini');
    assert.equal(body.resolution, '720p');
    assert.equal(body.generate_audio, true);
    assert.deepEqual(body.content.filter((part: any) => part.type !== 'text').map((part: any) => [part.role, part[part.type].url]), [
      ['reference_image', 'https://example.com/portrait.png'],
      ['reference_video', 'https://example.com/silent.mp4'],
      ['reference_audio', 'https://example.com/speech.mp3'],
    ]);
    const result = await getMultimodalVideoTask(created.taskId);
    assert.equal(result.videoUrl, 'https://example.com/generated.mp4');
    assert.equal(result.status, 'completed');
    assert.equal(requests[1].url, 'https://tokendance.example/gateway/ark/v3/generations/tasks/provider-task-1');
  } finally {
    globalThis.fetch = oldFetch;
    config.tokendanceApiKey = oldKey;
    config.tokendanceBaseUrl = oldUrl;
  }
});

test('Tokendance provider failures preserve their error message', async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = config.tokendanceApiKey;
  config.tokendanceApiKey = 'mock-token';
  globalThis.fetch = async () => new Response(JSON.stringify({
    status: 'failed', error: { code: 'TaskSubmitFailed', message: 'provider rejected the media' },
  }), { status: 200 });
  try {
    const result = await getMultimodalVideoTask('tokendance:failed-task');
    assert.equal(result.status, 'failed');
    assert.equal(result.errorMessage, 'TokenDance [TaskSubmitFailed] provider rejected the media (task ID: tokendance:failed-task)');
  } finally {
    globalThis.fetch = oldFetch;
    config.tokendanceApiKey = oldKey;
  }
});
