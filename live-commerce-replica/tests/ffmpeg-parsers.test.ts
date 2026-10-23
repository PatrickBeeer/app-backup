import { describe, expect, it } from 'vitest';
import { parseProbeJson, parseSceneTimes, parseSpeechSegments } from '../src/media/ffmpeg.js';

describe('FFmpeg output parsers', () => {
  it('normalizes a video probe with audio and fractional fps', () => {
    const result = parseProbeJson(JSON.stringify({
      format: { duration: '42.5', format_name: 'mov,mp4' },
      streams: [
        { codec_type: 'video', width: 1080, height: 1920, r_frame_rate: '30000/1001' },
        { codec_type: 'audio' }
      ]
    }));

    expect(result).toEqual({
      duration: 42.5,
      width: 1080,
      height: 1920,
      fps: 29.97,
      hasVideo: true,
      hasAudio: true,
      formatName: 'mov,mp4'
    });
  });

  it('deduplicates scene timestamps that are too close together', () => {
    const stderr = 'pts_time:0.100\npts_time:3.200\npts_time:3.350\npts_time:9.500';
    expect(parseSceneTimes(stderr, 12)).toEqual([3.2, 9.5]);
  });

  it('inverts detected silence into speech segments', () => {
    const stderr = [
      'silence_start: 0',
      'silence_end: 1.000 | silence_duration: 1.000',
      'silence_start: 4.000',
      'silence_end: 5.000 | silence_duration: 1.000',
      'silence_start: 9.000'
    ].join('\n');
    expect(parseSpeechSegments(stderr, 10)).toEqual([
      { id: 'speech-1', start: 1, end: 4 },
      { id: 'speech-2', start: 5, end: 9 }
    ]);
  });
});
