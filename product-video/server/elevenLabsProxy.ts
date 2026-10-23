import type { Plugin, ViteDevServer } from 'vite';

const ELEVENLABS_API_BASE_URL = 'https://api.elevenlabs.io/v1';

type ElevenLabsResult = {
  ok: boolean;
  status: number;
  contentType: string;
  text?: string;
  bytes?: Buffer;
};

async function readJsonBody(req: any): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function sendJson(res: any, status: number, payload: any): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function parseJsonText(text: string | undefined, status: number): any {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { message: text || `ElevenLabs HTTP ${status}` };
  }
}

async function requestElevenLabs(
  env: Record<string, string>,
  url: string,
  options: { method?: 'GET' | 'POST'; formFields?: Record<string, string>; responseType?: 'text' | 'binary' },
): Promise<ElevenLabsResult> {
  const configuredBridgeUrl = env.KLING_NETWORK_BRIDGE_URL || 'http://127.0.0.1:3379/request';
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
    const payload = await response.json() as {
      ok?: boolean;
      status?: number;
      contentType?: string;
      text?: string;
      base64?: string;
      message?: string;
    };
    if (!response.ok || typeof payload.status !== 'number') throw new Error(payload.message || 'ElevenLabs 网络桥接不可用');
    return {
      ok: Boolean(payload.ok),
      status: payload.status,
      contentType: payload.contentType || 'application/octet-stream',
      text: payload.text,
      bytes: payload.base64 ? Buffer.from(payload.base64, 'base64') : undefined,
    };
  } catch {
    const apiKey = env.ELEVENLABS_API_KEY;
    const form = options.method === 'POST' ? new FormData() : undefined;
    for (const [key, value] of Object.entries(options.formFields || {})) form?.append(key, value);
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: { 'xi-api-key': apiKey },
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

export function createElevenLabsProxy(env: Record<string, string>): Plugin {
  return {
    name: 'elevenlabs-local-proxy',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/elevenlabs/voice-convert', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        try {
          const body = await readJsonBody(req);
          const configuredBridgeUrl = env.KLING_NETWORK_BRIDGE_URL || 'http://127.0.0.1:3379/request';
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
          return res.end(text);
        } catch (error) {
          return sendJson(res, 502, {
            message: `转换人物声线失败：${error instanceof Error ? error.message : 'unknown'}`,
          });
        }
      });
      server.middlewares.use('/api/elevenlabs/dubbing', async (req, res, next) => {
        const apiKey = env.ELEVENLABS_API_KEY;
        if (!apiKey) return sendJson(res, 500, { message: '请在 .env.local 中配置 ELEVENLABS_API_KEY' });

        const route = String(req.url || '/').split('?')[0];
        const segments = route.split('/').filter(Boolean).map(decodeURIComponent);
        try {
          if (req.method === 'POST' && segments.length === 0) {
            const body = await readJsonBody(req);
            const sourceUrl = String(body?.sourceUrl || '').trim();
            const targetLang = String(body?.targetLang || '').trim().toLowerCase();
            if (!/^https?:\/\//i.test(sourceUrl)) {
              return sendJson(res, 400, { message: '多语言配音要求生成结果为公网视频 URL。' });
            }
            if (!/^[a-z]{2,3}(?:-[a-z]{2})?$/i.test(targetLang)) {
              return sendJson(res, 400, { message: '目标语言代码无效。' });
            }

            const response = await requestElevenLabs(env, `${ELEVENLABS_API_BASE_URL}/dubbing`, {
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
            const payload = parseJsonText(response.text, response.status);
            if (!response.ok) return sendJson(res, response.status, payload);
            return sendJson(res, 200, payload);
          }

          if (req.method === 'GET' && segments.length === 1) {
            const dubbingId = encodeURIComponent(segments[0]);
            const response = await requestElevenLabs(env, `${ELEVENLABS_API_BASE_URL}/dubbing/${dubbingId}`, {});
            const payload = parseJsonText(response.text, response.status);
            return sendJson(res, response.status, payload);
          }

          if (req.method === 'GET' && segments.length === 3 && segments[1] === 'audio') {
            const dubbingId = encodeURIComponent(segments[0]);
            const languageCode = encodeURIComponent(segments[2]);
            let response: ElevenLabsResult | null = null;
            for (let attempt = 1; attempt <= 3; attempt += 1) {
              response = await requestElevenLabs(
                env,
                `${ELEVENLABS_API_BASE_URL}/dubbing/${dubbingId}/audio/${languageCode}`,
                { responseType: 'binary' },
              );
              if (response.ok || response.status < 500) break;
              if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 2_000));
            }
            if (!response) return sendJson(res, 502, { message: 'ElevenLabs 未返回配音媒体。' });
            if (!response.ok) {
              const payload = parseJsonText(response.text, response.status);
              return sendJson(res, response.status, payload);
            }
            const bytes = response.bytes || Buffer.alloc(0);
            res.statusCode = 200;
            res.setHeader('Content-Type', response.contentType || 'video/mp4');
            res.setHeader('Content-Length', String(bytes.byteLength));
            res.setHeader('Cache-Control', 'private, max-age=300');
            return res.end(bytes);
          }

          return next();
        } catch (error) {
          return sendJson(res, 502, {
            message: `连接 ElevenLabs 失败：${error instanceof Error ? error.message : 'unknown'}`,
          });
        }
      });
    },
  };
}
