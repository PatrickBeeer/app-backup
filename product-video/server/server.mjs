import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createServer as createLocalServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';

const APP_ID = 'product-video';
const ELEVENLABS_API_BASE_URL = 'https://api.elevenlabs.io/v1';
const ASSET_TTL_MS = 2 * 60 * 60 * 1000;
const TUNNEL_START_TIMEOUT_MS = 45_000;

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const contents = fs.readFileSync(filePath, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) {
      continue;
    }

    const key = match[1];
    if (process.env[key]) {
      continue;
    }

    process.env[key] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

loadEnvFile(path.resolve(process.cwd(), '.run/product-video.env'));
loadEnvFile(path.resolve(process.cwd(), '.env.local'));
loadEnvFile(path.resolve(process.cwd(), '.env'));

const PORT = Number(process.env.PRODUCT_VIDEO_BACKEND_PORT || process.env.PORT || 9897);
const KLING_API_BASE_URL = String(process.env.KLING_API_BASE_URL || 'https://api-beijing.klingai.com').replace(/\/+$/, '');
const KLING_NETWORK_BRIDGE_URL = String(process.env.KLING_NETWORK_BRIDGE_URL || 'http://127.0.0.1:3379/request').replace(/\/+$/, '');
const KLING_API_KEY = String(process.env.KLING_API_KEY || '').trim();
const ELEVENLABS_API_KEY = String(process.env.ELEVENLABS_API_KEY || '').trim();
const CLOUD_FLARED_PATH = String(process.env.CLOUDFLARED_PATH || '').trim();
const KLING_PUBLIC_ASSET_BASE_URL = String(process.env.KLING_PUBLIC_ASSET_BASE_URL || '').replace(/\/$/, '');

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  return text ? JSON.parse(text) : {};
}

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:[^;,]+;base64,(.+)$/s);
  if (!match) {
    throw new Error('音频素材不是有效的 Base64 文件。');
  }
  return Buffer.from(match[1], 'base64');
}

async function runLocalFfmpeg(args) {
  await new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const stderr = [];
    child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)));
    child.once('error', reject);
    child.once('close', code => {
      if (code === 0) {
        resolve();
        return;
      }
      const detail = Buffer.concat(stderr).toString('utf8').trim().split(/\r?\n/).slice(-3).join(' ');
      reject(new Error(detail || `FFmpeg 退出代码 ${code ?? -1}`));
    });
  });
}

function isAllowedKlingMediaURL(value) {
  try {
    const target = new URL(String(value || ''));
    const hostname = target.hostname.toLowerCase();
    return target.protocol === 'https:' && (
      hostname === 'kechuangai.com' ||
      hostname.endsWith('.kechuangai.com') ||
      hostname === 'klingai.com' ||
      hostname.endsWith('.klingai.com')
    );
  } catch {
    return false;
  }
}

async function writeDiagnostic(event) {
  try {
    const logDirectory = path.join(process.cwd(), '.logs');
    await mkdir(logDirectory, { recursive: true });
    await appendFile(
      path.join(logDirectory, 'product-video-backend.jsonl'),
      `${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`,
      'utf8',
    );
  } catch {
    // Ignore diagnostic failures.
  }
}

function parseRange(rangeHeader, size) {
  const match = String(rangeHeader || '').match(/^bytes=(\d*)-(\d*)$/i);
  if (!match) {
    return null;
  }
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) {
    return null;
  }
  return { start, end: Math.min(end, size - 1) };
}

function decodeInlineDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+)?;base64,(.+)$/is);
  if (!match) {
    return null;
  }
  return {
    mimeType: match[1] || 'application/octet-stream',
    bytes: Buffer.from(match[2], 'base64'),
  };
}

class KlingAssetTunnel {
  constructor() {
    this.assets = new Map();
    this.assetServer = null;
    this.tunnelProcess = null;
    this.publicBaseUrl = KLING_PUBLIC_ASSET_BASE_URL;
    this.startupPromise = null;
    const cleanupTimer = setInterval(() => this.cleanupExpired(), 10 * 60 * 1000);
    cleanupTimer.unref();
  }

