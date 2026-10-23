import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildAss } from '../core/ass.js';
import type { GenerationJob, Project } from '../core/types.js';

export interface RenderInput {
  project: Project;
  jobs: GenerationJob[];
  outputPath: string;
  workDir: string;
  ffmpegPath?: string;
}

async function run(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`成片处理失败：${stderr.slice(-1800)}`)));
  });
}

function concatPath(filePath: string): string {
  return filePath.replaceAll('\\', '/').replaceAll("'", "'\\''");
}

function filterPath(filePath: string): string {
  return filePath.replaceAll('\\', '/').replaceAll(':', '\\:').replaceAll("'", "\\'");
}

export async function renderFinal(input: RenderInput): Promise<string> {
  const { project } = input;
  const units = project.analysis?.generationUnits;
  if (!units || units.length === 0) throw new Error('项目没有生成单元');
  const accepted = new Map(
    input.jobs.filter((job) => job.accepted && job.outputPath).map((job) => [job.unitId, job])
  );
  if (units.some((unit) => !accepted.has(unit.id))) throw new Error('仍有片段未通过审核');

  await mkdir(input.workDir, { recursive: true });
  await mkdir(path.dirname(input.outputPath), { recursive: true });
  const ffmpegPath = input.ffmpegPath ?? 'ffmpeg';
  const width = project.ratio === '9:16' ? 720 : 1280;
  const height = project.ratio === '9:16' ? 1280 : 720;
  const normalizedPaths: string[] = [];

  for (const [index, unit] of units.entries()) {
    const source = accepted.get(unit.id)!.outputPath!;
    const normalized = path.join(input.workDir, `normalized-${String(index + 1).padStart(2, '0')}.mp4`);
    const duration = unit.duration.toFixed(3);
    await run(ffmpegPath, [
      '-y', '-i', source,
      '-filter_complex',
      `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=30,tpad=stop_mode=clone:stop_duration=15,trim=duration=${duration},setpts=PTS-STARTPTS[v];[0:a]apad=pad_dur=15,atrim=duration=${duration},asetpts=PTS-STARTPTS[a]`,
      '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-b:a', '160k', '-movflags', '+faststart', normalized
    ]);
    normalizedPaths.push(normalized);
  }

  const concatFile = path.join(input.workDir, 'concat.txt');
  await writeFile(concatFile, normalizedPaths.map((filePath) => `file '${concatPath(filePath)}'`).join('\n'), 'utf8');
  const stitched = path.join(input.workDir, 'stitched.mp4');
  await run(ffmpegPath, ['-y', '-f', 'concat', '-safe', '0', '-i', concatFile, '-c', 'copy', stitched]);

  const assPath = path.join(input.workDir, 'overlays.ass');
  await writeFile(assPath, buildAss(project), 'utf8');
  await run(ffmpegPath, [
    '-y', '-i', stitched, '-vf', `ass='${filterPath(assPath)}'`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'copy', '-movflags', '+faststart', input.outputPath
  ]);
  return input.outputPath;
}
