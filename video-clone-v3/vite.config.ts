import path from 'path';
import { spawn } from 'node:child_process';
import { resolve4 } from 'node:dns/promises';
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { defineConfig, loadEnv, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { KlingAssetTunnel } from './server/klingAssetTunnel';
import { createElevenLabsProxy } from './server/elevenLabsProxy';

async function readJsonBody(req: any): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function getInlineData(payload: any): string | null {
  const parts = payload?.contents?.parts || [];
  const imagePart = parts.find((part: any) => part?.inlineData?.data);
  if (!imagePart?.inlineData?.data) return null;
  const mimeType = imagePart.inlineData.mimeType || 'image/jpeg';
  return `data:${mimeType};base64,${imagePart.inlineData.data}`;
}

function sendJson(res: any, status: number, payload: any): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function decodeDataUrl(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:[^;,]+;base64,(.+)$/s);
  if (!match) throw new Error('音频素材不是有效的 Base64 文件。');
  return Buffer.from(match[1], 'base64');
}

async function runLocalFfmpeg(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('ffmpeg', args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    const stderr: Buffer[] = [];
    child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)));
    child.once('error', reject);
    child.once('close', code => {
      if (code === 0) return resolve();
      const detail = Buffer.concat(stderr).toString('utf8').trim().split(/\r?\n/).slice(-3).join(' ');
      reject(new Error(detail || `FFmpeg 退出代码 ${code ?? -1}`));
    });
  });
}

type KlingHttpResult = { ok: boolean; status: number; text: string };

class KlingApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: any,
  ) {
    super(message);
    this.name = 'KlingApiRequestError';
  }
}

function parseKlingPayload(upstream: KlingHttpResult): any {
  try {
    return upstream.text ? JSON.parse(upstream.text) : {};
  } catch {
    return { message: upstream.text };
  }
}