  async publishDataUrl(dataUrl) {
    const asset = decodeInlineDataUrl(dataUrl);
    if (!asset?.bytes?.length) {
      throw new Error('参考视频数据无效，无法创建临时地址。');
    }
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

  close() {
    if (this.tunnelProcess) {
      this.tunnelProcess.kill();
      this.tunnelProcess = null;
    }
    if (this.assetServer) {
      this.assetServer.close();
      this.assetServer = null;
    }
    this.assets.clear();
  }

  cleanupExpired() {
    const now = Date.now();
    for (const [token, asset] of this.assets.entries()) {
      if (asset.expiresAt <= now) {
        this.assets.delete(token);
      }
    }
  }

  async ensurePublicBaseUrl() {
    if (this.publicBaseUrl) {
      return this.publicBaseUrl;
    }
    if (!this.startupPromise) {
      this.startupPromise = this.startTunnel();
    }
    try {
      return await this.startupPromise;
    } catch (error) {
      this.startupPromise = null;
      throw error;
    }
  }

  async startTunnel() {
    const executable = CLOUD_FLARED_PATH || path.resolve(process.cwd(), '.tools/cloudflared.exe');
    if (!existsSync(executable)) {
      throw new Error(`缺少本地临时隧道程序：${executable}。`);
    }

    const assetServer = createLocalServer((req, res) => {
      const token = decodeURIComponent(String(req.url || '').split('?')[0].replace(/^\/kling-media\//, ''));
      const asset = this.assets.get(token);
      if (!req.url?.startsWith('/kling-media/') || !asset || asset.expiresAt <= Date.now()) {
        res.writeHead(404).end('Not found');
        return;
      }

      const range = parseRange(req.headers.range, asset.bytes.length);
      const headers = {
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
        if (req.method === 'HEAD') {
          res.end();
        } else {
          res.end(chunk);
        }
        return;
      }

      res.writeHead(200, { ...headers, 'Content-Length': asset.bytes.length });
      if (req.method === 'HEAD') {
        res.end();
      } else {
        res.end(asset.bytes);
      }
    });

    await new Promise((resolve, reject) => {
      assetServer.once('error', reject);
      assetServer.listen(0, '127.0.0.1', () => resolve());
    });
    this.assetServer = assetServer;
    const address = assetServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('无法启动本地临时素材服务。');
    }

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
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.tunnelProcess = child;

    return await new Promise((resolve, reject) => {
      let tunnelOutput = '';
      let settled = false;
      const fail = (prefix) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        const detail = tunnelOutput.trim().slice(-1200);
        reject(new Error(`${prefix}${detail ? `：${detail}` : ''}`));
      };
      const timeout = setTimeout(() => fail('启动临时 HTTPS 素材通道超时'), TUNNEL_START_TIMEOUT_MS);
      const consume = (chunk) => {
        tunnelOutput = `${tunnelOutput}${chunk.toString('utf8')}`.slice(-16_000);
        const candidates = tunnelOutput.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi) || [];
        const publicTunnelUrl = candidates.find(candidate => {
          try {
            return new URL(candidate).hostname.toLowerCase() !== 'api.trycloudflare.com';
          } catch {
            return false;
          }
        });
        if (!publicTunnelUrl || settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        this.publicBaseUrl = publicTunnelUrl.replace(/\/$/, '');
        resolve(this.publicBaseUrl);
      };
      child.stdout.on('data', consume);
      child.stderr.on('data', consume);
      child.once('error', error => fail(`无法启动临时 HTTPS 素材通道：${error.message}`));
      child.once('exit', code => {
        if (!this.publicBaseUrl) {
          fail(`临时 HTTPS 素材通道已退出（代码 ${code ?? 'unknown'}）`);
        }
      });
    });
  }
}

const assetTunnel = new KlingAssetTunnel();

class KlingApiRequestError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'KlingApiRequestError';
    this.status = status;
    this.payload = payload;
  }
}

