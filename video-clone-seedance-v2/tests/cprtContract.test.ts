import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_CPRT_MODEL,
  DEFAULT_CPRT_RESOLUTION,
  buildConversionSlots,
  isCprtResolution,
} from '../shared/cprtContract';
import { RequestValidationError, parseStartCloneInput } from '../server/validation';
import { createMultimodalVideoTask, getMultimodalVideoTask, clearMasterAssetCacheForTests } from '../server/cprt';
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
  assert.equal(DEFAULT_CPRT_MODEL, 'master-video-s2-0-mini');
  assert.equal(DEFAULT_CPRT_RESOLUTION, '480p');
});

test('model-specific resolutions are enforced', () => {
  assert.equal(isCprtResolution('master-video-s2-0', '1080p'), true);
  assert.equal(isCprtResolution('master-video-s2-0', '4k'), false);
  assert.equal(isCprtResolution('master-video-s2-5', '1080p'), false);
  assert.throws(
    () => parseStartCloneInput({ ...validInput, model: 'master-video-s2-5', resolution: '1080p' }),
    RequestValidationError,
  );
});

test('legacy native resolution names normalize to UI labels and real-person mode defaults on', () => {
  const input = parseStartCloneInput({ ...validInput, model: 'master-video-s2-0', resolution: 'native1080p', realPersonMode: undefined });
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

test('prompt and URL validation are server-side', () => {
  assert.throws(() => parseStartCloneInput({ ...validInput, prompt: '' }), RequestValidationError);
  assert.throws(() => parseStartCloneInput({ ...validInput, prompt: 'x'.repeat(20_481) }), RequestValidationError);
  assert.throws(() => parseStartCloneInput({ ...validInput, referenceVideoUrl: 'http://example.com/reference.mp4' }), RequestValidationError);
});

test('real-person conversion slots target the reference video and every image', () => {
  assert.deepEqual(buildConversionSlots(1, 1), ['video1', 'image1']);
  assert.deepEqual(buildConversionSlots(3, 1), ['video1', 'image1', 'image2', 'image3']);
});

// Ark 网关协议：prompt 在 content 的 text 分片里，媒体在带 role 的 image_url/video_url 分片里。
function contentText(body: any): string {
  return String((Array.isArray(body?.content) ? body.content.find((part: any) => part?.type === 'text') : null)?.text || '');
}

function contentMediaUrls(body: any, type: string): string[] {
  const urlKey = type === 'video_url' ? 'video_url' : type === 'audio_url' ? 'audio_url' : 'image_url';
  return (Array.isArray(body?.content) ? body.content : [])
    .filter((part: any) => part?.type === type)
    .map((part: any) => String(part?.[urlKey]?.url || ''));
}

// 两种协议的 prompt 提取：master-video 在 content text 分片，free-video wrapper 在平铺 prompt 字段。
function requestPrompt(body: any): string {
  return contentText(body) || String(body?.prompt || '');
}

// master-video 流程的统一 mock：送审(/master/asset/submit)、审核结果(/master/asset/status)、
// 任务创建(/v1/chat/asyncTask)。送审按 URL 记录 asset_id，供断言 asset:// 引用。
type MockCprtCapture = { requestBody: any; assetIds: Record<string, string> };

function mockCprtEndpoints(capture: MockCprtCapture): () => void {
  clearMasterAssetCacheForTests();
  const originalFetch = globalThis.fetch;
  const originalApiKey = config.cprtApiKey;
  config.cprtApiKey = 'test-key';
  globalThis.fetch = async (input: any, init?: any) => {
    const url = String(typeof input === 'string' ? input : input?.url || '');
    if (url.includes('/master/asset/submit')) {
      const body = JSON.parse(String(init?.body || '{}'));
      if (!capture.assetIds[body.url]) {
        capture.assetIds[body.url] = `asset-test-${Object.keys(capture.assetIds).length + 1}`;
      }
      return new Response(JSON.stringify({ asset_id: capture.assetIds[body.url] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/master/asset/status')) {
      return new Response(JSON.stringify({ status: 'Active' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    capture.requestBody = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({ id: '20260915120000_mockTask', status: 'queued' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return () => {
    globalThis.fetch = originalFetch;
    config.cprtApiKey = originalApiKey;
  };
}

test('CPRT prompt protects lipstick demos from visible tongue artifacts', async () => {
  const capture: MockCprtCapture = { requestBody: null, assetIds: {} };
  const restore = mockCprtEndpoints(capture);
  try {
    await createMultimodalVideoTask({
      model: DEFAULT_CPRT_MODEL,
      // 只有真的提到唇部产品时，才会下发「口红试色场景」约束。
      prompt: '涂口红试色，把唇膏沿唇线涂抹均匀。',
      resolution: DEFAULT_CPRT_RESOLUTION,
      durationSeconds: 4,
      ratio: 'adaptive',
      imageUrls: validInput.imageUrls,
      videoUrls: [validInput.referenceVideoUrl],
      realPersonMode: true,
    });
    const prompt = requestPrompt(capture.requestBody);
    assert.match(prompt, /口红试色\/涂抹测评场景/);
    assert.match(prompt, /舌头必须始终收在口腔内不可见/);
    assert.match(prompt, /不要吐舌、舔唇/);
  } finally {
    restore();
  }
});

test('master-video flow submits every asset for review and references asset:// ids in content parts', async () => {
  const capture: MockCprtCapture = { requestBody: null, assetIds: {} };
  const restore = mockCprtEndpoints(capture);
  try {
    await createMultimodalVideoTask({
      // 显式走 master-video 分支（当前模型列表是 free-video，但该方法需保留验证）。
      model: 'master-video-s2-0-mini',
      prompt: validInput.prompt,
      resolution: DEFAULT_CPRT_RESOLUTION,
      durationSeconds: 4,
      ratio: 'adaptive',
      imageUrls: validInput.imageUrls,
      videoUrls: [validInput.referenceVideoUrl],
      realPersonMode: true,
      conversionSlots: buildConversionSlots(validInput.imageUrls.length, 1),
      voiceReplacement: {
        enabled: true,
        language: 'en-US',
        voiceId: 'qwen-audio-3.0-tts-plus_vc-demo1234-ab12cd',
        voiceAudioUrl: 'https://example.com/voice-sample.mp3',
        audioUrl: 'https://example.com/voice.mp3',
      },
      backgroundReplacement: {
        mode: 'replace',
        prompt: 'bright studio with soft daylight',
        imageUrl: 'https://example.com/background.jpg',
      },
    });
    const requestBody = capture.requestBody;
    const prompt = contentText(requestBody);
    // 送审覆盖：人物参考图、背景图、参考视频、配音音频，全部拿到 asset_id。
    assert.deepEqual(Object.keys(capture.assetIds).sort(), [
      'https://example.com/background.jpg',
      'https://example.com/reference.jpg',
      'https://example.com/reference.mp4',
      'https://example.com/voice.mp3',
    ]);
    // content 分片里只允许 asset:// 引用；音频走 audio_url 分片（role=reference_audio）。
    assert.deepEqual(contentMediaUrls(requestBody, 'image_url'), [
      `asset://${capture.assetIds['https://example.com/reference.jpg']}`,
      `asset://${capture.assetIds['https://example.com/background.jpg']}`,
    ]);
    assert.deepEqual(
      requestBody.content.filter((part: any) => part.type === 'image_url').map((part: any) => part.role),
      ['reference_image', 'reference_image'],
    );
    assert.equal(requestBody.content.some((part: any) => part.role === 'first_frame'), false);
    assert.deepEqual(contentMediaUrls(requestBody, 'video_url'), [
      `asset://${capture.assetIds['https://example.com/reference.mp4']}`,
    ]);
    assert.deepEqual(contentMediaUrls(requestBody, 'audio_url'), [
      `asset://${capture.assetIds['https://example.com/voice.mp3']}`,
    ]);
    // 平铺字段按 Ark 文档：generate_audio 布尔 + watermark；不再有 audioUrls/conversionSlots。
    assert.equal(requestBody.generate_audio, true);
    assert.equal(requestBody.watermark, false);
    assert.equal(requestBody.audioUrls, undefined);
    assert.equal(requestBody.conversionSlots, undefined);
    assert.match(prompt, /目标语音语言\/国家：美国英语/);
    assert.match(prompt, /配音音色已由用户上传的人声样本通过声音复刻生成/);
    assert.match(prompt, /必须用这位复刻音色说美国英语/);
    assert.match(prompt, /bright studio with soft daylight/);
  } finally {
    restore();
  }
});

test('master-video without real-person mode keeps the reference image without a first frame', async () => {
  const capture: MockCprtCapture = { requestBody: null, assetIds: {} };
  const restore = mockCprtEndpoints(capture);
  try {
    await createMultimodalVideoTask({
      model: 'master-video-s2-0-mini',
      prompt: validInput.prompt,
      resolution: DEFAULT_CPRT_RESOLUTION,
      durationSeconds: 4,
      imageUrls: validInput.imageUrls,
      videoUrls: [validInput.referenceVideoUrl],
      realPersonMode: false,
    });
    assert.deepEqual(
      capture.requestBody.content.filter((part: any) => part.type === 'image_url').map((part: any) => part.role),
      ['reference_image'],
    );
  } finally {
    restore();
  }
});

test('master-video submit retries transient TOS download timeouts before giving up', async () => {
  const capture: MockCprtCapture = { requestBody: null, assetIds: {} };
  const restore = mockCprtEndpoints(capture);
  let submitCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: any, init?: any) => {
    const url = String(typeof input === 'string' ? input : input?.url || '');
    if (url.includes('/master/asset/submit')) {
      submitCalls += 1;
      if (submitCalls === 1) {
        // 首次让 TOS 下载超时（Ark 返回 InvalidParameter.DownloadFailed）。
        return new Response(JSON.stringify({
          ResponseMetadata: { Action: 'CreateAsset', Service: 'ark', Region: 'cn-beijing' },
          Error: { Code: 'InvalidParameter.DownloadFailed', Message: 'tos: read body err:context deadline exceeded' },
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
    }
    return originalFetch(input, init);
  };
  try {
    const result = await createMultimodalVideoTask({
      model: 'master-video-s2-0-mini',
      prompt: validInput.prompt,
      resolution: DEFAULT_CPRT_RESOLUTION,
      durationSeconds: 4,
      ratio: 'adaptive',
      imageUrls: validInput.imageUrls,
      videoUrls: [validInput.referenceVideoUrl],
      realPersonMode: true,
    });
    // 图片送审重试了一次（失败+成功=2 次），参考视频送审 1 次。
    assert.equal(submitCalls, 3);
    assert.equal(result.taskId, '20260915120000_mockTask');
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }
});

test('the free-video wrapper method is preserved for non-master models', async () => {
  const capture: MockCprtCapture = { requestBody: null, assetIds: {} };
  const restore = mockCprtEndpoints(capture);
  try {
    await createMultimodalVideoTask({
      // 旧 free-video wrapper 模型名：保留的备用方法，平铺字段 + conversionSlots + native 分辨率。
      model: 'free-video-2.0-multimodal-video',
      prompt: validInput.prompt,
      resolution: '1080p',
      durationSeconds: 4,
      ratio: 'adaptive',
      imageUrls: validInput.imageUrls,
      videoUrls: [validInput.referenceVideoUrl],
      realPersonMode: true,
      conversionSlots: buildConversionSlots(validInput.imageUrls.length, 1),
      voiceReplacement: {
        enabled: true,
        language: 'en-US',
        voiceId: 'qwen-audio-3.0-tts-plus_vc-demo1234-ab12cd',
        voiceAudioUrl: 'https://example.com/voice-sample.mp3',
        audioUrl: 'https://example.com/voice.mp3',
      },
      backgroundReplacement: {
        mode: 'replace',
        prompt: 'bright studio with soft daylight',
        imageUrl: 'https://example.com/background.jpg',
      },
    });
    const requestBody = capture.requestBody;
    // 平铺 wrapper 协议：prompt/imageUrls/videoUrls/audioUrls 全部原样下发，不经送审。
    assert.deepEqual(Object.keys(capture.assetIds), []);
    assert.deepEqual(requestBody.imageUrls, ['https://example.com/reference.jpg', 'https://example.com/background.jpg']);
    assert.deepEqual(requestBody.videoUrls, ['https://example.com/reference.mp4']);
    assert.deepEqual(requestBody.audioUrls, ['https://example.com/voice.mp3']);
    assert.equal(requestBody.generateAudio, true);
    assert.equal(requestBody.realPersonMode, true);
    assert.deepEqual(requestBody.conversionSlots, ['video1', 'image1']);
    assert.equal(requestBody.resolution, 'native1080p');
    assert.equal(requestBody.content, undefined);
    assert.match(String(requestBody.prompt), /bright studio with soft daylight/);
  } finally {
    restore();
  }
});

// 捕获真正下发给 CPRT 的 prompt，用于断言各类硬约束是否被注入。
async function capturePrompt(
  options: Parameters<typeof createMultimodalVideoTask>[0],
): Promise<string> {
  const capture: MockCprtCapture = { requestBody: null, assetIds: {} };
  const restore = mockCprtEndpoints(capture);
  try {
    await createMultimodalVideoTask(options);
    return requestPrompt(capture.requestBody);
  } finally {
    restore();
  }
}

const baseTaskOptions = {
  model: DEFAULT_CPRT_MODEL,
  resolution: DEFAULT_CPRT_RESOLUTION,
  durationSeconds: 4,
  ratio: 'adaptive',
  imageUrls: validInput.imageUrls,
  videoUrls: [validInput.referenceVideoUrl],
  realPersonMode: true,
};

test('product state evolution is progressive: effects accumulate along the contact path instead of snapping on', async () => {
  const lipstickPrompt = await capturePrompt({
    ...baseTaskOptions,
    prompt: '涂口红试色，把唇膏沿唇线涂抹，唇色从浅色逐渐变成红色。',
  });
  // 通用规则：效果只能出现在接触过的位置，且必须逐帧累积。
  assert.match(lipstickPrompt, /产品状态演化规则/);
  assert.match(lipstickPrompt, /由浅到深、由少到多逐帧累积/);
  assert.match(lipstickPrompt, /未接触区域提前变色/);
  // 唇部品类规则：禁止一涂就满嘴红。
  assert.match(lipstickPrompt, /【唇部产品】/);
  assert.match(lipstickPrompt, /严禁一开始就满嘴红色/);
  assert.match(lipstickPrompt, /严禁一接触整片嘴唇瞬间变红/);

  const foundationPrompt = await capturePrompt({
    ...baseTaskOptions,
    prompt: '涂抹粉底液，用美妆蛋均匀推开。',
  });
  assert.match(foundationPrompt, /【底妆产品】/);
  assert.match(foundationPrompt, /严禁全脸瞬间变白/);
  // 不同品类互不串台：底妆场景不应带上唇部规则。
  assert.doesNotMatch(foundationPrompt, /【唇部产品】/);
});

test('cleaning actions evolve in the opposite direction', async () => {
  const prompt = await capturePrompt({
    ...baseTaskOptions,
    prompt: '用卸妆水擦拭脸部，把妆擦干净。',
  });
  assert.match(prompt, /【卸除\/清洁类/);
  assert.match(prompt, /逐帧由带妆\/带污变干净/);
  assert.match(prompt, /严禁妆容瞬间全部消失/);
});

test('skincare texture is absorbed gradually instead of piling up', async () => {
  const prompt = await capturePrompt({
    ...baseTaskOptions,
    prompt: '把面霜涂在手上推开按摩。',
  });
  assert.match(prompt, /【护肤品质地】/);
  assert.match(prompt, /逐步被皮肤吸收/);
  assert.match(prompt, /严禁膏体一直堆积在皮肤上不吸收/);
});

test('background replacement enforces lighting, contact and perspective coherence', async () => {
  const prompt = await capturePrompt({
    ...baseTaskOptions,
    prompt: validInput.prompt,
    backgroundReplacement: {
      mode: 'replace',
      prompt: 'bright studio with soft daylight',
      imageUrl: 'https://example.com/background.jpg',
    },
  });
  assert.match(prompt, /光照一致性/);
  assert.match(prompt, /环境光与轮廓光/);
  assert.match(prompt, /接触阴影和投影/);
  assert.match(prompt, /相机机位|机位、焦距、透视网格/);
  assert.match(prompt, /传感器噪点/);
  assert.match(prompt, /严格遵循参考图的光照方向/);
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

test('non-lipstick products never get lipstick injected into the prompt', async () => {
  const prompt = await capturePrompt({
    ...baseTaskOptions,
    prompt: '把参考视频里的人物换成参考图片中的人物，展示这件外套的上身效果。',
  });
  // 历史 bug：口红场景约束被无条件下发，导致任何品类都可能凭空画出唇膏。
  assert.doesNotMatch(prompt, /口红试色/);
  assert.doesNotMatch(prompt, /唇膏/);
  assert.doesNotMatch(prompt, /唇线/);
  // 通用口腔约束仍在，但不夹带口红概念。
  assert.match(prompt, /口腔与唇部/);
  assert.match(prompt, /严禁吐舌/);
});

test('camera motion, handheld props and lip-sync are locked down in the prompt', async () => {
  const prompt = await capturePrompt({
    ...baseTaskOptions,
    prompt: '涂口红试色，展示产品。',
    voiceReplacement: {
      enabled: true,
      language: 'en-US',
      script: 'This lipstick shade is gorgeous.',
      audioUrl: 'https://example.com/tts.mp3',
    },
  });
  // 参考图片是最高优先级：脸、发型、穿搭都按参考图，且不能被「保留原视频一切」覆盖。
  assert.match(prompt, /最高优先级 · 参考图片决定人物的一切/);
  assert.match(prompt, /穿搭服饰/);
  assert.match(prompt, /严禁只换脸不换发型或穿搭/);
  assert.match(prompt, /衣物以参考图片为准/);
  // 运镜必须逐帧复刻，不能被模型重新构图或「稳定化」。
  assert.match(prompt, /运镜与画面复刻/);
  assert.match(prompt, /禁止重新构图或裁切/);
  assert.match(prompt, /禁止改变运镜速度与方向/);
  // 剧烈晃动要同等剧烈，不能被削弱成平滑镜头。
  assert.match(prompt, /晃得多剧烈，成片就要晃得多剧烈/);
  assert.match(prompt, /严禁削弱抖动幅度/);
  // 手里的产品不能丢、不能变形。
  assert.match(prompt, /手持物品与道具/);
  assert.match(prompt, /禁止物品消失、变形、漂浮/);
  assert.match(prompt, /禁止多指、少指/);
  // 手持晃动本身也要保留，不能被「稳定化」。
  assert.match(prompt, /镜头晃动/);
  // 有音频时必须逐音节对口型。
  assert.match(prompt, /viseme 级别/);
  assert.match(prompt, /口型领先或滞后于音频/);
  assert.match(prompt, /静音段落嘴还在动/);
  // 成片音轨必须就是目标语言配音，不能沿用原视频原声。
  assert.match(prompt, /成片音轨必须就是这段音频/);
  assert.match(prompt, /严禁出现参考视频的原语言人声/);
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
