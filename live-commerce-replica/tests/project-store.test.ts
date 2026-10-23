import { describe, expect, it } from 'vitest';
import { ProjectStore } from '../src/store/project-store.js';
import type { CreateProjectInput, GenerationJob } from '../src/core/types.js';

const projectInput: CreateProjectInput = {
  name: '夏季水杯',
  ratio: '9:16',
  presenterMode: 'reference',
  referenceVideo: 'projects/demo/reference.mp4',
  personPhotos: ['projects/demo/person-1.jpg', 'projects/demo/person-2.jpg', 'projects/demo/person-3.jpg'],
  productImages: ['projects/demo/product-1.jpg'],
  product: {
    name: '便携保温杯',
    price: '99 元',
    sellingPoints: ['316 不锈钢', '单手开盖'],
    specifications: ['500mL'],
    requiredClaims: ['食品接触级材质'],
    forbiddenClaims: ['全网最低价']
  }
};

describe('ProjectStore', () => {
  it('round-trips a project while discarding unknown credential fields', () => {
    const store = new ProjectStore(':memory:');
    const saved = store.createProject({ ...projectInput, apiKey: 'secret-key' } as CreateProjectInput);

    expect(store.getProject(saved.id)?.name).toBe('夏季水杯');
    expect(store.getProject(saved.id)?.presenterMode).toBe('reference');
    expect(JSON.stringify(store.getProject(saved.id))).not.toContain('secret-key');
  });

  it('lists newest projects first', () => {
    const store = new ProjectStore(':memory:');
    const first = store.createProject({ ...projectInput, name: '第一个' });
    const second = store.createProject({ ...projectInput, name: '第二个' });
    first.updatedAt = '2026-01-01T00:00:00.000Z';
    second.updatedAt = '2026-01-02T00:00:00.000Z';
    store.saveProject(first);
    store.saveProject(second);

    expect(store.listProjects().map((project) => project.name)).toEqual(['第二个', '第一个']);
  });

  it('normalizes stored transcript and generated copy to Simplified Chinese on reads', () => {
    const store = new ProjectStore(':memory:');
    const project = store.createProject(projectInput);
    project.analysis = {
      probe: { duration: 4, width: 720, height: 1280, fps: 30, hasVideo: true, hasAudio: true },
      shots: [],
      speechSegments: [],
      referenceTranscript: [{ id: 'speech-1', start: 0, end: 4, text: '這件長袖很顯瘦' }],
      generationUnits: [],
      script: [{ id: 'line-1', start: 0, end: 4, text: '這件短袖很透氣', source: 'llm' }],
      overlays: [],
      summary: '短袖套裝口播',
      degraded: false,
      warnings: []
    };
    store.saveProject(project);

    expect(store.getProject(project.id)?.analysis?.referenceTranscript?.[0]?.text).toBe('这件长袖很显瘦');
    expect(store.listProjects()[0]?.analysis?.script[0]?.text).toBe('这件短袖很透气');
  });

  it('persists generation jobs independently from project data', () => {
    const store = new ProjectStore(':memory:');
    const project = store.createProject(projectInput);
    const job: GenerationJob = {
      id: 'job-1',
      projectId: project.id,
      unitId: 'unit-1',
      provider: 'cprt-multimodal',
      status: 'PENDING',
      attempt: 1,
      maxAttempts: 2,
      accepted: false,
      issues: [],
      createdAt: '2026-08-13T00:00:00.000Z',
      updatedAt: '2026-08-13T00:00:00.000Z'
    };

    store.createJob(job);
    job.status = 'QUEUED';
    job.remoteId = 'remote-42';
    store.saveJob(job);

    expect(store.listJobs(project.id)).toEqual([expect.objectContaining({ id: 'job-1', remoteId: 'remote-42' })]);
  });
});
