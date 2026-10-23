import { fetchWithAuthFallback, readApiData } from './authenticatedFetch';

const APP_ID = 'video-clone-seedance';

export type AssetUploadRequest = {
  fileName?: string;
  objectPath?: string;
  contentType?: string;
};

export type AssetUploadResult = {
  upload_url?: string;
  headers?: Record<string, string>;
  public_url?: string;
  signed_url?: string;
  url?: string;
};

export async function uploadAsset(file: Blob, request: AssetUploadRequest = {}): Promise<AssetUploadResult> {
  const contentType = (request.contentType || file.type || 'application/octet-stream').trim();
  const presignResponse = await fetchWithAuthFallback(
    `/standalone/${APP_ID}/api/execute/cos/presign-upload`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_name: request.fileName,
        object_path: request.objectPath,
        app_id: APP_ID,
        cam_appid: APP_ID,
        content_type: contentType,
      }),
    },
  );
  const presign = await readApiData<AssetUploadResult>(presignResponse, '创建上传地址失败');
  const uploadUrl = String(presign.upload_url || '').trim();
  if (!uploadUrl) {
    throw new Error('上传服务未返回 upload_url。');
  }

  const headers = new Headers(presign.headers || {});
  if (contentType && !headers.has('Content-Type')) {
    headers.set('Content-Type', contentType);
  }
  const uploadResponse = await fetch(uploadUrl, { method: 'PUT', headers, body: file, mode: 'cors' });
  if (!uploadResponse.ok) {
    const message = (await uploadResponse.text()).replace(/\s+/g, ' ').trim().slice(0, 240);
    throw new Error(`素材上传失败（HTTP ${uploadResponse.status}）：${message || uploadResponse.statusText}`);
  }
  return presign;
}
