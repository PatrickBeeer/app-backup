import { describe, expect, it } from 'vitest';
import { alignTranscriptToSpeech } from '../src/core/transcript.js';

describe('alignTranscriptToSpeech', () => {
  it('assigns each Whisper chunk to the speech segment with the largest overlap', () => {
    const result = alignTranscriptToSpeech([
      { id: 'chunk-1', start: 0.2, end: 2, text: '姐妹们看这里' },
      { id: 'chunk-2', start: 2, end: 4, text: '这件长袖很显瘦' },
      { id: 'chunk-3', start: 5, end: 8, text: '今天价格很划算' }
    ], [
      { id: 'speech-1', start: 0, end: 4 },
      { id: 'speech-2', start: 4.8, end: 8.2 }
    ]);

    expect(result).toEqual([
      { id: 'speech-1', start: 0, end: 4, text: '姐妹们看这里这件长袖很显瘦' },
      { id: 'speech-2', start: 4.8, end: 8.2, text: '今天价格很划算' }
    ]);
  });

  it('returns one empty transcript row per speech segment when Whisper has no chunks', () => {
    expect(alignTranscriptToSpeech([], [{ id: 'speech-1', start: 1, end: 3 }])).toEqual([
      { id: 'speech-1', start: 1, end: 3, text: '' }
    ]);
  });
});
