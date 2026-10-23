// video-clone-v3 BFF：Node HTTP 服务（端口 9896）。
// nginx 把 /video-clone-v3-bff/ 前缀剥离后转发到本服务的 /api/* 路由。
// 处理可灵（multi-elements / i2v / lip-sync / 媒体代理）、TokenDance（seedance2）、
// ElevenLabs（dubbing / voice-convert）以及本地 FFmpeg 声音合并。

import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { config } from './config';
import { submitOrQueryCprt } from './cprt';
import { KlingAssetTunnel } from './klingAssetTunnel';
import {
  convertVoiceGender,
  ElevenLabsVoiceNotFoundError,
  fetchDubbingAudio,
} from './elevenlabs';
import { applyCameraShake, downloadToFile, mergeVideoWithAudio } from './media';
import {
  createKlingLipSync,
  createKlingTask,
  KlingApiRequestError,
  proxyKlingMedia,
  queryKlingLipSync,
} from './kling';
import { submitOrQueryTokendance } from './tokendance';
import { calculateVideoPointCost } from '../shared/pricing';

const ELEVENLABS_API_BASE_URL = 'https://api.elevenlabs.io/v1';

const MAX_BODY_BYTES = 32 * 1024 * 1024;

class RequestValidationError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
    this.name = 'RequestValidationError';
  }
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    bytes += buffer.byteLength;
    if (bytes > MAX_BODY_BYTES) {
      throw new RequestValidationError('Request body is too large.', 413);
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RequestValidationError('Request body must be valid JSON.', 400);
  }
}

async function drainRequestBody(req: IncomingMessage, maxBytes = MAX_BODY_BYTES): Promise<void> {
  let bytes = 0;
  for await (const chunk of req) {
    bytes += (chunk as Buffer).byteLength;
    if (bytes > maxBytes) return;
  }
}

function getRouteSegments(req: IncomingMessage): string[] {
  const rawUrl = String(req.url || '').split('?')[0] || '/';
  return rawUrl.split('/').filter(Boolean).map(decodeURIComponent);
}

/**
 * 从 /api/run 请求体中解析计费输入（model / resolution / durationSeconds）。
 * 规则与 tokendance.ts / kling.ts 实际下发给上游的 resolution 一致，
 * 保证 quote_clone_job 与 start_clone_job 走同一套定价口径。
 * - seedance2：上游固定 720p，model 取 env 默认（TOKENDANCE_VIDEO_MODEL）。
 * - kling：referenceVideo 存在 → multi-elements (kling-v1-6)；否则 → i2v (kling-3.0)。
 *   resolution 只接受 720p / 1080p，默认 1080p（与 kling.ts 一致）。
 */
function resolveJobPricingInput(body: any): { model: string; resolution: string; durationSeconds: number } {
  const provider = body?.config?.provider;
  const resolution = body?.config?.resolution === '1080p' ? '1080p' : '720p';
  if (provider === 'seedance2') {
    return {
      model: String(body?.model || '').trim() || config.tokendanceVideoModel,
      resolution,
      durationSeconds: Number(body?.config?.durationSeconds),
    };
  }
  if (provider === 'kling') {
    const model = body?.config?.referenceVideo ? 'kling-v1-6' : 'kling-3.0';
    return {
      model,
      resolution,
      durationSeconds: Number(body?.config?.durationSeconds),
    };
  }
  if (provider === 'cprt') {
    // CPRT master-video：model 由前端 config.model 指定；分辨率 480p/720p/1080p。
    return {
      model: String(body?.config?.model || 'master-video-s2-0-mini').trim(),
      resolution: ['480p', '720p', '1080p'].includes(String(body?.config?.resolution)) ? String(body?.config?.resolution) : '480p',
      durationSeconds: Number(body?.config?.durationSeconds),
    };
  }
  throw new RequestValidationError(
    `Unsupported provider for video pricing: ${provider || '(empty)'}`,
    400,
  );
}

