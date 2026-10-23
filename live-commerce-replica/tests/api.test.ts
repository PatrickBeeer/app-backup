import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ProjectService } from '../src/services/project-service.js';
import { ReviewService } from '../src/services/review-service.js';
import { ProjectStore } from '../src/store/project-store.js';

function form(): FormData {
  const body = new FormData();
  body.set('name', '水杯复刻');
  body.set('ratio', '9:16');
  body.set('presenterMode', 'reference');
  body.set('productName', '便携保温杯');
  body.set('price', '99 元');
  body.set('sellingPoints', '316 不锈钢\n单手开盖');
  body.set('specifications', '500mL');
  body.set('requiredClaims', '食品接触级材质');
  body.set('forbiddenClaims', '全网最低价');
  body.set('referenceVideo', new File([new Uint8Array([1, 2, 3])], 'reference.mp4', { type: 'video/mp4' }));
  for (let index = 1; index <= 3; index += 1) {
    body.append('personPhotos', new File([new Uint8Array([index])], `person-${index}.jpg`, { type: 'image/jpeg' }));
  }
  body.append('productImages', new File([new Uint8Array([9])], 'product.jpg', { type: 'image/jpeg' }));
  return body;
}

function setup(duration = 36) {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'jingke-api-'));
  const store = new ProjectStore(':memory:');
  const projectService = new ProjectService({
    store, dataDir, ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe',
    media: {
      probeVideo: async () => ({ duration, width: 1080, height: 1920, fps: 30, hasVideo: true, hasAudio: true }),
      detectShots: async () => [], detectSpeechSegments: async () => [], extractRepresentativeFrames: async () => [],
      sliceGenerationUnit: async (_input, _unit, output) => output,
      extractBoundaryFrame: async (_input, _time, output) => output
    }
  });
  const app = createApp({
    dataDir, demoMode: true, videoCostPerSecond: 15, store, projectService, reviewService: new ReviewService(store),
    worker: { tick: async () => undefined },
    probeUpload: async () => ({ duration, width: 1080, height: 1920, fps: 30, hasVideo: true, hasAudio: true }),
    render: async (_project, _jobs, outputPath) => outputPath
  });
  return { app, store, projectService, dataDir };
}

