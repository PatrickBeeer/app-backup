/**
 * 镜刻 → 平台后端 的 HTTP 客户端。
 *
 * 目前只承担 COS presign + 直传一个用途：把本地素材文件经 app-manager
 * 转发到 api-manager，由 api-manager 凭服务端配置的 `cos_setting.cam_api_key`
 * / `cos_setting.bucket` 签出 24h 有效的 COS 预签名上传 URL，浏览器（或本服务）
 * 再把字节直接 PUT 到 COS。返回的 signed_url 即作为素材公共 URL 交给 CPRT。
 *
 * CPRT（视频生成）与 DeepSeek（口播改写）不经过本客户端——按当前项目约定，
 * 这两个外部 API 由本应用直接持有 Key 调用，不路由到 app-manager。
 */

export interface PlatformClientConfig {
  /** 网关入口，例如 http://127.0.0.1:80 或 https://www.aiunity.shop。 */
  gatewayOrigin: string;
  /** 独立应用 ID，与 app_manager.app_catalog 中的注册一致。 */
  appID: string;
  /** 单次 HTTP 超时（毫秒）。 */
  timeoutMs?: number;
}

export interface PresignCOSUploadRequest {
  fileName: string;
  contentType: string;
  /** COS 对象 key 的路径前缀，如 `standalone/live-commerce-replica/jingke/<projectId>`。 */
  objectPath: string;
  /** 独立应用 ID（覆盖默认）。 */
  appID?: string;
  /** 可选：指定具体 COS bucket，留空则用 api-manager 服务端默认。 */
  bucketName?: string;
  /** 可选：指定具体 COS region，留空则用 api-manager 服务端默认。 */
  region?: string;
}

// 字段名与 api-manager `PresignCOSUploadResult` (cos_asset_service.go) 的
// JSON tag 对齐——服务端返回 snake_case，这里不能用 camelCase，否则
// presign.upload_url 会解析成 undefined，fetch 报 "Failed to parse URL from undefined"。
export interface PresignCOSUploadResult {
  bucket_name: string;
  region: string;
  object_key: string;
  public_url: string;
  signed_url: string;
  upload_url: string;
  url: string;
  headers?: Record<string, string>;
}

interface ApiManagerEnvelope<T> {
  code?: number;
  message?: string;
  success?: boolean;
  data?: T;
  error?: string;
}

function unwrapEnvelope<T>(payload: ApiManagerEnvelope<T>, fallbackMessage: string): T {
  if (payload && typeof payload === 'object' && 'data' in payload && payload.data !== undefined && payload.data !== null) {
    const code = payload.code;
    const success = payload.success;
    if ((code === undefined || code === 0) && success !== false) {
      return payload.data as T;
    }
  }
  const message = (payload && (payload.message || payload.error)) || fallbackMessage;
  throw new Error(message);
}

export class PlatformClient {
  private readonly gatewayOrigin: string;
  private readonly appID: string;
  private readonly timeoutMs: number;

  constructor(config: PlatformClientConfig) {
    this.gatewayOrigin = config.gatewayOrigin.replace(/\/$/, '');
    this.appID = config.appID;
    this.timeoutMs = config.timeoutMs ?? 120000;
  }

  /**
   * 向 app-manager 申请 COS 预签名上传 URL。
   *
   * 网关路径 `/standalone/<appID>/api/execute/cos/presign-upload` →
   * app-manager `standaloneExecuteCOSPresignUpload` → api-manager
   * `PresignUploadObject`。需要请求方携带用户的 `Authorization: Bearer
   * <JWT>`，否则 `resolveRequesterUserID` 解析为 0，对象 key 会落到
   * `user_storage/anonymous/...`、计费无法归属到真实用户。
   */
  async presignCOSUpload(req: PresignCOSUploadRequest, auth: string): Promise<PresignCOSUploadResult> {
    const url = `${this.gatewayOrigin}/standalone/${this.appID}/api/execute/cos/presign-upload`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: auth } : {})
      },
      body: JSON.stringify({
        file_name: req.fileName,
        content_type: req.contentType,
        object_path: req.objectPath,
        app_id: req.appID ?? this.appID,
        ...(req.bucketName ? { bucket_name: req.bucketName } : {}),
        ...(req.region ? { region: req.region } : {})
      }),
      signal: AbortSignal.timeout(this.timeoutMs)
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`COS presign 失败（${response.status}）：${text || response.statusText}`);
    }

    const envelope = (await response.json()) as ApiManagerEnvelope<PresignCOSUploadResult>;
    return unwrapEnvelope(envelope, 'COS presign 返回无效响应');
  }

  /**
   * 用预签名 URL 直接把字节 PUT 到 COS。
   * 返回可用于视频生成 API 拉取的 signed_url（24h 内有效）。
   */
  async uploadBytes(presign: PresignCOSUploadResult, body: Buffer, contentType: string): Promise<string> {
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      ...(presign.headers ?? {})
    };
    const response = await fetch(presign.upload_url, {
      method: 'PUT',
      headers,
      body: body as BodyInit,
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`COS 直传失败（${response.status}）：${text || response.statusText}`);
    }
    return presign.signed_url || presign.public_url || presign.url;
  }
}
