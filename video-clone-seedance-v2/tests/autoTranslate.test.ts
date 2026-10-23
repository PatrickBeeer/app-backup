import assert from 'node:assert/strict';
import test from 'node:test';

import { recognizeSpeech } from '../server/asr';
import { normalizeTranslatedText, translateScript } from '../server/translate';
import { config } from '../server/config';

function mockFetchOnce(handler: () => { status?: number; body: unknown }): void {
  const result = handler();
  globalThis.fetch = async () => new Response(
    typeof result.body === 'string' ? result.body : JSON.stringify(result.body),
    {
      status: result.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    },
  ) as unknown as Response;
}

test('ASR returns the recognized transcript', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = config.bailianApiKey;
  const originalBase = config.bailianBaseUrl;
  config.bailianApiKey = 'test-key';
  config.bailianBaseUrl = 'https://ws-test.cn-beijing.maas.aliyuncs.com';
  try {
    mockFetchOnce(() => ({
      body: { output: { text: '今天给大家推荐一款非常好看的口红。' } },
    }));
    const text = await recognizeSpeech({ audioBase64: 'AAAA', format: 'mp3', sampleRate: 16000 });
    assert.equal(text, '今天给大家推荐一款非常好看的口红。');
  } finally {
    globalThis.fetch = originalFetch;
    config.bailianApiKey = originalKey;
    config.bailianBaseUrl = originalBase;
  }
});

test('ASR reports a rejected/invalid Bailian key clearly', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = config.bailianApiKey;
  const originalBase = config.bailianBaseUrl;
  config.bailianApiKey = 'test-key';
  config.bailianBaseUrl = 'https://ws-test.cn-beijing.maas.aliyuncs.com';
  try {
    mockFetchOnce(() => ({
      status: 401,
      body: { code: 'InvalidApiKey', message: 'Invalid API-key provided.' },
    }));
    await assert.rejects(
      () => recognizeSpeech({ audioBase64: 'AAAA' }),
      /百炼 API Key 无效或已被删除/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    config.bailianApiKey = originalKey;
    config.bailianBaseUrl = originalBase;
  }
});

test('translation prompt asks for spoken target-language copy only', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.LLM_TRANSLATE_API_KEY;
  const originalModel = process.env.LLM_TRANSLATE_MODEL;
  process.env.LLM_TRANSLATE_API_KEY = 'test-key';
  process.env.LLM_TRANSLATE_MODEL = 'test-model';
  let requestBody: any = null;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'This lipstick shade is absolutely stunning.' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const translated = await translateScript({
      text: '这款口红的颜色真的绝了。',
      targetLanguage: 'en-US',
    });
    assert.equal(translated, 'This lipstick shade is absolutely stunning.');
    // 目标语言与原文都进了 prompt，且要求只输出译文。
    assert.match(requestBody.messages[0].content, /只输出翻译后的台词本身/);
    assert.match(requestBody.messages[1].content, /英文/);
    assert.match(requestBody.messages[1].content, /这款口红的颜色真的绝了。/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey !== undefined) process.env.LLM_TRANSLATE_API_KEY = originalKey;
    if (originalModel !== undefined) process.env.LLM_TRANSLATE_MODEL = originalModel;
  }
});

test('translation requires configuration and reports it clearly', async () => {
  const originalKey = process.env.LLM_TRANSLATE_API_KEY;
  const originalModel = process.env.LLM_TRANSLATE_MODEL;
  delete process.env.LLM_TRANSLATE_API_KEY;
  delete process.env.LLM_TRANSLATE_MODEL;
  try {
    await assert.rejects(
      () => translateScript({ text: '你好', targetLanguage: 'ja-JP' }),
      /自动翻译尚未配置/,
    );
  } finally {
    if (originalKey !== undefined) process.env.LLM_TRANSLATE_API_KEY = originalKey;
    if (originalModel !== undefined) process.env.LLM_TRANSLATE_MODEL = originalModel;
  }
});

test('translated text is cleaned up before it goes to TTS', () => {
  assert.equal(normalizeTranslatedText('  Hello there.  '), 'Hello there.');
  assert.equal(normalizeTranslatedText('```\nHello there.\n```'), 'Hello there.');
  assert.equal(normalizeTranslatedText('"Hello there."'), 'Hello there.');
  assert.equal(normalizeTranslatedText('译文：Hello there.'), 'Hello there.');
});
