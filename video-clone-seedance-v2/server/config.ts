import fs from 'node:fs';
import path from 'node:path';

type RuntimeConfig = {
  port: number;
  assetPort: number;
  assetStorageDir: string;
  publicAssetBaseUrlFile: string;
  cprtBaseUrl: string;
  cprtApiKey: string;
  tokendanceApiKey: string;
  tokendanceBaseUrl: string;
  /** 阿里云百炼 API Key（sk-ws- 业务空间 Key）。 */
  bailianApiKey: string;
  /** 业务空间专属域名根，如 https://ws-xxx.cn-beijing.maas.aliyuncs.com。 */
  bailianBaseUrl: string;
  /** 业务空间 ID（如 ws-xxxxxxxx）。 */
  bailianWorkspaceId: string;
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
loadEnvFile(path.resolve(cwd, '.run/video-clone-seedance-v2.env'));
loadEnvFile(path.resolve(cwd, '.env.local'));
loadEnvFile(path.resolve(cwd, '.env'));

const cprtApiKey = String(process.env.CPRT_KEY || process.env.CPRT_API_KEY || '').trim();
// 阿里云百炼（DashScope）API Key，用于 Qwen-Audio-TTS 声音复刻 + 非实时语音合成。
const bailianApiKey = String(
  process.env.BAILIAN_KEY || process.env.DASHSCOPE_API_KEY || process.env.BAILIAN_API_KEY || '',
).trim();
// sk-ws- 业务空间 Key 必须搭配业务空间专属域名 {WorkspaceId}.{region}.maas.aliyuncs.com 使用。
const bailianWorkspaceId = String(process.env.BAILIAN_WORKSPACE_ID || '').trim();
const bailianRegion = String(process.env.BAILIAN_REGION || 'cn-beijing').trim();
// 默认拼业务空间专属域名；也允许 BAILIAN_BASE_URL 显式覆盖。
const bailianBaseUrl = String(
  process.env.BAILIAN_BASE_URL
    || (bailianWorkspaceId ? `https://${bailianWorkspaceId}.${bailianRegion}.maas.aliyuncs.com` : ''),
).replace(/\/$/, '');

export const config: RuntimeConfig = {
  port: Number(process.env.PORT || 9895),
  assetPort: Number(process.env.LOCAL_ASSET_PORT || 9894),
  assetStorageDir: path.resolve(cwd, process.env.LOCAL_ASSET_STORAGE_DIR || '.run/uploads'),
  publicAssetBaseUrlFile: path.resolve(cwd, process.env.PUBLIC_ASSET_BASE_URL_FILE || '.run/public-asset-base-url'),
  cprtBaseUrl: String(process.env.CPRT_BASE_URL || 'https://ai-api.cprt.xyz').replace(/\/$/, ''),
  cprtApiKey,
  tokendanceApiKey: String(process.env.TOKENDANCE_KEY || process.env.TOKENDANCE_API_KEY || '').trim(),
  tokendanceBaseUrl: String(process.env.TOKENDANCE_BASE_URL || 'https://tokendance.space/gateway/ark/v3').replace(/\/$/, ''),
  bailianApiKey,
  bailianBaseUrl,
  bailianWorkspaceId,
  appId: 'video-clone-seedance-v2',
};
