import fs from 'node:fs';
import path from 'node:path';

type RuntimeConfig = {
  port: number;
  appId: string;
  /** 本地素材 HTTP 服务端口（cloudflared 隧道指向这里，用于把 data: URL 发布成公网 URL）。 */
  assetPort: number;
  /** ElevenLabs 直接调用所需的 key。 */
  elevenlabsApiKey: string;
  /** TokenDance (seedance2 引擎) 直接调用所需的 key + 基址 + 模型名。 */
  tokendanceApiKey: string;
  tokendanceBaseUrl: string;
  tokendanceVideoModel: string;
  /** Kling (multi-elements / i2v / lip-sync) 直接调用所需的 key + 基址。 */
  klingApiKey: string;
  klingApiBaseUrl: string;
  /** CPRT (备用引擎，当前未启用，保留以便后续接入 XG-MASTER-VIDEO-2.5)。 */
  cprtBaseUrl: string;
  cprtApiKey: string;
  /** 网关入口（仅用于 BFF 侧 COS presign；浏览器侧 COS presign 直接走同源）。 */
  platformGatewayOrigin: string;
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
loadEnvFile(path.resolve(cwd, '.run/video-clone-v3.env'));
loadEnvFile(path.resolve(cwd, '.env.local'));
loadEnvFile(path.resolve(cwd, '.env'));

const cprtApiKey = String(process.env.CPRT_KEY || process.env.CPRT_API_KEY || '').trim();
const elevenlabsApiKey = String(process.env.ELEVENLABS_API_KEY || '').trim();
const tokendanceApiKey = String(process.env.TOKENDANCE_API_KEY || '').trim();
const klingApiKey = String(process.env.KLING_API_KEY || '').trim();

export const config: RuntimeConfig = {
  port: Number(process.env.PORT || 9896),
  appId: 'video-clone-v3',
  assetPort: Number(process.env.ASSET_PORT || 9897),
  elevenlabsApiKey,
  tokendanceApiKey,
  tokendanceBaseUrl: String(process.env.TOKENDANCE_SEEDANCE_BASE_URL || 'https://tokendance.space/gateway/ark/v3').replace(/\/$/, ''),
  tokendanceVideoModel: String(process.env.TOKENDANCE_VIDEO_MODEL || 'seedance-2.0-fast'),
  klingApiKey,
  klingApiBaseUrl: String(process.env.KLING_API_BASE_URL || 'https://api-beijing.klingai.com').replace(/\/$/, ''),
  cprtBaseUrl: String(process.env.CPRT_BASE_URL || 'https://ai-api.cprt.xyz').replace(/\/$/, ''),
  cprtApiKey,
  platformGatewayOrigin: String(process.env.PLATFORM_GATEWAY_ORIGIN || 'http://127.0.0.1:3002').replace(/\/$/, ''),
};
