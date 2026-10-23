import fs from 'node:fs';
import path from 'node:path';

type RuntimeConfig = {
  port: number;
  cprtBaseUrl: string;
  cprtApiKey: string;
  appId: string;
};

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const contents = fs.readFileSync(filePath, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) {
      continue;
    }

    const key = match[1];
    if (process.env[key]) {
      continue;
    }

    process.env[key] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const cwd = process.cwd();
loadEnvFile(path.resolve(cwd, '.run/video-clone-seedance.env'));
loadEnvFile(path.resolve(cwd, '.env.local'));
loadEnvFile(path.resolve(cwd, '.env'));

const cprtApiKey = String(process.env.CPRT_KEY || process.env.CPRT_API_KEY || '').trim();

export const config: RuntimeConfig = {
  port: Number(process.env.PORT || 9896),
  cprtBaseUrl: String(process.env.CPRT_BASE_URL || 'https://ai-api.cprt.xyz').replace(/\/$/, ''),
  cprtApiKey,
  appId: 'video-clone-seedance',
};
