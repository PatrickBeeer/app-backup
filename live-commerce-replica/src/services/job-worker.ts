import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildUnitPrompt } from '../core/prompts.js';
import { isContentModerationError } from '../core/job-errors.js';
import { resolvePresenterMode } from '../core/presenter.js';
import type { GenerationJob, GenerationUnit, Project, QualityReport } from '../core/types.js';
import { sliceGenerationUnit } from '../media/ffmpeg.js';
import {
  buildImageFallbackPayload,
  buildMultimodalPayload,
  type VideoProvider
} from '../providers/cprt.js';
import type { MediaPublisher } from '../providers/media-publisher.js';
import type { ProjectStore } from '../store/project-store.js';
import type { DemoGeneratorPort } from './demo-generator.js';
import type { BillingService } from './billing-service.js';
import { InsufficientCreditsError, BillingAuthError } from './billing-service.js';

export interface JobWorkerDependencies {
  store: ProjectStore;
  provider: VideoProvider;
  publisher: MediaPublisher;
  demoGenerator: DemoGeneratorPort;
  billing: BillingService;
  download: (url: string, outputPath: string) => Promise<string>;
  inspect: (filePath: string, expected: { duration: number; ratio: Project['ratio'] }) => Promise<QualityReport>;
  prepareReferenceClip?: (
    inputPath: string,
    unit: GenerationUnit,
    outputPath: string
  ) => Promise<string>;
  dataDir?: string;
  ffmpegPath?: string;
  /** 主视频模型（XG-MASTER-VIDEO-2.5），来自 config.cprt.videoModel。 */
  videoModel?: string;
  /** 备用图生视频模型，来自 config.cprt.fallbackModel。 */
  fallbackModel?: string;
}

