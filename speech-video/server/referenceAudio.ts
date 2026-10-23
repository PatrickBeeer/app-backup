import fsp from 'node:fs/promises';
import { assetPath, saveAsset } from './assets';
import { cropAudio, duration } from './media';

export async function referenceAudioForVideo(audioId: string, videoSeconds: number): Promise<string> {
  const source = assetPath(audioId);
  if (await duration(source) <= videoSeconds + 0.001) return audioId;
  // Previously prepared MP3s can run past the requested video length due to encoder padding.
  const id = saveAsset('video-reference.wav', Buffer.alloc(0));
  try {
    await cropAudio(source, assetPath(id), videoSeconds);
    if (await duration(assetPath(id)) > videoSeconds + 0.001) {
      throw new Error('无法将口播音频裁剪至视频时长，请重新生成语音。');
    }
    return id;
  } catch (error) {
    await fsp.rm(assetPath(id), { force: true });
    throw error;
  }
}
