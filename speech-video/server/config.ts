import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
for (const name of ['.env.local', '.env']) {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}

const workspace = process.env.BAILIAN_WORKSPACE_ID?.trim();
const region = process.env.BAILIAN_REGION?.trim() || 'cn-beijing';
export const config = {
  port: Number(process.env.PORT || 9905),
  assetPort: Number(process.env.LOCAL_ASSET_PORT || 9904),
  storageDir: path.resolve(root, process.env.LOCAL_ASSET_STORAGE_DIR || '.run/uploads'),
  baseUrlFile: path.resolve(root, '.run/public-asset-base-url'),
  cprtKey: (process.env.CPRT_KEY || '').trim(),
  cprtBaseUrl: (process.env.CPRT_BASE_URL || 'https://ai-api.cprt.xyz').replace(/\/$/, ''),
  volcengineApiKey: (process.env.VOLCENGINE_API_KEY_SECRET || '').trim(),
  videoPointsPerSecond: Number(process.env.OMNIHUMAN_VIDEO_POINTS_PER_SECOND || 0),
  bailianKey: (process.env.BAILIAN_KEY || '').trim(),
  bailianBaseUrl: (process.env.BAILIAN_BASE_URL || (workspace ? `https://${workspace}.${region}.maas.aliyuncs.com` : '')).replace(/\/$/, ''),
};
