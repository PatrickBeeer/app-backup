// Kling 资产隧道（Linux 版）：用 cloudflared 把本地 HTTP 素材服务暴露成公网 HTTPS URL，
// 用来把 data: URL（Base64 视频/图片）发布成 Kling API 可访问的公网地址。
//
// 懒启动：构造器只做配置，assetServer + cloudflared 在首次 publishDataUrl 时才启动。
// 这样 vite build 加载插件时不会占用端口；只有 BFF 实际发布素材时才启动隧道。
//
// 工作流程：
// 1. publishDataUrl(dataUrl) 首次调用 → ensureStarted() → 启动 assetServer + cloudflared。
// 2. cloudflared 从 stderr 输出 trycloudflare.com 公网 URL。
// 3. publishDataUrl 解码 Base64 → 写入磁盘 → 返回 `${tunnelUrl}/asset/<uuid>`。

import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const ASSET_DIR = path.join(process.cwd(), '.run', 'kling-assets');
const TUNNEL_START_TIMEOUT_MS = 45_000;

interface AssetEntry {
  fileName: string;
  contentType: string;
  filePath: string;
}

export class KlingAssetTunnel {
  private readonly assetDir: string;
  private readonly assetPort: number;
  private readonly registry = new Map<string, AssetEntry>();
  private assetServer: ReturnType<typeof createServer> | null = null;
  private tunnel: ChildProcess | null = null;
  private publishedUrl = '';
  private startupPromise: Promise<string> | null = null;

  constructor(options: { assetPort: number; assetDir?: string }) {
    this.assetPort = options.assetPort;
    this.assetDir = options.assetDir ?? ASSET_DIR;
    fs.mkdirSync(this.assetDir, { recursive: true });
  }

  private receiveOutput(chunk: Buffer): void {
    const text = chunk.toString('utf8');
    process.stdout.write(text);
    if (this.publishedUrl) return;
    const match = text.match(/https:\/\/[-a-z0-9]+\.trycloudflare\.com/i);
    if (!match) return;
    this.publishedUrl = match[0];
    console.log(`[kling-asset-tunnel] public URL ready: ${this.publishedUrl}`);
  }

  getPublicBaseUrl(): string {
    return this.publishedUrl;
  }

  isReady(): boolean {
    return Boolean(this.publishedUrl);
  }

  async publishDataUrl(dataUrl: string): Promise<string> {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) throw new Error('素材不是有效的 Base64 data: URL。');
    const contentType = match[1];
    const bytes = Buffer.from(match[2], 'base64');
    return await this.publishBuffer(bytes, contentType);
  }

  /** 把内存中的素材写入本地并返回公网地址（与 publishDataUrl 同一套 registry / 静态服务）。 */
  async publishBuffer(bytes: Buffer, contentType: string): Promise<string> {
    const baseUrl = await this.ensureStarted();
    const id = randomUUID();
    const ext = contentType.split('/')[1]?.split('+')[0] || 'bin';
    const fileName = `${id}.${ext}`;
    const filePath = path.join(this.assetDir, fileName);
    fs.writeFileSync(filePath, bytes);
    this.registry.set(id, { fileName, contentType, filePath });
    return `${baseUrl}/asset/${id}`;
  }

  private async ensureStarted(): Promise<string> {
    if (this.publishedUrl) return this.publishedUrl;
    if (!this.startupPromise) this.startupPromise = this.startTunnel();
    try {
      return await this.startupPromise;
    } catch (error) {
      this.startupPromise = null;
      throw error;
    }
  }

  private async startTunnel(): Promise<string> {
    this.assetServer = createServer((req, res) => this.serveAsset(req, res));
    await new Promise<void>((resolve, reject) => {
      this.assetServer!.once('error', reject);
      this.assetServer!.listen(this.assetPort, '127.0.0.1', resolve);
    });
    console.log(`[kling-asset-tunnel] asset server listening on http://127.0.0.1:${this.assetPort}`);

    this.tunnel = spawn('cloudflared', ['tunnel', '--url', `http://127.0.0.1:${this.assetPort}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false,
    });
    this.tunnel.stdout?.on('data', (chunk: Buffer) => this.receiveOutput(chunk));
    this.tunnel.stderr?.on('data', (chunk: Buffer) => this.receiveOutput(chunk));
    this.tunnel.on('error', (error) => {
      console.error(`[kling-asset-tunnel] cloudflared error: ${error.message}`);
    });
    this.tunnel.on('exit', (code) => {
      console.log(`[kling-asset-tunnel] cloudflared exited (code=${code ?? '?'})`);
    });

    return await new Promise<string>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('启动 cloudflared 临时素材隧道超时（45s）。'));
        }
      }, TUNNEL_START_TIMEOUT_MS);
      const check = () => {
        if (this.publishedUrl && !settled) {
          settled = true;
          clearTimeout(timeout);
          // 关键：URL 打印出来 ≠ 公网已可访问（DNS 尚未生效、边缘连接尚未注册，
          // 实测存在数秒空窗，期间下载会 Bad Gateway/ENOTFOUND，上游会误报
          // FormatUnsupported / DownloadFailed）。对外探测成功后才返回 URL。
          this.probeTunnelReady(this.publishedUrl, TUNNEL_START_TIMEOUT_MS)
            .then(resolve)
            .catch(reject);
          return;
        }
        setTimeout(check, 200);
      };
      check();
    });
  }

  /**
   * 从公网侧探测隧道 URL：拿到任意 HTTP 响应（含 404）即视为
   * DNS + Cloudflare 边缘 + 隧道链路全部打通。
   */
  private async probeTunnelReady(url: string, timeoutMs: number): Promise<string> {
    const startedAt = Date.now();
    for (;;) {
      try {
        const response = await fetch(`${url}/__tunnel_ready__`);
        if (response.status > 0) return url;
      } catch {
        // ENOTFOUND / ECONNRESET：DNS 尚未生效或边缘连接尚未注册，继续重试。
      }
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error('cloudflared 临时素材隧道在超时时间内仍无法从公网访问。');
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  private serveAsset(req: IncomingMessage, res: ServerResponse): void {
    const routeUrl = String(req.url || '').split('?')[0] || '/';
    if (req.method !== 'GET' || !routeUrl.startsWith('/asset/')) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    const id = decodeURIComponent(routeUrl.slice('/asset/'.length));
    const entry = this.registry.get(id);
    if (!entry || !fs.existsSync(entry.filePath)) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    const stat = fs.statSync(entry.filePath);
    res.statusCode = 200;
    res.setHeader('Content-Type', entry.contentType);
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Cache-Control', 'private, max-age=3600');
    fs.createReadStream(entry.filePath).pipe(res);
  }

  close(): void {
    try { this.tunnel?.kill(); } catch { /* ignore */ }
    try { this.assetServer?.close(); } catch { /* ignore */ }
    this.tunnel = null;
    this.assetServer = null;
    this.startupPromise = null;
    this.publishedUrl = '';
  }
}
