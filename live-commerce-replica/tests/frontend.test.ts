import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ProjectService } from '../src/services/project-service.js';
import { ReviewService } from '../src/services/review-service.js';
import { ProjectStore } from '../src/store/project-store.js';

describe('product UI delivery', () => {
  it('serves the branded Chinese workspace at the root route', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'jingke-ui-'));
    const store = new ProjectStore(':memory:');
    const projectService = new ProjectService({ store, dataDir, ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe' });
    const app = createApp({
      dataDir, demoMode: true, videoCostPerSecond: 15, store, projectService, reviewService: new ReviewService(store),
      worker: { tick: async () => undefined },
      probeUpload: async () => ({ duration: 36, width: 1080, height: 1920, fps: 30, hasVideo: true, hasAudio: true }),
      render: async (_project, _jobs, outputPath) => outputPath
    });

    const response = await app.request('/');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('<title>镜刻 · 真人带货视频复刻工作台</title>');
    expect(html).toContain('id="app"');
    expect(html).toContain('/app.js');
  });

  it('serves a generated video with a Unicode file name from the media route', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'jingke-media-'));
    const mediaDir = path.join(dataDir, 'projects');
    mkdirSync(mediaDir, { recursive: true });
    writeFileSync(path.join(mediaDir, '成片.mp4'), Buffer.from('video-fixture'));
    const store = new ProjectStore(':memory:');
    const projectService = new ProjectService({ store, dataDir, ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe' });
    const app = createApp({
      dataDir, demoMode: true, videoCostPerSecond: 15, store, projectService, reviewService: new ReviewService(store),
      worker: { tick: async () => undefined },
      probeUpload: async () => ({ duration: 36, width: 1080, height: 1920, fps: 30, hasVideo: true, hasAudio: true }),
      render: async (_project, _jobs, outputPath) => outputPath
    });

    const response = await app.request('/media/projects/%E6%88%90%E7%89%87.mp4');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('video/mp4');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('video-fixture');
  });

  it('serves the presenter form state module used by the upload workflow', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'jingke-presenter-ui-'));
    const store = new ProjectStore(':memory:');
    const projectService = new ProjectService({ store, dataDir, ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe' });
    const app = createApp({
      dataDir, demoMode: true, videoCostPerSecond: 15, store, projectService, reviewService: new ReviewService(store),
      worker: { tick: async () => undefined },
      probeUpload: async () => ({ duration: 15, width: 1080, height: 1920, fps: 30, hasVideo: true, hasAudio: true }),
      render: async (_project, _jobs, outputPath) => outputPath
    });

    const response = await app.request('/presenter-form.js');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('javascript');
  });

  it('serves the script editor state module used by the confirmation workflow', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'jingke-script-ui-'));
    const store = new ProjectStore(':memory:');
    const projectService = new ProjectService({ store, dataDir, ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe' });
    const app = createApp({
      dataDir, demoMode: true, videoCostPerSecond: 15, store, projectService, reviewService: new ReviewService(store),
      worker: { tick: async () => undefined },
      probeUpload: async () => ({ duration: 15, width: 1080, height: 1920, fps: 30, hasVideo: true, hasAudio: true }),
      render: async (_project, _jobs, outputPath) => outputPath
    });

    const response = await app.request('/script-editor.js');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('javascript');
  });
});
