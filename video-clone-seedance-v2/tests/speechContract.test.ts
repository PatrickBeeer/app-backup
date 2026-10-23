import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BAILIAN_TTS_MODEL,
  BAILIAN_VOICE_ENROLLMENT_MODEL,
  BAILIAN_DEFAULT_REGION,
  BAILIAN_VOICE_CUSTOMIZATION_PATH,
  BAILIAN_TTS_SYNTHESIZER_PATH,
  BAILIAN_SPEECH_LANGUAGE_LABELS,
  BAILIAN_VOICE_PREVIEW_TEXTS,
  BAILIAN_CLONE_AUDIO_EXTENSIONS,
  BAILIAN_CLONE_AUDIO_MAX_BYTES,
  bailianSpeechLanguageLabel,
  buildCloneVoicePrefix,
  isBailianSpeechLanguageSupported,
  isCloneVoiceId,
  previewTextForLanguage,
} from '../shared/speechContract';

test('模型常量：合成固定 qwen-audio-3.0-tts-plus，复刻固定 voice-enrollment，北京地域', () => {
  assert.equal(BAILIAN_TTS_MODEL, 'qwen-audio-3.0-tts-plus');
  assert.equal(BAILIAN_VOICE_ENROLLMENT_MODEL, 'voice-enrollment');
  assert.equal(BAILIAN_DEFAULT_REGION, 'cn-beijing');
  assert.equal(BAILIAN_VOICE_CUSTOMIZATION_PATH, '/api/v1/services/audio/tts/customization');
  assert.equal(BAILIAN_TTS_SYNTHESIZER_PATH, '/api/v1/services/audio/tts/SpeechSynthesizer');
});

test('样本音频要求：mp3/m4a/wav 且上限 10MB', () => {
  assert.deepEqual([...BAILIAN_CLONE_AUDIO_EXTENSIONS], ['.mp3', '.m4a', '.wav']);
  assert.equal(BAILIAN_CLONE_AUDIO_MAX_BYTES, 10 * 1024 * 1024);
});

test('语种白名单：keep 与文档列出的语种受支持，未知语种被拒', () => {
  assert.equal(isBailianSpeechLanguageSupported('zh-CN'), true);
  assert.equal(isBailianSpeechLanguageSupported('en-US'), true);
  assert.equal(isBailianSpeechLanguageSupported('ar-SA'), true);
  assert.equal(isBailianSpeechLanguageSupported('keep'), true);
  assert.equal(isBailianSpeechLanguageSupported('xx-YY'), false);
  assert.ok(Object.keys(BAILIAN_SPEECH_LANGUAGE_LABELS).length >= 9);
  assert.equal(bailianSpeechLanguageLabel('ja-JP'), '日语');
  assert.equal(bailianSpeechLanguageLabel('xx-YY'), 'xx-YY');
});

test('复刻音色 ID：宽松安全字符校验', () => {
  assert.equal(isCloneVoiceId('qwen-audio-3.0-tts-plus_vc-abcd1234-ef0123'), true);
  assert.equal(isCloneVoiceId('myvoice_20260101'), true);
  assert.equal(isCloneVoiceId(''), false);
  assert.equal(isCloneVoiceId(undefined), false);
  assert.equal(isCloneVoiceId('a b'), false);
  assert.equal(isCloneVoiceId('<script>'), false);
  // 超长 id 拒绝（上限 255 字符）。
  assert.equal(isCloneVoiceId(`a${'b'.repeat(260)}`), false);
});

test('音色前缀：vc 开头、仅小写安全字符、固定 10 字符（百炼 prefix 上限）、多次调用不撞名', () => {
  const first = buildCloneVoicePrefix();
  const second = buildCloneVoicePrefix();
  assert.match(first, /^vc[a-z0-9]{8}$/);
  assert.equal(first.length, 10);
  assert.notEqual(first, second);
});

test('试听文本：目标语种都有一句短词，未知语种回退中文', () => {
  assert.ok(previewTextForLanguage('zh-CN').includes('试听'));
  assert.match(previewTextForLanguage('en-US'), /cloned voice/i);
  assert.equal(previewTextForLanguage('xx-YY'), BAILIAN_VOICE_PREVIEW_TEXTS['zh-CN']);
});
