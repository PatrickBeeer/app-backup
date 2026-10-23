import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { config } from './config';

const command = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';

let publishedUrl = '';
let shuttingDown = false;
let tunnel: ChildProcess | null = null;

function receiveOutput(chunk: Buffer): void {
  const text = chunk.toString('utf8');
  process.stdout.write(text);
  const match = text.match(/https:\/\/[-a-z0-9]+\.trycloudflare\.com/i);
  if (!match || publishedUrl) {
    return;
  }
  publishedUrl = match[0];
  fs.mkdirSync(path.dirname(config.publicAssetBaseUrlFile), { recursive: true });
  fs.writeFileSync(config.publicAssetBaseUrlFile, publishedUrl, 'utf8');
  console.log(`[video-clone-seedance] local asset tunnel ready: ${publishedUrl}`);
}

/**
 * cloudflared 会自动更新并退出（auto-update shutdown），quick tunnel 也会偶发断线。
 * 隧道一旦死掉，生成环节就会全挂；这里在意外退出后自动重启，
 * 换新域名并把新地址写回 base-url 文件，让 BFF 的素材地址改写继续可用。
 */
function startTunnel(): void {
  if (shuttingDown) {
    return;
  }
  publishedUrl = '';
  tunnel = spawn(command, ['tunnel', '--url', `http://127.0.0.1:${config.assetPort}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  tunnel.stdout?.on('data', receiveOutput);
  tunnel.stderr?.on('data', receiveOutput);
  tunnel.on('error', (error) => {
    // 二进制不存在等启动失败：重试没有意义，直接退出（与旧行为一致）。
    console.error(`[video-clone-seedance] failed to start cloudflared: ${error.message}`);
    process.exitCode = 1;
  });
  tunnel.on('exit', (code) => {
    try { fs.unlinkSync(config.publicAssetBaseUrlFile); } catch { /* already absent */ }
    if (shuttingDown) {
      if (code && code !== 0) {
        process.exitCode = code;
      }
      return;
    }
    console.warn(`[video-clone-seedance] cloudflared exited (code=${code}), restarting in 3s ...`);
    setTimeout(startTunnel, 3000);
  });
}

startTunnel();

function shutdown(): void {
  shuttingDown = true;
  tunnel?.kill();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
