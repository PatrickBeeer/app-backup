import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, writeSync } from 'node:fs';
import { createConnection } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const NODE = process.execPath;
const LOG_DIR = path.join(ROOT, '.run');

mkdirSync(LOG_DIR, { recursive: true });

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.setTimeout(800, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function launch(logName, args) {
  const logPath = path.join(LOG_DIR, logName);
  const fd = openSync(logPath, 'a');
  writeSync(fd, `\n===== ${new Date().toISOString()} start: ${args.join(' ')} =====\n`);
  const child = spawn(NODE, args, {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', fd, fd],
  });
  child.unref();
  return child.pid;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function isTunnelAlive() {
  const file = path.join(LOG_DIR, 'public-asset-base-url');
  if (!existsSync(file)) return false;
  const base = readFileSync(file, 'utf8').trim();
  if (!base) return false;
  try {
    const res = await fetch(`${base}/`, { signal: AbortSignal.timeout(12000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function main() {
  const targets = [
    { name: 'BFF  9896', port: 9896, log: 'bff.log', args: ['node_modules/tsx/dist/cli.mjs', 'server/server.ts'] },
    { name: 'VITE 5173', port: 5173, log: 'vite.log', args: ['node_modules/vite/bin/vite.js', '--port', '5173', '--strictPort'] },
  ];

  for (const target of targets) {
    if (await isPortOpen(target.port)) {
      console.log(`${target.name} : already running, skip`);
      continue;
    }
    const pid = launch(target.log, target.args);
    console.log(`${target.name} : started (pid ${pid})`);
  }

  // cloudflared tunnel: CPRT needs a public HTTPS url to read local assets.
  // Only restart when unreachable, so the existing domain (and asset urls) survive.
  if (await isTunnelAlive()) {
    console.log('TUNNEL     : alive, keep current domain');
  } else {
    spawnSync('taskkill', ['/IM', 'cloudflared.exe', '/F'], { stdio: 'ignore' });
    const pid = launch('tunnel.log', ['node_modules/tsx/dist/cli.mjs', 'server/tunnel.ts']);
    console.log(`TUNNEL     : restarted (pid ${pid})`);
  }

  for (let i = 0; i < 20; i += 1) {
    await sleep(1000);
    const bff = await isPortOpen(9896);
    const vite = await isPortOpen(5173);
    if (bff && vite) {
      console.log(`READY      : BFF 9896 + Vite 5173 both up (t+${i + 1}s)`);
      return;
    }
  }
  console.log('WARN       : not all ports came up, check .run/bff.log and .run/vite.log');
}

main();
