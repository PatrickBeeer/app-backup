import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { config } from './config';
import { RequestValidationError } from './validation';

const MAX_ASSET_BYTES = 55 * 1024 * 1024;
const SUPPORTED_CONTENT_TYPE_PREFIXES = ['image/', 'video/', 'audio/'];

export type LocalAsset = {
  fileName: string;
  contentType: string;
  filePath: string;
};

function sanitizeFileName(value: string): string {
  const baseName = path.basename(value).replace(/[^a-zA-Z0-9._-]/g, '_');
  return baseName.slice(0, 160) || 'asset';
}

function isSupportedContentType(contentType: string): boolean {
  return SUPPORTED_CONTENT_TYPE_PREFIXES.some((prefix) => contentType.startsWith(prefix));
}

export function detectedImageType(bytes: Uint8Array): { contentType: string; extension: string } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: 'image/jpeg', extension: '.jpg' };
  }
  if (bytes.length >= 8 && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { contentType: 'image/png', extension: '.png' };
  }
  return null;
}

export async function readBinaryBody(request: AsyncIterable<Buffer | Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > MAX_ASSET_BYTES) {
      throw new RequestValidationError('上传文件不能超过 55MB。', 413);
    }
    chunks.push(buffer);
  }
  if (totalBytes === 0) {
    throw new RequestValidationError('上传文件不能为空。', 400);
  }
  return Buffer.concat(chunks);
}

export function saveLocalAsset(fileName: string, contentType: string, contents: Buffer): LocalAsset {
  let normalizedContentType = contentType.trim().toLowerCase();
  if (!isSupportedContentType(normalizedContentType)) {
    throw new RequestValidationError('只支持上传图片、视频或音频文件。', 400);
  }
  let safeName = sanitizeFileName(fileName);
  const detected = normalizedContentType.startsWith('image/') ? detectedImageType(contents) : null;
  if (detected) {
    normalizedContentType = detected.contentType;
    const extension = path.extname(safeName).toLowerCase();
    if (extension !== detected.extension && !(detected.extension === '.jpg' && extension === '.jpeg')) {
      safeName = `${(extension ? safeName.slice(0, -extension.length) : safeName).slice(0, 160 - detected.extension.length)}${detected.extension}`;
    }
  }
  fs.mkdirSync(config.assetStorageDir, { recursive: true });
  const filePath = path.join(config.assetStorageDir, `${crypto.randomUUID()}-${safeName}`);
  fs.writeFileSync(filePath, contents, { flag: 'wx' });
  return { fileName: safeName, contentType: normalizedContentType, filePath };
}

export function findLocalAsset(assetFileName: string): LocalAsset | null {
  const safeName = path.basename(assetFileName);
  if (!/^[a-f0-9-]{36}-[a-zA-Z0-9._-]{1,160}$/.test(safeName)) {
    return null;
  }
  const filePath = path.join(config.assetStorageDir, safeName);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return null;
  }
  const inferredContentType = contentTypeFromFileName(safeName);
  let imageType: ReturnType<typeof detectedImageType> = null;
  if (inferredContentType.startsWith('image/')) {
    const descriptor = fs.openSync(filePath, 'r');
    try {
      const header = Buffer.alloc(8);
      imageType = detectedImageType(header.subarray(0, fs.readSync(descriptor, header, 0, header.length, 0)));
    } finally {
      fs.closeSync(descriptor);
    }
  }
  return { fileName: safeName.slice(37), contentType: imageType?.contentType || inferredContentType, filePath };
}

function contentTypeFromFileName(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  const types: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg',
  };
  return types[extension] || 'application/octet-stream';
}

export function getPublicAssetBaseUrl(): string {
  const configured = String(process.env.PUBLIC_ASSET_BASE_URL || '').trim();
  if (configured) {
    return configured.replace(/\/$/, '');
  }
  try {
    return fs.readFileSync(config.publicAssetBaseUrlFile, 'utf8').trim().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function localAssetUrl(asset: LocalAsset): string {
  return `http://127.0.0.1:${config.assetPort}/assets/${encodeURIComponent(path.basename(asset.filePath))}`;
}

export function publicAssetUrl(asset: LocalAsset): string {
  const baseUrl = getPublicAssetBaseUrl();
  if (/^https:\/\//i.test(baseUrl)) {
    return `${baseUrl}/assets/${encodeURIComponent(path.basename(asset.filePath))}`;
  }
  // 隧道未启动时回退到本地素材服务：浏览器预览/下载/换声不受影响；
  // 仅「生成」环节（CPRT 需要公网地址）会在校验时给出明确提示。
  return localAssetUrl(asset);
}
