import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig DeepSeek settings', () => {
  it('uses the official non-legacy DeepSeek defaults', () => {
    const config = loadConfig({}, 'E:/workspace');

    expect(config.deepseek).toEqual({
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash'
    });
    expect(config.asr).toEqual({
      enabled: true,
      model: 'onnx-community/whisper-small'
    });
    expect(config.billing.videoCostPerSecond).toBe(15);
  });

  it('keeps a configured DeepSeek key in the runtime-only provider config', () => {
    const config = loadConfig({
      DEEPSEEK_API_KEY: 'local-test-key',
      DEEPSEEK_MODEL: 'deepseek-v4-pro'
    }, 'E:/workspace');

    expect(config.deepseek).toEqual({
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'local-test-key',
      model: 'deepseek-v4-pro'
    });
  });

  it('allows local ASR to be disabled or use another compatible model', () => {
    const config = loadConfig({
      LOCAL_ASR_ENABLED: 'false',
      WHISPER_MODEL: 'local/whisper-model'
    }, 'E:/workspace');

    expect(config.asr).toEqual({
      enabled: false,
      model: 'local/whisper-model'
    });
  });

  it('accepts the reference app Seedance per-second billing aliases', () => {
    const config = loadConfig({
      SEEDANCE_VIDEO_PER_SECOND: '15'
    }, 'E:/workspace');

    expect(config.billing.videoCostPerSecond).toBe(15);
  });
});
