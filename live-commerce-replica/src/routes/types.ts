import type { VideoProbe, GenerationJob, Project } from '../core/types.js';
import type { ProjectService } from '../services/project-service.js';
import type { ReviewService } from '../services/review-service.js';
import type { ProjectStore } from '../store/project-store.js';

/** Hono 上下文变量：auth 中间件提取的 Authorization 头值。 */
export type AppType = { Variables: { auth: string } };

export interface RouteDependencies {
  dataDir: string;
  demoMode: boolean;
  /** 视频生成每秒费用（积分/秒），用于前端展示扣费预估。 */
  videoCostPerSecond: number;
  store: ProjectStore;
  projectService: ProjectService;
  reviewService: ReviewService;
  worker: { tick(): Promise<void> };
  probeUpload(filePath: string): Promise<VideoProbe>;
  render(project: Project, jobs: GenerationJob[], outputPath: string): Promise<string>;
}

export class HttpError extends Error {
  constructor(message: string, readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 422) {
    super(message);
  }
}