function parseKlingPayload(upstream) {
  try {
    return upstream.text ? JSON.parse(upstream.text) : {};
  } catch {
    return { message: upstream.text };
  }
}

async function requestKlingThroughBridge(url, method, body) {
  const response = await fetch(KLING_NETWORK_BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, method, body }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || `本地网络桥接返回 ${response.status}`);
  }
  if (typeof payload.status !== 'number' || typeof payload.text !== 'string') {
    throw new Error('本地网络桥接响应格式无效');
  }
  return { ok: Boolean(payload.ok), status: payload.status, text: payload.text };
}

async function requestKlingWithFetch(url, method, bearerToken, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body,
      signal: controller.signal,
    });
    return { ok: response.ok, status: response.status, text: await response.text() };
  } finally {
    clearTimeout(timeout);
  }
}

async function requestKling(url, method, bearerToken, body) {
  try {
    return await requestKlingThroughBridge(url, method, body);
  } catch {
    return requestKlingWithFetch(url, method, bearerToken, body);
  }
}

async function publishKlingAssetThroughBridge(dataUrl) {
  const publishUrl = new URL('/assets/publish', KLING_NETWORK_BRIDGE_URL).toString();
  const response = await fetch(publishUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.url) {
    throw new Error(payload.message || `本地素材桥接返回 ${response.status}`);
  }
  return payload.url;
}

async function requestKlingJson(url, method, body, stageLabel) {
  const upstream = await requestKling(url, method, KLING_API_KEY, body ? JSON.stringify(body) : undefined);
  const payload = parseKlingPayload(upstream);
  if (!upstream.ok || (typeof payload?.code !== 'undefined' && Number(payload.code) !== 0)) {
    throw new KlingApiRequestError(
      `${stageLabel}失败：${String(payload?.message || payload?.task_status_msg || `HTTP ${upstream.status}`)}`,
      upstream.status || 502,
      payload,
    );
  }
  return { upstream, payload };
}

async function handleMergeAudio(req, res) {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'product-video-audio-'));
  const videoPath = path.join(tempDirectory, 'generated-video.mp4');
  const audioPath = path.join(tempDirectory, 'reference-audio.bin');
  const outputPath = path.join(tempDirectory, 'video-with-audio.mp4');

  try {
    const body = await readJsonBody(req);
    const videoUrl = String(body?.videoUrl || '').trim();
    const audioDataUrl = String(body?.audioDataUrl || '').trim();
    if (!isAllowedKlingMediaURL(videoUrl)) {
      sendJson(res, 400, { message: '生成视频地址不在可灵媒体白名单内。' });
      return;
    }
    if (!audioDataUrl.startsWith('data:')) {
      sendJson(res, 400, { message: '参考音频文件无效。' });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);
    let generatedVideo;
    try {
      const upstream = await fetch(videoUrl, { signal: controller.signal });
      if (!upstream.ok) {
        throw new Error(`HTTP ${upstream.status}`);
      }
      generatedVideo = Buffer.from(await upstream.arrayBuffer());
    } finally {
      clearTimeout(timeout);
    }

    await writeFile(videoPath, generatedVideo);
    await writeFile(audioPath, decodeDataUrl(audioDataUrl));
    await runLocalFfmpeg([
      '-y',
      '-i', videoPath,
      '-i', audioPath,
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '160k',
      '-shortest',
      '-movflags', '+faststart',
      outputPath,
    ]);
    const output = await readFile(outputPath);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', String(output.byteLength));
    res.setHeader('Cache-Control', 'no-store');
    res.end(output);
  } catch (error) {
    sendJson(res, 500, {
      message: error instanceof Error ? `本地合并声音失败：${error.message}` : '本地合并声音失败。',
    });
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

async function handleKlingMedia(req, res, requestURL) {
  const target = String(requestURL.searchParams.get('url') || '').trim();
  if (!isAllowedKlingMediaURL(target)) {
    sendJson(res, 400, { message: '视频地址不在可灵媒体白名单内。' });
    return;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);
    try {
      const upstream = await fetch(target, { signal: controller.signal });
      if (!upstream.ok) {
        sendJson(res, upstream.status, { message: `读取可灵视频失败（HTTP ${upstream.status}）。` });
        return;
      }
      const bytes = Buffer.from(await upstream.arrayBuffer());
      res.statusCode = 200;
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'video/mp4');
      res.setHeader('Content-Length', String(bytes.byteLength));
      res.setHeader('Cache-Control', 'no-store');
      res.end(bytes);
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    sendJson(res, 502, {
      message: error instanceof Error ? `读取可灵视频失败：${error.message}` : '读取可灵视频失败。',
    });
  }
}

