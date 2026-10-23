import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

const HOST = '127.0.0.1';
const PORT = Number(process.env.KLING_NETWORK_BRIDGE_PORT || 3379);
const MAX_REQUEST_BYTES = 40 * 1024 * 1024;
const ASSET_TTL_MS = 2 * 60 * 60 * 1000;
const TUNNEL_START_TIMEOUT_MS = 45_000;
const ELEVENLABS_API_BASE_URL = 'https://api.elevenlabs.io/v1';

const assets = new Map();
let assetServer = null;
let tunnelProcess = null;
let publicBaseUrl = '';
let tunnelStartupPromise = null;

function loadLocalEnv() {
  try {
    const contents = readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch {
    // Environment variables may already be supplied by the launcher.
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) throw new Error('请求体过大');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function errorDetail(error) {
  return error?.cause?.code || error?.cause?.message || error?.message || 'unknown';
}

function parseApiErrorMessage(text, fallback) {
  try {
    const payload = JSON.parse(String(text || ''));
    return String(payload?.detail?.message || payload?.detail || payload?.message || fallback);
  } catch {
    return String(text || '').trim() || fallback;
  }
}

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+)?;base64,(.+)$/is);
  if (!match) return null;
  return {
    mimeType: match[1] || 'application/octet-stream',
    bytes: Buffer.from(match[2], 'base64'),
  };
}

function parseRange(rangeHeader, size) {
  const match = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/i);
  if (!match) return null;
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

function createAssetServer() {
  return createServer((request, response) => {
    const pathname = String(request.url || '').split('?')[0];
    const token = decodeURIComponent(pathname.replace(/^\/kling-media\//, ''));
    const asset = assets.get(token);
    if (!pathname.startsWith('/kling-media/') || !asset || asset.expiresAt <= Date.now()) {
      response.writeHead(404).end('Not found');
      return;
    }

    const range = parseRange(request.headers.range, asset.bytes.length);
    const headers = {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=7200, immutable',
      'Content-Type': asset.mimeType,
    };
    if (range) {
      const chunk = asset.bytes.subarray(range.start, range.end + 1);
      response.writeHead(206, {
        ...headers,
        'Content-Length': chunk.length,
        'Content-Range': `bytes ${range.start}-${range.end}/${asset.bytes.length}`,
      });
      request.method === 'HEAD' ? response.end() : response.end(chunk);
      return;
    }

    response.writeHead(200, { ...headers, 'Content-Length': asset.bytes.length });
    request.method === 'HEAD' ? response.end() : response.end(asset.bytes);
  });
}

async function ensureAssetTunnel() {
  if (publicBaseUrl) return publicBaseUrl;
  if (tunnelStartupPromise) return tunnelStartupPromise;

  tunnelStartupPromise = (async () => {
    const executable = process.env.CLOUDFLARED_PATH || path.resolve(process.cwd(), '.tools/cloudflared.exe');
    if (!existsSync(executable)) throw new Error(`缺少临时素材通道程序：${executable}`);

    assetServer = createAssetServer();
    await new Promise((resolve, reject) => {
      assetServer.once('error', reject);
      assetServer.listen(0, HOST, resolve);
    });
    const address = assetServer.address();
    if (!address || typeof address === 'string') throw new Error('无法启动本地素材服务');

    tunnelProcess = spawn(executable, [
      'tunnel',
      '--protocol',
      'http2',
      '--edge-ip-version',
      '4',
      '--url',
      `http://${HOST}:${address.port}`,
      '--no-autoupdate',
    ], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    return await new Promise((resolve, reject) => {
      let tunnelOutput = '';
      let settled = false;
      const finishError = (message) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(new Error(message));
      };
      const timeout = setTimeout(() => finishError(`启动临时 HTTPS 素材通道超时：${tunnelOutput.slice(-800)}`), TUNNEL_START_TIMEOUT_MS);
      const consume = (chunk) => {
        tunnelOutput = `${tunnelOutput}${chunk.toString('utf8')}`.slice(-16_000);
        const candidates = tunnelOutput.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi) || [];
        const publicTunnelUrl = candidates.find(candidate => new URL(candidate).hostname.toLowerCase() !== 'api.trycloudflare.com');
        if (!publicTunnelUrl || settled) return;
        settled = true;
        clearTimeout(timeout);
        publicBaseUrl = publicTunnelUrl.replace(/\/$/, '');
        resolve(publicBaseUrl);
      };
      tunnelProcess.stdout.on('data', consume);
      tunnelProcess.stderr.on('data', consume);
      tunnelProcess.once('error', error => finishError(`无法启动临时 HTTPS 素材通道：${error.message}`));
      tunnelProcess.once('exit', code => {
        if (!publicBaseUrl) finishError(`临时 HTTPS 素材通道已退出（代码 ${code ?? 'unknown'}）：${tunnelOutput.slice(-800)}`);
      });
    });
  })();

  try {
    return await tunnelStartupPromise;
  } catch (error) {
    tunnelStartupPromise = null;
    publicBaseUrl = '';
    tunnelProcess?.kill();
    tunnelProcess = null;
    assetServer?.close();
    assetServer = null;
    throw error;
  }
}

async function publishAsset(dataUrl) {
  const asset = decodeDataUrl(dataUrl);
  if (!asset?.bytes.length) throw new Error('上传素材数据无效');
  const baseUrl = await ensureAssetTunnel();
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
  assets.set(token, { ...asset, expiresAt: Date.now() + ASSET_TTL_MS });
  const publicUrl = `${baseUrl}/kling-media/${token}`;
  await waitForPublicAsset(publicUrl, asset.bytes.length);
  return publicUrl;
}

async function resolveTunnelIpv4(hostname) {
  const endpoints = [
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
    `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=A`,
  ];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) continue;
      const payload = await response.json();
      const addresses = (payload.Answer || [])
        .filter(answer => answer.type === 1 && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(answer.data))
        .map(answer => answer.data);
      if (addresses.length) return addresses;
    } catch {
      // Try the next DNS-over-HTTPS resolver.
    }
  }
  return [];
}

