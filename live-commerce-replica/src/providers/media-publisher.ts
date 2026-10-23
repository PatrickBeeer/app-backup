import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { PlatformClient } from './platformClient.js';

/**
 * 媒体发布器：把本服务生成的本地文件转成视频生成 API 可拉取的公共 HTTPS URL。
 *
 * 实现策略二选一：
 * - `PlatformMediaPublisher`：经 app-manager 调用 api-manager 的 COS presign 上传，
 *   返回 24h 有效的 signed_url。生产环境默认走这条；COS 凭证由 api-manager
 *   服务端持有，本应用不接触。
 * - `PublicBaseMediaPublisher`：本服务已经过反向代理或隧道暴露在公网时使用，
 *   直接拼 `${publicBaseUrl}/media/<relative>`，零上传。仅作开发兜底。
 *
 * `publish` 第二个参数 `auth` 是请求方携带的 `Authorization: Bearer <JWT>`，
 * 用于经 app-manager 上传时识别用户身份（决定 COS 对象 key 的 user_storage 前缀）。
 */
export interface MediaPublisher {
  publish(localPath: string, auth: string): Promise<string>;
}

export class PublicBaseMediaPublisher implements MediaPublisher {
  private readonly dataDir: string;
  private readonly publicBaseUrl: string;

  constructor(dataDir: string, publicBaseUrl: string) {
    this.dataDir = path.resolve(dataDir);
    this.publicBaseUrl = publicBaseUrl.replace(/\/$/, '');
  }

  async publish(localPath: string, _auth: string): Promise<string> {
    const resolved = path.resolve(localPath);
    const relative = path.relative(this.dataDir, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('只能发布项目媒体目录中的文件');
    }
    const encoded = relative.split(path.sep).map(encodeURIComponent).join('/');
    return `${this.publicBaseUrl}/media/${encoded}`;
  }
}

export interface PlatformMediaPublisherConfig {
  platformClient: PlatformClient;
  /** COS 对象 key 前缀（在 user_storage/<userID>/ 之下）。 */
  objectPathPrefix: string;
}

function contentTypeFor(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.mp4') return 'video/mp4';
  if (extension === '.webm') return 'video/webm';
  if (extension === '.mov') return 'video/quicktime';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.m4a') return 'audio/mp4';
  return 'application/octet-stream';
}

export class PlatformMediaPublisher implements MediaPublisher {
  constructor(private readonly config: PlatformMediaPublisherConfig) {}

  async publish(localPath: string, auth: string): Promise<string> {
    if (!auth) throw new Error('真实生成需要登录态：缺少 Authorization 头');
    const buffer = await readFile(localPath);
    const contentType = contentTypeFor(localPath);
    const safeName = path.basename(localPath).replace(/[^\p{L}\p{N}._-]+/gu, '-');
    const objectPath = `${this.config.objectPathPrefix.replace(/^\/+|\/+$/g, '')}/${Date.now()}-${safeName}`;
    const presign = await this.config.platformClient.presignCOSUpload(
      { fileName: safeName, contentType, objectPath },
      auth
    );
    return this.config.platformClient.uploadBytes(presign, buffer, contentType);
  }
}

export class MissingMediaPublisher implements MediaPublisher {
  async publish(_localPath: string, _auth: string): Promise<string> {
    throw new Error('真实生成需要配置 MEDIA_PUBLIC_BASE_URL 或登录后使用 COS 上传');
  }
}