async function requestKlingJson(
  bridgeUrl: string,
  url: string,
  method: 'GET' | 'POST',
  bearerToken: string,
  body: Record<string, unknown> | undefined,
  stageLabel: string,
): Promise<{ upstream: KlingHttpResult; payload: any }> {
  const upstream = await requestKling(
    bridgeUrl,
    url,
    method,
    bearerToken,
    body ? JSON.stringify(body) : undefined,
  );
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

async function writeKlingDiagnostic(event: Record<string, unknown>): Promise<void> {
  try {
    const logDirectory = path.join(process.cwd(), '.logs');
    await mkdir(logDirectory, { recursive: true });
    await appendFile(
      path.join(logDirectory, 'kling-network.jsonl'),
      `${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`,
      'utf8',
    );
  } catch {
    // Diagnostics must never interrupt a generation request.
  }
}

async function requestKlingWithPowerShell(url: string, method: 'GET' | 'POST', bearerToken: string, body?: string): Promise<KlingHttpResult> {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'video-clone-kling-ps-'));
  const bodyPath = path.join(tempDirectory, 'body.json');
  const marker = '__KLING_HTTP_STATUS__:';
  try {
    if (typeof body === 'string') await writeFile(bodyPath, body, { encoding: 'utf8', mode: 0o600 });
    const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[Console]::InputEncoding = [Text.Encoding]::UTF8
$headers = @{ Authorization = ('Bearer ' + $env:KLING_AUTH_TOKEN); Accept = 'application/json' }
$params = @{ Method = $env:KLING_REQUEST_METHOD; Uri = $env:KLING_REQUEST_URL; Headers = $headers; UserAgent = 'undici'; UseBasicParsing = $true; TimeoutSec = 180 }
if ($env:KLING_REQUEST_METHOD -eq 'POST') {
  $params.ContentType = 'application/json'
  $params.Body = [IO.File]::ReadAllText($env:KLING_BODY_PATH)
}
try {
  $response = Invoke-WebRequest @params
  [Console]::Out.Write($response.Content)
  [Console]::Out.Write("\n${marker}" + [int]$response.StatusCode)
} catch {
  if ($_.Exception.Response) {
    $status = [int]$_.Exception.Response.StatusCode
    $content = $_.ErrorDetails.Message
    if ($content) { [Console]::Out.Write($content) }
    [Console]::Out.Write("\n${marker}" + $status)
    exit 0
  }
  $statusName = if ($_.Exception.Status) { [string]$_.Exception.Status } else { 'Unknown' }
  $innerMessage = if ($_.Exception.InnerException) { [string]$_.Exception.InnerException.Message } else { '' }
  [Console]::Error.Write($statusName + '|' + $_.Exception.Message + '|' + $innerMessage)
  exit 91
}`;
    const result = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          KLING_AUTH_TOKEN: bearerToken,
          KLING_REQUEST_URL: url,
          KLING_REQUEST_METHOD: method,
          KLING_BODY_PATH: bodyPath,
        },
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout.on('data', chunk => stdout.push(Buffer.from(chunk)));
      child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)));
      child.once('error', reject);
      child.once('close', code => resolve({
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        code: code ?? -1,
      }));
    });
    if (result.code !== 0) throw new Error(result.stderr.trim() || `PowerShell HTTP exited with code ${result.code}`);
    const markerIndex = result.stdout.lastIndexOf(`\n${marker}`);
    if (markerIndex < 0) throw new Error('PowerShell HTTP 未返回状态码');
    const status = Number(result.stdout.slice(markerIndex + marker.length + 1).trim());
    return { ok: status >= 200 && status < 300, status, text: result.stdout.slice(0, markerIndex) };
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

async function requestKlingWithFetch(url: string, method: 'GET' | 'POST', bearerToken: string, body?: string): Promise<KlingHttpResult> {
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
  } catch (error) {
    const cause = error instanceof Error
      ? (error as Error & { cause?: { code?: string; message?: string } }).cause
      : undefined;
    const detail = cause?.code || cause?.message || (error instanceof Error ? error.message : 'unknown');
    throw new Error(detail, { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

async function requestKlingThroughBridge(bridgeUrl: string, url: string, method: 'GET' | 'POST', body?: string): Promise<KlingHttpResult> {
  const response = await fetch(bridgeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, method, body }),
  });
  const payload = await response.json() as Partial<KlingHttpResult> & { message?: string };
  if (!response.ok) throw new Error(payload.message || `本地网络桥接返回 ${response.status}`);
  if (typeof payload.status !== 'number' || typeof payload.text !== 'string') {
    throw new Error('本地网络桥接响应格式无效');
  }
  return { ok: Boolean(payload.ok), status: payload.status, text: payload.text };
}

async function publishKlingAssetThroughBridge(bridgeUrl: string, dataUrl: string): Promise<string> {
  const publishUrl = new URL('/assets/publish', bridgeUrl).toString();
  const response = await fetch(publishUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl }),
  });
  const payload = await response.json() as { url?: string; message?: string };
  if (!response.ok || !payload.url) {
    throw new Error(payload.message || `本地素材桥接返回 ${response.status}`);
  }
  return payload.url;
}

async function requestKling(bridgeUrl: string, url: string, method: 'GET' | 'POST', bearerToken: string, body?: string): Promise<KlingHttpResult> {
  try {
    return await requestKlingThroughBridge(bridgeUrl, url, method, body);
  } catch {
    // Fall back to direct transports when the local bridge is not running.
  }
  try {
    return await requestKlingWithFetch(url, method, bearerToken, body);
  } catch (nativeError) {
    try {
      return await requestKlingWithPowerShell(url, method, bearerToken, body);
    } catch (fallbackError) {
      const nativeDetail = nativeError instanceof Error ? nativeError.message : 'unknown';
      const fallbackDetail = fallbackError instanceof Error ? fallbackError.message : 'unknown';
      try {
        return await requestKlingWithCurl(url, method, bearerToken, body);
      } catch {
        // The combined error below preserves the two most useful Windows transport details.
      }
      throw new Error(`原生请求失败：${nativeDetail}；备用请求失败：${fallbackDetail}`);
    }
  }
}

async function requestKlingWithCurl(url: string, method: 'GET' | 'POST', bearerToken: string, body?: string): Promise<KlingHttpResult> {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'video-clone-kling-'));
  const headersPath = path.join(tempDirectory, 'headers.txt');
  const bodyPath = path.join(tempDirectory, 'body.json');
  try {
    await writeFile(headersPath, `Authorization: Bearer ${bearerToken}\r\nContent-Type: application/json\r\n`, { encoding: 'utf8', mode: 0o600 });
    if (typeof body === 'string') await writeFile(bodyPath, body, { encoding: 'utf8', mode: 0o600 });

    const marker = '__KLING_HTTP_STATUS__:';
    const args = [
      '--silent', '--show-error', '--location', '--ipv4',
      '--connect-timeout', '30', '--max-time', '180',
      '--request', method,
      '--header', `@${headersPath}`,
      '--write-out', `\n${marker}%{http_code}`,
    ];
    if (typeof body === 'string') args.push('--data-binary', `@${bodyPath}`);

    let result: { stdout: string; stderr: string; code: number } = { stdout: '', stderr: '', code: -1 };
    const safeRetryCodes = new Set([6, 7, 35]);
    const hostname = new URL(url).hostname;
    let resolvedAddresses: string[] = [];
    try {
      resolvedAddresses = Array.from(new Set(await resolve4(hostname)));
    } catch {
      // curl will perform its own DNS lookup when the system resolver is temporarily unavailable.
    }
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const attemptArgs = [...args];
      const address = resolvedAddresses[attempt % Math.max(1, resolvedAddresses.length)];
      if (address) attemptArgs.push('--resolve', `${hostname}:443:${address}`);
      attemptArgs.push(url);
      result = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
        const child = spawn('curl.exe', attemptArgs, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        const stdout: Buffer[] = [];
        const stderr: Buffer[] = [];
        child.stdout.on('data', chunk => stdout.push(Buffer.from(chunk)));
        child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)));
        child.once('error', reject);
        child.once('close', code => resolve({
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
          code: code ?? -1,
        }));
      });
      if (!safeRetryCodes.has(result.code) || attempt === 3) break;
      await new Promise(resolve => setTimeout(resolve, 750 * (attempt + 1)));
    }
    if (result.code !== 0) throw new Error(result.stderr.trim() || `curl exited with code ${result.code}`);
    const markerIndex = result.stdout.lastIndexOf(`\n${marker}`);
    if (markerIndex < 0) throw new Error('curl 未返回 HTTP 状态码');
    const status = Number(result.stdout.slice(markerIndex + marker.length + 1).trim());
    return { ok: status >= 200 && status < 300, status, text: result.stdout.slice(0, markerIndex) };
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

function createKlingProxy(env: Record<string, string>) {
  const assetTunnel = new KlingAssetTunnel({ assetPort: Number(env.ASSET_PORT || 9897) });
  const bridgeUrl = env.KLING_NETWORK_BRIDGE_URL || 'http://127.0.0.1:3379/request';
  return {
    name: 'kling-local-proxy',
    configureServer(server: ViteDevServer) {
      server.httpServer?.once('close', () => assetTunnel.close());
      server.middlewares.use('/api/media/merge-audio', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'video-clone-audio-'));
        const videoPath = path.join(tempDirectory, 'generated-video.mp4');
        const audioPath = path.join(tempDirectory, 'reference-audio.bin');
        const outputPath = path.join(tempDirectory, 'video-with-audio.mp4');
        try {
          const body = await readJsonBody(req);
          const videoUrl = String(body?.videoUrl || '').trim();
          const audioDataUrl = String(body?.audioDataUrl || '').trim();
          if (!/^https?:\/\//i.test(videoUrl)) {
            return sendJson(res, 400, { message: '生成视频地址无效。' });
          }
          if (!audioDataUrl.startsWith('data:')) {
            return sendJson(res, 400, { message: '参考音频文件无效。' });
          }

          const target = new URL(videoUrl);
          const hostname = target.hostname.toLowerCase();
          const isAllowedMediaHost = target.protocol === 'https:' && (
            hostname === 'kechuangai.com'
            || hostname.endsWith('.kechuangai.com')
            || hostname === 'klingai.com'
            || hostname.endsWith('.klingai.com')
          );
          if (!isAllowedMediaHost) {
            return sendJson(res, 400, { message: '生成视频地址不在可灵媒体白名单内。' });
          }

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 180_000);
          let generatedVideo: Buffer;
          try {
            const upstream = await fetch(target, { signal: controller.signal });
            if (!upstream.ok) throw new Error(`HTTP ${upstream.status}`);
            generatedVideo = Buffer.from(await upstream.arrayBuffer());
          } finally {
            clearTimeout(timeout);
          }
          if (!generatedVideo.byteLength) throw new Error('可灵返回了空视频。');

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
          if (!output.byteLength) throw new Error('没有生成包含声音的视频。');
          res.statusCode = 200;
          res.setHeader('Content-Type', 'video/mp4');
          res.setHeader('Content-Length', String(output.byteLength));
          res.setHeader('Cache-Control', 'no-store');
          return res.end(output);
        } catch (error) {
          return sendJson(res, 500, {
            message: error instanceof Error ? `本地合并声音失败：${error.message}` : '本地合并声音失败。',
          });
        } finally {
          await rm(tempDirectory, { recursive: true, force: true });
        }
      });
      server.middlewares.use('/api/kling/media', async (req, res, next) => {
        if (req.method !== 'GET') return next();
        try {
          const requestUrl = new URL(String(req.url || '/'), 'http://127.0.0.1');
          const target = new URL(String(requestUrl.searchParams.get('url') || ''));
          const hostname = target.hostname.toLowerCase();
          const isAllowedMediaHost = target.protocol === 'https:' && (
            hostname === 'kechuangai.com'
            || hostname.endsWith('.kechuangai.com')
            || hostname === 'klingai.com'
            || hostname.endsWith('.klingai.com')
          );
          if (!isAllowedMediaHost) {
            return sendJson(res, 400, { message: '视频地址不在可灵媒体白名单内。' });
          }
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 180_000);
          try {
            const upstream = await fetch(target, { signal: controller.signal });
            if (!upstream.ok) {
              return sendJson(res, upstream.status, { message: `读取可灵视频失败（HTTP ${upstream.status}）。` });
            }
            const bytes = Buffer.from(await upstream.arrayBuffer());
            res.statusCode = 200;
            res.setHeader('Content-Type', upstream.headers.get('content-type') || 'video/mp4');
            res.setHeader('Content-Length', String(bytes.byteLength));
            res.setHeader('Cache-Control', 'no-store');
            return res.end(bytes);
          } finally {
            clearTimeout(timeout);
          }
        } catch (error) {
          return sendJson(res, 502, {
            message: error instanceof Error ? `读取可灵视频失败：${error.message}` : '读取可灵视频失败。',
          });
        }
      });
      server.middlewares.use('/api/kling/assets/publish', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        try {
          const body = await readJsonBody(req);
          const dataUrl = String(body?.dataUrl || '');
          let url: string;
          try {
            url = await publishKlingAssetThroughBridge(bridgeUrl, dataUrl);
          } catch {
            url = await assetTunnel.publishDataUrl(dataUrl);
          }
          return sendJson(res, 200, { url, expiresInSeconds: 7200 });
        } catch (error) {
          return sendJson(res, 500, { message: error instanceof Error ? error.message : '无法发布临时参考视频' });
        }
      });
      server.middlewares.use('/api/kling/lip-sync', async (req, res, next) => {
        const bearerToken = env.KLING_API_KEY;
        if (!bearerToken) return sendJson(res, 500, { message: '请在 .env.local 中配置 KLING_API_KEY' });
        const baseUrl = env.KLING_API_BASE_URL || 'https://api-beijing.klingai.com';
        const route = String(req.url || '/').split('?')[0];
        const segments = route.split('/').filter(Boolean).map(decodeURIComponent);
        try {
          if (req.method === 'POST' && segments.length === 0) {
            const body = await readJsonBody(req);
            const videoUrl = String(body?.videoUrl || '').trim();
            const audioUrl = String(body?.audioUrl || '').trim();
            if (!/^https?:\/\//i.test(videoUrl) || !/^https?:\/\//i.test(audioUrl)) {
              return sendJson(res, 400, { message: '可灵口型同步要求公网视频和音频 URL。' });
            }
            const created = await requestKlingJson(
              bridgeUrl,
              `${baseUrl}/v1/videos/lip-sync`,
              'POST',
              bearerToken,
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
            return sendJson(res, 200, {
              taskId: created.payload?.data?.task_id || null,
              status: created.payload?.data?.task_status || 'submitted',
            });
          }

          if (req.method === 'GET' && segments.length === 1) {
            const taskId = encodeURIComponent(segments[0]);
            const queried = await requestKlingJson(
              bridgeUrl,
              `${baseUrl}/v1/videos/lip-sync/${taskId}`,
              'GET',
              bearerToken,
              undefined,
              '查询多语言口型同步任务',
            );
            const task = queried.payload?.data || {};
            return sendJson(res, 200, {
              taskId: task?.task_id || segments[0],
              status: task?.task_status || 'unknown',
              statusMessage: task?.task_status_msg || '',
              videoUrl: task?.task_result?.videos?.[0]?.url || null,
            });
          }

          return next();
        } catch (error) {
          if (error instanceof KlingApiRequestError) {
            return sendJson(res, error.status >= 400 && error.status < 600 ? error.status : 502, {
              ...error.payload,
              message: error.message,
            });
          }
          return sendJson(res, 502, { message: error instanceof Error ? error.message : '可灵口型同步失败' });
        }
      });
      server.middlewares.use('/api/gemini/generate', async (req, res, next) => {
    if (req.method !== 'POST') return next();

    try {
      const body = await readJsonBody(req);
      const provider = body?.config?.provider;
      if (provider === 'seedance2') {
        const bearerToken = env.TOKENDANCE_API_KEY;
        if (!bearerToken) {
          return sendJson(res, 500, { message: '请在 .env.local 中配置 TOKENDANCE_API_KEY' });
        }

        const baseUrl = String(env.TOKENDANCE_SEEDANCE_BASE_URL || 'https://tokendance.space/gateway/ark/v3').replace(/\/$/, '');
        const model = env.TOKENDANCE_VIDEO_MODEL || body?.model || 'seedance-2.0-fast';
        const taskId = String(body?.config?.taskId || '').trim();
        const endpoint = taskId
          ? `${baseUrl}/generations/tasks/${encodeURIComponent(taskId)}`
          : `${baseUrl}/generations/tasks`;

        const content = Array.isArray(body?.contents?.content)
          ? await Promise.all(body.contents.content.map(async (item: any) => {
              if (item?.type === 'image_url' && item?.image_url?.url) {
                return item;
              }
              if (item?.type === 'video_url' && item?.video_url?.url) {
                const videoUrl = String(item.video_url.url || '').trim();
                if (!videoUrl.startsWith('data:')) return item;
                const publicVideoUrl = await publishKlingAssetThroughBridge(bridgeUrl, videoUrl);
                return { ...item, video_url: { ...item.video_url, url: publicVideoUrl } };
              }
              if (item?.type === 'text') {
                return { ...item, text: String(item.text || '').slice(0, 2500) };
              }
              return item;
            }))
          : [];

        const requestBody = taskId ? undefined : JSON.stringify({
          model,
          content,
          ratio: body?.config?.aspectRatio || '9:16',
          resolution: '720p',
          duration: Math.min(15, Math.max(2, Math.round(Number(body?.config?.durationSeconds) || 5))),
          generate_audio: true,
          watermark: false,
        });

        let upstream: KlingHttpResult;
        try {
          upstream = await requestKlingWithFetch(endpoint, taskId ? 'GET' : 'POST', bearerToken, requestBody);
        } catch (nativeError) {
          try {
            upstream = await requestKlingWithPowerShell(endpoint, taskId ? 'GET' : 'POST', bearerToken, requestBody);
          } catch (fallbackError) {
            const nativeDetail = nativeError instanceof Error ? nativeError.message : 'unknown';
            const fallbackDetail = fallbackError instanceof Error ? fallbackError.message : 'unknown';
            return sendJson(res, 502, { message: `连接 TokenDance API 失败：${nativeDetail}；${fallbackDetail}` });
          }
        }

        let payload: any;
        try { payload = upstream.text ? JSON.parse(upstream.text) : {}; } catch { payload = { message: upstream.text }; }
        if (!upstream.ok) {
          return sendJson(res, upstream.status || 502, {
            ...payload,
            message: String(payload?.error?.message || payload?.message || `TokenDance API 请求失败（HTTP ${upstream.status}）`),
          });
        }
        return sendJson(res, 200, payload);
      }
      if (provider !== 'kling') return next();

      const bearerToken = env.KLING_API_KEY;
      if (!bearerToken) {
        return sendJson(res, 500, { message: '请在 .env.local 中配置 KLING_API_KEY' });
      }

      const baseUrl = env.KLING_API_BASE_URL || 'https://api-beijing.klingai.com';
      const taskId = body?.config?.taskId;
      let referenceVideo = String(body?.config?.referenceVideo || '');
      const inlineReferenceVideo = referenceVideo.startsWith('data:') ? referenceVideo : '';
      let image = getInlineData(body);
      const prompt = body.contents?.parts?.find((part: any) => typeof part?.text === 'string')?.text || '';

      if (taskId) {
        const encodedTaskId = encodeURIComponent(String(taskId));
        const queryEndpoints = [
          `${baseUrl}/v1/videos/multi-elements/${encodedTaskId}`,
          `${baseUrl}/v1/videos/motion-control/${encodedTaskId}`,
          `${baseUrl}/tasks?task_ids=${encodedTaskId}`,
        ];
        let lastResult: { upstream: KlingHttpResult; payload: any } | null = null;
        for (const queryEndpoint of queryEndpoints) {
          try {
            const upstream = await requestKling(bridgeUrl, queryEndpoint, 'GET', bearerToken);
            let payload: any;
            try { payload = upstream.text ? JSON.parse(upstream.text) : {}; } catch { payload = { message: upstream.text }; }
            lastResult = { upstream, payload };
            const task = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;
            const status = task?.task_status || task?.status;
            const taskResultVideo = task?.task_result?.videos?.[0];
            const outputVideo = task?.outputs?.find?.((item: any) => item?.type === 'video');
            if (upstream.ok && Number(payload?.code ?? 0) === 0 && (task?.task_id || task?.id || status)) {
              return sendJson(res, 200, {
                taskId: task?.task_id || task?.id || taskId,
                status: status || 'unknown',
                videoUrl: taskResultVideo?.url || outputVideo?.url || null,
                data: task,
              });
            }
          } catch {
            // Try the other Kling task-query protocol.
          }
        }
        if (lastResult?.upstream.ok && Number(lastResult.payload?.code ?? 0) === 0) {
          return sendJson(res, 404, {
            code: 'TASK_NOT_EXIST',
            message: 'TASK_NOT_EXIST: 可灵未找到该任务，请核对任务ID或稍后重试。',
            taskId,
          });
        }
        return sendJson(res, lastResult?.upstream.status || 502, lastResult?.payload || { message: '可灵任务查询失败' });
      }

      const endpoint = referenceVideo
        ? `${baseUrl}/v1/videos/multi-elements`
        : `${baseUrl}/image-to-video/kling-3.0`;
      const diagnosticId = randomUUID().slice(0, 8);

      if (!taskId && referenceVideo.startsWith('data:')) {
        await writeKlingDiagnostic({ diagnosticId, stage: 'publishing-reference-video' });
        try {
          referenceVideo = await publishKlingAssetThroughBridge(bridgeUrl, referenceVideo);
        } catch {
          referenceVideo = await assetTunnel.publishDataUrl(referenceVideo);
        }
        await writeKlingDiagnostic({ diagnosticId, stage: 'reference-video-published', videoUrl: referenceVideo });
      }
      if (!taskId && !referenceVideo && image?.startsWith('data:')) {
        try {
          image = await publishKlingAssetThroughBridge(bridgeUrl, image);
        } catch {
          image = await assetTunnel.publishDataUrl(image);
        }
      }

      const replacementMode = body?.config?.replacementMode === 'product' ? 'product' : 'face';
      let upstream: KlingHttpResult;
      try {
        let requestBody: string;
        if (referenceVideo) {
          if (!image) {
            throw new KlingApiRequestError('请先上传包含完整人脸与发型的目标图片。', 400, {});
          }
          const imageBase64 = image.replace(/^data:[^;]+;base64,/i, '');
          if (!imageBase64 || imageBase64 === image) {
            throw new KlingApiRequestError('目标人脸与发型图片格式无效。', 400, {});
          }
          if (replacementMode === 'product' && !body?.config?.referenceVideoProductSelection) {
            throw new KlingApiRequestError('请先在参考视频中定位需要替换的原产品。', 400, {});
          }

          await writeKlingDiagnostic({ diagnosticId, stage: 'initializing-video', mode: `multi-elements-${replacementMode}-swap` });
          let initialized: Awaited<ReturnType<typeof requestKlingJson>> | null = null;
          let initializeError: unknown = null;
          for (let attempt = 1; attempt <= 3; attempt += 1) {
            try {
              const initializationVideoUrl = new URL(referenceVideo);
              initializationVideoUrl.searchParams.set('kling_fetch', `${Date.now()}-${attempt}`);
              initialized = await requestKlingJson(
                bridgeUrl,
                `${baseUrl}/v1/videos/multi-elements/init-selection`,
                'POST',
                bearerToken,
                { video_url: initializationVideoUrl.toString() },
                '初始化参考视频',
              );
              break;
            } catch (error) {
              initializeError = error;
              await writeKlingDiagnostic({ diagnosticId, stage: 'video-initialize-retry', attempt, detail: error instanceof Error ? error.message : 'unknown' });
              if (attempt < 3) {
                if (inlineReferenceVideo) {
                  try {
                    referenceVideo = await publishKlingAssetThroughBridge(bridgeUrl, inlineReferenceVideo);
                    await writeKlingDiagnostic({ diagnosticId, stage: 'reference-video-republished', attempt, videoUrl: referenceVideo });
                  } catch {
                    // Keep the existing public URL and retry with a cache-busting query.
                  }
                }
                await new Promise(resolve => setTimeout(resolve, attempt * 3_000));
              }
            }
          }
          if (!initialized) throw initializeError;
          const initializedData = initialized.payload?.data;
          if (!initializedData?.session_id || Number(initializedData?.status ?? 0) !== 0) {
            throw new KlingApiRequestError(
              `初始化参考视频失败：${String(initialized.payload?.message || '可灵未返回有效会话')}`,
              502,
              initialized.payload,
            );
          }
          await writeKlingDiagnostic({ diagnosticId, stage: 'video-initialized' });

          const configuredSelection = replacementMode === 'product'
            ? body?.config?.referenceVideoProductSelection || {}
            : body?.config?.referenceVideoFaceSelection || {};
          const configuredHeadPoints = replacementMode === 'face' && Array.isArray(body?.config?.referenceVideoHeadSelectionPoints)
            ? body.config.referenceVideoHeadSelectionPoints.slice(0, 40)
            : [];
          const clampPoint = (value: unknown, fallback: number) => {
            const numeric = Number(value);
            return Number.isFinite(numeric) ? Math.min(1, Math.max(0, numeric)) : fallback;
          };
          const fps = Number(initializedData?.fps) || 30;
          const totalFrame = Math.max(1, Number(initializedData?.total_frame) || 1);
          const requestedDuration = Math.min(15, Math.max(5, Math.round(Number(body.config?.durationSeconds) || 5))) - 0.3;
          const pointsByFrame = new Map<number, Array<{ x: number; y: number }>>();
          const productAnchorPoints = replacementMode === 'product'
            ? [
                configuredSelection,
                { ...configuredSelection, x: clampPoint(Number(configuredSelection?.x) - 0.012, 0.488) },
                { ...configuredSelection, x: clampPoint(Number(configuredSelection?.x) + 0.012, 0.512) },
                { ...configuredSelection, y: clampPoint(Number(configuredSelection?.y) - 0.012, 0.638) },
                { ...configuredSelection, y: clampPoint(Number(configuredSelection?.y) + 0.012, 0.662) },
              ]
            : [];
          const allSelectionPoints = replacementMode === 'product'
            ? productAnchorPoints
            : configuredHeadPoints.length ? configuredHeadPoints : [configuredSelection];
          const inRangeSelectionPoints = allSelectionPoints.filter((point: any) => (Number(point?.timeSec) || 0) <= requestedDuration);
          for (const point of (inRangeSelectionPoints.length ? inRangeSelectionPoints : [allSelectionPoints[0]])) {
            const timeSec = Math.max(0, Number(point?.timeSec) || 0);
            const frameIndex = Math.min(totalFrame - 1, Math.round(timeSec * fps));
            const framePoints = pointsByFrame.get(frameIndex) || [];
            if (framePoints.length < 10) {
              framePoints.push({
                x: clampPoint(point?.x, 0.5),
                y: clampPoint(point?.y, replacementMode === 'product' ? 0.65 : 0.32),
              });
            }
            pointsByFrame.set(frameIndex, framePoints);
          }

          let selectedFrameCount = 0;
          let lastSelectionError: unknown = null;
          for (const [frameIndex, headPoints] of [...pointsByFrame.entries()].sort((a, b) => a[0] - b[0]).slice(0, 10)) {
            try {
              const selected = await requestKlingJson(
                bridgeUrl,
                `${baseUrl}/v1/videos/multi-elements/add-selection`,
                'POST',
                bearerToken,
                {
                  session_id: initializedData.session_id,
                  frame_index: frameIndex,
                  points: headPoints,
                },
                replacementMode === 'product' ? '定位参考视频产品' : '定位参考视频人脸',
              );
              if (Number(selected.payload?.data?.status ?? 0) !== 0) {
                throw new KlingApiRequestError(
                  `定位参考视频${replacementMode === 'product' ? '产品' : '人脸'}失败：${String(selected.payload?.message || `可灵未识别${replacementMode === 'product' ? '产品' : '人脸'}区域`)}`,
                  422,
                  selected.payload,
                );
              }
              selectedFrameCount += 1;
              await writeKlingDiagnostic({ diagnosticId, stage: `${replacementMode}-frame-selected`, frameIndex, pointCount: headPoints.length });
            } catch (error) {
              lastSelectionError = error;
              await writeKlingDiagnostic({ diagnosticId, stage: 'head-frame-skipped', frameIndex, detail: error instanceof Error ? error.message : 'unknown' });
            }
          }
          if (selectedFrameCount === 0) {
            throw lastSelectionError || new KlingApiRequestError(`定位参考视频${replacementMode === 'product' ? '产品' : '人脸'}失败：没有可用的关键帧`, 422, {});
          }
          await writeKlingDiagnostic({ diagnosticId, stage: `${replacementMode}-tracking-complete`, selectedFrameCount });

          const duration = String(Math.min(15, Math.max(5, Math.round(Number(body.config?.durationSeconds) || 5))));
          const resolution = body.config?.resolution === '720p' ? '720p' : '1080p';
          const isProductReplacement = replacementMode === 'product';
          const productCreative = isProductReplacement && Boolean(body.config?.productCreative);
          const creativeCorePrompt = '以<<<video_1>>>作为爆款叙事母版，以<<<image_1>>>中的目标产品作为唯一主角。先识别产品类别、用途、结构、材质、卖点、适用人群与合理场景，所有动作和环境必须符合真实用途。复用参考视频的开场钩子、镜头职能顺序、动作因果、产品揭示节点、展示节拍、卖点特写、转场、情绪递进和收尾回报；每个新镜头承担相同传播职能，但具体内容应适配目标产品。场景、天气、服装、美术和色彩允许创新。产品必须作为同一个刚性实体逐帧锁定，轮廓、长宽高比例、结构、部件数量、材质、颜色、包装、Logo、标签布局和文字与<<<image_1>>>完全一致；禁止拉伸、压缩、弯曲、融化、膨胀、缩小、拆分、合并、增减部件或重新设计。人物、手部、握持、遮挡、反射、阴影与运动模糊必须真实。保留原声音，不生成字幕、水印或额外品牌。';
          const replacementPrompt = '这是严格的真人实拍产品替换。使用<<<image_1>>>中的目标产品替换<<<video_1>>>中已选中的原产品。目标产品图是产品外观的唯一标准，产品必须作为同一个刚性实体逐帧锁定：轮廓、长宽高比例、结构、部件数量、材质、颜色、包装结构、Logo、标签布局和可见文字完全一致，严禁拉伸、压缩、弯曲、融化、膨胀、缩小、拆分、合并、增减部件或重新设计。沿用原产品的位置、大小、朝向、手持方式、运动轨迹、透视、光照、反射、阴影、景深和运动模糊。手和手指不得重绘或变形，保持原有握持关系与前后遮挡。除选中的产品区域外，其余像素全部锁定，保持人物、身体、服装、背景、镜头运动、剪辑和声音不变。';
          const faceReplacementPrompt = '这是严格的真人摄影头部替换，不是重新创造、磨皮或美化人物。使用<<<image_1>>>中的完整人物头部（人脸、发际线和完整发型），替换<<<video_1>>>中已选中的人物头部。目标人物图是人物身份、骨相、五官比例、真实皮肤纹理和发型的唯一标准，不能保留原人物身份。逐帧保留人物毛孔、细纹、轻微瑕疵、不对称性、面部绒毛和真实发丝；保持自然牙齿结构、口腔深度和唇纹。视频中的产品、包装、商标、标签和文字保持原样。除选中的头部区域外，其余原视频像素全部锁定。';
          const analysisSuffix = String(prompt || '').trim();
          const fullTaskPrompt = isProductReplacement
            ? productCreative
              ? `${creativeCorePrompt} 产品与爆款逻辑分析：${analysisSuffix}`
              : replacementPrompt
            : faceReplacementPrompt;
          // Kling's prompt field has a strict 2500-character ceiling. Keep a
          // safety margin and preserve the high-priority constraints at the front.
          const boundedTaskPrompt = Array.from(fullTaskPrompt).slice(0, 2400).join('');
          const createBody = {
            model_name: 'kling-v1-6',
            session_id: initializedData.session_id,
            edit_mode: 'swap',
            image_list: [{ image: imageBase64 }],
            prompt: boundedTaskPrompt,
            negative_prompt: isProductReplacement
              ? productCreative
                ? 'lost opening hook, reordered story beats, missing product reveal, missing demonstration beat, broken action causality, product misuse, scene unrelated to product purpose, random unrelated shot, weak payoff, wrong product, source product retained, mixed products, stretched product, squashed product, bent rigid product, melted product, inflated product, shrinking product, changing proportions, changing component count, redesigned package, unstable logo, unreadable label, product morphing, product identity drift, floating product, impossible grip, product-hand intersection, deformed hands, extra fingers, missing fingers, fused fingers, broken anatomy, AI look, CGI, flicker, abrupt transition, copied captions, watermark'
                : 'wrong target product, source product retained, mixed products, changed target product geometry, wrong package, wrong label, wrong logo, unreadable product text, floating product, deformed grip, product-hand intersection, product flicker, product melting, altered hands, altered fingers, extra fingers, missing fingers, fused fingers, changed face, changed identity, changed hairstyle, face flicker, wrong foreground-background occlusion, changed background, changed camera movement'
              : 'blurry face, low-resolution face, AI-generated look, CGI, doll face, waxy skin, beauty filter, skin smoothing, face flicker, identity drift, morphing, warping, wig-like hair, plastic hair, blurry hairline, hair flicker, changed held object, changed product, changed package, changed label, changed logo, changed product text, altered hands, altered fingers, wrong foreground-background occlusion, changed background, changed camera movement',
            mode: resolution === '720p' ? 'std' : 'pro',
            duration,
            watermark_info: { enabled: false },
          };
          requestBody = JSON.stringify(createBody);
          const created = await requestKlingJson(
            bridgeUrl,
            endpoint,
            'POST',
            bearerToken,
            createBody,
            isProductReplacement ? '创建产品替换任务' : '创建人脸替换任务',
          );
          upstream = created.upstream;
          await writeKlingDiagnostic({
            diagnosticId,
            stage: 'task-created',
            taskId: created.payload?.data?.task_id || null,
            status: created.payload?.data?.task_status || null,
          });
        } else {
          const createBody = {
            contents: [
              { type: 'prompt', text: Array.from(String(prompt || '')).slice(0, 2400).join('') },
              { type: 'first_frame', url: image },
            ],
            settings: {
              resolution: body.config?.resolution === '720p' ? '720p' : '1080p',
              duration: Math.min(15, Math.max(3, Number(body.config?.durationSeconds) || 5)),
              audio: 'off',
              multi_shot: false,
            },
            options: { watermark_info: { enabled: false } },
          };
          requestBody = JSON.stringify(createBody);
          const created = await requestKlingJson(
            bridgeUrl,
            endpoint,
            'POST',
            bearerToken,
            createBody,
            '创建视频任务',
          );
          upstream = created.upstream;
        }
        await writeKlingDiagnostic({
          diagnosticId,
          stage: 'prepared',
          method: 'POST',
          endpoint,
          endpointHostname: new URL(endpoint).hostname,
          requestBytes: Buffer.byteLength(requestBody, 'utf8'),
          promptCharacters: prompt.length,
          mode: referenceVideo ? `multi-elements-${replacementMode}-swap` : 'image-to-video',
          imageUrl: image?.startsWith('data:') ? 'inline-base64' : image || null,
          videoUrl: referenceVideo || null,
          requestedDurationSeconds: body.config?.durationSeconds ?? null,
          requestedResolution: body.config?.resolution ?? '1080p',
          referenceVideoDurationSeconds: body.config?.referenceVideoDurationSec ?? null,
        });
        await writeKlingDiagnostic({
          diagnosticId,
          stage: 'response',
          status: upstream.status,
          ok: upstream.ok,
          responseBytes: Buffer.byteLength(upstream.text, 'utf8'),
        });
      } catch (error) {
        if (error instanceof KlingApiRequestError) {
          await writeKlingDiagnostic({ diagnosticId, stage: 'api-failed', detail: error.message, status: error.status });
          return sendJson(res, error.status >= 400 && error.status < 600 ? error.status : 502, {
            ...error.payload,
            message: error.message,
          });
        }
        const cause = error instanceof Error ? (error as Error & { cause?: { code?: string; message?: string } }).cause : undefined;
        const baseDetail = cause?.code || cause?.message || (error instanceof Error ? error.message : 'unknown');
        const detail = `${baseDetail}；诊断编号：${diagnosticId}`;
        await writeKlingDiagnostic({ diagnosticId, stage: 'transport-failed', detail: baseDetail });
        return sendJson(res, 502, { message: `连接可灵 API 失败（${detail}），请检查网络后重试。` });
      }

      const payload = parseKlingPayload(upstream);
      return sendJson(res, upstream.status, payload);
    } catch (error) {
      return sendJson(res, 500, { message: error instanceof Error ? error.message : 'Kling proxy request failed' });
    }
      });
    },
    closeBundle() {
      assetTunnel.close();
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
  base: '/standalone/video-clone-v3/',
  server: {
    host: '127.0.0.1',
    port: 1111,
    strictPort: true,
    fs: {
      allow: [path.resolve(__dirname, '../..')],
    },
  },
  plugins: [react(), createElevenLabsProxy(env), createKlingProxy(env)],
  optimizeDeps: {
    // ffmpeg.wasm resolves its own module worker at runtime. Pre-bundling the
    // package rewrites that URL into node_modules/.vite/deps/worker.js, which
    // does not exist and leaves video preparation waiting forever.
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/core', '@ffmpeg/util'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../..'),
    },
  },
  };
});
