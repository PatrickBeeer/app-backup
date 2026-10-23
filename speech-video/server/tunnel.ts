import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';

const child = spawn('cloudflared', ['tunnel', '--url', `http://127.0.0.1:${config.assetPort}`], { stdio: ['ignore', 'pipe', 'pipe'] });
function receive(chunk: Buffer): void {
  const text = chunk.toString();
  process.stdout.write(text);
  const url = text.match(/https:\/\/[-a-z0-9]+\.trycloudflare\.com/i)?.[0];
  if (url) {
    fs.mkdirSync(path.dirname(config.baseUrlFile), { recursive: true });
    fs.writeFileSync(config.baseUrlFile, url);
  }
}
child.stdout.on('data', receive);
child.stderr.on('data', receive);
child.on('exit', () => { fs.rmSync(config.baseUrlFile, { force: true }); });
process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());
