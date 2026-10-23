import { randomUUID } from 'node:crypto';
import type { GenerationJob, Project } from '../core/types.js';
import type { ProjectStore } from '../store/project-store.js';

export class ReviewService {
  constructor(private readonly store: ProjectStore) {}

  accept(jobId: string): GenerationJob {
    const job = this.requireJob(jobId);
    if (!job.outputPath) throw new Error('当前候选没有可用视频');
    const candidates = this.store.listJobs(job.projectId).filter((item) => item.unitId === job.unitId);
    for (const candidate of candidates) {
      candidate.accepted = candidate.id === job.id;
      if (candidate.id === job.id) candidate.status = 'ACCEPTED';
      else if (candidate.status === 'ACCEPTED') candidate.status = 'REVIEW_REQUIRED';
      candidate.updatedAt = new Date().toISOString();
      this.store.saveJob(candidate);
    }
    this.syncProject(job.projectId);
    return this.requireJob(job.id);
  }

  regenerate(jobId: string, auth = ''): GenerationJob {
    const previous = this.requireJob(jobId);
    const now = new Date().toISOString();
    const next: GenerationJob = {
      id: randomUUID(),
      projectId: previous.projectId,
      unitId: previous.unitId,
      provider: previous.provider === 'demo' ? 'demo' : 'cprt-multimodal',
      status: 'PENDING',
      attempt: previous.attempt + 1,
      maxAttempts: previous.attempt + 2,
      accepted: false,
      issues: [],
      auth,
      createdAt: now,
      updatedAt: now
    };
    this.store.createJob(next);
    const project = this.requireProject(previous.projectId);
    project.status = 'GENERATING';
    project.updatedAt = now;
    this.store.saveProject(project);
    return next;
  }

  addReplacement(sourceJobId: string, outputPath: string): GenerationJob {
    const source = this.requireJob(sourceJobId);
    const now = new Date().toISOString();
    const replacement: GenerationJob = {
      id: randomUUID(),
      projectId: source.projectId,
      unitId: source.unitId,
      provider: 'replacement',
      status: 'REVIEW_REQUIRED',
      attempt: source.attempt + 1,
      maxAttempts: source.attempt + 1,
      accepted: false,
      issues: ['用户上传的替代片段，接受前请检查声音与时长'],
      outputPath,
      createdAt: now,
      updatedAt: now
    };
    this.store.createJob(replacement);
    this.syncProject(source.projectId);
    return replacement;
  }

  private syncProject(projectId: string): void {
    const project = this.requireProject(projectId);
    const jobs = this.store.listJobs(projectId);
    const units = project.analysis?.generationUnits ?? [];
    project.status = units.length > 0 && units.every((unit) => jobs.some((job) => job.unitId === unit.id && job.accepted))
      ? 'READY_TO_RENDER'
      : 'NEEDS_REVIEW';
    project.updatedAt = new Date().toISOString();
    this.store.saveProject(project);
  }

  private requireJob(jobId: string): GenerationJob {
    const job = this.store.getJob(jobId);
    if (!job) throw new Error('生成任务不存在');
    return job;
  }

  private requireProject(projectId: string): Project {
    const project = this.store.getProject(projectId);
    if (!project) throw new Error('项目不存在');
    return project;
  }
}
