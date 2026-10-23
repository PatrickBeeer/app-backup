// Node BFF for rednote-app. Stateless Express process that owns the TikHub
// token, downloads media (cover + optional FFmpeg frames), and composes covers
// via Sharp. All LLM runs in the browser through the shared geminiProxyService.
//
// Proxied by app-manager at /standalone/rednote-app/api/* (same origin as the
// SPA), so no CORS. Envelope: { success, data, message } — matches bffService.

import express, { type Request, type Response } from 'express';
import { config } from './config';
import { TikHubClient, TikHubError } from './tikhub';
import { downloadMedia, extractFrames, toDataUrl } from './media';
import { composeCover, type ComposeCoverInput } from './cover';

interface RunBody {
  action?: string;
  [key: string]: unknown;
}

interface RunResult {
  action: string;
  data: unknown;
}

const tikhub = new TikHubClient();

class UserError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function requireString(body: RunBody, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new UserError(`参数 ${key} 缺失或非字符串`);
  }
  return value.trim();
}

function optString(body: RunBody, key: string): string | undefined {
  const value = body[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

async function dispatch(body: RunBody): Promise<RunResult> {
  const action = String(body.action || '').trim();
  switch (action) {
    case 'health':
      return { action, data: { status: 'ok', service: 'rednote-app-bff' } };

    case 'fetch_note': {
      const url = requireString(body, 'url');
      const note = await tikhub.fetchNote(url);
      return { action, data: note };
    }

    case 'fetch_comments': {
      const url = requireString(body, 'url');
      const noteId = optString(body, 'noteId') || '';
      const comments = await tikhub.fetchComments(noteId, url);
      return { action, data: comments };
    }

    case 'fetch_media': {
      const coverUrl = optString(body, 'coverUrl') || null;
      const videoUrl = optString(body, 'videoUrl') || null;
      if (!coverUrl && !videoUrl) {
        throw new UserError('coverUrl 或 videoUrl 至少需要一个');
      }
      let sourceCoverDataUrl = '';
      const videoFrames: string[] = [];

      if (coverUrl) {
        const media = await downloadMedia(coverUrl);
        sourceCoverDataUrl = toDataUrl(media);
      } else if (videoUrl) {
        // No explicit cover — use the first extracted frame as the cover.
        const videoMedia = await downloadMedia(videoUrl);
        const frames = await extractFrames(videoMedia.buffer);
        videoFrames.push(...frames);
        sourceCoverDataUrl = frames[0] || '';
      }

      if (videoUrl && videoFrames.length === 0) {
        // Cover was downloaded but caller also wants video frames.
        const videoMedia = await downloadMedia(videoUrl);
        videoFrames.push(...(await extractFrames(videoMedia.buffer)));
      }

      return { action, data: { sourceCoverDataUrl, videoFrames } };
    }

    case 'compose_cover': {
      const coverType = body.coverType === 'text_only' || body.coverType === 'photo_text'
        ? body.coverType
        : (() => { throw new UserError('coverType 必须是 text_only 或 photo_text'); })();
      const title = requireString(body, 'title');
      const input: ComposeCoverInput = {
        coverType,
        title,
        baseImageB64: optString(body, 'baseImageB64'),
        visualReference: optString(body, 'visualReference'),
        variant: optString(body, 'variant'),
        typography: undefined,
      };
      const typographyRaw = body.typography;
      if (typographyRaw && typeof typographyRaw === 'object') {
        const t = typographyRaw as Record<string, unknown>;
        input.typography = {
          typography_symbols: Array.isArray(t.typography_symbols) ? t.typography_symbols.map(String) : [],
          emphasis_method: typeof t.emphasis_method === 'string' ? t.emphasis_method : '',
          line_break_pattern: typeof t.line_break_pattern === 'string' ? t.line_break_pattern : '',
          title_position: typeof t.title_position === 'string' ? t.title_position : '',
        };
      }
      const coverDataUrl = await composeCover(input);
      return { action, data: { coverDataUrl } };
    }

    default:
      throw new UserError(`未知的 action: ${action || '(空)'}`, 404);
  }
}

function sendEnvelope(res: Response, status: number, success: boolean, data: unknown, message: string): void {
  res.status(status).json({ success, data: success ? data : null, message: success ? '' : message });
}

const app = express();
// Base64 covers / source media can be a few MB each; allow generous body size.
app.use(express.json({ limit: '60mb' }));

app.get('/api/health', (_req: Request, res: Response) => {
  sendEnvelope(res, 200, true, { status: 'ok', service: 'rednote-app-bff', tikhub: Boolean(config.tikhubApiToken) }, '');
});

app.post('/api/run', async (req: Request, res: Response) => {
  const body = (req.body || {}) as RunBody;
  try {
    const result = await dispatch(body);
    sendEnvelope(res, 200, true, result.data, '');
  } catch (error) {
    if (error instanceof UserError) {
      sendEnvelope(res, error.status, false, null, error.message);
      return;
    }
    if (error instanceof TikHubError) {
      sendEnvelope(res, 502, false, null, error.message);
      return;
    }
    const message = String((error as Error)?.message || error).slice(0, 1000);
    console.error('[rednote-app-bff] dispatch error:', error);
    sendEnvelope(res, 500, false, null, message);
  }
});

// Fallback for any other path — keep SPA routing concerns on app-manager; BFF only owns /api/*.
app.use((req: Request, res: Response) => {
  sendEnvelope(res, 404, false, null, `路径不存在: ${req.method} ${req.path}`);
});

const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(`[rednote-app-bff] listening on http://127.0.0.1:${config.port} (tikhub token ${config.tikhubApiToken ? 'set' : 'MISSING'})`);
});

function shutdown(signal: string): void {
  console.log(`[rednote-app-bff] received ${signal}, shutting down`);
  server.close(() => process.exit(0));
  // Force exit after 5s if connections hang.
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