async function probePublicAssetWithCurl(publicUrl) {
  const target = new URL(publicUrl);
  const addresses = await resolveTunnelIpv4(target.hostname);
  let lastError = new Error('公共 DNS 尚未返回临时素材域名');
  for (const address of addresses) {
    try {
      const result = await new Promise((resolve, reject) => {
        const marker = '__ASSET_PROBE__:';
        const child = spawn('curl.exe', [
          '--silent', '--show-error', '--location', '--ipv4',
          '--connect-timeout', '10', '--max-time', '20',
          '--resolve', `${target.hostname}:443:${address}`,
          '--range', '0-1023', '--output', 'NUL',
          '--write-out', `${marker}%{http_code}|%{size_download}`,
          publicUrl,
        ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        const stdout = [];
        const stderr = [];
        child.stdout.on('data', chunk => stdout.push(Buffer.from(chunk)));
        child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)));
        child.once('error', reject);
        child.once('close', code => resolve({
          code: code ?? -1,
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
        }));
      });
      const match = result.stdout.match(/__ASSET_PROBE__:(\d{3})\|(\d+(?:\.\d+)?)/);
      const status = Number(match?.[1] || 0);
      const size = Number(match?.[2] || 0);
      if (result.code === 0 && (status === 200 || status === 206) && size > 0) return true;
      lastError = new Error(result.stderr.trim() || `curl HTTP ${status || 'unknown'}`);
    } catch (error) {
      lastError = error instanceof Error ? error : lastError;
    }
  }
  throw lastError;
}

