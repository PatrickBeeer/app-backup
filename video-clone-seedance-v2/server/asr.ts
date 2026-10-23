import { postBailianJson, isTransientBailianError } from './bailianSpeech';
import { RequestValidationError } from './validation';
import { BAILIAN_ASR_MODEL, BAILIAN_ASR_GENERATION_PATH } from '../shared/speechContract';

/**
 * 阿里云百炼 · 非实时语音识别（Qwen-Audio-3.0-ASR-Flash，同步调用），
 * 用于把参考视频的原台词转成文字，供「换语言」时自动翻译使用。
 *
 * 契约（文档：non-realtime-speech-recognition-user-guide）：
 *  - 端点：POST {业务空间域名}/api/v1/services/aigc/multimodal-generation/generation
 *  - 请求头 X-DashScope-SSE: disable（非流式，一次性拿 JSON）
 *  - 音频必须以 data URI 内联（data:audio/wav;base64,xxxx）；裸 base64 会 500。
 *    同步模型支持 5 分钟以内音频，参考视频音轨（≤15s）完全够用，因此不需要公网 URL。
 *  - 响应文本在顶层 output.text，兼容 output.sentence.text / output.output.* 形态。
 */

const MAX_ATTEMPTS = 3;

export type RecognizeSpeechInput = {
  /** 音频内容（base64，无 data: 前缀）。 */
  audioBase64: string;
  /** wav / mp3 / m4a 等。 */
  format?: string;
  sampleRate?: number;
};

function dataUriMime(format: string): string {
  const normalized = String(format || 'wav').trim().toLowerCase().replace(/^\./, '');
  switch (normalized) {
    case 'mp3':
      return 'audio/mpeg';
    case 'm4a':
    case 'aac':
      return 'audio/mp4';
    case 'wav':
    case 'pcm':
    default:
      return 'audio/wav';
  }
}

function extractTranscript(payload: any): string {
  // 实测同步识别：{ sentence:{text}, text, request_id, output:{sentence,text}, usage }。
  // 文档还给出 output.output.sentence.text 的形态，全部兼容。
  const candidates = [
    payload?.output?.text,
    payload?.text,
    payload?.output?.sentence?.text,
    payload?.sentence?.text,
    payload?.output?.output?.sentence?.text,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return '';
}

/** 识别音频中的语音，返回识别文本（无语音时返回空字符串）。 */
export async function recognizeSpeech(input: RecognizeSpeechInput): Promise<string> {
  const audioBase64 = String(input.audioBase64 || '').trim();
  if (!audioBase64) {
    throw new RequestValidationError('缺少待识别的音频数据。', 400);
  }

  const dataUri = `data:${dataUriMime(input.format || 'wav')};base64,${audioBase64}`;
  const body = {
    model: BAILIAN_ASR_MODEL,
    input: {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'input_audio', input_audio: { data: dataUri } },
          ],
        },
      ],
    },
    parameters: {
      format: String(input.format || 'wav').toLowerCase(),
      sample_rate: String(Number(input.sampleRate) || 16000),
    },
  };

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const payload = await postBailianJson(
        BAILIAN_ASR_GENERATION_PATH,
        body,
        120_000,
        { 'X-DashScope-SSE': 'disable' },
      );
      const text = extractTranscript(payload);
      if (!text) {
        // 200 但识别结果为空：可能是纯背景音乐 / 无人声，直接返回空串由上层提示。
        return '';
      }
      return text;
    } catch (error) {
      lastError = error;
      if (!isTransientBailianError(error) || attempt === MAX_ATTEMPTS) {
        if (error instanceof RequestValidationError) {
          throw error;
        }
        throw new RequestValidationError(
          `语音识别失败：${error instanceof Error ? error.message : '未知错误'}。`
          + '你也可以直接在「AI 换声 / 换语言」面板手动填写目标语言台词。',
          502,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 400 * (2 ** (attempt - 1))));
      console.warn(`[video-clone-seedance-bff] ASR attempt ${attempt} failed, retrying...`);
    }
  }

  throw new RequestValidationError(
    `语音识别服务连接失败（${lastError instanceof Error ? lastError.message : '网络错误'}）。`
    + '请重试一次；仍失败的话，直接在「AI 换声 / 换语言」面板手动填写目标语言台词即可继续生成。',
    502,
  );
}
