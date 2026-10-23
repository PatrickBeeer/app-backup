import type { QualityReport, Ratio, VideoProbe } from '../core/types.js';
import { probeVideo } from './ffmpeg.js';

export function evaluateProbe(
  probe: VideoProbe,
  expected: { duration: number; ratio: Ratio }
): QualityReport {
  const issues: string[] = [];
  const durationDelta = Math.round((probe.duration - expected.duration) * 1000) / 1000;
  if (durationDelta < -0.45) issues.push('片段时长不足');
  if (!probe.hasAudio) issues.push('缺少原生音轨');
  if (!probe.hasVideo) issues.push('缺少视频流');

  const target = expected.ratio === '9:16' ? { width: 720, height: 1280 } : { width: 1280, height: 720 };
  const ratioDelta = probe.height > 0
    ? Math.abs(probe.width / probe.height - target.width / target.height)
    : Number.POSITIVE_INFINITY;
  const resolutionMatches = ratioDelta <= 0.03 && Math.min(probe.width, probe.height) >= 700;
  if (probe.hasVideo && !resolutionMatches) issues.push('画幅或分辨率不符合项目设置');

  return {
    passed: issues.length === 0,
    score: Math.max(0, 100 - issues.length * 25),
    issues,
    technical: {
      durationDelta,
      hasVideo: probe.hasVideo,
      hasAudio: probe.hasAudio,
      resolutionMatches
    },
    semanticStatus: 'pending'
  };
}

export async function inspectGeneratedClip(
  filePath: string,
  expected: { duration: number; ratio: Ratio },
  ffprobePath = 'ffprobe'
): Promise<QualityReport> {
  const probe = await probeVideo(filePath, ffprobePath);
  return evaluateProbe(probe, expected);
}
