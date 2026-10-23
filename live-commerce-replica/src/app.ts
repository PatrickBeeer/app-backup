import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { registerJobRoutes } from './routes/jobs.js';
import { registerProjectRoutes } from './routes/projects.js';
import { HttpError, type AppType, type RouteDependencies } from './routes/types.js';

function contentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.mp4') return 'video/mp4';
  if (extension === '.webm') return 'video/webm';
  if (extension === '.mov') return 'video/quicktime';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.m4a') return 'audio/mp4';
  return 'application/octet-stream';
}

export function createApp(deps: RouteDependencies): Hono<AppType> {
  const app = new Hono<AppType>();
  app.onError((error, c) => {
    const status = error instanceof HttpError
      ? error.status
      : /不存在/.test(error.message)
        ? 404
        : /请先|尚未|未通过/.test(error.message)
          ? 409
          : 500;
    return c.json({ error: error.message }, status);
  });

  // 提取请求方的 Authorization 头（或 unityshop-main-frontend-token cookie），
  // 在后续路由里经 c.get('auth') 取出，由 JobWorker 在后台轮次中转发给
  // app-manager 的 COS presign 上传端点。
  app.use('/api/*', async (c, next) => {
    const header = c.req.header('Authorization');
    let auth: string | undefined;
    if (header) {
      auth = header;
    } else {
      const cookie = c.req.header('Cookie');
      const match = cookie?.match(/unityshop-main-frontend-token=([^;]+)/);
      if (match) auth = `Bearer ${decodeURIComponent(match[1]!)}`;
    }
    c.set('auth', auth ?? '');
    await next();
  });

  app.get('/api/health', (c) => c.json({ ok: true, demoMode: deps.demoMode, videoCostPerSecond: deps.videoCostPerSecond, service: '镜刻' }));
  registerProjectRoutes(app, deps);
  registerJobRoutes(app, deps);

  app.get('/media/*', async (c) => {
    const relative = c.req.path.slice('/media/'.length);
    const root = path.resolve(deps.dataDir);
    const resolved = path.resolve(root, relative);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new HttpError('禁止访问媒体目录之外的文件', 403);
    try {
      const bytes = await readFile(resolved);
      return new Response(bytes, { headers: { 'Content-Type': contentType(resolved), 'Cache-Control': 'no-store' } });
    } catch {
      throw new HttpError('媒体文件不存在', 404);
    }
  });

  app.get('/styles.css', serveStatic({ path: './public/styles.css' }));
  app.get('/presenter-form.js', serveStatic({ path: './public/presenter-form.js' }));
  app.get('/script-editor.js', serveStatic({ path: './public/script-editor.js' }));
  app.get('/app.js', serveStatic({ path: './public/app.js' }));
  app.get('/', serveStatic({ path: './public/index.html' }));
  return app;
}
