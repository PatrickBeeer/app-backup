import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { speechRefs, synthesize, videoStatus } from '../server/provider';
import { OMNIHUMAN_MODEL, omnihumanStatus, startOmnihuman } from '../server/omnihuman';
import { config } from '../server/config';
import { cropAudio, duration, muxVideo, narrationPolicy, validatePortrait } from '../server/media';
import { assetPath, providerUrl, saveAsset } from '../server/assets';
import { referenceAudioForVideo } from '../server/referenceAudio';
import { videoPointCost } from '../shared/omnihumanPricing';
import { VideoPreviewPlayer } from '../VideoPreviewPlayer';

const run = promisify(execFile);

test('finished video renders visible playback controls', () => {
  const markup = renderToStaticMarkup(createElement(VideoPreviewPlayer, { url: '/video.mp4' }));
  for (const label of ['播放视频', '视频播放进度', '静音', '全屏']) {
    assert.ok(markup.includes(label), `missing control: ${label}`);
  }
  assert.match(markup, /<video[^>]+src="\/video.mp4"/);
});

test('video charges require configured whole-number points per second', () => {
  assert.throws(() => videoPointCost(15, 0), /积分价格尚未配置/);
  assert.throws(() => videoPointCost(15, 1.5), /积分价格尚未配置/);
  assert.throws(() => videoPointCost(3, 40), /4至15秒/);
  assert.equal(videoPointCost(4, 40), 160);
  assert.equal(videoPointCost(15, 40), 600);
});

test('OmniHuman submits one portrait and exact audio with 1080p quality mode', async () => {
  const fetchBefore = globalThis.fetch;
  const keyBefore = config.volcengineApiKey;
  try {
    config.volcengineApiKey = 'mock-key';
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'https://openapi.cv.volces.com/api/common/v3/submit_task');
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer mock-key');
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.req_key, OMNIHUMAN_MODEL);
      assert.equal(payload.image_url, 'https://files.example.test/image.png');
      assert.equal(payload.audio_url, 'https://files.example.test/audio.wav');
      assert.equal(payload.output_resolution, 1080);
      assert.equal(payload.pe_fast_mode, false);
      assert.match(payload.prompt, /嘴唇随输入音频/);
      assert.match(payload.prompt, /镜头稳定/);
      return new Response(JSON.stringify({ code: 10000, data: { task_id: '1234567890123456789' } }), { status: 200 });
    };
    assert.equal(await startOmnihuman('https://files.example.test/image.png', 'https://files.example.test/audio.wav', '镜头稳定'), '1234567890123456789');
  } finally {
    globalThis.fetch = fetchBefore;
    config.volcengineApiKey = keyBefore;
  }
});

test('OmniHuman accepts opaque task IDs and reports ambiguous successful submissions', async () => {
  const fetchBefore = globalThis.fetch;
  const keyBefore = config.volcengineApiKey;
  const errorBefore = console.error;
  try {
    config.volcengineApiKey = 'mock-key';
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response(JSON.stringify({ code: 10000, data: { task_id: 'task_ab12-cd34' } }), { status: 200 });
    };
    assert.equal(await startOmnihuman('https://files.example.test/image.png', 'https://files.example.test/audio.wav', ''), 'task_ab12-cd34');
    globalThis.fetch = async () => {
      calls++;
      return new Response(JSON.stringify({ code: 10000, data: { taskId: 'task_alt123' } }), { status: 200 });
    };
    assert.equal(await startOmnihuman('https://files.example.test/image.png', 'https://files.example.test/audio.wav', ''), 'task_alt123');
    console.error = () => {};
    globalThis.fetch = async () => {
      calls++;
      return new Response(JSON.stringify({ code: 10000, data: {}, request_id: 'request-123' }), { status: 200 });
    };
    await assert.rejects(() => startOmnihuman('https://files.example.test/image.png', 'https://files.example.test/audio.wav', ''), /请勿立即重复提交.*request-123/);
    assert.equal(calls, 3, 'an ambiguous successful response must not be resubmitted');
  } finally {
    globalThis.fetch = fetchBefore;
    config.volcengineApiKey = keyBefore;
    console.error = errorBefore;
  }
});