describe('local workflow API', () => {
  it.each([12, 95])('creates a project for a %d-second reference without a product duration cap', async (duration) => {
    const { app, store } = setup(duration);

    const response = await app.request('/api/projects', { method: 'POST', body: form() });

    expect(response.status).toBe(201);
    expect(store.listProjects()).toHaveLength(1);
  });

  it('creates a reference-presenter draft from one person photo', async () => {
    const { app, store } = setup();
    const upload = form();
    upload.delete('personPhotos');
    upload.append('personPhotos', new File([new Uint8Array([1])], 'person-1.jpg', { type: 'image/jpeg' }));

    const response = await app.request('/api/projects', { method: 'POST', body: upload });
    const body = await response.json() as { project: { name: string; ratio: string; product: { sellingPoints: string[] } } };

    expect(response.status).toBe(201);
    expect(body.project).toEqual(expect.objectContaining({ name: '水杯复刻', ratio: '9:16' }));
    expect(body.project.product.sellingPoints).toEqual(['316 不锈钢', '单手开盖']);
    expect(store.listProjects()[0]?.personPhotos).toHaveLength(1);
  });

  it('accepts generated presenter mode without person photos at the 15-second boundary', async () => {
    const { app, store } = setup(15);
    const body = form();
    body.set('presenterMode', 'generated');
    body.delete('personPhotos');

    const response = await app.request('/api/projects', { method: 'POST', body });

    expect(response.status).toBe(201);
    expect(store.listProjects()[0]).toEqual(expect.objectContaining({
      presenterMode: 'generated',
      personPhotos: []
    }));
  });

  it('requires presenter photos when a generated-presenter reference exceeds 15 seconds', async () => {
    const { app, store } = setup(15.001);
    const body = form();
    body.set('presenterMode', 'generated');
    body.delete('personPhotos');

    const response = await app.request('/api/projects', { method: 'POST', body });
    const responseBody = await response.json() as { error: string };

    expect(response.status).toBe(422);
    expect(responseBody.error).toContain('超过 15 秒');
    expect(store.listProjects()).toHaveLength(0);
  });

  it('rejects reference presenter mode without person photos', async () => {
    const { app, store } = setup(12);
    const body = form();
    body.delete('personPhotos');

    const response = await app.request('/api/projects', { method: 'POST', body });

    expect(response.status).toBe(422);
    expect(store.listProjects()).toHaveLength(0);
  });

  it('keeps the paid generation route behind the explicit confirmation gate', async () => {
    const { app, store } = setup();
    const project = store.createProject({
      name: '项目', ratio: '9:16', presenterMode: 'generated', referenceVideo: 'reference.mp4', personPhotos: [], productImages: [],
      product: { name: '', price: '', sellingPoints: [], specifications: [], requiredClaims: [], forbiddenClaims: [] }
    });
    project.status = 'READY_TO_CONFIRM';
    project.analysis = {
      probe: { duration: 36, width: 1080, height: 1920, fps: 30, hasVideo: true, hasAudio: true },
      shots: [], speechSegments: [], script: [], overlays: [], summary: '', degraded: false, warnings: [],
      generationUnits: [{ id: 'unit-1', start: 0, end: 10, duration: 10, requestDuration: 10, shotIds: [], scriptLineIds: [] }]
    };
    store.saveProject(project);

    const response = await app.request(`/api/projects/${project.id}/generate`, { method: 'POST' });

    expect(response.status).toBe(409);
    expect(store.listJobs(project.id)).toHaveLength(0);
  });

  it('updates rewritten copy through the pre-payment script endpoint', async () => {
    const { app, store } = setup();
    const project = store.createProject({
      name: '项目', ratio: '9:16', presenterMode: 'generated', referenceVideo: 'reference.mp4', personPhotos: [], productImages: [],
      product: { name: '短袖', price: '', sellingPoints: ['透气'], specifications: ['短袖'], requiredClaims: [], forbiddenClaims: ['长袖'] }
    });
    project.status = 'READY_TO_CONFIRM';
    project.analysis = {
      probe: { duration: 4, width: 1080, height: 1920, fps: 30, hasVideo: true, hasAudio: true },
      shots: [], speechSegments: [{ id: 'speech-1', start: 0, end: 4 }],
      referenceTranscript: [{ id: 'speech-1', start: 0, end: 4, text: '这件长袖很显瘦' }],
      script: [{ id: 'line-1', start: 0, end: 4, text: '这件短袖清爽透气', source: 'llm' }],
      overlays: [], summary: '', degraded: false, warnings: [],
      generationUnits: [{ id: 'unit-1', start: 0, end: 4, duration: 4, requestDuration: 4, shotIds: [], scriptLineIds: ['line-1'] }]
    };
    store.saveProject(project);

    const response = await app.request(`/api/projects/${project.id}/script`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines: [{ id: 'line-1', text: '这件短袖穿起来清爽透气' }] })
    });
    const body = await response.json() as { project: { analysis: { script: Array<{ text: string }> } } };

    expect(response.status).toBe(200);
    expect(body.project.analysis.script[0]?.text).toBe('这件短袖穿起来清爽透气');
  });

  it('rejects malformed script edit requests with 422', async () => {
    const { app, store } = setup();
    const project = store.createProject({
      name: '项目', ratio: '9:16', presenterMode: 'generated', referenceVideo: 'reference.mp4', personPhotos: [], productImages: [],
      product: { name: '短袖', price: '', sellingPoints: [], specifications: [], requiredClaims: [], forbiddenClaims: [] }
    });

    const response = await app.request(`/api/projects/${project.id}/script`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines: [] })
    });

    expect(response.status).toBe(422);
  });

  it('blocks media path traversal', async () => {
    const { app } = setup();
    const response = await app.request('/media/%2e%2e/%2e%2e/secret.txt');
    expect([403, 404]).toContain(response.status);
  });

  it('presents one moderation error as manually retryable without inventing a rejection reason', async () => {
    const { app, store } = setup();
    const project = store.createProject({
      name: '项目', ratio: '9:16', presenterMode: 'generated', referenceVideo: 'reference.mp4', personPhotos: [], productImages: [],
      product: { name: '', price: '', sellingPoints: [], specifications: [], requiredClaims: [], forbiddenClaims: [] }
    });
    const upstreamMessage = 'Input material may contain sensitive content. Please replace the material and try again';
    store.createJob({
      id: 'job-sensitive', projectId: project.id, unitId: 'unit-1', provider: 'cprt-multimodal', status: 'FAILED',
      attempt: 1, maxAttempts: 2, accepted: false, issues: [upstreamMessage], error: upstreamMessage,
      createdAt: '', updatedAt: ''
    });

    const response = await app.request(`/api/projects/${project.id}`);
    const body = await response.json() as {
      project: { jobs: Array<{ displayIssues: string[]; retryable: boolean }> }
    };
    const presentedJob = body.project.jobs[0]!;

    expect(presentedJob.displayIssues).toEqual([
      upstreamMessage,
      '平台本次内容审核未通过。审核结果可能存在波动；确认人物明确成年且素材合规后，可手动再次生成，若仍失败请更换素材。'
    ]);
    expect(presentedJob.retryable).toBe(true);
  });
});
