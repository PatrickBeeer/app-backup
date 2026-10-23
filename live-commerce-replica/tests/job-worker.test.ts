import { describe, expect, it } from 'vitest';
import { JobWorker } from '../src/services/job-worker.js';
import { NoopBillingService } from '../src/services/billing-service.js';
import { ProjectStore } from '../src/store/project-store.js';
import type {
  CprtMultimodalPayload,
  NormalizedRemoteTask,
  VideoProvider
} from '../src/providers/cprt.js';
import type { GenerationJob, Project } from '../src/core/types.js';

class FakeProvider implements VideoProvider {
  submittedPayloads: CprtMultimodalPayload[] = [];
  queriedIds: string[] = [];
  queryResult: NormalizedRemoteTask = { taskId: 'remote-42', status: 'RUNNING', rawStatus: 'RUNNING' };

  async submit(payload: CprtMultimodalPayload): Promise<{ taskId: string }> {
    this.submittedPayloads.push(payload);
    return { taskId: 'new-remote' };
  }

  async query(taskId: string): Promise<NormalizedRemoteTask> {
    this.queriedIds.push(taskId);
    return this.queryResult;
  }
}

function fixture(): { store: ProjectStore; project: Project; job: GenerationJob } {
  const store = new ProjectStore(':memory:');
  const project = store.createProject({
    name: '项目', ratio: '9:16', presenterMode: 'reference', referenceVideo: 'reference.mp4',
    personPhotos: ['p1.jpg', 'p2.jpg', 'p3.jpg'], productImages: ['sku.jpg'],
    product: { name: '水杯', price: '', sellingPoints: ['保温'], specifications: [], requiredClaims: [], forbiddenClaims: [] }
  });
  project.status = 'GENERATING';
  project.confirmedAt = '2026-08-13T00:00:00.000Z';
  project.analysis = {
    probe: { duration: 30, width: 1080, height: 1920, fps: 30, hasVideo: true, hasAudio: true },
    shots: [], speechSegments: [], script: [], overlays: [], summary: '', degraded: false, warnings: [],
    generationUnits: [{
      id: 'unit-1', start: 0, end: 6, duration: 6, requestDuration: 6, shotIds: [], scriptLineIds: [],
      referenceClip: 'unit-1.mp4', referenceAudio: 'unit-1.mp3', firstFrame: 'first.jpg', lastFrame: 'last.jpg'
    }]
  };
  store.saveProject(project);
  const job: GenerationJob = {
    id: 'job-1', projectId: project.id, unitId: 'unit-1', provider: 'cprt-multimodal', status: 'QUEUED',
    attempt: 1, maxAttempts: 2, accepted: false, issues: [], remoteId: 'remote-42', auth: 'Bearer test-token',
    createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z'
  };
  store.createJob(job);
  return { store, project, job };
}

