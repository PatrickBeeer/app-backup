import { describe, expect, it } from 'vitest';
import { ReviewService } from '../src/services/review-service.js';
import { ProjectStore } from '../src/store/project-store.js';
import type { GenerationJob } from '../src/core/types.js';

function setup() {
  const store = new ProjectStore(':memory:');
  const project = store.createProject({
    name: '项目', ratio: '9:16', presenterMode: 'generated', referenceVideo: 'reference.mp4', personPhotos: [], productImages: [],
    product: { name: '商品', price: '', sellingPoints: [], specifications: [], requiredClaims: [], forbiddenClaims: [] }
  });
  project.status = 'NEEDS_REVIEW';
  project.analysis = {
    probe: { duration: 10, width: 720, height: 1280, fps: 30, hasVideo: true, hasAudio: true },
    shots: [], speechSegments: [], script: [], overlays: [], summary: '', degraded: false, warnings: [],
    generationUnits: [
      { id: 'unit-1', start: 0, end: 5, duration: 5, requestDuration: 5, shotIds: [], scriptLineIds: [] },
      { id: 'unit-2', start: 5, end: 10, duration: 5, requestDuration: 5, shotIds: [], scriptLineIds: [] }
    ]
  };
  store.saveProject(project);
  const base = {
    projectId: project.id, provider: 'demo' as const, status: 'REVIEW_REQUIRED' as const,
    attempt: 1, maxAttempts: 2, accepted: false, issues: [], createdAt: '', updatedAt: ''
  };
  const jobs: GenerationJob[] = [
    { ...base, id: 'job-1', unitId: 'unit-1', outputPath: 'one.mp4' },
    { ...base, id: 'job-2', unitId: 'unit-2', outputPath: 'two.mp4' }
  ];
  jobs.forEach((job) => store.createJob(job));
  return { store, project, service: new ReviewService(store) };
}

describe('ReviewService', () => {
  it('marks the project render-ready only after every unit has one accepted candidate', () => {
    const { store, project, service } = setup();

    service.accept('job-1');
    expect(store.getProject(project.id)?.status).toBe('NEEDS_REVIEW');
    service.accept('job-2');
    expect(store.getProject(project.id)?.status).toBe('READY_TO_RENDER');
  });

  it('creates a fresh pending attempt without deleting the previous candidate', () => {
    const { store, service } = setup();

    const retry = service.regenerate('job-1');

    expect(retry).toEqual(expect.objectContaining({ unitId: 'unit-1', status: 'PENDING', attempt: 2 }));
    expect(store.getJob('job-1')?.outputPath).toBe('one.mp4');
    expect(store.listJobs(retry.projectId)).toHaveLength(3);
  });

  it('allows a user-confirmed retry after a one-off moderation rejection', () => {
    const { store, service } = setup();
    const failed = store.getJob('job-1')!;
    failed.status = 'FAILED';
    failed.error = 'Input material may contain sensitive content. Please replace the material and try again';
    store.saveJob(failed);

    const retry = service.regenerate('job-1');

    expect(retry).toEqual(expect.objectContaining({ unitId: 'unit-1', status: 'PENDING', attempt: 2 }));
    expect(store.listJobs(failed.projectId)).toHaveLength(3);
  });
});