/**
 * 把 provider 上游结果包装成 app-manager 计费网关期望的 {success, data, message} 信封。
 * - 成功：HTTP 2xx + success=true，data 为上游 payload。
 * - 失败：HTTP 非 2xx + success=false，message 提取自上游 payload；app-manager
 *   的 standaloneProxySucceeded 会据此触发退款，并把本响应透传给前端。
 */
function wrapProviderResultForBilledRun(result: { status: number; payload: any }): {
  status: number;
  body: { success: boolean; data: any; message: string };
} {
  const ok = result.status >= 200 && result.status < 300;
  const message = ok
    ? ''
    : String(result.payload?.message || result.payload?.error?.message || '');
  const status = ok ? 200 : (result.status >= 400 && result.status < 600 ? result.status : 502);
  return { status, body: { success: ok, data: result.payload, message } };
}

// ElevenLabs dubbing 原样转发：前端读取 dubbing_id / status / error 等 snake_case 字段，
// 因此 BFF 不能做归一化，必须把上游 payload + status 原样返回。
async function forwardElevenLabsDubbing(
  res: ServerResponse,
  apiKey: string,
  url: string,
  options: { method: 'GET' | 'POST'; formFields?: Record<string, string> },
): Promise<void> {
  const form = options.method === 'POST' ? new FormData() : undefined;
  for (const [key, value] of Object.entries(options.formFields || {})) form?.append(key, value);
  const response = await fetch(url, {
    method: options.method,
    headers: { 'xi-api-key': apiKey },
    body: form,
  });
  const text = await response.text();
  let payload: any;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text || `ElevenLabs HTTP ${response.status}` };
  }
  sendJson(res, response.status, payload);
}

// 启动时单例 assetTunnel，供 kling.ts / tokendance.ts 复用。
const assetTunnel = new KlingAssetTunnel({ assetPort: config.assetPort });

