import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { GenerationUnit, Project } from '../core/types.js';

export interface DemoGeneratorPort {
  generate(project: Project, unit: GenerationUnit, outputPath: string): Promise<string>;
}

export class DemoGenerator implements DemoGeneratorPort {
  constructor(private readonly ffmpegPath = 'ffmpeg') {}

  async generate(project: Project, unit: GenerationUnit, outputPath: string): Promise<string> {
    await mkdir(path.dirname(outputPath), { recursive: true });
    const size = project.ratio === '9:16' ? '720x1280' : '1280x720';
    const unitNumber = Number(unit.id.replace(/\D/g, '')) || 1;
    const hue = (unitNumber * 47) % 360;
    const palette = ['0x1f3546', '0x452b3b', '0x234337', '0x4a4027', '0x2f3154', '0x4b3025'];
    const color = palette[(unitNumber - 1) % palette.length]!;
    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.ffmpegPath, [
        '-y',
        '-f', 'lavfi', '-i', `color=c=${color}:s=${size}:r=30:d=${unit.duration.toFixed(3)}`,
        '-f', 'lavfi', '-i', `sine=frequency=${260 + hue}:sample_rate=48000:duration=${unit.duration.toFixed(3)}`,
        '-vf', `drawbox=x='mod(t*120\\,iw)':y=ih*0.44:w=iw*0.22:h=ih*0.12:color=0xff5b3d@0.9:t=fill`,
        '-t', unit.duration.toFixed(3), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', outputPath
      ], { windowsHide: true });
      let stderr = '';
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => (stderr += chunk));
      child.on('error', reject);
      child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`演示片段生成失败：${stderr.slice(-1200)}`)));
    });
    return outputPath;
  }
}