async function waitForPublicAsset(publicUrl, expectedBytes) {
  let lastError = new Error('临时素材公网地址尚未就绪');
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const probeUrl = new URL(publicUrl);
      probeUrl.searchParams.set('ready', `${Date.now()}-${attempt}`);
      const probe = await fetch(probeUrl, {
        headers: {
          Range: 'bytes=0-1023',
          'Cache-Control': 'no-cache',
        },
        signal: controller.signal,
      });
      const bytes = Buffer.from(await probe.arrayBuffer());
      const contentRange = probe.headers.get('content-range') || '';
      if ((probe.status === 206 || probe.status === 200)
        && bytes.length > 0
        && (!contentRange || contentRange.endsWith(`/${expectedBytes}`))) {
        // Cloudflare may announce a quick tunnel before every edge has the route.
        await new Promise(resolve => setTimeout(resolve, 2_500));
        return;
      }
      lastError = new Error(`临时素材就绪检查返回 HTTP ${probe.status}`);
    } catch (error) {
      lastError = error instanceof Error ? error : lastError;
      try {
        if (await probePublicAssetWithCurl(publicUrl)) {
          await new Promise(resolve => setTimeout(resolve, 2_500));
          return;
        }
      } catch (fallbackError) {
        lastError = fallbackError instanceof Error ? fallbackError : lastError;
      }
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < 8) await new Promise(resolve => setTimeout(resolve, Math.min(1_000 * attempt, 4_000)));
  }
  throw new Error(`临时素材公网地址不可读取：${errorDetail(lastError)}`);
}

