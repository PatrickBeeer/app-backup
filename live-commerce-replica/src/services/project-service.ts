import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { buildGenerationUnits } from '../core/generation-units.js';
import { buildFallbackScript } from '../core/script.js';
import { alignTranscriptToSpeech } from '../core/transcript.js';
import type {
  GenerationJob,
  GenerationUnit,
  Project,
  ReferenceTranscriptSegment,
  ScriptLine,
  Shot,
  SpeechSegment,
  TextOverlay,
  VideoProbe
} from '../core/types.js';
import {
  detectShots,
  detectSpeechSegments,
  extractBoundaryFrame,
  extractRepresentativeFrames,
  probeVideo,
  sliceGenerationUnit
} from '../media/ffmpeg.js';
import type { ProjectStore } from '../store/project-store.js';

export interface MediaAnalysisPort {
  probeVideo(filePath: string, ffprobePath?: string): Promise<VideoProbe>;
  detectShots(filePath: string, duration: number, ffmpegPath?: string): Promise<Shot[]>;
  detectSpeechSegments(filePath: string, duration: number, ffmpegPath?: string): Promise<SpeechSegment[]>;
  extractRepresentativeFrames(
    filePath: string,
    outputDir: string,
    duration: number,
    count?: number,
    ffmpegPath?: string
  ): Promise<string[]>;
  sliceGenerationUnit(filePath: string, unit: GenerationUnit, outputPath: string, ffmpegPath?: string): Promise<string>;
  extractBoundaryFrame(filePath: string, timestamp: number, outputPath: string, ffmpegPath?: string): Promise<string>;
}

export interface AnalysisDraft {
  summary: string;
  script: ScriptLine[];
  overlays: TextOverlay[];
  warnings: string[];
}

export interface ProjectAnalyzer {
  analyze(input: {
    frames: string[];
    project: Project;
    shots: Shot[];
    speechSegments: SpeechSegment[];
    referenceTranscript: ReferenceTranscriptSegment[];
    duration: number;
  }): Promise<AnalysisDraft>;
}

export interface ReferenceTranscriber {
  transcribe(filePath: string): Promise<ReferenceTranscriptSegment[]>;
}

export interface ProjectServiceDependencies {
  store: ProjectStore;
  dataDir: string;
  ffmpegPath: string;
  ffprobePath: string;
  media?: MediaAnalysisPort;
  analyzer?: ProjectAnalyzer;
  transcriber?: ReferenceTranscriber;
}

const defaultMedia: MediaAnalysisPort = {
  probeVideo,
  detectShots,
  detectSpeechSegments,
  extractRepresentativeFrames,
  sliceGenerationUnit,
  extractBoundaryFrame
};

function validAnalysisScript(lines: ScriptLine[], speechSegments: SpeechSegment[], forbidden: string[]): boolean {
  return lines.length === speechSegments.length
    && lines.every((line) => line.text.trim().length > 0 && !forbidden.some((phrase) => line.text.includes(phrase)));
}

export class ProjectService {
  private readonly media: MediaAnalysisPort;

  constructor(private readonly deps: ProjectServiceDependencies) {
    this.media = deps.media ?? defaultMedia;
  }