async function handlePublishAsset(req, res) {
  try {
    const body = await readJsonBody(req);
    const dataUrl = String(body?.dataUrl || '');
    let url;
    try {
      url = await publishKlingAssetThroughBridge(dataUrl);
    } catch {
      url = await assetTunnel.publishDataUrl(dataUrl);
    }
    sendJson(res, 200, { url, expiresInSeconds: 7200 });
  } catch (error) {
    sendJson(res, 500, { message: error instanceof Error ? error.message : '无法发布临时参考视频' });
  }
}

async function handleKlingLipSyncCreate(req, res) {
  if (!KLING_API_KEY) {
    sendJson(res, 500, { message: '请在 .env.local 中配置 KLING_API_KEY' });
    return;
  }
  try {
    const body = await readJsonBody(req);
    const videoUrl = String(body?.videoUrl || '').trim();
    const audioUrl = String(body?.audioUrl || '').trim();
    if (!/^https?:\/\//i.test(videoUrl) || !/^https?:\/\//i.test(audioUrl)) {
      sendJson(res, 400, { message: '可灵口型同步要求公网视频和音频 URL。' });
      return;
    }
    const created = await requestKlingJson(
      `${KLING_API_BASE_URL}/v1/videos/lip-sync`,
      'POST',
      {
        input: {
          video_url: videoUrl,
          mode: 'audio2video',
          audio_type: 'url',
          audio_url: audioUrl,
        },
      },
      '创建多语言口型同步任务',
    );
    sendJson(res, 200, {
      taskId: created.payload?.data?.task_id || null,
      status: created.payload?.data?.task_status || 'submitted',
    });
  } catch (error) {
    if (error instanceof KlingApiRequestError) {
      sendJson(res, error.status >= 400 && error.status < 600 ? error.status : 502, {
        ...error.payload,
        message: error.message,
      });
      return;
    }
    sendJson(res, 502, { message: error instanceof Error ? error.message : '可灵口型同步失败' });
  }
}

async function handleKlingLipSyncQuery(res, taskId) {
  if (!KLING_API_KEY) {
    sendJson(res, 500, { message: '请在 .env.local 中配置 KLING_API_KEY' });
    return;
  }
  try {
    const queried = await requestKlingJson(
      `${KLING_API_BASE_URL}/v1/videos/lip-sync/${encodeURIComponent(taskId)}`,
      'GET',
      undefined,
      '查询多语言口型同步任务',
    );
    const task = queried.payload?.data || {};
    sendJson(res, 200, {
      taskId: task?.task_id || taskId,
      status: task?.task_status || 'unknown',
      statusMessage: task?.task_status_msg || '',
      videoUrl: task?.task_result?.videos?.[0]?.url || null,
    });
  } catch (error) {
    if (error instanceof KlingApiRequestError) {
      sendJson(res, error.status >= 400 && error.status < 600 ? error.status : 502, {
        ...error.payload,
        message: error.message,
      });
      return;
    }
    sendJson(res, 502, { message: error instanceof Error ? error.message : '可灵口型同步失败' });
  }
}

function parseJsonText(text, status) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { message: text || `ElevenLabs HTTP ${status}` };
  }
}