loadLocalEnv();

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    return sendJson(response, 200, { ok: true, assetTunnelReady: Boolean(publicBaseUrl) });
  }

  if (request.method === 'POST' && request.url === '/assets/publish') {
    try {
      const payload = await readJson(request);
      const url = await publishAsset(payload.dataUrl);
      return sendJson(response, 200, { url, expiresInSeconds: ASSET_TTL_MS / 1000 });
    } catch (error) {
      return sendJson(response, 502, { message: errorDetail(error) });
    }
  }

  if (request.method === 'POST' && request.url === '/elevenlabs/request') {
    try {
      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) return sendJson(response, 500, { message: '缺少 ELEVENLABS_API_KEY' });
      const payload = await readJson(request);
      const target = new URL(String(payload.url || ''));
      if (target.protocol !== 'https:' || target.hostname !== 'api.elevenlabs.io') {
        return sendJson(response, 400, { message: '目标地址不在 ElevenLabs API 白名单内' });
      }

      const method = payload.method === 'POST' ? 'POST' : 'GET';
      const headers = { 'xi-api-key': apiKey, Accept: '*/*' };
      let body;
      if (method === 'POST') {
        const form = new FormData();
        for (const [key, value] of Object.entries(payload.formFields || {})) {
          form.append(key, String(value ?? ''));
        }
        body = form;
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180_000);
      try {
        const upstream = await fetch(target, { method, headers, body, signal: controller.signal });
        const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
        if (payload.responseType === 'binary' && upstream.ok) {
          const bytes = Buffer.from(await upstream.arrayBuffer());
          return sendJson(response, 200, {
            ok: true,
            status: upstream.status,
            contentType,
            base64: bytes.toString('base64'),
          });
        }
        return sendJson(response, 200, {
          ok: upstream.ok,
          status: upstream.status,
          contentType,
          text: await upstream.text(),
        });
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      return sendJson(response, 502, { message: errorDetail(error) });
    }
  }

  if (request.method === 'POST' && request.url === '/elevenlabs/voice-convert') {
    try {
      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) return sendJson(response, 500, { message: '缺少 ELEVENLABS_API_KEY' });
      const payload = await readJson(request);
      const audio = decodeDataUrl(payload.audioDataUrl);
      const voiceGender = payload.voiceGender === 'male' ? 'male' : 'female';
      if (!audio?.bytes.length) return sendJson(response, 400, { message: '待转换的说话音频无效。' });

      let voiceId = voiceGender === 'female'
        ? String(process.env.ELEVENLABS_FEMALE_VOICE_ID || '').trim()
        : String(process.env.ELEVENLABS_MALE_VOICE_ID || '').trim();
      if (!voiceId) {
        const voicesResponse = await fetch(`${ELEVENLABS_API_BASE_URL}/voices`, {
          headers: { 'xi-api-key': apiKey, Accept: 'application/json' },
          signal: AbortSignal.timeout(30_000),
        });
        const voicesPayload = await voicesResponse.json();
        if (!voicesResponse.ok) {
          return sendJson(response, voicesResponse.status, {
            message: voicesPayload?.detail?.message || voicesPayload?.detail || '读取 ElevenLabs 音色失败。',
          });
        }
        const voices = Array.isArray(voicesPayload?.voices) ? voicesPayload.voices : [];
        const selectedVoice = voices.find(voice => String(voice?.labels?.gender || '').toLowerCase() === voiceGender);
        voiceId = String(selectedVoice?.voice_id || '').trim();
      }
      if (!voiceId) {
        return sendJson(response, 422, {
          message: `当前 ElevenLabs 账号中没有可用的${voiceGender === 'female' ? '女性' : '男性'}音色。`,
        });
      }

      const form = new FormData();
      const extension = audio.mimeType.includes('wav') ? 'wav' : audio.mimeType.includes('mpeg') ? 'mp3' : 'm4a';
      form.append('audio', new Blob([audio.bytes], { type: audio.mimeType }), `speech.${extension}`);
      form.append('model_id', 'eleven_multilingual_sts_v2');
      form.append('voice_settings', JSON.stringify({ stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true }));
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180_000);
      try {
        const upstream = await fetch(
          `${ELEVENLABS_API_BASE_URL}/speech-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
          {
            method: 'POST',
            headers: { 'xi-api-key': apiKey, Accept: 'audio/mpeg' },
            body: form,
            signal: controller.signal,
          },
        );
        if (!upstream.ok) {
          const detail = await upstream.text();
          return sendJson(response, upstream.status, {
            message: parseApiErrorMessage(detail, `ElevenLabs 声线转换失败（HTTP ${upstream.status}）。`),
          });
        }
        const bytes = Buffer.from(await upstream.arrayBuffer());
        return sendJson(response, 200, {
          base64: bytes.toString('base64'),
          contentType: upstream.headers.get('content-type') || 'audio/mpeg',
          voiceGender,
        });
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      return sendJson(response, 502, { message: `转换人物声线失败：${errorDetail(error)}` });
    }
  }

  if (request.method === 'POST' && request.url === '/elevenlabs/binary') {
    try {
      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) return sendJson(response, 500, { message: '缺少 ELEVENLABS_API_KEY' });
      const payload = await readJson(request);
      const target = new URL(String(payload.url || ''));
      if (target.protocol !== 'https:' || target.hostname !== 'api.elevenlabs.io') {
        return sendJson(response, 400, { message: '目标地址不在 ElevenLabs API 白名单内' });
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180_000);
      try {
        const upstream = await fetch(target, {
          headers: { 'xi-api-key': apiKey, Accept: '*/*' },
          signal: controller.signal,
        });
        const bytes = Buffer.from(await upstream.arrayBuffer());
        response.writeHead(upstream.status, {
          'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
          'Content-Length': String(bytes.byteLength),
          'Cache-Control': 'no-store',
        });
        return response.end(bytes);
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      return sendJson(response, 502, { message: errorDetail(error) });
    }
  }

  if (request.method !== 'POST' || request.url !== '/request') {
    return sendJson(response, 404, { message: 'Not found' });
  }

  try {
    const apiKey = process.env.KLING_API_KEY;
    if (!apiKey) return sendJson(response, 500, { message: '缺少 KLING_API_KEY' });

    const payload = await readJson(request);
    const target = new URL(String(payload.url || ''));
    const allowedHostname = new URL(process.env.KLING_API_BASE_URL || 'https://api-beijing.klingai.com').hostname;
    if (target.protocol !== 'https:' || target.hostname !== allowedHostname) {
      return sendJson(response, 400, { message: '目标地址不在可灵 API 白名单内' });
    }

    const method = payload.method === 'GET' ? 'GET' : 'POST';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);
    try {
      const upstream = await fetch(target, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: method === 'POST' ? String(payload.body || '{}') : undefined,
        signal: controller.signal,
      });
      const text = await upstream.text();
      return sendJson(response, 200, { ok: upstream.ok, status: upstream.status, text });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return sendJson(response, 502, { message: errorDetail(error) });
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Kling network bridge ready at http://${HOST}:${PORT}\n`);
});

function shutdown() {
  tunnelProcess?.kill();
  assetServer?.close();
  server.close(() => process.exit(0));
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, shutdown);

setInterval(() => {
  const now = Date.now();
  for (const [token, asset] of assets) {
    if (asset.expiresAt <= now) assets.delete(token);
  }
}, 10 * 60 * 1000).unref();