const server = createServer(async (req, res) => {
  const method = req.method || 'GET';
  const segments = getRouteSegments(req);
  // segments[0] 应当为 'api'（nginx 已剥离 /video-clone-v3-bff 前缀）。
  // 兼容未剥离的情况：去掉首段 'api' 之外的 standalone 前缀。
  const routeSegs = segments[0] === 'api' ? segments.slice(1) : segments;
  const route = `/${routeSegs.join('/')}`;
  console.log(`[video-clone-v3-bff] ${method} ${route}`);

  try {
    // GET /api/health
    if (method === 'GET' && route === '/health') {
      sendJson(res, 200, {
        status: 'ok',
        appId: config.appId,
        hasKlingKey: Boolean(config.klingApiKey),
        hasTokendanceKey: Boolean(config.tokendanceApiKey),
        hasElevenlabsKey: Boolean(config.elevenlabsApiKey),
        hasCprtKey: Boolean(config.cprtApiKey),
        assetTunnelReady: assetTunnel.isReady(),
      });
      return;
    }

    // POST /api/run (或 /api/execute/run) — app-manager 的计费执行端点。
    // 处理 quote_clone_job（返回 pointCost）与 start_clone_job（按 provider 委派
    // 到既有视频生成逻辑）。响应统一包成 {success, data, message}，便于 app-manager
    // 的 extractStandalonePointCost 读 data.pointCost、standaloneProxySucceeded 读 success。
    // 任务查询（带 config.taskId）不在此处受理，请走 /api/gemini/generate，避免被计费。
    if (method === 'POST' && (route === '/run' || route === '/execute/run')) {
      const body = await readJsonBody(req);
      const action = String(body?.action || '').trim();
      try {
        if (action === 'quote_clone_job') {
          const { model, resolution, durationSeconds } = resolveJobPricingInput(body);
          const pointCost = calculateVideoPointCost(model, resolution, durationSeconds);
          sendJson(res, 200, {
            success: true,
            data: { model, resolution, durationSeconds, pointCost },
            message: '',
          });
          return;
        }
        if (action === 'start_clone_job') {
          const taskId = String(body?.config?.taskId || '').trim();
          if (taskId) {
            // 仅负责「新建任务」。查询走 /api/gemini/generate，避免被计费扣费。
            sendJson(res, 400, {
              success: false,
              data: null,
              message: 'start_clone_job 不支持任务查询，请改走 /api/gemini/generate。',
            });
            return;
          }
          const provider = body?.config?.provider;
          let result: { status: number; payload: any };
          if (provider === 'seedance2') {
            if (!config.tokendanceApiKey) {
              sendJson(res, 500, {
                success: false,
                data: null,
                message: '请在 .env.local 中配置 TOKENDANCE_API_KEY',
              });
              return;
            }
            result = await submitOrQueryTokendance({
              bearerToken: config.tokendanceApiKey,
              baseUrl: config.tokendanceBaseUrl,
              model: config.tokendanceVideoModel,
              body,
              assetTunnel,
            });
          } else if (provider === 'kling') {
            if (!config.klingApiKey) {
              sendJson(res, 500, {
                success: false,
                data: null,
                message: '请在 .env.local 中配置 KLING_API_KEY',
              });
              return;
            }
            result = await createKlingTask({
              bearerToken: config.klingApiKey,
              baseUrl: config.klingApiBaseUrl,
              assetTunnel,
              body,
            });
          } else if (provider === 'cprt') {
            if (!config.cprtApiKey) {
              sendJson(res, 500, {
                success: false,
                data: null,
                message: '请在 .env.local 中配置 CPRT_KEY',
              });
              return;
            }
            result = await submitOrQueryCprt({
              bearerToken: config.cprtApiKey,
              baseUrl: config.cprtBaseUrl,
              body,
              assetTunnel,
            });
          } else {
            sendJson(res, 404, {
              success: false,
              data: null,
              message: `provider not supported by BFF: ${provider || '(empty)'}`,
            });
            return;
          }
          const wrapped = wrapProviderResultForBilledRun(result);
          sendJson(res, wrapped.status, wrapped.body);
          return;
        }
        sendJson(res, 404, {
          success: false,
          data: null,
          message: `Unknown action: ${action || '(empty)'}`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown BFF error.';
        // 上游原始报错落盘，便于排查（前端会做友好文案映射，日志里必须保留原文）。
        console.error(`[run] action=${action || '(empty)'} failed: ${message}`);
        const status = error instanceof RequestValidationError ? error.status : 500;
        sendJson(res, status, { success: false, data: null, message });
      }
      return;
    }

    // POST /api/gemini/generate — dispatcher by provider
    if (method === 'POST' && route === '/gemini/generate') {
      const body = await readJsonBody(req);
      const provider = body?.config?.provider;
      if (provider === 'seedance2') {
        if (!config.tokendanceApiKey) {
          sendJson(res, 500, { message: '请在 .env.local 中配置 TOKENDANCE_API_KEY' });
          return;
        }
        const result = await submitOrQueryTokendance({
          bearerToken: config.tokendanceApiKey,
          baseUrl: config.tokendanceBaseUrl,
          model: config.tokendanceVideoModel,
          body,
          assetTunnel,
        });
        sendJson(res, result.status, result.payload);
        return;
      }
      if (provider === 'kling') {
        if (!config.klingApiKey) {
          sendJson(res, 500, { message: '请在 .env.local 中配置 KLING_API_KEY' });
          return;
        }
        const result = await createKlingTask({
          bearerToken: config.klingApiKey,
          baseUrl: config.klingApiBaseUrl,
          assetTunnel,
          body,
        });
        sendJson(res, result.status, result.payload);
        return;
      }
      if (provider === 'cprt') {
        if (!config.cprtApiKey) {
          sendJson(res, 500, { message: '请在 .env.local 中配置 CPRT_KEY' });
          return;
        }
        const result = await submitOrQueryCprt({
          bearerToken: config.cprtApiKey,
          baseUrl: config.cprtBaseUrl,
          body,
          assetTunnel,
        });
        sendJson(res, result.status, result.payload);
        return;
      }
      // 文本/图片生成与 veo31/grokv3/jimeng 走共享 LLM 网关，不经本 BFF。
      sendJson(res, 404, { message: 'provider not supported by BFF' });
      return;
    }

    // POST /api/kling/lip-sync ; GET /api/kling/lip-sync/:id
    if (route === '/kling/lip-sync' || route.startsWith('/kling/lip-sync/')) {
      if (!config.klingApiKey) {
        sendJson(res, 500, { message: '请在 .env.local 中配置 KLING_API_KEY' });
        return;
      }
      const lipSyncSegs = routeSegs.slice(2); // 去掉 ['kling','lip-sync']
      try {
        if (method === 'POST' && lipSyncSegs.length === 0) {
          const body = await readJsonBody(req);
          const videoUrl = String(body?.videoUrl || '').trim();
          const audioUrl = String(body?.audioUrl || '').trim();
          if (!/^https?:\/\//i.test(videoUrl) || !/^https?:\/\//i.test(audioUrl)) {
            sendJson(res, 400, { message: '可灵口型同步要求公网视频和音频 URL。' });
            return;
          }
          const result = await createKlingLipSync({
            bearerToken: config.klingApiKey,
            baseUrl: config.klingApiBaseUrl,
            videoUrl,
            audioUrl,
          });
          sendJson(res, 200, result);
          return;
        }
        if (method === 'GET' && lipSyncSegs.length === 1) {
          const result = await queryKlingLipSync({
            bearerToken: config.klingApiKey,
            baseUrl: config.klingApiBaseUrl,
            taskId: lipSyncSegs[0],
          });
          sendJson(res, 200, result);
          return;
        }
      } catch (error) {
        if (error instanceof KlingApiRequestError) {
          sendJson(res, error.status >= 400 && error.status < 600 ? error.status : 502, {
            ...error.payload,
            message: error.message,
          });
          return;
        }
        sendJson(res, 502, { message: error instanceof Error ? error.message : '可灵口型同步失败' });
        return;
      }
    }

    // POST /api/kling/assets/publish — 通过 cloudflared 隧道发布 data: URL
    if (method === 'POST' && route === '/kling/assets/publish') {
      try {
        const body = await readJsonBody(req);
        const dataUrl = String(body?.dataUrl || '');
        const url = await assetTunnel.publishDataUrl(dataUrl);
        sendJson(res, 200, { url, expiresInSeconds: 7200 });
      } catch (error) {
        sendJson(res, 500, { message: error instanceof Error ? error.message : '无法发布临时参考视频' });
      }
      return;
    }

    // GET /api/kling/media?url=... — 代理下载可灵媒体（白名单）
    if (method === 'GET' && route === '/kling/media') {
      try {
        const requestUrl = new URL(String(req.url || '/'), 'http://127.0.0.1');
        const target = String(requestUrl.searchParams.get('url') || '');
        if (!target) {
          sendJson(res, 400, { message: '缺少 url 参数。' });
          return;
        }
        const result = await proxyKlingMedia(target);
        res.statusCode = 200;
        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Content-Length', String(result.bytes.byteLength));
        res.setHeader('Cache-Control', 'no-store');
        res.end(result.bytes);
      } catch (error) {
        if (error instanceof KlingApiRequestError) {
          sendJson(res, error.status, { message: error.message });
          return;
        }
        sendJson(res, 502, {
          message: error instanceof Error ? `读取可灵视频失败：${error.message}` : '读取可灵视频失败。',
        });
      }
      return;
    }

    // POST /api/media/merge-audio — FFmpeg 合并视频与音频，返回 video/mp4 二进制
    if (method === 'POST' && route === '/media/merge-audio') {
      try {
        const body = await readJsonBody(req);
        const videoUrl = String(body?.videoUrl || '').trim();
        const audioDataUrl = String(body?.audioDataUrl || '').trim();
        if (!/^https?:\/\//i.test(videoUrl)) {
          sendJson(res, 400, { message: '生成视频地址无效。' });
          return;
        }
        if (!audioDataUrl.startsWith('data:')) {
          sendJson(res, 400, { message: '参考音频文件无效。' });
          return;
        }
        const result = await mergeVideoWithAudio({ videoUrl, audioDataUrl });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Length', String(result.bytes.byteLength));
        res.setHeader('Cache-Control', 'no-store');
        res.end(result.bytes);
      } catch (error) {
        sendJson(res, 500, {
          message: error instanceof Error ? `本地合并声音失败：${error.message}` : '本地合并声音失败。',
        });
      }
      return;
    }

    // POST /api/video/finalize — 把参考视频的运镜（镜头抖动）套用到成片上。
    // 从 video-clone-seedance-v2 的 finalize_video 移植（不含换声，声音由 merge-audio 负责）。
    if (method === 'POST' && route === '/video/finalize') {
      const workDir = await mkdtemp(path.join(os.tmpdir(), 'video-clone-v3-finalize-'));
      const stamp = randomUUID().slice(0, 8);
      const refPath = path.join(workDir, `${stamp}-ref.mp4`);
      const targetPath = path.join(workDir, `${stamp}-target.mp4`);
      const outputPath = path.join(workDir, `${stamp}-shaken.mp4`);
      try {
        const body = await readJsonBody(req);
        const videoUrl = String(body?.videoUrl || '').trim();
        const referenceVideo = String(body?.referenceVideo || '').trim();
        if (!/^https?:\/\//i.test(videoUrl)) {
          sendJson(res, 400, { message: '生成视频地址无效，需要公网 URL。' });
          return;
        }
        if (!referenceVideo) {
          sendJson(res, 400, { message: '缺少参考视频。' });
          return;
        }

        // 参考视频可能是 data: URL（前端本地截取后的素材）或公网 URL。
        if (referenceVideo.startsWith('data:')) {
          const match = referenceVideo.match(/^data:[^;]+;base64,(.+)$/s);
          if (!match) {
            sendJson(res, 400, { message: '参考视频不是有效的 Base64 data: URL。' });
            return;
          }
          await writeFile(refPath, Buffer.from(match[1], 'base64'));
        } else if (/^https?:\/\//i.test(referenceVideo)) {
          await downloadToFile(referenceVideo, refPath);
        } else {
          sendJson(res, 400, { message: '参考视频地址无效。' });
          return;
        }

        await downloadToFile(videoUrl, targetPath);
        await applyCameraShake({
          sourceVideoPath: refPath,
          targetVideoPath: targetPath,
          outputPath,
          workDir,
        });
        const shakenBytes = await readFile(outputPath);
        if (!shakenBytes.byteLength) {
          throw new Error('套用运镜后没有生成视频。');
        }
        const finalUrl = await assetTunnel.publishBuffer(shakenBytes, 'video/mp4');
        console.log(`[video-clone-v3-bff] finalize_video done -> ${finalUrl}`);
        sendJson(res, 200, { videoUrl: finalUrl });
      } catch (error) {
        sendJson(res, 500, {
          message: error instanceof Error ? `套用参考视频运镜失败：${error.message}` : '套用参考视频运镜失败。',
        });
      } finally {
        await rm(workDir, { recursive: true, force: true }).catch(() => {});
      }
      return;
    }

    // ElevenLabs dubbing：POST 创建 / GET 查询 / GET audio 二进制
    if (route === '/elevenlabs/dubbing' || route.startsWith('/elevenlabs/dubbing/')) {
      if (!config.elevenlabsApiKey) {
        sendJson(res, 500, { message: '请在 .env.local 中配置 ELEVENLABS_API_KEY' });
        return;
      }
      const dubbingSegs = routeSegs.slice(2); // 去掉 ['elevenlabs','dubbing']
      try {
        if (method === 'POST' && dubbingSegs.length === 0) {
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
          await forwardElevenLabsDubbing(res, config.elevenlabsApiKey, `${ELEVENLABS_API_BASE_URL}/dubbing`, {
            method: 'POST',
            formFields: {
              source_url: sourceUrl,
              source_lang: 'auto',
              target_lang: targetLang,
              num_speakers: '0',
              watermark: 'true',
              name: `video-clone-${targetLang}-${Date.now()}`,
            },
          });
          return;
        }
        if (method === 'GET' && dubbingSegs.length === 1) {
          await forwardElevenLabsDubbing(
            res,
            config.elevenlabsApiKey,
            `${ELEVENLABS_API_BASE_URL}/dubbing/${encodeURIComponent(dubbingSegs[0])}`,
            { method: 'GET' },
          );
          return;
        }
        if (method === 'GET' && dubbingSegs.length === 3 && dubbingSegs[1] === 'audio') {
          const result = await fetchDubbingAudio(
            config.elevenlabsApiKey,
            dubbingSegs[0],
            dubbingSegs[2],
          );
          res.statusCode = 200;
          res.setHeader('Content-Type', result.contentType);
          res.setHeader('Content-Length', String(result.bytes.byteLength));
          res.setHeader('Cache-Control', 'private, max-age=300');
          res.end(result.bytes);
          return;
        }
      } catch (error) {
        sendJson(res, 502, {
          message: `连接 ElevenLabs 失败：${error instanceof Error ? error.message : 'unknown'}`,
        });
        return;
      }
    }

    // POST /api/elevenlabs/voice-convert — speech-to-speech 声线转换
    if (method === 'POST' && route === '/elevenlabs/voice-convert') {
      try {
        const body = await readJsonBody(req);
        const audioDataUrl = String(body?.audioDataUrl || '').trim();
        const voiceGenderRaw = String(body?.voiceGender || '').trim().toLowerCase();
        if (voiceGenderRaw !== 'female' && voiceGenderRaw !== 'male') {
          sendJson(res, 400, { message: 'voiceGender 必须为 female 或 male。' });
          return;
        }
        if (!audioDataUrl.startsWith('data:')) {
          sendJson(res, 400, { message: '音频素材不是有效的 Base64 文件。' });
          return;
        }
        const result = await convertVoiceGender(config.elevenlabsApiKey, audioDataUrl, voiceGenderRaw);
        sendJson(res, 200, result);
      } catch (error) {
        if (error instanceof ElevenLabsVoiceNotFoundError) {
          sendJson(res, 422, { message: error.message });
          return;
        }
        sendJson(res, 502, {
          message: `转换人物声线失败：${error instanceof Error ? error.message : 'unknown'}`,
        });
      }
      return;
    }

    await drainRequestBody(req);
    sendJson(res, 404, { message: `Path not found: ${method} ${route}` });
  } catch (error) {
    if (error instanceof RequestValidationError) {
      sendJson(res, error.status, { message: error.message });
      return;
    }
    console.error('[video-clone-v3-bff] request error', error);
    sendJson(res, 500, {
      message: error instanceof Error ? error.message : 'Unknown BFF error.',
    });
  }
});

server.listen(config.port, '127.0.0.1', () => {
  console.log(`[video-clone-v3-bff] listening on http://127.0.0.1:${config.port}`);
  console.log(
    `[video-clone-v3-bff] kling=${config.klingApiKey ? 'yes' : 'NO'} tokendance=${config.tokendanceApiKey ? 'yes' : 'NO'} elevenlabs=${config.elevenlabsApiKey ? 'yes' : 'NO'}`,
  );
});

function shutdown(signal: string): void {
  console.log(`[video-clone-v3-bff] received ${signal}, shutting down`);
  try { assetTunnel.close(); } catch { /* ignore */ }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