async function requestElevenLabs(url, options = {}) {
  const configuredBridgeUrl = process.env.KLING_NETWORK_BRIDGE_URL || 'http://127.0.0.1:3379/request';
  const bridgeRequestUrl = new URL(
    options.responseType === 'binary' ? '/elevenlabs/binary' : '/elevenlabs/request',
    configuredBridgeUrl,
  ).toString();

  try {
    const response = await fetch(bridgeRequestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        method: options.method || 'GET',
        formFields: options.formFields || {},
        responseType: options.responseType || 'text',
      }),
    });
    if (options.responseType === 'binary') {
      const bytes = Buffer.from(await response.arrayBuffer());
      return {
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get('content-type') || 'application/octet-stream',
        bytes: response.ok ? bytes : undefined,
        text: response.ok ? undefined : bytes.toString('utf8'),
      };
    }
    const payload = await response.json();
    if (!response.ok || typeof payload.status !== 'number') {
      throw new Error(payload.message || 'ElevenLabs 网络桥接不可用');
    }
    return {
      ok: Boolean(payload.ok),
      status: payload.status,
      contentType: payload.contentType || 'application/octet-stream',
      text: payload.text,
      bytes: payload.base64 ? Buffer.from(payload.base64, 'base64') : undefined,
    };
  } catch {
    const form = options.method === 'POST' ? new FormData() : undefined;
    for (const [key, value] of Object.entries(options.formFields || {})) {
      form?.append(key, value);
    }
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: { 'xi-api-key': ELEVENLABS_API_KEY },
      body: form,
    });
    if (options.responseType === 'binary' && response.ok) {
      return {
        ok: true,
        status: response.status,
        contentType: response.headers.get('content-type') || 'application/octet-stream',
        bytes: Buffer.from(await response.arrayBuffer()),
      };
    }
    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type') || 'application/json',
      text: await response.text(),
    };
  }
}

async function handleElevenLabsVoiceConvert(req, res) {
  try {
    const body = await readJsonBody(req);
    const configuredBridgeUrl = process.env.KLING_NETWORK_BRIDGE_URL || 'http://127.0.0.1:3379/request';
    const bridgeUrl = new URL('/elevenlabs/voice-convert', configuredBridgeUrl).toString();
    const response = await fetch(bridgeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    res.statusCode = response.status;
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(text);
  } catch (error) {
    sendJson(res, 502, {
      message: `转换人物声线失败：${error instanceof Error ? error.message : 'unknown'}`,
    });
  }
}

async function handleElevenLabsDubbingCreate(req, res) {
  if (!ELEVENLABS_API_KEY) {
    sendJson(res, 500, { message: '请在 .env.local 中配置 ELEVENLABS_API_KEY' });
    return;
  }
  try {
    const body = await readJsonBody(req);
    const sourceUrl = String(body?.sourceUrl || '').trim();
    const targetLang = String(body?.targetLang || '').trim().toLowerCase();
    if (!/^https?:\/\//i.test(sourceUrl)) {
      sendJson(res, 400, { message: '多语言配音要求生成结果为公网视频 URL。' });
      return;
    }
    if (!/^[a-z]{2,3}(?:-[a-z]{2})?$/i.test(targetLang)) {
      sendJson(res, 400, { message: '目标语言代码无效。' });
      return;
    }

    const response = await requestElevenLabs(`${ELEVENLABS_API_BASE_URL}/dubbing`, {
      method: 'POST',
      formFields: {
        source_url: sourceUrl,
        source_lang: 'auto',
        target_lang: targetLang,
        num_speakers: '0',
        watermark: 'true',
        name: `${APP_ID}-${targetLang}-${Date.now()}`,
      },
    });
    const payload = parseJsonText(response.text, response.status);
    sendJson(res, response.ok ? 200 : response.status, payload);
  } catch (error) {
    sendJson(res, 502, {
      message: `连接 ElevenLabs 失败：${error instanceof Error ? error.message : 'unknown'}`,
    });
  }
}

async function handleElevenLabsDubbingQuery(res, dubbingId) {
  if (!ELEVENLABS_API_KEY) {
    sendJson(res, 500, { message: '请在 .env.local 中配置 ELEVENLABS_API_KEY' });
    return;
  }
  try {
    const response = await requestElevenLabs(`${ELEVENLABS_API_BASE_URL}/dubbing/${encodeURIComponent(dubbingId)}`, {});
    const payload = parseJsonText(response.text, response.status);
    sendJson(res, response.status, payload);
  } catch (error) {
    sendJson(res, 502, {
      message: `连接 ElevenLabs 失败：${error instanceof Error ? error.message : 'unknown'}`,
    });
  }
}

async function handleElevenLabsDubbingAudio(res, dubbingId, languageCode) {
  if (!ELEVENLABS_API_KEY) {
    sendJson(res, 500, { message: '请在 .env.local 中配置 ELEVENLABS_API_KEY' });
    return;
  }
  try {
    let response = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      response = await requestElevenLabs(
        `${ELEVENLABS_API_BASE_URL}/dubbing/${encodeURIComponent(dubbingId)}/audio/${encodeURIComponent(languageCode)}`,
        { responseType: 'binary' },
      );
      if (response.ok || response.status < 500) {
        break;
      }
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, attempt * 2_000));
      }
    }
    if (!response) {
      sendJson(res, 502, { message: 'ElevenLabs 未返回配音媒体。' });
      return;
    }
    if (!response.ok) {
      sendJson(res, response.status, parseJsonText(response.text, response.status));
      return;
    }
    const bytes = response.bytes || Buffer.alloc(0);
    res.statusCode = 200;
    res.setHeader('Content-Type', response.contentType || 'video/mp4');
    res.setHeader('Content-Length', String(bytes.byteLength));
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.end(bytes);
  } catch (error) {
    sendJson(res, 502, {
      message: `连接 ElevenLabs 失败：${error instanceof Error ? error.message : 'unknown'}`,
    });
  }
}

