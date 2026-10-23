import type { ReferenceTranscriptSegment } from '../core/types.js';
import { decodeAudioToFloat32 } from '../media/audio-pcm.js';
import { simplifyChinese } from '../text/simplified-chinese.js';

interface AsrChunk {
  text: string;
  timestamp: [number, number | null];
}

interface AsrResult {
  text: string;
  chunks?: AsrChunk[];
}

type AsrPipeline = ((audio: Float32Array, options: Record<string, unknown>) => Promise<AsrResult>) & {
  dispose(): Promise<void> | void;
};

type AudioDecoder = (filePath: string, ffmpegPath: string) => Promise<Float32Array>;
type PipelineFactory = (model: string, cacheDir: string) => Promise<AsrPipeline>;

async function createPipeline(model: string, cacheDir: string): Promise<AsrPipeline> {
  const { pipeline } = await import('@huggingface/transformers');
  const instance = await pipeline('automatic-speech-recognition', model, { dtype: 'q4', cache_dir: cacheDir });
  return instance as unknown as AsrPipeline;
}

export class LocalWhisperTranscriber {
  private pipelinePromise: Promise<AsrPipeline> | undefined;

  constructor(
    private readonly config: { model: string; ffmpegPath: string; cacheDir: string },
    private readonly decodeAudio: AudioDecoder = decodeAudioToFloat32,
    private readonly pipelineFactory: PipelineFactory = createPipeline
  ) {}

  async transcribe(filePath: string): Promise<ReferenceTranscriptSegment[]> {
    const [audio, asr] = await Promise.all([
      this.decodeAudio(filePath, this.config.ffmpegPath),
      this.getPipeline()
    ]);
    const result = await asr(audio, {
      language: 'zh',
      task: 'transcribe',
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5
    });
    const chunks = result.chunks ?? [];
    const mapped = chunks.flatMap<ReferenceTranscriptSegment>((chunk, index) => {
      const start = chunk.timestamp[0];
      const end = chunk.timestamp[1];
      const text = simplifyChinese(chunk.text.replace(/\s+/g, ' ').trim());
      if (!Number.isFinite(start) || typeof end !== 'number' || !Number.isFinite(end) || end <= start || !text) return [];
      return [{ id: `chunk-${index + 1}`, start, end, text }];
    });
    if (mapped.length > 0) return mapped;

    const text = simplifyChinese(result.text.replace(/\s+/g, ' ').trim());
    return text
      ? [{ id: 'chunk-1', start: 0, end: audio.length / 16000, text }]
      : [];
  }

  async dispose(): Promise<void> {
    const current = this.pipelinePromise;
    this.pipelinePromise = undefined;
    if (!current) return;
    const pipeline = await current.catch(() => undefined);
    await pipeline?.dispose();
  }

  private getPipeline(): Promise<AsrPipeline> {
    this.pipelinePromise ??= this.pipelineFactory(this.config.model, this.config.cacheDir);
    return this.pipelinePromise;
  }
}
