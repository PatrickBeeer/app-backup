import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { CreateProjectInput, GenerationJob, Project } from '../core/types.js';
import { simplifyChinese } from '../text/simplified-chinese.js';

function parseProject(json: string): Project {
  const project = JSON.parse(json) as Project;
  if (!project.analysis) return project;
  if (project.analysis.referenceTranscript) {
    project.analysis.referenceTranscript = project.analysis.referenceTranscript.map((segment) => ({
      ...segment,
      text: simplifyChinese(segment.text)
    }));
  }
  project.analysis.script = project.analysis.script.map((line) => ({ ...line, text: simplifyChinese(line.text) }));
  project.analysis.overlays = project.analysis.overlays.map((overlay) => ({
    ...overlay,
    text: simplifyChinese(overlay.text)
  }));
  project.analysis.summary = simplifyChinese(project.analysis.summary);
  return project;
}

export class ProjectStore {
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    if (databasePath !== ':memory:') {
      mkdirSync(path.dirname(databasePath), { recursive: true });
    }
    this.database = new DatabaseSync(databasePath);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        updated_at TEXT NOT NULL,
        data_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS generation_jobs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        data_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_generation_jobs_project
        ON generation_jobs(project_id, updated_at);
    `);
  }

  createProject(input: CreateProjectInput): Project {
    const now = new Date().toISOString();
    const project: Project = {
      id: randomUUID(),
      name: input.name.trim(),
      ratio: input.ratio,
      presenterMode: input.presenterMode,
      referenceVideo: input.referenceVideo,
      personPhotos: [...input.personPhotos],
      productImages: [...input.productImages],
      product: {
        name: input.product.name.trim(),
        price: input.product.price.trim(),
        sellingPoints: [...input.product.sellingPoints],
        specifications: [...input.product.specifications],
        requiredClaims: [...input.product.requiredClaims],
        forbiddenClaims: [...input.product.forbiddenClaims]
      },
      status: 'DRAFT',
      createdAt: now,
      updatedAt: now
    };
    this.saveProject(project);
    return project;
  }

  saveProject(project: Project): void {
    this.database
      .prepare(`
        INSERT INTO projects (id, updated_at, data_json)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          updated_at = excluded.updated_at,
          data_json = excluded.data_json
      `)
      .run(project.id, project.updatedAt, JSON.stringify(project));
  }

  getProject(id: string): Project | undefined {
    const row = this.database.prepare('SELECT data_json FROM projects WHERE id = ?').get(id) as
      | { data_json: string }
      | undefined;
    return row ? parseProject(row.data_json) : undefined;
  }

  listProjects(): Project[] {
    const rows = this.database
      .prepare('SELECT data_json FROM projects ORDER BY updated_at DESC, id DESC')
      .all() as Array<{ data_json: string }>;
    return rows.map((row) => parseProject(row.data_json));
  }

  createJob(job: GenerationJob): void {
    this.saveJob(job);
  }

  saveJob(job: GenerationJob): void {
    this.database
      .prepare(`
        INSERT INTO generation_jobs (id, project_id, updated_at, data_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          project_id = excluded.project_id,
          updated_at = excluded.updated_at,
          data_json = excluded.data_json
      `)
      .run(job.id, job.projectId, job.updatedAt, JSON.stringify(job));
  }

  getJob(id: string): GenerationJob | undefined {
    const row = this.database.prepare('SELECT data_json FROM generation_jobs WHERE id = ?').get(id) as
      | { data_json: string }
      | undefined;
    return row ? (JSON.parse(row.data_json) as GenerationJob) : undefined;
  }

  listJobs(projectId: string): GenerationJob[] {
    const rows = this.database
      .prepare('SELECT data_json FROM generation_jobs WHERE project_id = ? ORDER BY updated_at ASC, id ASC')
      .all(projectId) as Array<{ data_json: string }>;
    return rows.map((row) => JSON.parse(row.data_json) as GenerationJob);
  }

  listActiveJobs(): GenerationJob[] {
    const active = new Set(['PENDING', 'SUBMITTING', 'QUEUED', 'RUNNING', 'DOWNLOADING']);
    const rows = this.database.prepare('SELECT data_json FROM generation_jobs ORDER BY updated_at ASC').all() as Array<{
      data_json: string;
    }>;
    return rows
      .map((row) => JSON.parse(row.data_json) as GenerationJob)
      .filter((job) => active.has(job.status));
  }
}