test('OmniHuman polling maps success, queue, expiration and provider errors', async () => {
  const fetchBefore = globalThis.fetch;
  const keyBefore = config.volcengineApiKey;
  try {
    config.volcengineApiKey = 'mock-key';
    for (const [state, expected] of [['in_queue', 'queued'], ['processing', 'running'], ['generating', 'running'], ['expired', 'failed'], ['done', 'completed']]) {
      globalThis.fetch = async (input, init) => {
        assert.equal(String(input), 'https://openapi.cv.volces.com/api/common/v3/get_result');
        assert.equal(JSON.parse(String(init?.body)).task_id, '1234567890123456789');
        return new Response(JSON.stringify({ code: 10000, data: { status: state, video_url: 'https://files.example.test/video.mp4' } }), { status: 200 });
      };
      assert.equal((await omnihumanStatus('1234567890123456789')).status, expected);
    }
    globalThis.fetch = async () => new Response(JSON.stringify({ code: 50514, message: 'Pre Audio Risk Not Pass' }), { status: 400 });
    await assert.rejects(() => omnihumanStatus('1234567890123456789'), /50514.*Pre Audio/);
    await assert.rejects(() => omnihumanStatus('bad/id'), /无效的数字人任务编号/);
  } finally {
    globalThis.fetch = fetchBefore;
    config.volcengineApiKey = keyBefore;
  }
});

test('legacy CPRT job polling remains available', async () => {
  const fetchBefore = globalThis.fetch;
  const keyBefore = config.cprtKey;
  const baseBefore = config.cprtBaseUrl;
  try {
    config.cprtKey = 'mock-key';
    config.cprtBaseUrl = 'https://cprt.example.test';
    globalThis.fetch = async () => new Response(JSON.stringify({ status: 'SUCCESS', content: { video_url: 'https://files.example.test/legacy.mp4' } }), { status: 200 });
    assert.equal((await videoStatus('legacy_task_123')).status, 'completed');
  } finally {
    globalThis.fetch = fetchBefore;
    config.cprtKey = keyBefore;
    config.cprtBaseUrl = baseBefore;
  }
});

test('Bailian audio references include top-level URL and inline data', () => {
  assert.deepEqual(speechRefs({ url: 'https://example.test/audio.mp3' }), {
    audioUrl: 'https://example.test/audio.mp3', inlineBase64: '',
  });
  assert.deepEqual(speechRefs({ output: { audio: { data: 'data:audio/mpeg;base64,SUQz' } } }), {
    audioUrl: '', inlineBase64: 'data:audio/mpeg;base64,SUQz',
  });
  assert.equal(speechRefs({ output: { audio: { url: null } } }).audioUrl, '');
});

test('synthesis downloads a top-level Bailian URL', async () => {
  const fetchBefore = globalThis.fetch;
  const keyBefore = config.bailianKey;
  const baseBefore = config.bailianBaseUrl;
  try {
    config.bailianKey = 'mock-key';
    config.bailianBaseUrl = 'https://bailian.example.test';
    let calls = 0;
    globalThis.fetch = async (input, init) => {
      calls++;
      if (calls === 1) {
        assert.match(String(input), /SpeechSynthesizer$/);
        assert.equal(new Headers(init?.headers).get('Accept'), 'application/json');
        return new Response(JSON.stringify({ url: 'https://files.example.test/voice.mp3' }), { status: 200 });
      }
      assert.equal(String(input), 'https://files.example.test/voice.mp3');
      return new Response(new Uint8Array([73, 68, 51]), { status: 200 });
    };
    assert.deepEqual(await synthesize('测试台词', 'test-voice'), Buffer.from([73, 68, 51]));
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = fetchBefore;
    config.bailianKey = keyBefore;
    config.bailianBaseUrl = baseBefore;
  }
});

test('synthesis downloads a provider-issued HTTP audio URL', async () => {
  const fetchBefore = globalThis.fetch;
  const keyBefore = config.bailianKey;
  const baseBefore = config.bailianBaseUrl;
  try {
    config.bailianKey = 'mock-key';
    config.bailianBaseUrl = 'https://bailian.example.test';
    let calls = 0;
    globalThis.fetch = async (input) => {
      calls++;
      if (calls === 1) return new Response(JSON.stringify({ output: { audio: { url: 'http://files.example.test/voice.mp3?signature=redacted' } } }), { status: 200 });
      assert.equal(String(input), 'http://files.example.test/voice.mp3?signature=redacted');
      return new Response(new Uint8Array([73, 68, 51]), { status: 200 });
    };
    assert.deepEqual(await synthesize('测试台词', 'test-voice'), Buffer.from([73, 68, 51]));
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = fetchBefore;
    config.bailianKey = keyBefore;
    config.bailianBaseUrl = baseBefore;
  }
});

test('speech shorter than four seconds is rejected before video submission', () => {
  assert.throws(() => narrationPolicy(3.99), /音频不足4秒/);
  assert.deepEqual(narrationPolicy(4), { cropped: false, durationSeconds: 4 });
  assert.deepEqual(narrationPolicy(14.2), { cropped: false, durationSeconds: 15 });
  assert.deepEqual(narrationPolicy(16), { cropped: true, durationSeconds: 15 });
});

