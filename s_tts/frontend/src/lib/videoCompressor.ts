import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

export const compressVideo = async (
  file: File,
  onProgress?: (progress: number) => void
): Promise<File> => {
  if (!ffmpeg) {
    ffmpeg = new FFmpeg();
    await ffmpeg.load({
      coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
      wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
    });
  }

  // Reset progress listener
  ffmpeg.off('progress', () => {});
  ffmpeg.on('progress', ({ progress }) => {
    if (onProgress) {
      // progress is a ratio from 0 to 1
      onProgress(Math.round(progress * 100));
    }
  });

  const ext = file.name.split('.').pop() || 'mp4';
  const inputName = `input.${ext}`;
  const outputName = 'output.mp4';

  await ffmpeg.writeFile(inputName, await fetchFile(file));

  try {
    // Compress: scale down to 480p max, 24fps, 500k bitrate for fast processing and small size
    // Gemini API doesn't need high-res video for content analysis
    await ffmpeg.exec([
      '-i', inputName,
      '-vf', "scale='min(854,iw)':-2",
      '-r', '24',
      '-b:v', '500k',
      '-c:v', 'libx264',
      '-preset', 'superfast',
      outputName
    ]);

    const data = await ffmpeg.readFile(outputName);
    const blob = new Blob([data], { type: 'video/mp4' });
    return new File([blob], `compressed_${file.name}.mp4`, { type: 'video/mp4' });
  } finally {
    // Clean up memory safely
    try { await ffmpeg.deleteFile(inputName); } catch (e) { console.warn(e); }
    try { await ffmpeg.deleteFile(outputName); } catch (e) { console.warn(e); }
  }
};
