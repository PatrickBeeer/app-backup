export type Ratio = '9:16' | '16:9';
export type PresenterMode = 'reference' | 'generated';

export type ProjectStatus =
  | 'DRAFT'
  | 'ANALYZING'
  | 'READY_TO_CONFIRM'
  | 'GENERATING'
  | 'NEEDS_REVIEW'
  | 'READY_TO_RENDER'
  | 'RENDERING'
  | 'COMPLETED'
  | 'FAILED';

export type JobStatus =
  | 'PENDING'
  | 'SUBMITTING'
  | 'QUEUED'
  | 'RUNNING'
  | 'DOWNLOADING'
  | 'REVIEW_REQUIRED'
  | 'ACCEPTED'
  | 'FAILED';

export interface ProductBrief {
  name: string;
  price: string;
  sellingPoints: string[];
  specifications: string[];
  requiredClaims: string[];
  forbiddenClaims: string[];
}

export interface CreateProjectInput {
  name: string;
  ratio: Ratio;
  presenterMode: PresenterMode;
  referenceVideo: string;
  personPhotos: string[];
  productImages: string[];
  product: ProductBrief;
}

export interface VideoProbe {
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasVideo: boolean;
  hasAudio: boolean;
  formatName?: string;
}

export interface Shot {
  id: string;
  start: number;
  end: number;
}

export interface SpeechSegment {
  id: string;
  start: number;
  end: number;
}

export interface ReferenceTranscriptSegment {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface ScriptLine {
  id: string;
  start: number;
  end: number;
  text: string;
  source: 'llm' | 'fallback';
}

export interface TextOverlay {
  id: string;
  start: number;
  end: number;
  text: string;
  xPercent: number;
  yPercent: number;
  fontSize: number;
  color: string;
  outlineColor: string;
  backgroundColor?: string;
}

export interface GenerationUnit {
  id: string;
  start: number;
  end: number;
  duration: number;
  requestDuration: number;
  shotIds: string[];
  referenceClip?: string;
  referenceAudio?: string;
  firstFrame?: string;
  lastFrame?: string;
  scriptLineIds: string[];
}

export interface ProjectAnalysis {
  probe: VideoProbe;
  shots: Shot[];
  speechSegments: SpeechSegment[];
  referenceTranscript?: ReferenceTranscriptSegment[];
  generationUnits: GenerationUnit[];
  script: ScriptLine[];
  overlays: TextOverlay[];
  summary: string;
  degraded: boolean;
  warnings: string[];
}

export interface Project {
  id: string;
  name: string;
  ratio: Ratio;
  presenterMode?: PresenterMode;
  referenceVideo: string;
  personPhotos: string[];
  productImages: string[];
  product: ProductBrief;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  analysis?: ProjectAnalysis;
  confirmedAt?: string;
  finalVideo?: string;
  error?: string;
}

export interface QualityReport {
  passed: boolean;
  score: number;
  issues: string[];
  technical: {
    durationDelta?: number;
    hasVideo: boolean;
    hasAudio: boolean;
    resolutionMatches: boolean;
  };
  semanticStatus: 'pending' | 'passed' | 'failed' | 'unavailable';
}

export interface GenerationJob {
  id: string;
  projectId: string;
  unitId: string;
  provider: 'cprt-multimodal' | 'cprt-image-fallback' | 'demo' | 'replacement';
  status: JobStatus;
  attempt: number;
  maxAttempts: number;
  accepted: boolean;
  issues: string[];
  remoteId?: string;
  remoteStatus?: string;
  outputPath?: string;
  remoteVideoUrl?: string;
  quality?: QualityReport;
  error?: string;
  /**
   * 创建该任务时发起方携带的 `Authorization: Bearer <JWT>` 值。
   * JobWorker 在后台轮次中复用此 token 调用 app-manager 上传素材到 COS。
   * 长时间运行的任务可能遇到 token 过期（401），此时标记 REVIEW_REQUIRED
   * 等待用户重新触发。
   */
  auth?: string;
  /**
   * 视频生成预扣积分的 user-manager 交易 ID。
   * CPRT 提交成功后保留扣费；提交失败重试时退款。
   */
  billingTransactionId?: number;
  createdAt: string;
  updatedAt: string;
}
