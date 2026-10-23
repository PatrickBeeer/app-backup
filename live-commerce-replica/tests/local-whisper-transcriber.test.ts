import { describe, expect, it } from 'vitest';
import { LocalWhisperTranscriber } from '../src/providers/local-whisper-transcriber.js';

describe('LocalWhisperTranscriber', () => {
  it('loads one Chinese timestamped ASR pipeline and maps chunks', async () => {
    let factoryCalls = 0;
    let receivedFactoryConfig: { model: string; cacheDir: string } | undefined;
    let receivedOptions: Record<string, unknown> | undefined;
    const transcriber = new LocalWhisperTranscriber(
      { model: 'onnx-community/whisper-small', ffmpegPath: 'ffmpeg', cacheDir: 'data/model-cache' },
      async () => new Float32Array([0, 0.1, -0.1]),
      async (model, cacheDir) => {
        factoryCalls += 1;
        receivedFactoryConfig = { model, cacheDir };
        return Object.assign(
          async (_audio: Float32Array, options: Record<string, unknown>) => {
            receivedOptions = options;
            return {
              text: '姐妹們這件長袖很顯瘦',
              chunks: [{ text: '姐妹們這件長袖很顯瘦', timestamp: [0.2, 3.8] as [number, number] }]
            };
          },
          { dispose: async () => undefined }
        );
      }
    );

    const first = await transcriber.transcribe('reference.mp4');
    const second = await transcriber.transcribe('reference.mp4');

    expect(first).toEqual([{ id: 'chunk-1', start: 0.2, end: 3.8, text: '姐妹们这件长袖很显瘦' }]);
    expect(second).toEqual(first);
    expect(factoryCalls).toBe(1);
    expect(receivedFactoryConfig).toEqual({
      model: 'onnx-community/whisper-small',
      cacheDir: 'data/model-cache'
    });
    expect(receivedOptions).toEqual(expect.objectContaining({
      language: 'zh', task: 'transcribe', return_timestamps: true
    }));
  });

  it('disposes the loaded pipeline during application shutdown', async () => {
    let disposed = 0;
    const transcriber = new LocalWhisperTranscriber(
      { model: 'onnx-community/whisper-small', ffmpegPath: 'ffmpeg', cacheDir: 'data/model-cache' },
      async () => new Float32Array([0, 0.1]),
      async () => Object.assign(
        async () => ({ text: '测试', chunks: [{ text: '测试', timestamp: [0, 1] as [number, number] }] }),
        { dispose: async () => { disposed += 1; } }
      )
    );

    await transcriber.transcribe('reference.mp4');
    await transcriber.dispose();

    expect(disposed).toBe(1);
  });
});
