import fs from 'node:fs';
import path from 'node:path';

type RuntimeConfig = {
  port: number;
  densBaseUrl: string;
  densApiKey: string;
  klingBaseUrl: string;
  klingApiKey: string;
  tokendanceBaseUrl: string;
  tokendanceApiKey: string;
  tokendanceModel: string;
  elevenLabsBaseUrl: string;
  elevenLabsApiKey: string;
  elevenLabsVoiceId: string;
  elevenLabsModelId: string;
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
loadEnvFile(path.resolve(cwd, '.run/video-clone.env'));
loadEnvFile(path.resolve(cwd, '.env.local'));
loadEnvFile(path.resolve(cwd, '.env'));

const densApiKey = String(process.env.DENS_KEY || '').trim();
const klingApiKey = String(process.env.KLING_API_KEY || process.env.KLING_KEY || '').trim();
const tokendanceApiKey = String(process.env.TOKENDANCE_KEY || '').trim();
const elevenLabsApiKey = String(process.env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_KEY || '').trim();

export const config: RuntimeConfig = {
  port: Number(process.env.PORT || 9898),
  densBaseUrl: String(process.env.DENS_BASE_URL || 'https://api.doubleespressonosugar.com').replace(/\/$/, ''),
  densApiKey,
  klingBaseUrl: String(process.env.KLING_BASE_URL || 'https://api-beijing.klingai.com').replace(/\/$/, ''),
  klingApiKey,
  tokendanceBaseUrl: String(process.env.TOKENDANCE_BASE_URL || 'https://tokendance.space').replace(/\/$/, ''),
  tokendanceApiKey,
  tokendanceModel: String(process.env.TOKENDANCE_MODEL || 'seedream-5.0-pro').trim(),
  elevenLabsBaseUrl: String(process.env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io').replace(/\/$/, ''),
  elevenLabsApiKey,
  elevenLabsVoiceId: String(process.env.ELEVENLABS_VOICE_ID || process.env.DENS_ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb').trim(),
  elevenLabsModelId: String(process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_sts_v2').trim(),
  appId: 'video-clone',
};
