import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_CPRT_MODEL,
  DEFAULT_CPRT_RESOLUTION,
  buildConversionSlots,
  isCprtResolution,
} from '../shared/cprtContract';
import { RequestValidationError, parseStartCloneInput } from '../server/validation';
import { getMultimodalVideoTask } from '../server/cprt';
import { config } from '../server/config';

const validInput = {
  prompt: '将参考视频中的人物替换成参考图片中的人物。',
  referenceVideoUrl: 'https://example.com/reference.mp4',
  imageUrls: ['https://example.com/reference.jpg'],
  model: DEFAULT_CPRT_MODEL,
  resolution: DEFAULT_CPRT_RESOLUTION,
  durationSeconds: 4,
  ratio: 'adaptive',
  realPersonMode: false,
};

test('defaults use the requested Mini 480p tier', () => {
  assert.equal(DEFAULT_CPRT_MODEL, 'free-video-2.0-mini-multimodal-video');
  assert.equal(DEFAULT_CPRT_RESOLUTION, '480p');
});

test('model-specific resolutions are enforced', () => {
  assert.equal(isCprtResolution('free-video-2.0-multimodal-video', '4k'), true);
  assert.equal(isCprtResolution('free-video-2.0-multimodal-video', '1080p'), true);
  assert.equal(isCprtResolution('free-video-2.5-multimodal-video', '4k'), false);
  assert.throws(
    () => parseStartCloneInput({ ...validInput, model: 'free-video-2.5-multimodal-video', resolution: '4k' }),
    RequestValidationError,
  );
});

test('legacy native resolution names normalize to UI labels and real-person mode defaults on', () => {
  const input = parseStartCloneInput({ ...validInput, model: 'free-video-2.0-multimodal-video', resolution: 'native1080p', realPersonMode: undefined });
  assert.equal(input.resolution, '1080p');
  assert.equal(input.realPersonMode, true);
});

test('duration accepts every whole second from 4 through 15', () => {
  for (let durationSeconds = 4; durationSeconds <= 15; durationSeconds += 1) {
    assert.equal(parseStartCloneInput({ ...validInput, durationSeconds }).durationSeconds, durationSeconds);
  }
  assert.throws(() => parseStartCloneInput({ ...validInput, durationSeconds: 16 }), /durationSeconds must be one of/);
});

test('the app requires one video and one to three reference images', () => {
  assert.throws(() => parseStartCloneInput({ ...validInput, imageUrls: [] }), RequestValidationError);
  assert.throws(
    () => parseStartCloneInput({
      ...validInput,
      imageUrls: [1, 2, 3, 4].map((index) => `https://example.com/${index}.jpg`),
    }),
    RequestValidationError,
  );
});

test('reference audios are optional, capped at three, and must be HTTPS URLs', () => {
  assert.deepEqual(parseStartCloneInput(validInput).audioUrls, []);
  assert.deepEqual(
    parseStartCloneInput({ ...validInput, audioUrls: ['https://example.com/voice.mp3'] }).audioUrls,
    ['https://example.com/voice.mp3'],
  );
  assert.throws(
    () => parseStartCloneInput({
      ...validInput,
      audioUrls: [1, 2, 3, 4].map((index) => `https://example.com/${index}.mp3`),
    }),
    RequestValidationError,
  );
  assert.throws(
    () => parseStartCloneInput({ ...validInput, audioUrls: ['http://example.com/voice.mp3'] }),
    RequestValidationError,
  );
});

test('prompt and URL validation are server-side', () => {
  assert.throws(() => parseStartCloneInput({ ...validInput, prompt: '' }), RequestValidationError);
  assert.throws(() => parseStartCloneInput({ ...validInput, prompt: 'x'.repeat(20_481) }), RequestValidationError);
  assert.throws(() => parseStartCloneInput({ ...validInput, referenceVideoUrl: 'http://example.com/reference.mp4' }), RequestValidationError);
});

test('real-person conversion slots target the reference video and every image', () => {
  assert.deepEqual(buildConversionSlots(1, 1), ['video1', 'image1']);
  assert.deepEqual(buildConversionSlots(3, 1), ['video1', 'image1', 'image2', 'image3']);
});

test('polling preserves the public CPRT task ID', async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = config.cprtApiKey;
  config.cprtApiKey = 'test-key';
  globalThis.fetch = async () => new Response(JSON.stringify({
    taskId: '2099395798147428353',
    status: 'RUNNING',
    results: null,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const publicTaskId = '20260914151212_2i5vvUoe8W3c09OLWgvW3';
    const task = await getMultimodalVideoTask(publicTaskId);
    assert.equal(task.taskId, publicTaskId);
    assert.equal(task.status, 'running');
  } finally {
    globalThis.fetch = originalFetch;
    config.cprtApiKey = originalApiKey;
  }
});

test('temporary CPRT polling failures remain non-terminal for public task IDs', async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = config.cprtApiKey;
  config.cprtApiKey = 'test-key';
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { code: '5005', message: '任务不存在', type: 'system_error' },
  }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  try {
    const task = await getMultimodalVideoTask('20260914151212_2i5vvUoe8W3c09OLWgvW3');
    assert.equal(task.status, 'running');
    assert.equal(task.errorMessage, null);
  } finally {
    globalThis.fetch = originalFetch;
    config.cprtApiKey = originalApiKey;
  }
});