test('OmniHuman accepts a small portrait and rejects files over 5MB', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'speech-portrait-'));
  try {
    const portrait = path.join(directory, 'portrait.jpg');
    await run('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x64', '-frames:v', '1', portrait]);
    await validatePortrait(portrait);
    const tooLarge = path.join(directory, 'oversized.jpg');
    await fs.writeFile(tooLarge, Buffer.alloc(5 * 1024 * 1024));
    await assert.rejects(() => validatePortrait(tooLarge), /小于5MB/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('cropped narration ends at the requested video duration without MP3 padding', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'speech-video-test-'));
  const source = path.join(directory, 'source.mp3');
  const prepared = path.join(directory, 'prepared.wav');
  try {
    await run('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=700:duration=17', '-c:a', 'libmp3lame', source]);
    assert.ok((await duration(source)) > 15);
    await cropAudio(source, prepared, 15);
    const cropped = await duration(prepared);
    assert.ok(cropped >= 14.999 && cropped <= 15.001, `unexpected cropped length: ${cropped}`);
    assert.equal((await fs.readFile(prepared)).subarray(0, 4).toString(), 'RIFF');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('legacy padded MP3 is trimmed before OmniHuman submission and its reference is muxed', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'speech-video-legacy-'));
  const storageBefore = config.storageDir;
  const fetchBefore = globalThis.fetch;
  const keyBefore = config.volcengineApiKey;
  try {
    config.storageDir = directory;
    const source = path.join(directory, 'padded.mp3');
    const video = path.join(directory, 'video.mp4');
    const output = path.join(directory, 'final.mp4');
    await run('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=700:duration=17', '-t', '15', '-c:a', 'libmp3lame', source]);
    assert.ok((await duration(source)) > 15, 'fixture must reproduce MP3 encoder padding');
    const originalId = saveAsset('legacy.mp3', await fs.readFile(source));
    const referenceId = await referenceAudioForVideo(originalId, 15);
    assert.notEqual(referenceId, originalId);
    assert.match(referenceId, /\.wav$/);
    assert.ok((await duration(assetPath(referenceId))) <= 15.001);
    assert.equal(await referenceAudioForVideo(referenceId, 15), referenceId);

    await run('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:r=25:d=15', '-c:v', 'mpeg4', video]);
    const videoBytes = await fs.readFile(video);
    const referenceBytes = await fs.readFile(assetPath(referenceId));
    config.volcengineApiKey = 'mock-key';
    let uploaded = false;
    let submittedAudio = false;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/v1/execute/cos/presign-upload')) {
        const payload = JSON.parse(String(init?.body));
        assert.equal(payload.file_name, referenceId);
        assert.equal(payload.content_type, 'audio/wav');
        return new Response(JSON.stringify({ data: { upload_url: 'https://cos.example.test/upload', url: 'https://cos.example.test/reference.wav' } }), { status: 200 });
      }
      if (url === 'https://cos.example.test/upload') {
        assert.equal(new Headers(init?.headers).get('Content-Type'), 'audio/wav');
        assert.deepEqual(Buffer.from(init?.body as Uint8Array), referenceBytes);
        uploaded = true;
        return new Response(null, { status: 200 });
      }
      if (url.endsWith('/api/common/v3/submit_task')) {
        const payload = JSON.parse(String(init?.body));
        assert.equal(payload.audio_url, 'https://cos.example.test/reference.wav');
        submittedAudio = true;
        return new Response(JSON.stringify({ code: 10000, data: { task_id: '1234567890123456789' } }), { status: 200 });
      }
      if (url === 'https://video.example.test/result.mp4') return new Response(videoBytes, { status: 200 });
      throw new Error(`Unexpected request: ${url}`);
    };
    const audioUrl = await providerUrl(referenceId);
    assert.equal(await startOmnihuman('https://files.example.test/image.png', audioUrl, ''), '1234567890123456789');
    assert.ok(uploaded && submittedAudio);
    await muxVideo('https://video.example.test/result.mp4', assetPath(referenceId), output);
    assert.ok((await duration(output)) <= 15.1, 'final video must not retain padded audio');
    const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'default=noprint_wrappers=1:nokey=1', output]);
    assert.equal(stdout.trim(), 'aac');
  } finally {
    config.storageDir = storageBefore;
    config.volcengineApiKey = keyBefore;
    globalThis.fetch = fetchBefore;
    await fs.rm(directory, { recursive: true, force: true });
  }
});
