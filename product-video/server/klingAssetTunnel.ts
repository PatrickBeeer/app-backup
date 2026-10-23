import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

const ASSET_TTL_MS = 2 * 60 * 60 * 1000;
const TUNNEL_START_TIMEOUT_MS = 45_000;

type TemporaryAsset = {
  bytes: Buffer;
  mimeType: string;
  expiresAt: number;
};

function parseRange(rangeHeader: string | undefined, size: number): { start: number; end: number } | null {
  const match = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/i);
  if (!match) return null;
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

export function decodeDataUrl(dataUrl: string): { bytes: Buffer; mimeType: string } | null {
  const match = dataUrl.match(/^data:([^;,]+)?;base64,(.+)$/is);
  if (!match) return null;
  return {
    mimeType: match[1] || 'application/octet-stream',
    bytes: Buffer.from(match[2], 'base64'),
  };
}

export class KlingAssetTunnel {
  private readonly assets = new Map<string, TemporaryAsset>();
  private assetServer: Server | null = null;
  private tunnelProcess: ChildProcessWithoutNullStreams | null = null;
  private publicBaseUrl = '';
  private startupPromise: Promise<string> | null = null;

  constructor(private readonly env: Record<string, string>) {
    this.publicBaseUrl = String(env.KLING_PUBLIC_ASSET_BASE_URL || '').replace(/\/$/, '');
    const cleanupTimer = setInterval(() => this.cleanupExpired(), 10 * 60 * 1000);
    cleanupTimer.unref();
  }

  async publishDataUrl(dataUrl: string): Promise<string> {
    const asset = decodeDataUrl(dataUrl);
    if (!asset?.bytes.length) throw new Error('参考视频数据无效，无法创建临时地址。');
    const baseUrl = await this.ensurePublicBaseUrl();
    const extension = asset.mimeType.includes('video')
      ? 'mp4'
      : asset.mimeType.includes('audio/mpeg')
        ? 'mp3'
        : asset.mimeType.includes('audio/wav')
          ? 'wav'
          : asset.mimeType.includes('audio/mp4') || asset.mimeType.includes('audio/aac')
            ? 'm4a'
            : asset.mimeType.includes('audio')
              ? 'm4a'
              : asset.mimeType.includes('png')
                ? 'png'
                : asset.mimeType.includes('webp')
                  ? 'webp'
                  : 'jpg';
    const token = `${randomUUID()}.${extension}`;
    this.assets.set(token, { ...asset, expiresAt: Date.now() + ASSET_TTL_MS });
    return `${baseUrl}/kling-media/${token}`;
  }

  close(): void {
    this.tunnelProcess?.kill();
    this.tunnelProcess = null;
    this.assetServer?.close();
    this.assetServer = null;
    this.assets.clear();
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [token, asset] of this.assets) {
      if (asset.expiresAt <= now) this.assets.delete(token);
    }
  }

  private async ensurePublicBaseUrl(): Promise<string> {
    if (this.publicBaseUrl) return this.publicBaseUrl;
    if (!this.startupPromise) this.startupPromise = this.startTunnel();
    try {
      return await this.startupPromise;
    } catch (error) {
      this.startupPromise = null;
      throw error;
    }
  }

  private async startTunnel(): Promise<string> {
    const executable = this.env.CLOUDFLARED_PATH || path.resolve(process.cwd(), '.tools/cloudflared.exe');
    if (!existsSync(executable)) {
      throw new Error(`缺少本地临时隧道程序：${executable}。请重新启动安装后的本地服务。`);
    }

    const assetServer = createServer((req, res) => {
      const token = decodeURIComponent(String(req.url || '').split('?')[0].replace(/^\/kling-media\//, ''));
      const asset = this.assets.get(token);
      if (!req.url?.startsWith('/kling-media/') || !asset || asset.expiresAt <= Date.now()) {
        res.writeHead(404).end('Not found');
        return;
      }

      const range = parseRange(req.headers.range, asset.bytes.length);
      const headers: Record<string, string | number> = {
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=7200, immutable',
        'Content-Type': asset.mimeType,
      };
      if (range) {
        const chunk = asset.bytes.subarray(range.start, range.end + 1);
        res.writeHead(206, {
          ...headers,
          'Content-Length': chunk.length,
          'Content-Range': `bytes ${range.start}-${range.end}/${asset.bytes.length}`,
        });
        if (req.method === 'HEAD') res.end(); else res.end(chunk);
        return;
      }

      res.writeHead(200, { ...headers, 'Content-Length': asset.bytes.length });
      if (req.method === 'HEAD') res.end(); else res.end(asset.bytes);
    });

    await new Promise<void>((resolve, reject) => {
      assetServer.once('error', reject);
      assetServer.listen(0, '127.0.0.1', () => resolve());
    });
    this.assetServer = assetServer;
    const address = assetServer.address();
    if (!address || typeof address === 'string') throw new Error('无法启动本地临时素材服务。');

    const child = spawn(executable, [
      'tunnel',
      '--protocol',
      'http2',
      '--edge-ip-version',
      '4',
      '--url',
      `http://127.0.0.1:${address.port}`,
      '--no-autoupdate',
    ], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.tunnelProcess = child;

    return await new Promise<string>((resolve, reject) => {
      let tunnelOutput = '';
      let settled = false;
      const fail = (prefix: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        const detail = tunnelOutput.trim().slice(-1200);
        reject(new Error(`${prefix}${detail ? `：${detail}` : ''}`));
      };
      const timeout = setTimeout(
        () => fail('启动临时 HTTPS 素材通道超时'),
        TUNNEL_START_TIMEOUT_MS,
      );
      const consume = (chunk: Buffer) => {
        tunnelOutput = `${tunnelOutput}${chunk.toString('utf8')}`.slice(-16_000);
        const candidates = tunnelOutput.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi) || [];
        const publicTunnelUrl = candidates.find(candidate => {
          try {
            return new URL(candidate).hostname.toLowerCase() !== 'api.trycloudflare.com';
          } catch {
            return false;
          }
        });
        if (!publicTunnelUrl || settled) return;
        settled = true;
        clearTimeout(timeout);
        this.publicBaseUrl = publicTunnelUrl.replace(/\/$/, '');
        resolve(this.publicBaseUrl);
      };
      child.stdout.on('data', consume);
      child.stderr.on('data', consume);
      child.once('error', error => {
        fail(`无法启动临时 HTTPS 素材通道：${error.message}`);
      });
      child.once('exit', code => {
        if (this.publicBaseUrl) return;
        fail(`临时 HTTPS 素材通道已退出（代码 ${code ?? 'unknown'}）`);
      });
    });
  }
}
