import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Hono } from 'hono';
import { presentProject } from './projects.js';
import { HttpError, type AppType, type RouteDependencies } from './types.js';

export function registerJobRoutes(app: Hono<AppType>, deps: RouteDependencies): void {
  app.post('/api/jobs/:id/accept', (c) => {
    const job = deps.reviewService.accept(c.req.param('id'));
    const project = deps.store.getProject(job.projectId)!;
    return c.json({ project: presentProject(project, deps.store.listJobs(project.id), deps.dataDir) });
  });

  app.post('/api/jobs/:id/regenerate', (c) => {
    const auth = (c.get('auth') as string | undefined) ?? '';
    if (!deps.demoMode && !auth) throw new HttpError('未授权：请先登录后再重新生成', 401);
    const job = deps.reviewService.regenerate(c.req.param('id'), auth);
    void deps.worker.tick();
    const project = deps.store.getProject(job.projectId)!;
    return c.json({ project: presentProject(project, deps.store.listJobs(project.id), deps.dataDir) }, 202);
  });

  app.post('/api/jobs/:id/replacement', async (c) => {
    const source = deps.store.getJob(c.req.param('id'));
    if (!source) throw new HttpError('生成任务不存在', 404);
    const form = await c.req.formData();
    const value = form.get('video');
    if (!(value instanceof File) || value.size === 0) throw new HttpError('请上传替代视频', 422);
    if (!['.mp4', '.mov', '.webm'].includes(path.extname(value.name).toLowerCase())) {
      throw new HttpError('替代视频仅支持 MP4、MOV、WebM', 422);
    }
    const directory = path.join(deps.dataDir, 'projects', source.projectId, 'replacements');
    await mkdir(directory, { recursive: true });
    const outputPath = path.join(directory, `${source.unitId}-${Date.now()}${path.extname(value.name).toLowerCase()}`);
    await writeFile(outputPath, Buffer.from(await value.arrayBuffer()));
    const replacement = deps.reviewService.addReplacement(source.id, outputPath);
    const project = deps.store.getProject(replacement.projectId)!;
    return c.json({ project: presentProject(project, deps.store.listJobs(project.id), deps.dataDir) }, 201);
  });
}