const server = createServer(async (req, res) => {
  const requestURL = new URL(String(req.url || '/'), 'http://127.0.0.1');
  const pathname = requestURL.pathname;

  try {
    if (req.method === 'GET' && pathname === '/api/health') {
      sendJson(res, 200, {
        success: true,
        data: {
          status: 'ok',
          service: 'product-video-backend',
          appId: APP_ID,
          hasKlingKey: Boolean(KLING_API_KEY),
          hasElevenLabsKey: Boolean(ELEVENLABS_API_KEY),
        },
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/media/merge-audio') {
      await handleMergeAudio(req, res);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/kling/media') {
      await handleKlingMedia(req, res, requestURL);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/kling/assets/publish') {
      await handlePublishAsset(req, res);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/kling/lip-sync') {
      await handleKlingLipSyncCreate(req, res);
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/api/kling/lip-sync/')) {
      const taskId = decodeURIComponent(pathname.replace('/api/kling/lip-sync/', ''));
      await handleKlingLipSyncQuery(res, taskId);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/elevenlabs/voice-convert') {
      await handleElevenLabsVoiceConvert(req, res);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/elevenlabs/dubbing') {
      await handleElevenLabsDubbingCreate(req, res);
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/api/elevenlabs/dubbing/')) {
      const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
      if (parts.length === 4) {
        await handleElevenLabsDubbingQuery(res, parts[3]);
        return;
      }
      if (parts.length === 6 && parts[4] === 'audio') {
        await handleElevenLabsDubbingAudio(res, parts[3], parts[5]);
        return;
      }
    }

    sendJson(res, 404, { success: false, message: `Path not found: ${req.method} ${pathname}` });
  } catch (error) {
    await writeDiagnostic({
      stage: 'request-failed',
      method: req.method,
      pathname,
      error: error instanceof Error ? error.message : 'unknown',
    });
    sendJson(res, 500, {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown backend error.',
    });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[product-video-backend] listening on http://127.0.0.1:${PORT}`);
});

function shutdown(signal) {
  console.log(`[product-video-backend] received ${signal}, shutting down`);
  assetTunnel.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