export async function downloadRemoteVideo(url: string, outputPath: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载生成结果失败（${response.status}）`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes);
  return outputPath;
}

export class JobWorker {
  private timer: NodeJS.Timeout | undefined;
  private ticking = false;

  constructor(private readonly deps: JobWorkerDependencies) {}

  start(intervalMs = 5000): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    const projectIds = new Set<string>();
    try {
      for (const job of this.deps.store.listActiveJobs()) {
        projectIds.add(job.projectId);
        try {
          await this.processJob(job);
        } catch (error) {
          this.failOrRetry(job, error instanceof Error ? error.message : String(error));
        }
      }
      projectIds.forEach((projectId) => this.syncProjectStatus(projectId));
    } finally {
      this.ticking = false;
    }
  }

  private async processJob(job: GenerationJob): Promise<void> {
    const project = this.requireProject(job.projectId);
    const unit = this.requireUnit(project, job.unitId);
    if (job.status === 'PENDING') {
      if (job.provider === 'demo') {
        await this.generateDemo(job, project, unit);
      } else {
        await this.submitRemote(job, project, unit);
      }
      return;
    }
    if ((job.status === 'QUEUED' || job.status === 'RUNNING') && job.remoteId) {
      const remote = await this.deps.provider.query(job.remoteId);
      job.remoteStatus = remote.rawStatus;
      if (remote.status === 'QUEUED' || remote.status === 'RUNNING') {
        job.status = remote.status;
        this.saveJob(job);
        return;
      }
      if (remote.status === 'FAILED') {
        this.failOrRetry(job, remote.error ?? '上游视频任务失败');
        return;
      }
      if (!remote.videoUrl) throw new Error('任务成功但未返回视频 URL');
      job.status = 'DOWNLOADING';
      job.remoteVideoUrl = remote.videoUrl;
      this.saveJob(job);
      const outputPath = this.outputPath(project, unit, job.attempt);
      const localPath = await this.deps.download(remote.videoUrl, outputPath);
      await this.finishCandidate(job, project, unit, localPath);
    }
  }

  private async generateDemo(job: GenerationJob, project: Project, unit: GenerationUnit): Promise<void> {
    job.status = 'RUNNING';
    this.saveJob(job);
    const localPath = await this.deps.demoGenerator.generate(project, unit, this.outputPath(project, unit, job.attempt));
    await this.finishCandidate(job, project, unit, localPath);
  }

  private async submitRemote(job: GenerationJob, project: Project, unit: GenerationUnit): Promise<void> {
    job.status = 'SUBMITTING';
    this.saveJob(job);
    const auth = job.auth ?? '';

    // 预扣积分：按当前每秒费率 × requestDuration。在提交 CPRT 前扣费，
    // 失败/重试时退款。余额不足直接失败（不重试）。
    if (!job.billingTransactionId) {
      try {
        const deduction = await this.deps.billing.deductForVideo(auth, unit.requestDuration);
        job.billingTransactionId = deduction.transactionId;
        this.saveJob(job);
      } catch (error) {
        if (error instanceof InsufficientCreditsError || error instanceof BillingAuthError) {
          // 余额不足或 token 过期：永久失败，不重试。
          job.status = 'FAILED';
          job.error = error.message;
          job.issues = [...job.issues, error.message];
          this.saveJob(job);
          return;
        }
        throw error;
      }
    }

    const personUrls = await Promise.all(project.personPhotos.map((filePath) => this.deps.publisher.publish(filePath, auth)));
    const productUrls = await Promise.all(project.productImages.map((filePath) => this.deps.publisher.publish(filePath, auth)));
    const prompt = buildUnitPrompt(project, unit);
    let payload;
    if (unit.referenceClip) {
      const parsedReference = path.parse(unit.referenceClip);
      const voiceReferencePath = path.join(
        parsedReference.dir,
        `${parsedReference.name}-with-audio${parsedReference.ext || '.mp4'}`
      );
      const prepareReferenceClip = this.deps.prepareReferenceClip
        ?? ((inputPath: string, generationUnit: GenerationUnit, outputPath: string) => sliceGenerationUnit(
          inputPath,
          generationUnit,
          outputPath,
          this.deps.ffmpegPath
        ));
      const preparedReferenceClip = await prepareReferenceClip(
        project.referenceVideo,
        unit,
        voiceReferencePath
      );
      const referenceVideoUrl = await this.deps.publisher.publish(preparedReferenceClip, auth);
      const multimodalPayload = buildMultimodalPayload({
        presenterMode: resolvePresenterMode(project),
        ...(this.deps.videoModel ? { model: this.deps.videoModel } : {}),
        personUrls,
        productUrls,
        referenceVideoUrl,
        prompt,
        ratio: project.ratio,
        requestDuration: unit.requestDuration
      });
      // 设计文档 §6：主模型提交失败时改用首尾帧备用模型兜底，避免对已知
      // 失效的上游（如 CPRT multimodal-video 返回"上游返回的任务id为空"）
      // 重复重试同一付费请求。multimodal 提交未生成任务 id 时不计费。
      try {
        const submitted = await this.deps.provider.submit(multimodalPayload);
        job.remoteId = submitted.taskId;
        job.status = 'QUEUED';
        this.saveJob(job);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!unit.firstFrame) throw error;
        job.provider = 'cprt-image-fallback';
        job.issues = [...new Set([...job.issues, `主模型提交失败（${message}），已改用首尾帧兜底`])];
        payload = buildImageFallbackPayload({
          firstFrameUrl: await this.deps.publisher.publish(unit.firstFrame, auth),
          ...(unit.lastFrame ? { lastFrameUrl: await this.deps.publisher.publish(unit.lastFrame, auth) } : {}),
          prompt,
          requestDuration: unit.requestDuration
        });
      }
    } else {
      if (!unit.firstFrame) throw new Error('参考片段与首帧均不可用');
      const firstFrameUrl = await this.deps.publisher.publish(unit.firstFrame, auth);
      const lastFrameUrl = unit.lastFrame ? await this.deps.publisher.publish(unit.lastFrame, auth) : undefined;
      payload = buildImageFallbackPayload({
        ...(this.deps.fallbackModel ? { model: this.deps.fallbackModel } : {}),
        firstFrameUrl,
        ...(lastFrameUrl ? { lastFrameUrl } : {}),
        prompt,
        requestDuration: unit.requestDuration
      });
      job.provider = 'cprt-image-fallback';
      job.issues = ['参考视频不可用，已改用首尾帧兜底'];
    }
    const submitted = await this.deps.provider.submit(payload);
    job.remoteId = submitted.taskId;
    job.status = 'QUEUED';
    this.saveJob(job);
  }

  private async finishCandidate(
    job: GenerationJob,
    project: Project,
    unit: GenerationUnit,
    localPath: string
  ): Promise<void> {
    const quality = await this.deps.inspect(localPath, { duration: unit.duration, ratio: project.ratio });
    if (!quality.passed && job.attempt < job.maxAttempts) {
      this.failOrRetry(job, quality.issues.join('；'));
      return;
    }
    job.outputPath = localPath;
    job.quality = quality;
    job.issues = [...job.issues, ...quality.issues];
    if (quality.passed && quality.semanticStatus === 'passed') {
      job.status = 'ACCEPTED';
      job.accepted = true;
    } else {
      job.status = 'REVIEW_REQUIRED';
      if (quality.semanticStatus === 'pending' || quality.semanticStatus === 'unavailable') {
        job.issues.push('需要人工核验人物、商品与镜头一致性');
      }
    }
    this.saveJob(job);
  }

  private failOrRetry(job: GenerationJob, message: string): void {
    job.error = message;
    if (isContentModerationError(message)) {
      job.status = 'FAILED';
      job.issues = [...new Set([...job.issues, message])];
    } else if (job.attempt < job.maxAttempts) {
      job.attempt += 1;
      job.status = 'PENDING';
      delete job.remoteId;
      delete job.remoteStatus;
      delete job.remoteVideoUrl;
      // 退款：重试时会重新扣费。异步执行，不阻塞主流程。
      this.refundBilling(job);
    } else {
      job.status = 'FAILED';
      job.issues = [...job.issues, message];
      // 最终失败：退款。
      this.refundBilling(job);
    }
    this.saveJob(job);
  }

  /**
   * 退还预扣积分。仅在存在 billingTransactionId 时调用。
   * 异步执行，退款失败仅记录日志（不阻塞任务流程）。
   */
  private async refundBilling(job: GenerationJob): Promise<void> {
    if (!job.billingTransactionId || !job.auth) return;
    const transactionId = job.billingTransactionId;
    const auth = job.auth;
    delete job.billingTransactionId;
    try {
      await this.deps.billing.refund(auth, transactionId);
    } catch (error) {
      console.warn(`[billing] 退款失败（交易 #${transactionId}）:`, error instanceof Error ? error.message : error);
    }
  }

  private syncProjectStatus(projectId: string): void {
    const project = this.requireProject(projectId);
    const jobs = this.deps.store.listJobs(projectId);
    if (jobs.length === 0) return;
    if (jobs.every((job) => job.accepted)) project.status = 'READY_TO_RENDER';
    else if (jobs.every((job) => ['ACCEPTED', 'REVIEW_REQUIRED', 'FAILED'].includes(job.status))) project.status = 'NEEDS_REVIEW';
    else project.status = 'GENERATING';
    project.updatedAt = new Date().toISOString();
    this.deps.store.saveProject(project);
  }

  private outputPath(project: Project, unit: GenerationUnit, attempt: number): string {
    return path.join(this.deps.dataDir ?? 'data', 'projects', project.id, 'generated', `${unit.id}-v${attempt}.mp4`);
  }

  private saveJob(job: GenerationJob): void {
    job.updatedAt = new Date().toISOString();
    this.deps.store.saveJob(job);
  }

  private requireProject(projectId: string): Project {
    const project = this.deps.store.getProject(projectId);
    if (!project) throw new Error('项目不存在');
    return project;
  }

  private requireUnit(project: Project, unitId: string): GenerationUnit {
    const unit = project.analysis?.generationUnits.find((item) => item.id === unitId);
    if (!unit) throw new Error('生成单元不存在');
    return unit;
  }
}
