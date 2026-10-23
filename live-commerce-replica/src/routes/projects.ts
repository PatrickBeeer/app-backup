import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Hono } from 'hono';
import { z } from 'zod';
import type { GenerationJob, Project, Ratio } from '../core/types.js';
import { generationJobDisplayIssues } from '../core/job-errors.js';
import { resolvePresenterMode } from '../core/presenter.js';
import { HttpError, type AppType, type RouteDependencies } from './types.js';

function splitLines(value: FormDataEntryValue | null): string[] {
  return typeof value === 'string'
    ? value.split(/\r?\n|，|,/).map((item) => item.trim()).filter(Boolean)
    : [];
}

function requiredText(form: FormData, name: string, label: string): string {
  const value = form.get(name);
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(`请填写${label}`, 422);
  return value.trim();
}

function files(form: FormData, name: string): File[] {
  return form.getAll(name).filter((value): value is File => value instanceof File && value.size > 0);
}

function safeFileName(file: File, prefix: string, index = 1): string {
  const extension = path.extname(file.name).toLowerCase();
  return `${prefix}-${String(index).padStart(2, '0')}${extension}`;
}

async function saveFile(directory: string, file: File, prefix: string, index = 1): Promise<string> {
  await mkdir(directory, { recursive: true });
  const outputPath = path.join(directory, safeFileName(file, prefix, index));
  await writeFile(outputPath, Buffer.from(await file.arrayBuffer()));
  return outputPath;
}

function mediaUrl(dataDir: string, filePath: string | undefined): string | undefined {
  if (!filePath) return undefined;
  const relative = path.relative(path.resolve(dataDir), path.resolve(filePath));
  if (relative.startsWith('..') || path.isAbsolute(relative)) return undefined;
  return `media/${relative.split(path.sep).map(encodeURIComponent).join('/')}`;
}

export function presentProject(project: Project, jobs: GenerationJob[], dataDir: string): Record<string, unknown> {
  return {
    ...project,
    presenterMode: resolvePresenterMode(project),
    media: {
      referenceVideo: mediaUrl(dataDir, project.referenceVideo),
      personPhotos: project.personPhotos.map((filePath) => mediaUrl(dataDir, filePath)),
      productImages: project.productImages.map((filePath) => mediaUrl(dataDir, filePath)),
      finalVideo: mediaUrl(dataDir, project.finalVideo),
      units: Object.fromEntries((project.analysis?.generationUnits ?? []).map((unit) => [unit.id, {
        referenceClip: mediaUrl(dataDir, unit.referenceClip),
        firstFrame: mediaUrl(dataDir, unit.firstFrame),
        lastFrame: mediaUrl(dataDir, unit.lastFrame)
      }]))
    },
    jobs: jobs.map((job) => ({
      ...job,
      outputUrl: mediaUrl(dataDir, job.outputPath),
      displayIssues: generationJobDisplayIssues(job),
      retryable: true
    }))
  };
}

