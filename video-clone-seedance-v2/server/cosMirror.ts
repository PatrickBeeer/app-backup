import { promises as fs } from 'node:fs';
import path from 'node:path';
import { detectedImageType } from './localAssets';

/**
 * 本地素材镜像到腾讯 COS（复用 api-manager 的 presign/upload 通道，与
 * s_selling-point-visual-video_v4 同一套基础设施）。
 *
 * 背景：master-video 走 Ark/TOS（cn-beijing）下载素材，trycloudflare 隧道
 * 跨境链路慢，经常触发 InvalidParameter.DownloadFailed（context deadline exceeded）。
 * COS 国内节点（如 ap-guangzhou）对 TOS 拉取稳定且快，因此提交 CPRT 前先把
 * 本地素材镜像上去，用 COS 地址替代隧道地址；镜像失败时回退隧道地址。
 */

const API_MANAGER_INTERNAL_BASE_URL = (process.env.API_MANAGER_INTERNAL_BASE_URL || 'http://127.0.0.1:3051').replace(/\/$/, '');
const COS_APP_ID = 'video-clone-seedance-v2';
const COS_OBJECT_PATH = `standalone/${COS_APP_ID}/cprt_refs`;
const COS_MIRROR_USER_ID = String(process.env.COS_MIRROR_USER_ID || '1').trim() || '1';

type CosPresignData = {
  upload_url?: string;
  headers?: Record<string, string>;
  url?: string;
  signed_url?: string;
  public_url?: string;
  object_key?: string;
};

type CosPresignResponse = { code?: number; data?: CosPresignData };

// key: 本地文件绝对路径；value: COS 下载地址。同一文件只镜像一次。
const cosUrlCache = new Map<string, string>();

/** 仅供测试使用：清空镜像缓存，保证各用例相互独立。 */
export function clearCosMirrorCacheForTests(): void {
  cosUrlCache.clear();
}

export async function mirrorLocalFileToCOS(
  localPath: string,
  fileName: string,
  contentType: string,
): Promise<string | null> {
  const cached = cosUrlCache.get(localPath);
  if (cached) {
    return cached;
  }
  try {
    const bytes = await fs.readFile(localPath);
    const imageType = contentType.startsWith('image/') ? detectedImageType(bytes) : null;
    const uploadContentType = imageType?.contentType || contentType;
    const extension = path.extname(fileName).toLowerCase();
    const uploadFileName = imageType && extension !== imageType.extension
      && !(imageType.extension === '.jpg' && extension === '.jpeg')
      ? `${extension ? fileName.slice(0, -extension.length) : fileName}${imageType.extension}`
      : fileName;
    const presignResponse = await fetch(`${API_MANAGER_INTERNAL_BASE_URL}/api/v1/execute/cos/presign-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-ID': COS_MIRROR_USER_ID },
      body: JSON.stringify({
        file_name: uploadFileName,
        content_type: uploadContentType || 'application/octet-stream',
        app_id: COS_APP_ID,
        object_path: COS_OBJECT_PATH,
      }),
    });
    if (!presignResponse.ok) {
      throw new Error(`presign HTTP ${presignResponse.status}`);
    }
    const payload = (await presignResponse.json()) as CosPresignResponse;
    const uploadUrl = String(payload?.data?.upload_url || '').trim();
    if (!uploadUrl) {
      throw new Error('presign response missing upload_url');
    }
    const headers = new Headers(payload?.data?.headers || {});
    headers.set('Content-Type', uploadContentType || 'application/octet-stream');
    const putResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers,
      body: new Uint8Array(bytes),
    });
    if (!putResponse.ok) {
      throw new Error(`cos put HTTP ${putResponse.status}`);
    }
    const downloadUrl = String(
      payload?.data?.url || payload?.data?.signed_url || payload?.data?.public_url || '',
    ).trim();
    if (!downloadUrl) {
      throw new Error('presign response missing download url');
    }
    cosUrlCache.set(localPath, downloadUrl);
    return downloadUrl;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[video-clone-seedance-bff] cos mirror skipped (${fileName}): ${reason}`);
    return null;
  }
}
