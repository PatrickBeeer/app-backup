import { fetchWithAuthFallback, readApiData } from './authenticatedFetch';

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
  const uploadResponse = await fetchWithAuthFallback(
    '/standalone/video-clone-seedance-v2/api/execute/local-assets',
    {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        // Headers 只接受 ISO-8859-1 码位，中文文件名必须先编码，服务端再解码。
        'X-File-Name': encodeURIComponent(request.fileName || 'asset'),
      },
      body: file,
    },
  );
  return readApiData<AssetUploadResult>(uploadResponse, '本地素材上传失败');
}