  async analyze(projectId: string): Promise<Project> {
    const project = this.requireProject(projectId);
    project.status = 'ANALYZING';
    delete project.error;
    project.updatedAt = new Date().toISOString();
    this.deps.store.saveProject(project);

    try {
      const probe = await this.media.probeVideo(project.referenceVideo, this.deps.ffprobePath);
      if (!probe.hasVideo) throw new Error('参考文件中没有可解码的视频流');

      const projectDir = path.join(this.deps.dataDir, 'projects', project.id);
      const warnings: string[] = [];
      const transcriptPromise = probe.hasAudio && this.deps.transcriber
        ? this.deps.transcriber.transcribe(project.referenceVideo).catch((error) => {
            warnings.push(`本地台词转写降级：${error instanceof Error ? error.message : String(error)}`);
            return [];
          })
        : Promise.resolve([]);
      const [shots, speechSegments, frames, transcriptChunks] = await Promise.all([
        this.media.detectShots(project.referenceVideo, probe.duration, this.deps.ffmpegPath),
        probe.hasAudio
          ? this.media.detectSpeechSegments(project.referenceVideo, probe.duration, this.deps.ffmpegPath)
          : Promise.resolve([]),
        this.media.extractRepresentativeFrames(
          project.referenceVideo,
          path.join(projectDir, 'frames'),
          probe.duration,
          8,
          this.deps.ffmpegPath
        ),
        transcriptPromise
      ]);

      const units = buildGenerationUnits(shots, probe.duration);
      const fallbackScript = buildFallbackScript(speechSegments, project.product, probe.duration);
      const hasTranscript = transcriptChunks.some((segment) => segment.text.trim().length > 0);
      const referenceTranscript = hasTranscript
        ? alignTranscriptToSpeech(transcriptChunks, speechSegments)
        : [];
      if (probe.hasAudio && this.deps.transcriber && !hasTranscript && !warnings.some((warning) => warning.startsWith('本地台词转写降级：'))) {
        warnings.push('本地台词转写降级：未识别到有效台词');
      }
      let draft: AnalysisDraft | undefined;
      if (!probe.hasAudio) warnings.push('参考视频没有音轨，口播时间轴已按镜头自动分配。');
      if (this.deps.analyzer) {
        try {
          draft = await this.deps.analyzer.analyze({
            frames, project, shots, speechSegments, referenceTranscript, duration: probe.duration
          });
        } catch (error) {
          warnings.push(`智能结构分析降级：${error instanceof Error ? error.message : String(error)}`);
        }
      }
      const useDraft = Boolean(
        draft && validAnalysisScript(draft.script, speechSegments.length > 0 ? speechSegments : fallbackScript, project.product.forbiddenClaims)
      );
      const script = useDraft ? draft!.script : fallbackScript;

      for (const unit of units) {
        const unitDir = path.join(projectDir, 'units', unit.id);
        unit.referenceClip = await this.media.sliceGenerationUnit(
          project.referenceVideo,
          unit,
          path.join(unitDir, 'reference.mp4'),
          this.deps.ffmpegPath
        );
        unit.firstFrame = await this.media.extractBoundaryFrame(
          project.referenceVideo,
          unit.start,
          path.join(unitDir, 'first.jpg'),
          this.deps.ffmpegPath
        );
        unit.lastFrame = await this.media.extractBoundaryFrame(
          project.referenceVideo,
          Math.max(unit.start, unit.end - 0.04),
          path.join(unitDir, 'last.jpg'),
          this.deps.ffmpegPath
        );
        unit.scriptLineIds = script.filter((line) => line.start < unit.end && line.end > unit.start).map((line) => line.id);
      }

      project.analysis = {
        probe,
        shots,
        speechSegments,
        referenceTranscript,
        generationUnits: units,
        script,
        overlays: useDraft ? draft!.overlays : [],
        summary: useDraft ? draft!.summary : '已按镜头、语音停顿和商品事实生成结构迁移方案。',
        degraded: !useDraft,
        warnings: [...warnings, ...(useDraft ? draft!.warnings : ['当前使用确定性商品事实模板，可在生成前检查新口播。'])]
      };
      project.status = 'READY_TO_CONFIRM';
      project.updatedAt = new Date().toISOString();
      this.deps.store.saveProject(project);
      return project;
    } catch (error) {
      project.status = 'FAILED';
      project.error = error instanceof Error ? error.message : String(error);
      project.updatedAt = new Date().toISOString();
      this.deps.store.saveProject(project);
      throw error;
    }
  }

  confirm(projectId: string): Project {
    const project = this.requireProject(projectId);
    if (project.status !== 'READY_TO_CONFIRM' || !project.analysis) throw new Error('项目尚未完成分析');
    project.confirmedAt = new Date().toISOString();
    project.updatedAt = project.confirmedAt;
    this.deps.store.saveProject(project);
    return project;
  }

  updateScript(projectId: string, lines: Array<{ id: string; text: string }>): Project {
    const project = this.requireProject(projectId);
    if (project.status !== 'READY_TO_CONFIRM' || !project.analysis) {
      throw new Error('仅可在生成前修改口播');
    }
    const current = project.analysis.script;
    if (lines.length !== current.length || lines.some((line, index) => line.id !== current[index]?.id)) {
      throw new Error('口播段落必须与分析结果一一对应');
    }

    const texts = lines.map((line) => line.text.trim());
    if (texts.some((text) => text.length === 0)) throw new Error('口播不能为空');
    for (const text of texts) {
      const forbidden = project.product.forbiddenClaims.find((phrase) => phrase && text.includes(phrase));
      if (forbidden) throw new Error(`新口播包含禁止表达：${forbidden}`);
    }

    project.analysis.script = current.map((line, index) => ({ ...line, text: texts[index]! }));
    project.updatedAt = new Date().toISOString();
    this.deps.store.saveProject(project);
    return project;
  }

  startGeneration(projectId: string, demoMode = false, auth = ''): GenerationJob[] {
    const project = this.requireProject(projectId);
    if (!project.analysis) throw new Error('项目尚未完成分析');
    if (!project.confirmedAt) throw new Error('请先确认生成方案');
    const existing = this.deps.store.listJobs(projectId);
    if (existing.length > 0) return existing;
    const now = new Date().toISOString();
    const jobs = project.analysis.generationUnits.map<GenerationJob>((unit) => ({
      id: randomUUID(),
      projectId,
      unitId: unit.id,
      provider: demoMode ? 'demo' : 'cprt-multimodal',
      status: 'PENDING',
      attempt: 1,
      maxAttempts: 2,
      accepted: false,
      issues: [],
      auth,
      createdAt: now,
      updatedAt: now
    }));
    jobs.forEach((job) => this.deps.store.createJob(job));
    project.status = 'GENERATING';
    project.updatedAt = now;
    this.deps.store.saveProject(project);
    return jobs;
  }

  private requireProject(projectId: string): Project {
    const project = this.deps.store.getProject(projectId);
    if (!project) throw new Error('项目不存在');
    return project;
  }
}
