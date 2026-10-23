/**
 * 阿里云百炼（Model Studio · DashScope）语音契约。
 *
 * 配音链路：
 *  1. 用户上传 10~20 秒清晰人声样本（mp3/m4a/wav，≤10MB）；
 *  2. 调 Qwen-Audio-TTS 声音复刻接口（无需训练，即时返回 voice_id）；
 *  3. 用复刻音色调非实时语音合成（SpeechSynthesizer）生成目标台词音频。
 *
 * 模型固定为 qwen-audio-3.0-tts-plus：创建音色时的 target_model 必须与合成模型
 * 完全一致，否则合成失败。
 *
 * 文档：
 *  - 声音复刻：https://docs.bailian.console.aliyun.com/zh/model-studio/voice-cloning-user-guide
 *  - 非实时语音合成：https://docs.bailian.console.aliyun.com/zh/model-studio/non-realtime-tts-user-guide
 */

/** 语音合成模型（也是声音复刻绑定的 target_model，二者必须一致）。 */
export const BAILIAN_TTS_MODEL = 'qwen-audio-3.0-tts-plus';

/** 声音复刻接口固定 model 值（不可改）。 */
export const BAILIAN_VOICE_ENROLLMENT_MODEL = 'voice-enrollment';

/** 默认地域：华北2（北京）。 */
export const BAILIAN_DEFAULT_REGION = 'cn-beijing';

/** 声音复刻：创建音色。 */
export const BAILIAN_VOICE_CUSTOMIZATION_PATH = '/api/v1/services/audio/tts/customization';

/** 非实时语音合成。 */
export const BAILIAN_TTS_SYNTHESIZER_PATH = '/api/v1/services/audio/tts/SpeechSynthesizer';

/** 非实时语音识别模型（同步，5 分钟以内音频，音频以 data URI 内联）。 */
export const BAILIAN_ASR_MODEL = 'qwen-audio-3.0-asr-flash';

/** 多模态生成端点：qwen-audio-3.0-asr-flash 同步识别走这里。 */
export const BAILIAN_ASR_GENERATION_PATH = '/api/v1/services/aigc/multimodal-generation/generation';

/* ------------------------------------------------------------------ */
/* 复刻音频样本要求（Qwen-Audio-TTS）                                  */
/* ------------------------------------------------------------------ */

export const BAILIAN_CLONE_AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.wav'] as const;
export const BAILIAN_CLONE_AUDIO_MAX_BYTES = 10 * 1024 * 1024; // ≤ 10 MB
/** 推荐 10~20 秒，最长不超过 60 秒；至少 5 秒连续清晰朗读。 */
export const BAILIAN_CLONE_AUDIO_MIN_SECONDS = 5;
export const BAILIAN_CLONE_AUDIO_RECOMMENDED_MAX_SECONDS = 20;
export const BAILIAN_CLONE_AUDIO_MAX_SECONDS = 60;

/* ------------------------------------------------------------------ */
/* 语种                                                                */
/* ------------------------------------------------------------------ */

/**
 * 合成接口支持的语种（Qwen-Audio-TTS 声音复刻音频要求中列出的语种）。
 * 下拉选项在 cprtContract.VOICE_LANGUAGE_OPTIONS；这里的表用于服务端校验与提示。
 */
export const BAILIAN_SPEECH_LANGUAGE_LABELS: Record<string, string> = {
  'zh-CN': '中文',
  'en-US': '英文',
  'ja-JP': '日语',
  'ko-KR': '韩语',
  'fr-FR': '法语',
  'de-DE': '德语',
  'es-ES': '西班牙语',
  'pt-BR': '巴西葡萄牙语',
  'ar-SA': '阿拉伯语',
};

export function isBailianSpeechLanguageSupported(language: string): boolean {
  return language === 'keep' || Object.prototype.hasOwnProperty.call(BAILIAN_SPEECH_LANGUAGE_LABELS, language);
}

export function bailianSpeechLanguageLabel(language: string): string {
  return BAILIAN_SPEECH_LANGUAGE_LABELS[language] || language;
}

/* ------------------------------------------------------------------ */
/* 复刻音色                                                            */
/* ------------------------------------------------------------------ */

/**
 * 声音复刻返回的 voice_id 校验：平台返回的 id 形如
 * `<target_model>-<prefix>-<随机串>`，这里只做宽松的安全字符校验，避免把脏数据/
 * 提示文案当成 id 透传。
 */
const CLONE_VOICE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;

export function isCloneVoiceId(id: string | undefined | null): id is string {
  const normalized = String(id || '').trim();
  return normalized.length > 0 && CLONE_VOICE_ID_PATTERN.test(normalized);
}

/**
 * 生成音色名称前缀（prefix）：仅小写字母/数字，保证多次上传不会撞到历史音色。
 * 注意百炼限制 prefix 最长 10 个字符，返回值固定为 `vc` + 8 位十六进制（共 10 位）。
 * 平台返回的 voice_id 会带上这个前缀。
 */
export function buildCloneVoicePrefix(): string {
  const random = Math.random().toString(16).slice(2, 10).padEnd(8, '0');
  return `vc${random}`.toLowerCase();
}

/* ------------------------------------------------------------------ */
/* 音色试听文本                                                        */
/* ------------------------------------------------------------------ */

/** 每种目标语种一句固定的短试听词，keep 等同中文。 */
export const BAILIAN_VOICE_PREVIEW_TEXTS: Record<string, string> = {
  keep: '你好，欢迎试听我的复刻音色，希望它适合你的视频。',
  'zh-CN': '你好，欢迎试听我的复刻音色，希望它适合你的视频。',
  'en-US': "Hi there! Welcome to the preview of my cloned voice. I hope it fits your video.",
  'ja-JP': 'こんにちは。この複製ボイスのサンプルへようこそ。あなたの動画に合う声です。',
  'ko-KR': '안녕하세요! 제 복제 목소리 미리 듣기에 오신 것을 환영합니다. 당신의 영상에 잘 어울리는 목소리입니다.',
  'fr-FR': "Bonjour ! Bienvenue dans l'aperçu de ma voix clonée. J'espère qu'elle conviendra à votre vidéo.",
  'de-DE': 'Hallo! Willkommen zur Vorschau meiner geklonten Stimme. Ich hoffe, sie passt zu deinem Video.',
  'es-ES': '¡Hola! Bienvenido a la muestra de mi voz clonada. Espero que encaje con tu vídeo.',
  'pt-BR': 'Olá! Bem-vindo à prévia da minha voz clonada. Espero que combine com o seu vídeo.',
  'ar-SA': 'مرحبًا بك في معاينة صوتي المستنسخ. آمل أن يناسب الفيديو الخاص بك.',
};

export function previewTextForLanguage(language: string): string {
  return BAILIAN_VOICE_PREVIEW_TEXTS[String(language || '').trim()]
    || BAILIAN_VOICE_PREVIEW_TEXTS['zh-CN'];
}