export function registerProjectRoutes(app: Hono<AppType>, deps: RouteDependencies): void {
  app.get('/api/projects', (c) => c.json({
    projects: deps.store.listProjects().map((project) => presentProject(project, deps.store.listJobs(project.id), deps.dataDir))
  }));

  app.post('/api/projects', async (c) => {
    const form = await c.req.formData();
    const reference = files(form, 'referenceVideo')[0];
    const personPhotos = files(form, 'personPhotos');
    const productImages = files(form, 'productImages');
    const presenterModeValue = requiredText(form, 'presenterMode', '人物来源');
    if (presenterModeValue !== 'reference' && presenterModeValue !== 'generated') {
      throw new HttpError('人物来源必须为指定模特或模型生成人物', 422);
    }
    if (!reference) throw new HttpError('请上传参考视频', 422);
    if (!['.mp4', '.mov', '.webm'].includes(path.extname(reference.name).toLowerCase())) {
      throw new HttpError('参考视频仅支持 MP4、MOV、WebM', 422);
    }
    if (reference.size > 200 * 1024 * 1024) throw new HttpError('参考视频不能超过 200 MB', 413);
    if (presenterModeValue === 'reference' && (personPhotos.length < 1 || personPhotos.length > 5)) {
      throw new HttpError('指定模特模式请上传 1–5 张同一位成年人物照片', 422);
    }
    if (presenterModeValue === 'generated' && personPhotos.length > 0) {
      throw new HttpError('模型生成人物模式请勿上传人物照片', 422);
    }
    if (productImages.length < 1 || productImages.length > 9) throw new HttpError('请上传 1–9 张商品图片', 422);
    if ([...personPhotos, ...productImages].some((file) => file.size > 30 * 1024 * 1024)) {
      throw new HttpError('单张图片不能超过 30 MB', 413);
    }

    const ratioValue = requiredText(form, 'ratio', '输出画幅');
    if (ratioValue !== '9:16' && ratioValue !== '16:9') throw new HttpError('输出画幅必须为 9:16 或 16:9', 422);
    const uploadId = randomUUID();
    const uploadDir = path.join(deps.dataDir, 'projects', uploadId, 'source');
    try {
      const referencePath = await saveFile(uploadDir, reference, 'reference');
      const probe = await deps.probeUpload(referencePath);
      if (!probe.hasVideo) throw new HttpError('参考文件中没有可解码的视频流', 422);
      if (presenterModeValue === 'generated' && probe.duration > 15) {
        throw new HttpError('参考视频超过 15 秒，为保持分段人物一致性，请上传 1–5 张指定模特照片', 422);
      }
      const savedPersonPhotos = await Promise.all(
        personPhotos.map((file, index) => saveFile(path.join(uploadDir, 'people'), file, 'person', index + 1))
      );
      const savedProductImages = await Promise.all(
        productImages.map((file, index) => saveFile(path.join(uploadDir, 'product'), file, 'product', index + 1))
      );
      const project = deps.store.createProject({
        name: requiredText(form, 'name', '项目名称'),
        ratio: ratioValue as Ratio,
        presenterMode: presenterModeValue,
        referenceVideo: referencePath,
        personPhotos: savedPersonPhotos,
        productImages: savedProductImages,
        product: {
          name: requiredText(form, 'productName', '商品名称'),
          price: typeof form.get('price') === 'string' ? String(form.get('price')).trim() : '',
          sellingPoints: splitLines(form.get('sellingPoints')),
          specifications: splitLines(form.get('specifications')),
          requiredClaims: splitLines(form.get('requiredClaims')),
          forbiddenClaims: splitLines(form.get('forbiddenClaims'))
        }
      });
      return c.json({ project: presentProject(project, [], deps.dataDir) }, 201);
    } catch (error) {
      await rm(path.join(deps.dataDir, 'projects', uploadId), { recursive: true, force: true });
      throw error;
    }
  });

  app.get('/api/projects/:id', (c) => {
    const project = deps.store.getProject(c.req.param('id'));
    if (!project) throw new HttpError('项目不存在', 404);
    return c.json({ project: presentProject(project, deps.store.listJobs(project.id), deps.dataDir) });
  });

  app.post('/api/projects/:id/analyze', async (c) => {
    const project = await deps.projectService.analyze(c.req.param('id'));
    return c.json({ project: presentProject(project, deps.store.listJobs(project.id), deps.dataDir) });
  });

  app.post('/api/projects/:id/confirm', (c) => {
    const project = deps.projectService.confirm(c.req.param('id'));
    return c.json({ project: presentProject(project, deps.store.listJobs(project.id), deps.dataDir) });
  });

  app.patch('/api/projects/:id/script', async (c) => {
    const schema = z.object({
      lines: z.array(z.object({ id: z.string().min(1), text: z.string() })).min(1)
    });
    let input: z.infer<typeof schema>;
    try {
      input = schema.parse(await c.req.json());
    } catch {
      throw new HttpError('新口播参数无效', 422);
    }
    const project = deps.projectService.updateScript(c.req.param('id'), input.lines);
    return c.json({ project: presentProject(project, deps.store.listJobs(project.id), deps.dataDir) });
  });

  app.post('/api/projects/:id/generate', (c) => {
    const auth = (c.get('auth') as string | undefined) ?? '';
    if (!deps.demoMode && !auth) throw new HttpError('未授权：请先登录后再触发生成', 401);
    const jobs = deps.projectService.startGeneration(c.req.param('id'), deps.demoMode, auth);
    void deps.worker.tick();
    const project = deps.store.getProject(c.req.param('id'))!;
    return c.json({ project: presentProject(project, jobs, deps.dataDir) }, 202);
  });

  app.post('/api/projects/:id/render', async (c) => {
    const project = deps.store.getProject(c.req.param('id'));
    if (!project) throw new HttpError('项目不存在', 404);
    if (project.status !== 'READY_TO_RENDER') throw new HttpError('仍有片段未通过审核', 409);
    const jobs = deps.store.listJobs(project.id);
    const fileName = `${project.name.replace(/[<>:"/\\|?*]+/g, '-')}.mp4`;
    const outputPath = path.join(deps.dataDir, 'projects', project.id, 'final', fileName);
    project.status = 'RENDERING';
    project.updatedAt = new Date().toISOString();
    deps.store.saveProject(project);
    try {
      project.finalVideo = await deps.render(project, jobs, outputPath);
      project.status = 'COMPLETED';
      delete project.error;
    } catch (error) {
      project.status = 'READY_TO_RENDER';
      project.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      project.updatedAt = new Date().toISOString();
      deps.store.saveProject(project);
    }
    return c.json({ project: presentProject(project, jobs, deps.dataDir) });
  });
}