describe('JobWorker', () => {
  it('polls a persisted remote id without resubmitting after restart', async () => {
    const { store } = fixture();
    const provider = new FakeProvider();
    const worker = new JobWorker({
      store, provider,
      publisher: { publish: async (filePath: string, _auth: string) => `https://media.example/${filePath}` },
      prepareReferenceClip: async (inputPath: string) => inputPath,
      demoGenerator: { generate: async () => 'demo.mp4' },
      billing: new NoopBillingService(),
      download: async () => 'download.mp4',
      inspect: async () => ({
        passed: true, score: 100, issues: [], semanticStatus: 'pending',
        technical: { hasVideo: true, hasAudio: true, resolutionMatches: true }
      })
    });

    await worker.tick();

    expect(provider.submittedPayloads).toHaveLength(0);
    expect(provider.queriedIds).toEqual(['remote-42']);
    expect(store.getJob('job-1')?.status).toBe('RUNNING');
  });

  it('submits a pending multimodal task once and persists its remote id', async () => {
    const { store, job } = fixture();
    job.status = 'PENDING';
    delete job.remoteId;
    store.saveJob(job);
    const provider = new FakeProvider();
    const publishedPaths: string[] = [];
    const preparedPaths: Array<{
      inputPath: string;
      unit: { start: number; duration: number };
      outputPath: string;
    }> = [];
    const worker = new JobWorker({
      store, provider,
      publisher: { publish: async (filePath: string, _auth: string) => {
        publishedPaths.push(filePath);
        return `https://media.example/${filePath}`;
      } },
      prepareReferenceClip: async (inputPath: string, unit, outputPath: string) => {
        preparedPaths.push({
          inputPath,
          unit: { start: unit.start, duration: unit.duration },
          outputPath
        });
        return outputPath;
      },
      demoGenerator: { generate: async () => 'demo.mp4' },
      billing: new NoopBillingService(),
      download: async () => 'download.mp4',
      inspect: async () => ({
        passed: true, score: 100, issues: [], semanticStatus: 'pending',
        technical: { hasVideo: true, hasAudio: true, resolutionMatches: true }
      })
    });

    await worker.tick();

    expect(provider.submittedPayloads).toHaveLength(1);
    expect(preparedPaths).toEqual([{
      inputPath: 'reference.mp4',
      unit: { start: 0, duration: 6 },
      outputPath: 'unit-1-with-audio.mp4'
    }]);
    const submitted = provider.submittedPayloads[0] as CprtMultimodalPayload;
    expect(submitted.model).toBe('XG-MASTER-VIDEO-2.5');
    expect(submitted.generate_audio).toBe(true);
    expect(submitted.ratio).toBe('9:16');
    expect(submitted.duration).toBe(6);
    expect(submitted.content.map((c) => c.type)).toEqual([
      'text', 'image_url', 'image_url', 'image_url', 'image_url', 'video_url'
    ]);
    expect(submitted.content.filter((c) => c.type === 'image_url').map((c) => c.image_url?.url)).toEqual([
      'https://media.example/p1.jpg',
      'https://media.example/p2.jpg',
      'https://media.example/p3.jpg',
      'https://media.example/sku.jpg'
    ]);
    const videoItem = submitted.content.find((c) => c.type === 'video_url');
    expect(videoItem?.video_url?.url).toBe('https://media.example/unit-1-with-audio.mp4');
    expect(videoItem?.role).toBe('reference_video');
    expect(publishedPaths).not.toContain('unit-1.mp3');
    expect(store.getJob('job-1')).toEqual(expect.objectContaining({ status: 'QUEUED', remoteId: 'new-remote' }));
  });

  it('requeues one failed attempt but stops after the configured maximum', async () => {
    const { store, job } = fixture();
    const provider = new FakeProvider();
    provider.queryResult = { taskId: 'remote-42', status: 'FAILED', rawStatus: 'FAILED', error: 'upstream failed' };
    const worker = new JobWorker({
      store, provider,
      publisher: { publish: async (filePath: string, _auth: string) => `https://media.example/${filePath}` },
      prepareReferenceClip: async (inputPath: string) => inputPath,
      demoGenerator: { generate: async () => 'demo.mp4' },
      billing: new NoopBillingService(),
      download: async () => 'download.mp4',
      inspect: async () => ({
        passed: true, score: 100, issues: [], semanticStatus: 'pending',
        technical: { hasVideo: true, hasAudio: true, resolutionMatches: true }
      })
    });

    await worker.tick();
    expect(store.getJob(job.id)).toEqual(expect.objectContaining({ status: 'PENDING', attempt: 2 }));
    await worker.tick();
    await worker.tick();
    expect(store.getJob(job.id)?.status).toBe('FAILED');
  });

  it('stops immediately when the provider rejects sensitive input material', async () => {
    const { store, job } = fixture();
    const provider = new FakeProvider();
    provider.queryResult = {
      taskId: 'remote-42',
      status: 'FAILED',
      rawStatus: 'FAILED',
      error: 'Input material may contain sensitive content. Please replace the material and try again'
    };
    const worker = new JobWorker({
      store, provider,
      publisher: { publish: async (filePath: string, _auth: string) => `https://media.example/${filePath}` },
      demoGenerator: { generate: async () => 'demo.mp4' },
      billing: new NoopBillingService(),
      download: async () => 'download.mp4',
      inspect: async () => ({
        passed: true, score: 100, issues: [], semanticStatus: 'pending',
        technical: { hasVideo: true, hasAudio: true, resolutionMatches: true }
      })
    });

    await worker.tick();

    expect(store.getJob(job.id)).toEqual(expect.objectContaining({ status: 'FAILED', attempt: 1 }));
    expect(provider.queriedIds).toEqual(['remote-42']);
  });
});
