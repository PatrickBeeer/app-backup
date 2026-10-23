import { spawn } from 'node:child_process';

export function decodeAudioToFloat32(filePath: string, ffmpegPath = 'ffmpeg'): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, [
      '-v', 'error',
      '-i', filePath,
      '-vn',
      '-ac', '1',
      '-ar', '16000',
      '-f', 'f32le',
      'pipe:1'
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const output: Buffer[] = [];
    const errors: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => output.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
    child.once('error', (error) => reject(new Error(`无法启动 FFmpeg 音频解码：${error.message}`)));
    child.once('close', (code) => {
      if (code !== 0) {
        const detail = Buffer.concat(errors).toString('utf8').trim().slice(-1000);
        reject(new Error(`参考视频音频解码失败${detail ? `：${detail}` : ''}`));
        return;
      }
      const bytes = Buffer.concat(output);
      if (bytes.length === 0) {
        reject(new Error('参考视频音轨没有可识别的采样'));
        return;
      }
      if (bytes.length % 4 !== 0) {
        reject(new Error('FFmpeg 返回的音频采样格式无效'));
        return;
      }
      const samples = new Float32Array(bytes.length / 4);
      for (let index = 0; index < samples.length; index += 1) {
        samples[index] = bytes.readFloatLE(index * 4);
      }
      resolve(samples);
    });
  });
}
