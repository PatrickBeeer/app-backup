
import React, { useEffect, useRef, useState } from 'react';
import { AppState, AdPlan, Shot, type FaceSelectionPoint } from './types';
import { analyzeProduct, createProductCreativePrompt, detectProductPosition, generateVideo, generateShotImage, regenerateShotDescription, expandShotDescriptionAI, queryVideoTaskProgress, type VideoEngine } from './services/geminiService';
import { WorkbenchLayout } from './components/WorkbenchLayout';
import { calculateVideoPointCost } from './shared/pricing';
import { CPRT_MULTIMODAL_VIDEO_MODELS, CPRT_RESOLUTIONS_BY_MODEL, DEFAULT_CPRT_MODEL, type CprtMultimodalVideoModel } from './shared/cprtContract';
import JSZip from 'jszip';
import { AppProps } from './types';
import { uploadAssetToCOSWithPresignedURL } from './services/geminiProxyService';
import { createTaskQueueItem, getLatestVideoTask, recordTaskManagerObject, updateTaskQueueVideoResult } from './services/taskManagerService';
import { finalizeVideoWithCameraShake, mergeVideoWithReferenceAudioDataUrl, trimReferenceVideoDataUrl, upscaleVideoTo1080p } from './services/videoTrimService';

const PILOT_APP_ID = 'video-clone';
const PILOT_APP_NAME = '产品爆款视频创作';
const IMAGE_GEN_COST_POINTS = 10;
const SEEDANCE_VIDEO_GEN_COST_PER_SECOND = 15;
const VEO_DURATION_OPTIONS = [4, 8] as const;
const VEO_VIDEO_COST_MAP: Record<number, number> = {
  4: 30,
  8: 50,
};
const DEFAULT_VIDEO_DURATION_SECONDS = 4;
const GROK_FIXED_DURATION_SECONDS = 10;
const GROK_VIDEO_COST_POINTS = 20;
const JIMENG_VIDEO_DURATION_OPTIONS = [5, 10] as const;
const JIMENG_VIDEO_COST_MAP: Record<number, number> = { 5: 75, 10: 150 };
const KLING_VIDEO_DURATION_OPTIONS = [5, 10] as const;
const VIDEO_RESOLUTION_OPTIONS = ['480p', '720p', '1080p'] as const;
type VideoResolution = typeof VIDEO_RESOLUTION_OPTIONS[number];
const AUDIENCE_TAGS = ['都市白领', '宝妈家庭', 'Z世代', '银发人群', '精致女性', '潮流男性', '健身达人', '商务精英'] as const;
const VIDEO_POLL_INTERVAL_MS = 8_000;
const VIDEO_POLL_MAX_FAILURES = 5;
const VIDEO_POLL_MAX_WAIT_MS = 20 * 60 * 1000;
const VIDEO_MODEL_BY_ENGINE: Record<VideoEngine, string> = {
  seedance2: 'seedance-2.0-fast',
  veo31: 'veo_3_1',
  grokv3: 'grok-video-3-pro',
  kling: 'kling-3.0',
  jimeng: 'jimeng_i2v_first_v30',
  cprt: DEFAULT_CPRT_MODEL,
};

const CPRT_MODEL_LABELS: Record<CprtMultimodalVideoModel, string> = {
  'master-video-s2-0-mini': 'S2.0 Mini',
  'master-video-s2-0-fast': 'S2.0 Fast',
  'master-video-s2-0': 'Seedance 2.0',
  'master-video-s2-5': 'Seedance 2.5',
};

// 以下两个错误映射从 video-clone-seedance-v2/App.tsx 移植（真人素材审核场景）。
function isRealPersonModeRejection(message: string): boolean {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('realpersonmode') || normalized.includes('真人素材') || normalized.includes('real-person');
}

function toFriendlyErrorMessage(message: string): string {
  const raw = String(message || '').trim();
  if (!raw) {
    return '生成失败。';
  }
  if (isRealPersonModeRejection(raw)) {
    return '当前模式不支持真人素材：参考视频/图片中包含真人时，请开启「真人模式」后重新生成。';
  }
  if (/copyright/i.test(raw)) {
    return '参考素材命中平台版权策略：请更换为自己拥有版权的素材后重试（避免明星、网红、动漫角色或明显像公众人物的 AI 生成内容）。';
  }
  if (/format is unsupported|unsupported.*format|invalid (file|video|image)|unsupported (file|media)/i.test(raw)) {
    return '素材格式不支持：请确认上传的是完好的 JPG/PNG 图片与 MP4 视频（不要只改扩展名），再重新生成。';
  }
  // 内容审核：使用更精准的关键词，避免把含 content/sensitive 字样的普通报错（如限流、参数错误）误判为审核拦截。
  if (/(内容审核|审核不通过|未通过审核|素材.*(审核|不合规)|moderation|content (review|check|audit).*(fail|reject|not pass)|sensitive content|policy (violation|reject)|违规内容|敏感内容|not approved.*content)/i.test(raw)) {
    return [
      '参考素材未通过平台内容审核，请更换素材后重试。',
      '素材须为本人或已授权的真人内容，且不能含第三方肖像、品牌 logo 或水印。',
    ].join('\n');
  }
  return raw;
}

type SidebarTab = 'selling_video' | 'storyboard';
type TaskQueueStatus = 'queued' | 'running' | 'finished' | 'failed';

function formatTaskName(label: string): string {
  const trimmedLabel = String(label || '').trim();
  if (!trimmedLabel) {
    return PILOT_APP_NAME;
  }
  return `${PILOT_APP_NAME} - ${trimmedLabel}`;
}

async function assetUrlToBlob(assetUrl: string): Promise<Blob> {
  const trimmed = String(assetUrl || '').trim();
  if (trimmed.startsWith('data:')) {
    const mimeMatch = trimmed.match(/^data:([^;]+);base64,/i);
    const mimeType = mimeMatch?.[1] || 'application/octet-stream';
    const base64 = trimmed.replace(/^data:[^;]+;base64,/i, '');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  }

  const response = await fetch(trimmed);
  if (!response.ok) {
    throw new Error(`failed to fetch generated asset: ${response.status}`);
  }
  return response.blob();
}

type VideoFaceDetection = {
  hasFace: boolean;
  selection: FaceSelectionPoint | null;
  headSelectionPoints: FaceSelectionPoint[];
  reliable: boolean;
};

const FALLBACK_FACE_SELECTION: FaceSelectionPoint = { x: 0.5, y: 0.32, timeSec: 0 };

function createHeadSelectionPoints(selection: FaceSelectionPoint, faceWidth = 0.13, faceHeight = 0.18): FaceSelectionPoint[] {
  const clamp = (value: number) => Math.min(0.99, Math.max(0.01, value));
  const horizontalOffset = Math.max(0.045, Math.min(0.1, faceWidth * 0.5));
  const upperOffset = Math.max(0.09, Math.min(0.18, faceHeight * 0.7));
  return [
    { ...selection, x: clamp(selection.x), y: clamp(selection.y) },
    { ...selection, x: clamp(selection.x), y: clamp(selection.y - upperOffset) },
    { ...selection, x: clamp(selection.x - horizontalOffset), y: clamp(selection.y - upperOffset * 0.62) },
    { ...selection, x: clamp(selection.x + horizontalOffset), y: clamp(selection.y - upperOffset * 0.62) },
  ];
}

async function detectFaceInVideo(file: File): Promise<VideoFaceDetection> {
  const FaceDetectorCtor = (window as any).FaceDetector;
  if (!FaceDetectorCtor) {
    return { hasFace: true, selection: FALLBACK_FACE_SELECTION, headSelectionPoints: createHeadSelectionPoints(FALLBACK_FACE_SELECTION), reliable: false };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('video face detection failed'));
    });
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 360;
    const context = canvas.getContext('2d');
    if (!context) return { hasFace: true, selection: FALLBACK_FACE_SELECTION, headSelectionPoints: createHeadSelectionPoints(FALLBACK_FACE_SELECTION), reliable: false };

    const detector = new FaceDetectorCtor({ fastMode: true, maxDetectedFaces: 5 });
    const duration = Number(video.duration) || 0;
    const desiredSampleTimes = [0.15, 1.25, 2.5, 3.75, 4.6, 6.5, 8, 9.5];
    const sampleTimes = desiredSampleTimes
      .map(time => Math.max(0, Math.min(time, Math.max(0, duration - 0.08))))
      .filter((time, index, list) => index === 0 || Math.abs(time - list[index - 1]) >= 0.2);
    const trackedHeadPoints: FaceSelectionPoint[] = [];
    let previousSelection: FaceSelectionPoint | null = null;

    for (const detectionTimeSec of sampleTimes) {
      if (Math.abs(video.currentTime - detectionTimeSec) > 0.03) {
        await new Promise<void>((resolve, reject) => {
          const handleSeeked = () => { cleanup(); resolve(); };
          const handleError = () => { cleanup(); reject(new Error('video seek failed')); };
          const cleanup = () => {
            video.removeEventListener('seeked', handleSeeked);
            video.removeEventListener('error', handleError);
          };
          video.addEventListener('seeked', handleSeeked, { once: true });
          video.addEventListener('error', handleError, { once: true });
          video.currentTime = detectionTimeSec;
        });
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const detectedFaces = await detector.detect(canvas);
      const faceBoxes = (Array.isArray(detectedFaces) ? detectedFaces : [])
        .map((item: any) => item?.boundingBox)
        .filter(Boolean);
      if (!faceBoxes.length) continue;

      const face = faceBoxes
        .map((box: any) => {
          const centerX = (Number(box.x ?? box.left ?? 0) + Number(box.width ?? 0) / 2) / canvas.width;
          const centerY = (Number(box.y ?? box.top ?? 0) + Number(box.height ?? 0) / 2) / canvas.height;
          const trackingDistance = previousSelection
            ? Math.hypot(centerX - previousSelection.x, centerY - previousSelection.y)
            : 0;
          return { box, centerX, centerY, trackingDistance };
        })
        .sort((a: any, b: any) => previousSelection
          ? a.trackingDistance - b.trackingDistance
          : (Number(b.box.width) * Number(b.box.height)) - (Number(a.box.width) * Number(a.box.height)))[0];
      if (!face) continue;

      const selection: FaceSelectionPoint = {
        x: Math.min(1, Math.max(0, face.centerX)),
        y: Math.min(1, Math.max(0, face.centerY)),
        timeSec: detectionTimeSec,
      };
      previousSelection = selection;
      trackedHeadPoints.push(...createHeadSelectionPoints(
        selection,
        Number(face.box.width || 0) / canvas.width,
        Number(face.box.height || 0) / canvas.height,
      ));
    }

    if (!trackedHeadPoints.length) {
      return { hasFace: false, selection: null, headSelectionPoints: [], reliable: true };
    }
    return {
      hasFace: true,
      selection: trackedHeadPoints[0],
      headSelectionPoints: trackedHeadPoints,
      reliable: true,
    };
  } catch {
    return { hasFace: true, selection: FALLBACK_FACE_SELECTION, headSelectionPoints: createHeadSelectionPoints(FALLBACK_FACE_SELECTION), reliable: false };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function readVideoDuration(file: File): Promise<number | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = objectUrl;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('video metadata loading failed'));
    });
    const duration = Number(video.duration);
    return Number.isFinite(duration) && duration > 0 ? Number(duration.toFixed(2)) : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function captureVideoFrames(videoDataUrl: string, ratios: number[]): Promise<Array<{ image: string; timeSec: number }>> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = videoDataUrl;
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('无法读取参考视频画面。'));
  });
  const duration = Number(video.duration) || 1;
  const canvas = document.createElement('canvas');
  const maxWidth = 720;
  const scale = Math.min(1, maxWidth / Math.max(1, video.videoWidth));
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法分析参考视频画面。');

  const frames: Array<{ image: string; timeSec: number }> = [];
  for (const ratio of ratios) {
    const timeSec = Math.max(0, Math.min(duration - 0.05, duration * ratio));
    if (Math.abs(video.currentTime - timeSec) > 0.02) {
      await new Promise<void>((resolve, reject) => {
        const onSeeked = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); reject(new Error('无法定位参考视频关键帧。')); };
        const cleanup = () => {
          video.removeEventListener('seeked', onSeeked);
          video.removeEventListener('error', onError);
        };
        video.addEventListener('seeked', onSeeked, { once: true });
        video.addEventListener('error', onError, { once: true });
        video.currentTime = timeSec;
      });
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push({ image: canvas.toDataURL('image/jpeg', 0.84), timeSec });
  }
  video.removeAttribute('src');
  video.load();
  return frames;
}

async function estimateSalientProductPoint(frameDataUrl: string): Promise<{ x: number; y: number }> {
  const image = new Image();
  image.src = frameDataUrl;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('无法读取产品定位画面。'));
  });
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = Math.max(54, Math.round(96 * image.naturalHeight / Math.max(1, image.naturalWidth)));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return { x: 0.5, y: 0.62 };
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let weightedX = 0;
  let weightedY = 0;
  let totalWeight = 0;
  const indexAt = (x: number, y: number) => (y * canvas.width + x) * 4;
  for (let y = 2; y < canvas.height - 2; y += 2) {
    for (let x = 2; x < canvas.width - 2; x += 2) {
      const i = indexAt(x, y);
      const right = indexAt(x + 2, y);
      const down = indexAt(x, y + 2);
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const edge = Math.abs(r - pixels[right]) + Math.abs(g - pixels[right + 1]) + Math.abs(b - pixels[right + 2])
        + Math.abs(r - pixels[down]) + Math.abs(g - pixels[down + 1]) + Math.abs(b - pixels[down + 2]);
      const saturation = Math.max(r, g, b) - Math.min(r, g, b);
      const normalizedX = x / canvas.width;
      const normalizedY = y / canvas.height;
      const centerPrior = Math.max(0.12, 1 - Math.hypot((normalizedX - 0.5) * 1.25, (normalizedY - 0.58) * 0.9));
      const weight = Math.pow(Math.max(0, edge + saturation * 1.4), 1.25) * centerPrior;
      weightedX += normalizedX * weight;
      weightedY += normalizedY * weight;
      totalWeight += weight;
    }
  }
  if (!totalWeight) return { x: 0.5, y: 0.62 };
  return {
    x: Math.min(0.9, Math.max(0.1, weightedX / totalWeight)),
    y: Math.min(0.9, Math.max(0.1, weightedY / totalWeight)),
  };
}

function normalizeTaskQueueStatus(status: string, videoUrl?: string | null): TaskQueueStatus {
  if (String(videoUrl || '').trim()) {
    return 'finished';
  }

  switch (String(status || '').trim().toLowerCase()) {
    case 'finished':
    case 'succeeded':
    case 'success':
    case 'completed':
    case 'done':
      return 'finished';
    case 'failed':
    case 'error':
    case 'cancelled':
    case 'canceled':
      return 'failed';
    case 'queued':
      return 'queued';
    default:
      return 'running';
  }
}

const defaultPlatform: AppProps['platform'] = {
  user: { id: 0, username: 'standalone-user', credits: 0 },
  credits: 0,
  checkBalance: () => true,
  deductCredits: async () => true,
  refreshCredits: async () => {},
  showRecharge: () => {},
  openTaskManager: () => {},
  onBack: () => {
    window.location.href = '/app/';
  },
};

const App: React.FC<Partial<AppProps>> = ({ platform, costs }) => {
  const activePlatform = platform ?? defaultPlatform;
  const activeCosts = costs ?? {};
  const [providerNotice, setProviderNotice] = useState<string | null>(null);
  const [selectedVideoEngine] = useState<VideoEngine>('cprt');
  const [seedanceDebugNotice, setSeedanceDebugNotice] = useState<string | null>(null);
  const [cprtModel, setCprtModel] = useState<CprtMultimodalVideoModel>(DEFAULT_CPRT_MODEL);
  const [realPersonMode, setRealPersonMode] = useState(true);
  const [isAuditRejection, setIsAuditRejection] = useState(false);

  const [state, setState] = useState<AppState & { customSellingPoints: string }>({
    image: null,
    referenceVideo: null,
    referenceVideoDurationSec: null,
    referenceVideoHasFace: false,
    referenceVideoFaceSelection: null,
    referenceVideoHeadSelectionPoints: [],
    referenceVideoProductSelection: null,
    plan: null,
    videoUrl: null,
    isAnalyzing: false,
    isGeneratingImages: false,
    isGeneratingVideo: false,
    error: null,
    aspectRatio: '9:16',
    editedPrompt: '',
    customSellingPoints: '',
    shotCount: 4,
  });

  const parseShotDurationSeconds = (durationText?: string): number => {
    const matched = String(durationText || '').match(/(\d+)/);
    const parsed = matched ? Number(matched[1]) : Number.NaN;
    const raw = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_VIDEO_DURATION_SECONDS;
    if (selectedVideoEngine === 'grokv3') {
      return GROK_FIXED_DURATION_SECONDS;
    }
    if (selectedVideoEngine === 'veo31') {
      return raw >= 8 ? 8 : 4;
    }
    if (selectedVideoEngine === 'jimeng') {
      return raw >= 8 ? 10 : 5;
    }
    if (selectedVideoEngine === 'kling') {
      return raw >= 8 ? 10 : 5;
    }
    return Math.min(15, Math.max(4, Math.round(raw)));
  };

  const formatDuration = (seconds?: number | null): string => {
    if (!Number.isFinite(seconds) || (seconds ?? 0) <= 0) {
      return '--';
    }
    const rounded = Number(seconds);
    return Number.isInteger(rounded) ? `${rounded}s` : `${rounded.toFixed(1)}s`;
  };

  const formatTaskStatus = (status?: string): string => {
    const normalized = String(status || '').trim().toLowerCase();
    if (normalized === 'preparing') return '正在准备素材';
    if (normalized === 'submitted' || normalized === 'queued') return '已提交，等待处理';
    if (normalized === 'processing' || normalized === 'running') return '可灵处理中';
    if (normalized === 'succeed' || normalized === 'succeeded' || normalized === 'success' || normalized === 'completed') return '已完成';
    if (normalized === 'failed' || normalized === 'fail' || normalized === 'error' || normalized === 'rejected') return '生成失败';
    return status ? `状态：${status}` : '等待状态';
  };

  const resolveVideoBillingTask = (videoSeconds?: number): string => {
    const seconds = Number(videoSeconds ?? DEFAULT_VIDEO_DURATION_SECONDS);
    const effectiveSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_VIDEO_DURATION_SECONDS;
    if (selectedVideoEngine === 'veo31' || selectedVideoEngine === 'grokv3') {
      const normalizedDuration = effectiveSeconds >= 8 ? 8 : 4;
      return `veo_video_${normalizedDuration}s`;
    }

    if (selectedVideoEngine === 'jimeng') {
      const normalizedDuration = effectiveSeconds >= 8 ? 10 : 5;
      return `jimeng_video_${normalizedDuration}s`;
    }

    if (selectedVideoEngine === 'kling') {
      return `kling_video_${Math.max(1, Math.ceil(effectiveSeconds))}s`;
    }

    if (selectedVideoEngine === 'cprt') {
      return `cprt_video_${Math.min(15, Math.max(4, Math.round(effectiveSeconds)))}s`;
    }

    const normalizedDuration = Math.min(15, Math.max(4, Math.round(effectiveSeconds)));
    return `seedance_video_${normalizedDuration}s`;
  };

  const resolveActionCost = (actionType: string, videoSeconds?: number): number => {
    if (actionType === 'SHOT_IMAGE') {
      const configuredCost = Number(activeCosts.shot_image);
      if (Number.isFinite(configuredCost) && configuredCost > 0) {
        return configuredCost;
      }
      return IMAGE_GEN_COST_POINTS;
    }
    if (actionType === 'SHOT_VIDEO' || actionType === 'FULL_VIDEO') {
      if (selectedVideoEngine === 'grokv3') {
        return GROK_VIDEO_COST_POINTS;
      }

      const billingTask = resolveVideoBillingTask(videoSeconds);
      const configuredCost = Number(activeCosts[billingTask]);
      if (Number.isFinite(configuredCost) && configuredCost > 0) {
        return configuredCost;
      }
      const seconds = Number(videoSeconds ?? DEFAULT_VIDEO_DURATION_SECONDS);
      const effectiveSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_VIDEO_DURATION_SECONDS;
      if (selectedVideoEngine === 'veo31') {
        const normalizedDuration = effectiveSeconds >= 8 ? 8 : 4;
        return VEO_VIDEO_COST_MAP[normalizedDuration] || VEO_VIDEO_COST_MAP[4];
      }
      if (selectedVideoEngine === 'jimeng') {
        const normalizedDuration = effectiveSeconds >= 8 ? 10 : 5;
        return JIMENG_VIDEO_COST_MAP[normalizedDuration];
      }
      if (selectedVideoEngine === 'seedance2') {
        return calculateVideoPointCost('seedance-2.0-fast', outputResolution, effectiveSeconds);
      }
      if (selectedVideoEngine === 'kling') {
        const model = state.referenceVideo ? 'kling-v1-6' : 'kling-3.0';
        return calculateVideoPointCost(model, outputResolution, effectiveSeconds);
      }
      if (selectedVideoEngine === 'cprt') {
        return calculateVideoPointCost(cprtModel, outputResolution, effectiveSeconds);
      }
      return Math.round(effectiveSeconds) * SEEDANCE_VIDEO_GEN_COST_PER_SECOND;
    }
    if (actionType === 'PLAN_ANALYSIS') {
      return Number(activeCosts.plan_analysis ?? 0);
    }
    return Number(activeCosts[actionType] ?? 0);
  };

  const resolveBillingTask = (actionType: string, videoSeconds?: number): string => {
    if (actionType === 'PLAN_ANALYSIS') {
      return 'plan_analysis';
    }
    if (actionType === 'SHOT_IMAGE') {
      return 'shot_image';
    }

    return resolveVideoBillingTask(videoSeconds);
  };

  const ensureActionAllowed = (actionType: string, options?: { videoSeconds?: number }): boolean => {
    // Local migration mode: do not block generation on the host platform's credit balance.
    void actionType;
    void options;
    return true;
  };

  const [loadingShots, setLoadingShots] = useState<Set<number>>(new Set());
  const [loadingShotVideos, setLoadingShotVideos] = useState<Set<number>>(new Set());
  const [loadingDescriptions, setLoadingDescriptions] = useState<Set<number>>(new Set());
  const [loadingExpansions, setLoadingExpansions] = useState<Set<number>>(new Set());
  const [isBundling, setIsBundling] = useState(false);
  const [isProcessingAllImages, setIsProcessingAllImages] = useState(false);
  const [latestTaskId, setLatestTaskId] = useState<string>('');
  const [queryTaskId, setQueryTaskId] = useState<string>('');
  const [isQueryingTask, setIsQueryingTask] = useState(false);
  const [queryTaskStatus, setQueryTaskStatus] = useState<string>('');
  const [isAutoPollingEnabled, setIsAutoPollingEnabled] = useState(true);
  const pollingInFlightRef = useRef(false);
  const consecutivePollFailuresRef = useRef(0);
  const generationStartedAtRef = useRef<number | null>(null);
  const [finalVideoDurationSec, setFinalVideoDurationSec] = useState<number | null>(null);
  const [isGeneratingDubbing, setIsGeneratingDubbing] = useState(false);
  const [dubbingStage, setDubbingStage] = useState<string>('');
  const [dubbingError, setDubbingError] = useState<string | null>(null);
  const [dubbedVideoUrl, setDubbedVideoUrl] = useState<string | null>(null);
  const pendingAutomaticDubbingRef = useRef(false);
  const preparedReferenceVideoForAudioRef = useRef<string | null>(null);
  const [shotVideoDurations, setShotVideoDurations] = useState<Record<number, number>>({});
  const [shotTaskIds, setShotTaskIds] = useState<Record<number, string>>({});
  const activeSidebarTab = (() => 'selling_video' as SidebarTab)();
  const [directVideoDurationSec, setDirectVideoDurationSec] = useState<number>(5);
  const [outputResolution, setOutputResolution] = useState<VideoResolution>('480p');
  const isUpscalingResultRef = useRef(false);
  const [selectedAudienceTag, setSelectedAudienceTag] = useState<string>(AUDIENCE_TAGS[0]);
  const [referenceProductMarker, setReferenceProductMarker] = useState<{ leftPct: number; topPct: number } | null>(null);
  const [isAutoLocatingProduct, setIsAutoLocatingProduct] = useState(false);
  const autoProductLocationRunRef = useRef(0);
  const [generatedVideoFrameRatio, setGeneratedVideoFrameRatio] = useState<string>('9 / 16');
  const comparisonOriginalVideoRef = useRef<HTMLVideoElement | null>(null);
  const comparisonGeneratedVideoRef = useRef<HTMLVideoElement | null>(null);
  const comparisonSyncLockRef = useRef(false);
  const effectiveDirectVideoDurationSec = selectedVideoEngine === 'grokv3'
      ? GROK_FIXED_DURATION_SECONDS
      : directVideoDurationSec;
  const isReferenceVideoDisabled = false;

  useEffect(() => {
    if (!state.image || !state.referenceVideo) return;
    const runId = ++autoProductLocationRunRef.current;
    setIsAutoLocatingProduct(true);
    setReferenceProductMarker(null);
    setProviderNotice('AI 正在自动识别爆款视频中的原产品…');
    void (async () => {
      let frames: Array<{ image: string; timeSec: number }> = [];
      try {
        frames = await captureVideoFrames(state.referenceVideo!, [0.16, 0.48, 0.8]);
        const detected = await detectProductPosition(state.image!, frames.map(frame => frame.image));
        if (runId !== autoProductLocationRunRef.current) return;
        const selectedFrame = frames[detected.frameIndex] || frames[0];
        const selection: FaceSelectionPoint = { x: detected.x, y: detected.y, timeSec: selectedFrame?.timeSec || 0 };
        setState(prev => ({ ...prev, referenceVideoProductSelection: selection, error: null }));
        setReferenceProductMarker({ leftPct: detected.x * 100, topPct: detected.y * 100 });
        setProviderNotice(detected.confidence >= 0.55
          ? 'AI 已自动定位原产品；如位置不准，可点击视频中的产品校正。'
          : 'AI 已完成产品初步定位，建议查看标记；如不准确可点击产品校正。');
      } catch (error) {
        if (runId !== autoProductLocationRunRef.current) return;
        const selectedFrame = frames[1] || frames[0];
        const localPoint = selectedFrame ? await estimateSalientProductPoint(selectedFrame.image) : { x: 0.5, y: 0.62 };
        const fallback: FaceSelectionPoint = { ...localPoint, timeSec: selectedFrame?.timeSec || 0 };
        setState(prev => ({ ...prev, referenceVideoProductSelection: fallback }));
        setReferenceProductMarker({ leftPct: localPoint.x * 100, topPct: localPoint.y * 100 });
        setProviderNotice('已通过本地视觉自动定位产品；如标记不准确，可点击产品校正。');
      } finally {
        if (runId === autoProductLocationRunRef.current) setIsAutoLocatingProduct(false);
      }
    })();
  }, [state.image, state.referenceVideo]);

  const reportTaskQueuePersistenceFailure = (contextLabel: string, error: unknown) => {
    console.error(`[${PILOT_APP_ID}] ${contextLabel} task persistence failed`, error);
    setProviderNotice(`${contextLabel}已完成，但写入任务面板失败。`);
  };

  const persistGeneratedImageTask = async (index: number, shot: Shot, imageDataUrl: string): Promise<string> => {
    const taskName = formatTaskName(`分镜 ${index + 1} 画面`);
    const blob = await assetUrlToBlob(imageDataUrl);
    const upload = await uploadAssetToCOSWithPresignedURL(blob, {
      fileName: `storyboard-shot-${index + 1}.png`,
      objectPath: `standalone/${PILOT_APP_ID}/generated_images`,
      appID: PILOT_APP_ID,
      camAppID: PILOT_APP_ID,
    });

    const persistedURL =
      String(upload.url || '').trim() ||
      String(upload.signed_url || '').trim() ||
      String(upload.public_url || '').trim() ||
      imageDataUrl;

    let objectRecord: Awaited<ReturnType<typeof recordTaskManagerObject>> | null = null;
    try {
      objectRecord = await recordTaskManagerObject({
        bucket_name: String(upload.bucket_name || '').trim(),
        region: String(upload.region || '').trim(),
        object_key: String(upload.object_key || '').trim(),
        url: persistedURL,
        size_bytes: blob.size,
        mime_type: blob.type || 'image/png',
      });
    } catch (error) {
      console.warn(`[${PILOT_APP_ID}] image object record failed, continue task creation`, error);
    }

    const fullPayload = {
      title: taskName,
      name: taskName,
      image_url: persistedURL,
      url: persistedURL,
      object_id: objectRecord?.object_id,
      object_key: upload.object_key,
      bucket: upload.bucket_name,
      region: upload.region,
      mime_type: blob.type || 'image/png',
      size_bytes: blob.size,
      shot_index: index,
      stage: shot.stage,
      description: shot.description,
      aspect_ratio: state.aspectRatio,
    };

    try {
      await createTaskQueueItem({
        source_app_id: PILOT_APP_ID,
        item_type: 'image_link',
        status: 'finished',
        payload: fullPayload,
      });
    } catch (error) {
      await createTaskQueueItem({
        source_app_id: PILOT_APP_ID,
        item_type: 'image_link',
        status: 'finished',
        payload: {
          title: taskName,
          name: taskName,
          image_url: persistedURL,
          url: persistedURL,
          shot_index: index,
          stage: shot.stage,
          aspect_ratio: state.aspectRatio,
        },
      });
      console.warn(`[${PILOT_APP_ID}] image task persisted with minimal payload`, error);
    }

    return persistedURL;
  };

  const persistVideoTask = async (
    title: string,
    generation: { taskId: string | null; status: string; videoUrl: string | null },
    options: {
      durationSeconds: number;
      prompt: string;
      shotIndex?: number;
      stage?: string;
      previewUrl?: string;
    },
  ) => {
    const taskName = formatTaskName(title);
    await createTaskQueueItem({
      source_app_id: PILOT_APP_ID,
      item_type: 'video_task',
      status: normalizeTaskQueueStatus(generation.status, generation.videoUrl),
      payload: {
        title: taskName,
        name: taskName,
        task_id: generation.taskId,
        taskId: generation.taskId,
        query_status: generation.status,
        model: VIDEO_MODEL_BY_ENGINE[selectedVideoEngine],
        engine: selectedVideoEngine,
        video_url: generation.videoUrl,
        videoUrl: generation.videoUrl,
        aspect_ratio: state.aspectRatio,
        duration_seconds: options.durationSeconds,
        prompt: options.prompt,
        shot_index: options.shotIndex,
        stage: options.stage,
        preview_url: options.previewUrl,
      },
    });
  };

  useEffect(() => {
    if (selectedVideoEngine === 'grokv3') {
      setDirectVideoDurationSec(GROK_FIXED_DURATION_SECONDS);
      return;
    }
    if (selectedVideoEngine === 'jimeng') {
      setDirectVideoDurationSec((prev) => (prev >= 8 ? 10 : 5));
      return;
    }
    if (selectedVideoEngine === 'veo31') {
      setDirectVideoDurationSec((prev) => (prev >= 8 ? 8 : 4));
    }
  }, [selectedVideoEngine]);

  useEffect(() => {
    if (!isReferenceVideoDisabled || !state.referenceVideo) {
      return;
    }
    setState((prev) => ({ ...prev, referenceVideo: null }));
  }, [isReferenceVideoDisabled, state.referenceVideo]);

  useEffect(() => {
    if (selectedVideoEngine !== 'kling' || !state.referenceVideo) return;
    const referenceDuration = Number(state.referenceVideoDurationSec);
    if (!Number.isFinite(referenceDuration) || directVideoDurationSec <= referenceDuration) return;
    if (referenceDuration >= 5) setDirectVideoDurationSec(5);
  }, [directVideoDurationSec, selectedVideoEngine, state.referenceVideo, state.referenceVideoDurationSec]);

  const isTerminalTaskStatus = (status: string): boolean => {
    const normalized = String(status || '').trim().toLowerCase();
    return normalized === 'succeed' || normalized === 'succeeded' || normalized === 'success' || normalized === 'completed' || normalized === 'fail' || normalized === 'failed' || normalized === 'error' || normalized === 'cancelled' || normalized === 'expired' || normalized === 'rejected' || normalized === 'not_found';
  };

  useEffect(() => {
    const savedTask = getLatestVideoTask();
    if (!savedTask) return;
    setLatestTaskId(savedTask.taskId);
    setQueryTaskId(savedTask.taskId);
    setQueryTaskStatus(savedTask.status || 'queued');
    if (savedTask.videoUrl) {
      setState(p => ({ ...p, videoUrl: savedTask.videoUrl, isGeneratingVideo: false, error: null }));
      return;
    }
    if (!isTerminalTaskStatus(savedTask.status)) {
      generationStartedAtRef.current = Date.now();
      consecutivePollFailuresRef.current = 0;
      setProviderNotice('已恢复最近提交的视频任务，正在当前页面继续查询生成进度。');
      setState(p => ({ ...p, isGeneratingVideo: true, error: null }));
    }
  }, []);

  const isRealPersonVideoRejection = (message: string): boolean => {
    const normalized = message.toLowerCase();
    return normalized.includes('input video may contain real person');
  };

  const isReferenceVideoTooLongRejection = (message: string): boolean => {
    const normalized = message.toLowerCase();
    return normalized.includes('video duration (seconds)') && normalized.includes('less than or equal to 15.2');
  };

  const isReferenceVideoTooSmallRejection = (message: string): boolean => {
    const normalized = message.toLowerCase();
    return normalized.includes('video pixel count') && normalized.includes('greater than or equal to 409600');
  };

  const isAbortedVideoRequest = (message: string): boolean => {
    const normalized = message.toLowerCase();
    return (
      normalized.includes('signal is aborted without reason') ||
      normalized.includes('aborterror') ||
      (normalized.includes('aborted') && normalized.includes('without reason'))
    );
  };

  const isSeedanceWaitTimeout = (message: string): boolean => {
    const normalized = message.toLowerCase();
    return normalized.includes('seedance video task timed out waiting for playable video url');
  };

  const extractTaskIdFromMessage = (message: string): string => {
    const match = message.match(/task_id=([a-zA-Z0-9_-]+)/);
    return match?.[1]?.trim() || '';
  };

  const handleVideoGenerationError = (message: string, fallbackMessage: string) => {
    if (selectedVideoEngine === 'cprt' && isRealPersonModeRejection(message)) {
      // CPRT 素材送审被拒：展示「关闭真人模式并重试」入口（仅当次重试关闭，不改开关）。
      setIsAuditRejection(true);
      setProviderNotice('真人素材未通过平台内容审核。可点击「关闭真人模式并重试」，本次生成将不下发真人素材槽位；或更换非真人素材。');
      setState(p => ({ ...p, error: null }));
      return;
    }

    if (isRealPersonVideoRejection(message)) {
      setProviderNotice('上传视频素材中可能有真人，请重试。');
      setState(p => ({ ...p, error: null }));
      return;
    }

    if (isReferenceVideoTooLongRejection(message)) {
      setProviderNotice('参考视频需少于15秒。');
      setState(p => ({ ...p, error: null }));
      return;
    }

    if (isReferenceVideoTooSmallRejection(message)) {
      setProviderNotice('参考视频过小。');
      setState(p => ({ ...p, error: null }));
      return;
    }

    if (isAbortedVideoRequest(message)) {
      const raw = message || 'signal is aborted without reason';
      setProviderNotice('请求超时或网络中断，请重试。');
      setState(p => ({
        ...p,
        error:
          `视频生成请求被中断。可能原因：任务耗时过长触发超时、网络波动、浏览器中止请求。原始信息：${raw}`,
      }));
      return;
    }

    if (isSeedanceWaitTimeout(message)) {
      const taskIdFromMessage = extractTaskIdFromMessage(message);
      if (taskIdFromMessage) {
        setLatestTaskId(taskIdFromMessage);
        setQueryTaskId(taskIdFromMessage);
      }
      setProviderNotice('任务仍在进行中，稍后可使用任务ID在此页面查询进度。');
      setState(p => ({ ...p, error: null }));
      return;
    }

    setState(p => ({ ...p, error: fallbackMessage }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) return;
      if (file.size > 10 * 1024 * 1024) {
        setState((prev) => ({ ...prev, error: '产品图片不能超过 10MB。' }));
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setProviderNotice(null);
        setFinalVideoDurationSec(null);
        setShotVideoDurations({});
        setShotTaskIds({});
        setState(p => ({ ...p, image: reader.result as string, plan: null, videoUrl: null, error: null }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleReferenceProductClick = (event: React.MouseEvent<HTMLVideoElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const video = event.currentTarget;
    const rect = video.getBoundingClientRect();
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (!sourceWidth || !sourceHeight || !rect.width || !rect.height) return;

    const scale = Math.min(rect.width / sourceWidth, rect.height / sourceHeight);
    const renderedWidth = sourceWidth * scale;
    const renderedHeight = sourceHeight * scale;
    const offsetX = (rect.width - renderedWidth) / 2;
    const offsetY = (rect.height - renderedHeight) / 2;
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    if (localX < offsetX || localX > offsetX + renderedWidth || localY < offsetY || localY > offsetY + renderedHeight) {
      setProviderNotice('请点击视频画面中的原产品。');
      return;
    }

    const selection: FaceSelectionPoint = {
      x: Math.min(1, Math.max(0, (localX - offsetX) / renderedWidth)),
      y: Math.min(1, Math.max(0, (localY - offsetY) / renderedHeight)),
      timeSec: Math.max(0, Math.min(Number(video.currentTime) || 0, Math.max(0, effectiveDirectVideoDurationSec - 0.1))),
    };
    video.pause();
    setReferenceProductMarker({ leftPct: (localX / rect.width) * 100, topPct: (localY / rect.height) * 100 });
    setState(prev => ({ ...prev, referenceVideoProductSelection: selection, error: null }));
    setProviderNotice('已定位原产品。生成时只替换产品，人物、手部、动作和镜头保持参考视频。');
  };

  const handleKlingDurationChange = (seconds: number) => {
    const referenceDuration = Number(state.referenceVideoDurationSec);
    if (state.referenceVideo && Number.isFinite(referenceDuration) && seconds > referenceDuration) {
      setProviderNotice(`生成时长不能超过参考视频的 ${formatDuration(referenceDuration)}。`);
      return;
    }
    setDirectVideoDurationSec(seconds);
    setProviderNotice(state.referenceVideo ? `已切换为 ${seconds} 秒，生成时长不能超过参考视频时长。` : null);
  };

  const handleCprtModelChange = (model: CprtMultimodalVideoModel) => {
    setCprtModel(model);
    // 分辨率随模型重置：不同模型支持的原生分辨率不同（如 2.5 不支持 1080p）。
    if (!CPRT_RESOLUTIONS_BY_MODEL[model].includes(outputResolution)) {
      setOutputResolution(CPRT_RESOLUTIONS_BY_MODEL[model][0] as VideoResolution);
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isReferenceVideoDisabled) {
      setProviderNotice('当前引擎暂不支持参考视频。');
      return;
    }
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        setState(p => ({ ...p, error: "视频文件过大，请上传 20MB 以内的视频。" }));
        return;
      }
      const durationSec = await readVideoDuration(file);
      if (durationSec !== null && (durationSec < 2 || durationSec > 15.2)) {
        setState(p => ({ ...p, error: '参考视频时长需为 2–15 秒。' }));
        e.target.value = '';
        return;
      }
      setDirectVideoDurationSec(5);
      setReferenceProductMarker(null);
      const reader = new FileReader();
      reader.onloadend = () => {
        setProviderNotice('爆款参考视频已上传，请点击画面中的原产品完成定位。');
        setFinalVideoDurationSec(null);
        setShotVideoDurations({});
        setShotTaskIds({});
      setState(p => ({
        ...p,
        referenceVideo: reader.result as string,
        referenceVideoDurationSec: durationSec,
        referenceVideoHasFace: false,
        referenceVideoFaceSelection: null,
        referenceVideoHeadSelectionPoints: [],
        referenceVideoProductSelection: null,
        plan: null,
        videoUrl: null,
        error: null,
      }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDirectGenerateVideo = async (realPersonModeOverride?: boolean) => {
    if (!state.image) {
      setProviderNotice('请先上传需要植入视频的产品图。');
      return;
    }
    if (!state.referenceVideo) {
      setProviderNotice('请先上传包含原产品的爆款参考视频。');
      return;
    }
    if (!state.referenceVideoProductSelection) {
      setProviderNotice('请先点击爆款参考视频中的原产品完成定位。');
      return;
    }
    const referenceDurationSec = Number(state.referenceVideoDurationSec);
    if (Number.isFinite(referenceDurationSec) && effectiveDirectVideoDurationSec > referenceDurationSec) {
      setProviderNotice(`生成时长不能超过参考视频的 ${formatDuration(referenceDurationSec)}。`);
      return;
    }

    if (!ensureActionAllowed('FULL_VIDEO', { videoSeconds: effectiveDirectVideoDurationSec })) return;
    const billingTask = resolveBillingTask('FULL_VIDEO', effectiveDirectVideoDurationSec);

    pendingAutomaticDubbingRef.current = false;
    preparedReferenceVideoForAudioRef.current = null;
    setIsAuditRejection(false);
    setDubbedVideoUrl(null);
    setDubbingStage('');
    setDubbingError(null);
    setProviderNotice('正在准备参考视频，请稍候。');
    setFinalVideoDurationSec(null);
    setLatestTaskId('');
    setQueryTaskId('');
    setQueryTaskStatus('preparing');
    setIsAutoPollingEnabled(true);
    consecutivePollFailuresRef.current = 0;
    generationStartedAtRef.current = Date.now();
    setState(p => ({ ...p, videoUrl: null, isGeneratingVideo: true, error: null }));
    try {
      const selectedDuration = Math.min(15, Math.max(5, Math.round(effectiveDirectVideoDurationSec))) as 5 | 10 | 15;
      setProviderNotice('正在检查参考视频尺寸并准备兼容素材…');
      if (Number(state.referenceVideoDurationSec) > selectedDuration) {
        setProviderNotice(`正在本地截取参考视频前 ${selectedDuration} 秒，截取不会改动画面内容。`);
      }
      const preparedReferenceVideo = await trimReferenceVideoDataUrl(
        state.referenceVideo,
        state.referenceVideoDurationSec,
        selectedDuration,
      );
      const generationReferenceVideo = preparedReferenceVideo;
      preparedReferenceVideoForAudioRef.current = preparedReferenceVideo;
      let prompt = 'Analyze every reference-video beat where the subject holds, operates or uses an object. At each corresponding beat, completely remove the original object and show the same subject actively using the uploaded product for its own canonical real-world purpose. Preserve the source timing, energy, gaze and performance, but replace the functional action; passive display, placement, looking at the product or merely holding it is invalid. Preserve the exact subject species, identity, anthropomorphism level, posture, clothing, facial expression, gaze, emotional state, gesture timing, body dynamics and performance style. For an anthropomorphic animal, use its hand-functioning forepaws to operate hand-held products and never use its mouth, tongue or teeth. Never show both old and new props. For example, with an uploaded book and a reference dog using a phone, show the same dog using its forepaws to hold, read and turn pages in the book at the original interaction beats, with no phone anywhere. Preserve the source composition and viral shot logic. Generate synchronized natural audio, ambient sound and action foley; never return a silent video.';
      setProviderNotice('AI 正在分析产品类别、真实用途、适用场景与爆款视频逻辑…');
      const referenceFrames = await captureVideoFrames(preparedReferenceVideo, [0.12, 0.5, 0.86]);
      try {
        const aiPrompt = await createProductCreativePrompt(
          state.image,
          referenceFrames.map(frame => frame.image),
          true,
        );
        if (aiPrompt) prompt = aiPrompt;
      } catch {
        prompt = 'Create a visually new premium live-action commercial for the uploaded product while preserving the reference character exactly: same species, identity cues, anthropomorphism, posture, clothing, expression, gaze, gesture rhythm and performance energy. Identify every beat where the subject holds, operates or uses an original object, remove that object completely, and replace each corresponding beat with active canonical use of the uploaded product. Do not merely show, place, look at or passively hold the product. For an anthropomorphic animal, its hand-functioning forepaws must operate hand-held products; mouth, tongue and teeth are forbidden. Example: uploaded book plus a dog using a phone must become the same dog using its forepaws to hold, read and turn pages in the book with similar pose and expression, with no phone anywhere. Keep the composition, hook, shot roles, interaction timing, transitions and payoff. Keep the uploaded product exact and stable. Generate synchronized natural audio, ambient sound and action foley; never return a silent video.';
      }
      // CPRT master-video：完整参考视频直接交给模型复刻动作与运镜，
      // 不再生成「动作基准图」，也不使用关键帧（避免模型只看帧而丢失时序）。
      void referenceFrames;
      setProviderNotice('创意方案已完成，模型将逐帧复刻参考视频的动作、运镜与镜头晃动，并把手中道具替换为上传产品。');
      const generation = await generateVideo(
        prompt,
        state.image || "",
        state.aspectRatio,
        undefined,
        undefined,
        generationReferenceVideo,
        effectiveDirectVideoDurationSec,
        selectedVideoEngine,
        billingTask,
        false,
        undefined,
        undefined,
        outputResolution,
        undefined,
        state.referenceVideoProductSelection || undefined,
        selectedAudienceTag,
        'product',
        true,
        [],
        undefined,
        cprtModel,
        realPersonModeOverride ?? realPersonMode,
      );
      void activePlatform.refreshCredits?.();

      if (generation.taskId) {
        consecutivePollFailuresRef.current = 0;
        generationStartedAtRef.current = Date.now();
        setLatestTaskId(generation.taskId);
        setQueryTaskId(generation.taskId);
        setQueryTaskStatus(generation.status || 'queued');
      }

      try {
        await persistVideoTask('产品全新创意视频', generation, {
          durationSeconds: effectiveDirectVideoDurationSec,
          prompt,
        });
      } catch (persistError) {
        reportTaskQueuePersistenceFailure('视频任务', persistError);
      }

      if (generation.videoUrl) {
        generationStartedAtRef.current = null;
        setQueryTaskStatus(generation.status);
        setFinalVideoDurationSec(null);
        setState(p => ({ ...p, videoUrl: generation.videoUrl, isGeneratingVideo: false }));
      } else {
        setProviderNotice('视频任务已提交，正在当前页面自动生成并查询进度，请保持页面打开。');
      }
    } catch (err: any) {
      pendingAutomaticDubbingRef.current = false;
      setIsGeneratingDubbing(false);
      generationStartedAtRef.current = null;
      setState(p => ({ ...p, isGeneratingVideo: false }));
      const errMessage = String(err?.message || '未知错误');
      const friendlyFallback = selectedVideoEngine === 'cprt'
        ? `视频生成失败: ${toFriendlyErrorMessage(errMessage)}`
        : `视频生成失败: ${errMessage}`;
      handleVideoGenerationError(errMessage, friendlyFallback);
    }
  };

  const startAnalysis = async () => {
    if (!state.image) return;

    if (!ensureActionAllowed('PLAN_ANALYSIS')) return;

    setState(p => ({ ...p, isAnalyzing: true, error: null }));
    try {
      const plan = await analyzeProduct(state.image, state.shotCount, state.customSellingPoints);
      void activePlatform.refreshCredits?.();
      setShotTaskIds({});
      setState(p => ({ ...p, plan, editedPrompt: plan.videoPrompt, isAnalyzing: false }));
    } catch (err: any) {
      console.error(err);
      let errorMsg = "分析失败，请重试。";
      if (err.message?.includes("429") || err.message?.includes("quota")) {
        errorMsg = "API 配额不足，请稍后。";
      } else if (err.message?.includes('no storyboard items') || err.message?.includes('response JSON parse failed')) {
        errorMsg = "分镜结果格式异常，请重试。";
      }
      setState(p => ({ ...p, isAnalyzing: false, error: errorMsg }));
    }
  };

  const generateSingleShotImage = async (index: number) => {
    if (!state.plan || !state.image) return;
    if (!ensureActionAllowed('SHOT_IMAGE')) return null;
    const billingTask = resolveBillingTask('SHOT_IMAGE');

    const shot = state.plan.storyboard[index];
    setLoadingShots(prev => new Set(prev).add(index));
    try {
      const previewUrl = await generateShotImage(shot.description, shot.overlayText, shot.cameraMovement, state.image, state.aspectRatio, billingTask);
      void activePlatform.refreshCredits?.();
      let persistedPreviewUrl = previewUrl;
      try {
        persistedPreviewUrl = await persistGeneratedImageTask(index, shot, previewUrl);
      } catch (persistError) {
        reportTaskQueuePersistenceFailure(`分镜 ${index + 1} 图片任务`, persistError);
      }
      setState(p => {
        const newStoryboard = [...(p.plan?.storyboard || [])];
        newStoryboard[index] = { ...newStoryboard[index], previewUrl: persistedPreviewUrl };
        return { ...p, plan: { ...p.plan!, storyboard: newStoryboard } };
      });
      return persistedPreviewUrl;
    } catch (err: any) {
      setState(p => ({ ...p, error: `分镜 ${index + 1} 画面生成失败` }));
      return null;
    } finally {
      setLoadingShots(prev => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

  const handleGenerateShotVideo = async (index: number) => {
    if (!state.plan || !state.image) return;
    const shot = state.plan.storyboard[index];
    const duration = parseShotDurationSeconds(shot.duration);
    if (!ensureActionAllowed('SHOT_VIDEO', { videoSeconds: duration })) return null;
    const billingTask = resolveBillingTask('SHOT_VIDEO', duration);

    setLoadingShotVideos(prev => new Set(prev).add(index));
    setShotVideoDurations(prev => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    setShotTaskIds(prev => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    try {
      setProviderNotice(null);
      const shotPrompt = `Commercial shot: ${shot.description}. FULL FRAME COVERAGE, NO BORDERS. ACTION COMPLETED IN ${duration} SECONDS.`;
      
      let lastFrameImage = undefined;
      if ((index === 1 || index === 2) && state.plan.storyboard[index + 1]?.previewUrl) {
        lastFrameImage = state.plan.storyboard[index + 1].previewUrl;
      }

      const generation = await generateVideo(
        shotPrompt,
        state.image,
        state.aspectRatio,
        shot.previewUrl,
        lastFrameImage,
        undefined,
        duration,
        selectedVideoEngine,
        billingTask,
        state.referenceVideoHasFace,
        undefined,
        undefined,
        outputResolution,
      );
      void activePlatform.refreshCredits?.();

      if (generation.taskId) {
        setLatestTaskId(generation.taskId);
        setQueryTaskId(generation.taskId);
        setShotTaskIds(prev => ({ ...prev, [index]: generation.taskId! }));
      }

      try {
        await persistVideoTask(`分镜 ${index + 1} 视频任务`, generation, {
          durationSeconds: duration,
          prompt: shotPrompt,
          shotIndex: index,
          stage: shot.stage,
          previewUrl: shot.previewUrl,
        });
      } catch (persistError) {
        reportTaskQueuePersistenceFailure(`分镜 ${index + 1} 视频任务`, persistError);
      }

      if (!generation.videoUrl) {
        setProviderNotice('任务仍在进行中，稍后可使用任务ID在此页面查询进度。');
        return null;
      }

      setState(p => {
        const newStoryboard = [...(p.plan?.storyboard || [])];
        newStoryboard[index] = { ...newStoryboard[index], videoUrl: generation.videoUrl };
        return { ...p, plan: { ...p.plan!, storyboard: newStoryboard } };
      });
      return generation.videoUrl;
    } catch (err: any) {
      const errMessage = String(err?.message || '未知错误');
      handleVideoGenerationError(errMessage, `视频生成失败: ${errMessage}`);
      return null;
    } finally {
      setLoadingShotVideos(prev => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

  const handleGenerateAllImages = async () => {
    if (!state.plan) return;
    setIsProcessingAllImages(true);
    try {
      for (let i = 0; i < state.plan.storyboard.length; i++) {
        await generateSingleShotImage(i);
      }
    } finally {
      setIsProcessingAllImages(false);
    }
  };

  const handleDownloadAll = async () => {
    if (!state.plan) return;
    setIsBundling(true);
    const zip = new JSZip();
    const folder = zip.folder("广告素材包");

    try {
      for (let i = 0; i < state.plan.storyboard.length; i++) {
        const shot = state.plan.storyboard[i];
        if (shot.previewUrl) {
          const imgBlob = await fetch(shot.previewUrl).then(r => r.blob());
          folder?.file(`分镜_${i + 1}_画面.png`, imgBlob);
        }
        if (shot.videoUrl) {
          const vidBlob = await fetch(shot.videoUrl).then(r => r.blob());
          folder?.file(`分镜_${i + 1}_视频.mp4`, vidBlob);
        }
      }
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `广告素材包_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Bundling failed", err);
      setState(p => ({ ...p, error: "打包下载失败，请尝试单独下载。" }));
    } finally {
      setIsBundling(false);
    }
  };

  const handleDownloadVideo = (url: string, index: number) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `广告分镜视频-${index + 1}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const fetchTaskProgress = async (
    taskId: string,
    options: { showLoading?: boolean; showNotice?: boolean } = {}
  ) => {
    const { showLoading = true, showNotice = true } = options;
    const trimmedTaskId = taskId.trim();
    if (!trimmedTaskId) {
      setState(p => ({ ...p, error: '请输入任务ID。' }));
      return;
    }

    if (showNotice) {
      setProviderNotice(null);
    }
    if (showLoading) {
      setIsQueryingTask(true);
    }
    try {
      const result = await queryVideoTaskProgress(trimmedTaskId, selectedVideoEngine);
      const normalizedStatus = String(result.status || 'unknown').trim().toLowerCase();
      setQueryTaskStatus(result.status || 'unknown');
      setLatestTaskId(result.taskId);
      setQueryTaskId(result.taskId);
      updateTaskQueueVideoResult(result.taskId, result.status || 'unknown', result.videoUrl);

      if (result.videoUrl) {
        if (isUpscalingResultRef.current) return;
        consecutivePollFailuresRef.current = 0;
        generationStartedAtRef.current = null;
        setFinalVideoDurationSec(null);
        let finalVideoUrl = result.videoUrl;
        if (selectedVideoEngine === 'seedance2' && outputResolution === '1080p') {
          isUpscalingResultRef.current = true;
          setProviderNotice('Seedance Fast 已生成 720p，正在本地升格为 1080p 并保留音轨…');
          try {
            finalVideoUrl = await upscaleVideoTo1080p(result.videoUrl, state.aspectRatio);
          } catch (error) {
            const detail = error instanceof Error ? error.message : '未知错误';
            setProviderNotice(`本地 1080p 升格失败，已保留 720p 原视频：${detail}`);
          } finally {
            isUpscalingResultRef.current = false;
          }
        }
        if (selectedVideoEngine === 'cprt') {
          // 运镜复刻（vidstab）：把参考视频的镜头晃动轨迹叠加到成片上，
          // 必须在 setState 之前完成，保证随后的自动配音使用复刻后的视频。
          const referenceForShake = preparedReferenceVideoForAudioRef.current || state.referenceVideo || '';
          if (referenceForShake) {
            setProviderNotice('视频已生成，正在复刻参考视频的运镜与镜头晃动…');
            try {
              const finalizedUrl = await finalizeVideoWithCameraShake(result.videoUrl, referenceForShake);
              if (finalizedUrl) finalVideoUrl = finalizedUrl;
            } catch (error) {
              const detail = error instanceof Error ? error.message : '未知错误';
              setProviderNotice(`运镜复刻失败，已保留原始生成视频：${detail}`);
            }
          }
        }
        setState(p => ({ ...p, videoUrl: finalVideoUrl, isGeneratingVideo: false, error: null }));
        if (showNotice) {
          setProviderNotice('任务已完成，视频已加载。');
        }
      } else if (isTerminalTaskStatus(result.status)) {
        consecutivePollFailuresRef.current = 0;
        generationStartedAtRef.current = null;
        const message = normalizedStatus === 'succeed' || normalizedStatus === 'succeeded' || normalizedStatus === 'success' || normalizedStatus === 'completed'
          ? '视频任务已完成，但可灵未返回可播放的视频地址。'
          : `视频生成失败：可灵任务状态为 ${result.status || 'unknown'}。`;
        setState(p => ({ ...p, isGeneratingVideo: false, error: message }));
        setProviderNotice(null);
      } else {
        if (!normalizedStatus || normalizedStatus === 'unknown') {
          consecutivePollFailuresRef.current += 1;
          if (consecutivePollFailuresRef.current >= VIDEO_POLL_MAX_FAILURES) {
            setIsAutoPollingEnabled(false);
            setState(p => ({ ...p, isGeneratingVideo: false, error: '可灵连续未返回有效任务状态，已停止自动等待。请点击“立即查询”重试。' }));
            setProviderNotice(null);
            return;
          }
        } else {
          consecutivePollFailuresRef.current = 0;
        }
        if (showNotice) {
          setProviderNotice('任务仍在进行中，稍后可使用任务ID在此页面查询进度。');
        }
      }
    } catch (err: any) {
      const errMessage = String(err?.message || '查询任务失败');
      if (selectedVideoEngine === 'cprt' && isRealPersonModeRejection(errMessage)) {
        // 任务在 CPRT 侧因真人素材送审被拒：停止轮询并展示「关闭真人模式并重试」。
        setIsAutoPollingEnabled(false);
        generationStartedAtRef.current = null;
        setIsAuditRejection(true);
        setState(p => ({ ...p, isGeneratingVideo: false, error: null }));
        setProviderNotice('真人素材未通过平台内容审核。可点击「关闭真人模式并重试」，本次生成将不下发真人素材槽位；或更换非真人素材。');
        return;
      }
      consecutivePollFailuresRef.current += 1;
      if (showNotice || consecutivePollFailuresRef.current >= VIDEO_POLL_MAX_FAILURES) {
        setState(p => ({
          ...p,
          isGeneratingVideo: consecutivePollFailuresRef.current < VIDEO_POLL_MAX_FAILURES,
          error: `查询任务失败: ${errMessage}`,
        }));
      }
      if (consecutivePollFailuresRef.current >= VIDEO_POLL_MAX_FAILURES) {
        setIsAutoPollingEnabled(false);
        setProviderNotice('任务查询连续失败，已停止自动等待，避免页面一直处于生成状态。');
      }
    } finally {
      if (showLoading) {
        setIsQueryingTask(false);
      }
    }
  };

  const handleQueryTaskProgress = async () => {
    consecutivePollFailuresRef.current = 0;
    generationStartedAtRef.current = Date.now();
    setIsAutoPollingEnabled(true);
    setState(p => ({ ...p, isGeneratingVideo: true, error: null }));
    await fetchTaskProgress(queryTaskId, { showLoading: true, showNotice: true });
  };

  const handleStopWaiting = () => {
    setIsAutoPollingEnabled(false);
    generationStartedAtRef.current = null;
    setState(p => ({ ...p, isGeneratingVideo: false }));
    setProviderNotice('已停止页面自动等待；可灵服务器中的任务不会被取消，可稍后点击“立即查询”。');
  };

  useEffect(() => {
    if (!isAutoPollingEnabled) {
      return;
    }

    const candidateTaskId = String(latestTaskId || queryTaskId || '').trim();
    if (!candidateTaskId) {
      return;
    }

    if (state.videoUrl) {
      return;
    }

    if (isTerminalTaskStatus(queryTaskStatus)) {
      return;
    }

    const poll = () => {
      const startedAt = generationStartedAtRef.current;
      if (startedAt && Date.now() - startedAt >= VIDEO_POLL_MAX_WAIT_MS) {
        setIsAutoPollingEnabled(false);
        setState(p => ({ ...p, isGeneratingVideo: false, error: '视频任务等待超过 20 分钟，已停止自动等待。可稍后点击“立即查询”。' }));
        return;
      }
      if (pollingInFlightRef.current) return;
      pollingInFlightRef.current = true;
      void fetchTaskProgress(candidateTaskId, { showLoading: false, showNotice: false })
        .finally(() => { pollingInFlightRef.current = false; });
    };

    const firstPollId = window.setTimeout(poll, 1200);
    const timerId = window.setInterval(poll, VIDEO_POLL_INTERVAL_MS);

    return () => {
      window.clearTimeout(firstPollId);
      window.clearInterval(timerId);
    };
  }, [isAutoPollingEnabled, latestTaskId, queryTaskId, queryTaskStatus, state.videoUrl]);

  const handleDownloadImage = (url: string, index: number) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `广告分镜画面-${index + 1}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleFinalVideoMetadataLoaded = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const { videoWidth, videoHeight } = event.currentTarget;
    if (videoWidth > 0 && videoHeight > 0) {
      setGeneratedVideoFrameRatio(`${videoWidth} / ${videoHeight}`);
    }
    const duration = Number(event.currentTarget.duration);
    if (Number.isFinite(duration) && duration > 0) {
      setFinalVideoDurationSec(duration);
    }
  };

  const synchronizeComparisonVideos = (source: HTMLVideoElement, forceTime = false) => {
    if (comparisonSyncLockRef.current) return;
    const original = comparisonOriginalVideoRef.current;
    const generated = comparisonGeneratedVideoRef.current;
    if (!original || !generated) return;
    const target = source === original ? generated : original;

    comparisonSyncLockRef.current = true;
    const originalDuration = Number(original.duration);
    const generatedDuration = Number(generated.duration);
    const sharedDuration = Math.min(
      Number.isFinite(originalDuration) && originalDuration > 0 ? originalDuration : Number.POSITIVE_INFINITY,
      Number.isFinite(generatedDuration) && generatedDuration > 0 ? generatedDuration : Number.POSITIVE_INFINITY,
    );
    const targetDuration = Number(target.duration);
    const maximumSharedTime = Number.isFinite(sharedDuration)
      ? Math.max(0, sharedDuration - 0.01)
      : Number.isFinite(targetDuration) && targetDuration > 0
        ? Math.max(0, targetDuration - 0.01)
        : source.currentTime;
    const synchronizedTime = Number.isFinite(maximumSharedTime)
      ? Math.min(source.currentTime, maximumSharedTime)
      : source.currentTime;
    if (Math.abs(source.currentTime - synchronizedTime) > 0.01) {
      source.currentTime = synchronizedTime;
    }
    if (forceTime || Math.abs(target.currentTime - synchronizedTime) > 0.08) {
      target.currentTime = synchronizedTime;
    }
    target.playbackRate = source.playbackRate;
    if (source.paused) {
      target.pause();
    } else {
      void target.play().catch(() => undefined);
    }
    window.requestAnimationFrame(() => {
      comparisonSyncLockRef.current = false;
    });
  };

  const restartComparisonVideos = () => {
    const videos = [comparisonOriginalVideoRef.current, comparisonGeneratedVideoRef.current].filter(
      (video): video is HTMLVideoElement => Boolean(video),
    );
    comparisonSyncLockRef.current = true;
    videos.forEach(video => {
      video.currentTime = 0;
    });
    videos.forEach(video => {
      void video.play().catch(() => undefined);
    });
    window.requestAnimationFrame(() => {
      comparisonSyncLockRef.current = false;
    });
  };

  const handleRestoreOriginalAudio = async (sourceVideoUrl: string) => {
    pendingAutomaticDubbingRef.current = false;
    setIsGeneratingDubbing(true);
    setDubbedVideoUrl(null);
    setDubbingError(null);
    try {
      const referenceMedia = preparedReferenceVideoForAudioRef.current || state.referenceVideo;
      if (!referenceMedia) throw new Error('找不到包含原声音的参考视频。');
      setDubbingStage('正在合并参考视频原声音…');
      const finalUrl = await mergeVideoWithReferenceAudioDataUrl(sourceVideoUrl, referenceMedia);
      setDubbedVideoUrl(finalUrl);
      setDubbingStage('原声音已恢复');
    } catch (error) {
      setDubbingError(error instanceof Error ? error.message : '恢复参考视频声音失败。');
      setDubbingStage('');
    } finally {
      setIsGeneratingDubbing(false);
    }
  };

  useEffect(() => {
    setDubbedVideoUrl(null);
    setDubbingStage('');
    setDubbingError(null);
    const hasRecoverableAudio = Boolean(preparedReferenceVideoForAudioRef.current || state.referenceVideo);
    if (state.videoUrl && pendingAutomaticDubbingRef.current && hasRecoverableAudio) {
      void handleRestoreOriginalAudio(state.videoUrl);
    }
  }, [state.videoUrl, state.referenceVideo]);

  const handleShotVideoMetadataLoaded = (index: number, event: React.SyntheticEvent<HTMLVideoElement>) => {
    const duration = Number(event.currentTarget.duration);
    if (Number.isFinite(duration) && duration > 0) {
      setShotVideoDurations(prev => ({ ...prev, [index]: duration }));
    }
  };

  const totalStoryboardImageCost = (state.plan?.storyboard.length || 0) * IMAGE_GEN_COST_POINTS;

  const handleRegenerateDescription = async (index: number) => {
    if (!state.plan || !state.image) return;
    const shot = state.plan.storyboard[index];
    setLoadingDescriptions(prev => new Set(prev).add(index));
    try {
      const result = await regenerateShotDescription(state.image, shot.stage, state.customSellingPoints);
      setState(p => {
        if (!p.plan) return p;
        const newStoryboard = [...p.plan.storyboard];
        newStoryboard[index] = { 
          ...newStoryboard[index], 
          description: result.description,
          cameraMovement: result.cameraMovement,
          overlayText: result.overlayText
        };
        return { ...p, plan: { ...p.plan, storyboard: newStoryboard } };
      });
    } catch (err: any) {
      setState(p => ({ ...p, error: `分镜 ${index + 1} 描述生成失败` }));
    } finally {
      setLoadingDescriptions(prev => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

  const handleExpandDescription = async (index: number) => {
    if (!state.plan || !state.image) return;
    const shot = state.plan.storyboard[index];
    setLoadingExpansions(prev => new Set(prev).add(index));
    try {
      const expanded = await expandShotDescriptionAI(state.image, shot.description);
      handleTextChange(index, 'description', expanded);
    } catch (err: any) {
      setState(p => ({ ...p, error: `分镜 ${index + 1} 描述扩写失败` }));
    } finally {
      setLoadingExpansions(prev => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

  const handleTextChange = (index: number, field: keyof Shot, val: string) => {
    setState(p => {
      if (!p.plan) return p;
      const newStoryboard = [...p.plan.storyboard];
      newStoryboard[index] = { ...newStoryboard[index], [field]: val } as Shot;
      return { ...p, plan: { ...p.plan, storyboard: newStoryboard } };
    });
  };

  const Sidebar = (
    <div className="space-y-8 pb-10">
      <div className="hidden lg:block pb-6 border-b border-slate-100">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none">产品爆款视频创作 <span className="text-indigo-600 block text-lg mt-1">Product Viral Video Studio</span></h1>
        <p className="mt-4 text-[11px] font-semibold leading-relaxed text-slate-500">
          上传自己的产品，让热门视频为产品代言。
        </p>
      </div>

      <div className="space-y-6">
        <section>
          <div className="grid grid-cols-2 gap-3">
            <div className="w-full">
              <label className="min-h-8 text-[10px] leading-4 font-black text-slate-500 uppercase tracking-widest flex items-start mb-2 px-1">上传产品图</label>
              <label className="block group cursor-pointer">
                <div className="w-full aspect-square bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center overflow-hidden transition-all group-hover:border-indigo-400 group-hover:bg-indigo-50/30 group-hover:shadow-inner">
                  {state.image ? (
                    <img src={state.image} alt="已上传产品图" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 bg-white rounded-xl shadow-sm flex items-center justify-center mb-1 text-indigo-500 group-hover:scale-110 transition-transform">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      </div>
                      <span className="text-[9px] text-slate-400 font-bold uppercase">上传产品</span>
                    </div>
                  )}
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
            </div>

            {activeSidebarTab === 'selling_video' && (
              <div className="w-full">
                <label className="min-h-8 text-[10px] leading-4 font-black text-slate-500 uppercase tracking-widest flex items-start mb-2 px-1">
                  爆款参考视频（2–15s）
                  {isReferenceVideoDisabled && <span className="ml-2 text-[9px] text-slate-400">当前引擎暂不支持</span>}
                </label>
                <label className={`block group ${isReferenceVideoDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                  <div className={`w-full aspect-square border-2 rounded-3xl flex flex-col items-center justify-center overflow-hidden transition-all ${isReferenceVideoDisabled ? 'bg-slate-100 border-slate-200 opacity-60' : `${state.referenceVideo ? 'bg-slate-950' : 'bg-slate-50'} border-slate-200 group-hover:border-indigo-400 group-hover:shadow-inner`} }` }>
                    {state.referenceVideo ? (
                      <div className="relative w-full h-full bg-black flex items-center justify-center">
                        <video
                          src={state.referenceVideo}
                          muted
                          autoPlay
                          loop
                          playsInline
                           preload="metadata"
                           onClick={handleReferenceProductClick}
                          onTimeUpdate={(event) => {
                            if (event.currentTarget.currentTime >= effectiveDirectVideoDurationSec - 0.05) {
                              event.currentTarget.currentTime = 0;
                            }
                          }}
                           className="w-full h-full object-contain cursor-crosshair"
                           aria-label="爆款参考视频预览，AI 自动定位产品，可点击产品校正"
                         />
                         {referenceProductMarker && (
                           <span
                             className="absolute z-10 w-5 h-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.3)] pointer-events-none"
                             style={{ left: `${referenceProductMarker.leftPct}%`, top: `${referenceProductMarker.topPct}%` }}
                            aria-hidden="true"
                          />
                        )}
                        <div className="absolute inset-x-2 bottom-2 px-2 py-1.5 rounded-lg bg-black/65 text-white text-[8px] font-bold text-center pointer-events-none">
                           {isAutoLocatingProduct
                             ? 'AI 正在自动定位产品…'
                             : state.referenceVideoProductSelection ? 'AI 已定位，可点击产品调整' : '正在等待自动定位…'}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <div className={`w-8 h-8 bg-white rounded-xl shadow-sm flex items-center justify-center mb-1 transition-transform ${isReferenceVideoDisabled ? 'text-slate-300' : 'text-indigo-500 group-hover:scale-110'}`}>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        </div>
                        <span className="text-[9px] text-slate-400 font-bold uppercase">{isReferenceVideoDisabled ? '当前模型不可用' : '上传视频'}</span>
                      </div>
                    )}
                  </div>
                  <input id="reference-video-input" type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} disabled={isReferenceVideoDisabled} />
                </label>
                {state.referenceVideo && (
                  <label htmlFor="reference-video-input" className="mt-2 block text-center text-[9px] font-black text-indigo-600 cursor-pointer">更换视频</label>
                )}
              </div>
            )}
          </div>
        </section>

        <section>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">画幅</label>
          <div className="grid grid-cols-2 gap-2">
            {(['9:16', '16:9'] as const).map((ratio) => (
              <button
                key={ratio}
                type="button"
                disabled={state.isGeneratingVideo || isGeneratingDubbing}
                onClick={() => setState(prev => ({ ...prev, aspectRatio: ratio, videoUrl: null }))}
                className={`py-3 text-[10px] font-black rounded-xl border transition-all disabled:cursor-not-allowed disabled:opacity-60 ${state.aspectRatio === ratio ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
              >
                {ratio}
              </button>
            ))}
          </div>
        </section>

        <section>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">生成模型</label>
          <div className="grid grid-cols-2 gap-2">
            {CPRT_MULTIMODAL_VIDEO_MODELS.map((model) => (
              <button
                key={model}
                type="button"
                disabled={state.isGeneratingVideo || isGeneratingDubbing}
                onClick={() => handleCprtModelChange(model)}
                className={`py-3 text-[10px] font-black rounded-xl border transition-all disabled:cursor-not-allowed disabled:opacity-60 ${cprtModel === model ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
              >
                {CPRT_MODEL_LABELS[model]}
              </button>
            ))}
          </div>
        </section>

        <section>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">输出规格</label>
          <div className="grid grid-cols-3 gap-2">
            {CPRT_RESOLUTIONS_BY_MODEL[cprtModel].map((resolution) => (
              <button
                key={resolution}
                type="button"
                disabled={state.isGeneratingVideo || isGeneratingDubbing}
                onClick={() => setOutputResolution(resolution as VideoResolution)}
                className={`py-3 text-[10px] font-black rounded-xl border transition-all disabled:cursor-not-allowed disabled:opacity-60 ${outputResolution === resolution ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
              >
                {resolution}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[9px] leading-relaxed text-slate-400 px-1 text-center">分辨率由所选模型原生生成；Seedance 2.0 最高支持 1080p，其余模型最高 720p。</p>
        </section>

        <section>
          <button
            type="button"
            onClick={() => setRealPersonMode((prev) => !prev)}
            disabled={state.isGeneratingVideo}
            className="w-full flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 transition-all hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="flex flex-col items-start">
              <span className="text-[11px] font-black text-slate-800">真人模式</span>
              <span className="mt-0.5 text-[9px] text-slate-400 leading-relaxed text-left">
                开启后，参考视频与产品图将加入对应真人素材槽位
              </span>
            </span>
            <span className={`relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors ${realPersonMode ? 'bg-indigo-600' : 'bg-slate-200'}`}>
              <span className={`inline-block transform rounded-full bg-white shadow transition-transform ${realPersonMode ? 'translate-x-[22px]' : 'translate-x-[3px]'}`} style={{ height: 18, width: 18 }} />
            </span>
          </button>
          <p className="mt-2 px-1 text-[9px] leading-relaxed text-amber-600">
            默认开启：平台会对真人素材做严格权属审核（无授权真人/明星/网图/水印极易被拦）。被拦时点错误提示下方「关闭真人模式并重试」即可（仅当次重试关闭，不影响之后的设置）。<br />
            手动关闭：不下发真人素材槽位，平台只做常规审核。
          </p>
        </section>

        {activeSidebarTab === 'selling_video' && (
          <section>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">
              视频时长: {formatDuration(effectiveDirectVideoDurationSec)}
            </label>
            {selectedVideoEngine === 'grokv3' ? (
              <div className="w-full py-3 px-4 text-center text-[10px] font-black rounded-xl border border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed">
                固定 10s（Grok V3）
              </div>
            ) : selectedVideoEngine === 'veo31' ? (
              <div className="grid grid-cols-2 gap-2">
                {VEO_DURATION_OPTIONS.map((seconds) => (
                  <button
                    key={seconds}
                    type="button"
                    onClick={() => setDirectVideoDurationSec(seconds)}
                    className={`py-3 text-[10px] font-black rounded-xl border transition-all ${directVideoDurationSec === seconds ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                  >
                    {seconds}s
                  </button>
                ))}
              </div>
            ) : (
              <input
                type="range"
                min={5}
                max={15}
                step={1}
                value={directVideoDurationSec}
                onChange={(e) => handleKlingDurationChange(Number(e.target.value))}
                className="w-full accent-indigo-600 cursor-pointer"
                aria-label="选择视频时长"
              />
            )}
            {selectedVideoEngine !== 'grokv3' && selectedVideoEngine !== 'veo31' && (
              <div className="mt-1 flex items-center justify-between text-[10px] font-bold text-slate-400 px-1">
                <span>5 秒</span>
                <span>15 秒</span>
              </div>
            )}
            <p className="mt-2 text-[11px] font-bold text-slate-500 px-1">
              预计消耗：{resolveActionCost('FULL_VIDEO', effectiveDirectVideoDurationSec)} 积分
            </p>
            {selectedVideoEngine === 'kling' && (
              <p className="mt-1 text-[10px] font-medium text-slate-400 px-1">
                 生成时长不能超过参考视频；主体的动作、手势顺序、构图和爆款节奏严格跟随参考视频，仅按上传产品的真实用途适配手部操作并自然使用产品。
              </p>
            )}
          </section>
        )}

        {activeSidebarTab === 'storyboard' && (
          <section>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">分镜数量</label>
            <div className="grid grid-cols-5 gap-2">
              {[4, 6, 8, 10, 12].map(count => (
                <button
                  key={count}
                  onClick={() => setState(p => ({ ...p, shotCount: count, plan: null, videoUrl: null }))}
                  className={`py-3 text-[10px] font-black rounded-xl border transition-all ${state.shotCount === count ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                >
                  {count}
                </button>
              ))}
            </div>
          </section>
        )}

        {activeSidebarTab === 'storyboard' && (
          <div className="space-y-3">
            <button
              onClick={startAnalysis}
              disabled={!state.image || state.isAnalyzing}
              className="w-full py-4 bg-white border-2 border-indigo-600 text-indigo-600 rounded-2xl font-black text-xs transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-30 disabled:border-slate-200 disabled:text-slate-300 shadow-sm"
            >
              {state.isAnalyzing ? (
                <><span className="animate-spin h-3 w-3 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full" />分析中...</>
              ) : '生成分镜方案'}
            </button>
          </div>
        )}

        {activeSidebarTab === 'selling_video' && (
          <>
            <div className="space-y-3">
              <button
                onClick={() => void handleDirectGenerateVideo()}
                disabled={!state.image || !state.referenceVideo || state.isGeneratingVideo || isGeneratingDubbing || isAutoLocatingProduct}
                className="w-full py-5 bg-indigo-600 text-white rounded-3xl font-black text-sm shadow-xl shadow-indigo-200 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-300 disabled:shadow-none transition-all active:scale-[0.98] flex items-center justify-center gap-2 overflow-hidden relative"
              >
                {state.isGeneratingVideo && (
                  <span className="absolute inset-0 bg-indigo-500/50 animate-pulse" />
                )}
                {state.isGeneratingVideo || isGeneratingDubbing ? (
                  <><span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />{isGeneratingDubbing ? '正在恢复原声音...' : '视频生成中...'}</>
                ) : `生成产品全新创意（${resolveActionCost('FULL_VIDEO', effectiveDirectVideoDurationSec)}积分）`}
              </button>
              {latestTaskId && (
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-black text-indigo-700">{formatTaskStatus(queryTaskStatus)}</span>
                    {state.isGeneratingVideo && <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />}
                  </div>
                  <p className="text-[9px] font-medium text-slate-500 break-all">任务ID：{latestTaskId}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleQueryTaskProgress}
                      disabled={isQueryingTask}
                      className="py-2.5 rounded-xl bg-white border border-indigo-200 text-[10px] font-black text-indigo-700 disabled:opacity-50"
                    >
                      {isQueryingTask ? '查询中...' : '立即查询'}
                    </button>
                    <button
                      type="button"
                      onClick={handleStopWaiting}
                      className="py-2.5 rounded-xl bg-white border border-slate-200 text-[10px] font-black text-slate-500"
                    >
                      停止等待
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {state.error && (
        <div className="p-4 bg-rose-50 text-rose-600 text-[11px] font-bold rounded-2xl border border-rose-100 animate-in fade-in slide-in-from-top-2">
          {state.error}
        </div>
      )}

      {providerNotice && (
        <div className="p-4 bg-amber-50 text-amber-700 text-[11px] font-bold rounded-2xl border border-amber-200 animate-in fade-in slide-in-from-top-2 flex items-start justify-between gap-3 shadow-sm">
          <span className="flex-1">
            {providerNotice}
            {isAuditRejection && (
              <button
                type="button"
                onClick={() => {
                  // 当次审核拦截重试：仅通过 handleDirectGenerateVideo(false) 对这一次请求
                  // 关闭真人模式，不改写开关状态，避免之后的生成被静默取消真人素材槽位。
                  setIsAuditRejection(false);
                  setProviderNotice(null);
                  void handleDirectGenerateVideo(false);
                }}
                disabled={state.isGeneratingVideo || isGeneratingDubbing}
                className="mt-3 block w-full rounded-xl bg-rose-600 px-3 py-2 text-[11px] font-black text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
              >
                关闭真人模式并重试（绕过严格审核）
              </button>
            )}
          </span>
          <button
            type="button"
            onClick={() => setProviderNotice(null)}
            className="shrink-0 text-amber-500 hover:text-amber-700 transition-colors"
            aria-label="关闭提示"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {seedanceDebugNotice && (
        <div className="p-3 bg-slate-900 text-white text-[11px] font-bold rounded-2xl border border-slate-800 animate-in fade-in slide-in-from-top-2 flex items-start justify-between gap-3 shadow-lg">
          <span>{seedanceDebugNotice}</span>
          <button
            type="button"
            onClick={() => setSeedanceDebugNotice(null)}
            className="shrink-0 text-white/70 hover:text-white transition-colors"
            aria-label="关闭提示"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}
    </div>
  );

  const MainContent = (
    <div className="space-y-10 pb-24 lg:pb-20 px-2 lg:px-0">
      {state.referenceVideo && !state.plan && (
        <div className="animate-in fade-in zoom-in duration-500">
          <section className="rounded-[2rem] border border-indigo-100 bg-white p-5 lg:p-7 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-400">Output</p>
                <h2 className="mt-1 text-lg font-black text-slate-900">爆款视频效果对比</h2>
                <p className="mt-1 text-[11px] font-medium text-slate-400">左侧查看爆款原片，右侧查看产品创意成片。</p>
              </div>
              {state.videoUrl && <span className="rounded-full bg-emerald-50 px-3 py-1 text-[9px] font-black text-emerald-600">已完成</span>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-7 items-start">
              <article className="min-w-0 rounded-[1.75rem] border border-slate-200 bg-slate-50/70 p-3 lg:p-4">
                <div className="mb-3 flex items-center justify-between gap-3 px-1">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Original</p>
                    <h3 className="mt-0.5 text-sm font-black text-slate-800">爆款视频 · 原片</h3>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[9px] font-black text-slate-500">同步播放 · 静音</span>
                </div>
                <div className="mx-auto w-full overflow-hidden rounded-[1.35rem] bg-slate-950 shadow-inner flex items-center justify-center" style={{ aspectRatio: state.aspectRatio === '9:16' ? '9 / 16' : '16 / 9' }}>
                  <video
                    ref={comparisonOriginalVideoRef}
                    key={state.referenceVideo}
                    src={state.referenceVideo}
                    controls
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-contain"
                    onPlay={event => synchronizeComparisonVideos(event.currentTarget, true)}
                    onPause={event => synchronizeComparisonVideos(event.currentTarget)}
                    onSeeked={event => synchronizeComparisonVideos(event.currentTarget, true)}
                    onTimeUpdate={event => synchronizeComparisonVideos(event.currentTarget)}
                    onRateChange={event => synchronizeComparisonVideos(event.currentTarget)}
                    onEnded={restartComparisonVideos}
                    aria-label="爆款参考视频原片（与新视频同步播放，原片静音）"
                  />
                </div>
              </article>

              <article className="min-w-0 rounded-[1.75rem] border border-indigo-100 bg-indigo-50/40 p-3 lg:p-4">
                <div className="mb-3 flex items-center justify-between gap-3 px-1">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.16em] text-indigo-400">Generated</p>
                    <h3 className="mt-0.5 text-sm font-black text-slate-800">产品爆款 · 新效果</h3>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${state.videoUrl ? 'border-emerald-100 bg-emerald-50 text-emerald-600' : 'border-indigo-100 bg-white text-indigo-500'}`}>
                    {state.videoUrl ? '生成完成' : state.isGeneratingVideo ? '正在生成' : '等待生成'}
                  </span>
                </div>
                {state.videoUrl ? (
                  <div className="mx-auto w-full overflow-hidden rounded-[1.35rem] bg-slate-950 shadow-inner flex items-center justify-center" style={{ aspectRatio: generatedVideoFrameRatio }}>
                    <video
                      ref={comparisonGeneratedVideoRef}
                      key={dubbedVideoUrl || state.videoUrl}
                      src={dubbedVideoUrl || state.videoUrl}
                      controls
                      autoPlay
                      playsInline
                      className="h-full w-full object-contain"
                      onLoadedMetadata={handleFinalVideoMetadataLoaded}
                      onPlay={event => synchronizeComparisonVideos(event.currentTarget, true)}
                      onPause={event => synchronizeComparisonVideos(event.currentTarget)}
                      onSeeked={event => synchronizeComparisonVideos(event.currentTarget, true)}
                      onTimeUpdate={event => synchronizeComparisonVideos(event.currentTarget)}
                      onRateChange={event => synchronizeComparisonVideos(event.currentTarget)}
                      onEnded={restartComparisonVideos}
                      aria-label="生成的产品爆款视频（与原片同步播放）"
                    />
                  </div>
                ) : (
                  <div className="mx-auto w-full rounded-[1.35rem] border border-dashed border-indigo-200 bg-white/70 flex flex-col items-center justify-center px-6 text-center" style={{ aspectRatio: state.aspectRatio === '9:16' ? '9 / 16' : '16 / 9' }}>
                    <div className={`w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-500 mb-4 ${state.isGeneratingVideo ? 'animate-pulse' : ''}`}><svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A2 2 0 0121 9.512v4.976a2 2 0 01-2.447 1.948L15 16M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg></div>
                    <h3 className="text-base font-black text-slate-800">{state.isGeneratingVideo ? '正在创造新效果' : '等待生成结果'}</h3>
                    <p className="mt-2 max-w-xs text-[11px] leading-relaxed text-slate-400">生成完成后，会在这里与爆款原片并排展示。</p>
                  </div>
                )}
              </article>
            </div>

            {state.videoUrl && (
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-black rounded-full border border-emerald-100">成片时长：{finalVideoDurationSec ? formatDuration(finalVideoDurationSec) : '读取中...'}</span>
                {dubbedVideoUrl && <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-black rounded-full border border-indigo-100">原声音版</span>}
              </div>
            )}
            {(dubbingStage || dubbingError) && <div className={`mt-4 flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[11px] font-bold ${dubbingError ? 'border border-red-100 bg-red-50 text-red-600' : 'border border-indigo-100 bg-indigo-50 text-indigo-700'}`} aria-live="polite">{!dubbingError && <span className={`w-2 h-2 rounded-full bg-indigo-500 ${isGeneratingDubbing ? 'animate-pulse' : ''}`} />}<span>{dubbingError || dubbingStage}</span></div>}
            {dubbedVideoUrl && <div className="mt-5 flex justify-center"><button onClick={() => { const a = document.createElement('a'); a.href = dubbedVideoUrl || state.videoUrl!; a.download = `${dubbedVideoUrl ? '多语言广告视频' : '广告视频'}_${Date.now()}.mp4`; a.click(); }} className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl shadow-xl shadow-emerald-100 transition-all active:scale-95 flex items-center gap-2"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>{dubbedVideoUrl ? '下载多语言视频' : '下载最终视频'}</button></div>}
          </section>
        </div>
      )}

      {!state.plan && !state.isAnalyzing && !state.videoUrl && !state.referenceVideo && (
        <div className="py-24 lg:py-40 text-center max-w-lg mx-auto">
          <div className="w-20 h-20 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-inner">
            <svg className="w-10 h-10 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">准备好创造新的产品爆款了吗？</h2>
          <p className="text-sm text-slate-400 mt-4 leading-relaxed font-medium">
             上传产品图和爆款参考视频；AI 让主体动作、手势顺序与节奏严格跟随参考视频，同时保留主体、构图与爆款逻辑，仅按产品真实用途适配手部操作。
          </p>
        </div>
      )}

      {state.plan && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 mb-10">
            <div className="flex items-center gap-4">
              <div className="w-3 h-10 bg-indigo-600 rounded-full shadow-lg shadow-indigo-200" />
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight leading-none">分镜创作工作流</h2>
                <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-widest mt-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                  {state.plan.storyboard.length} 个分镜已就绪
                </p>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-3 w-full xl:w-auto">
              <button 
                onClick={handleGenerateAllImages}
                disabled={isProcessingAllImages}
                className="flex-1 sm:flex-none px-6 py-4 bg-white border border-indigo-200 text-indigo-600 text-[11px] font-black rounded-2xl shadow-sm hover:bg-indigo-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isProcessingAllImages ? <span className="animate-spin h-3.5 w-3.5 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full" /> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                {`一键生成所有构图（${totalStoryboardImageCost}积分）`}
              </button>
              <button 
                onClick={handleDownloadAll}
                disabled={isBundling}
                className="flex-1 sm:flex-none px-6 py-4 bg-slate-900 hover:bg-black text-white text-[11px] font-black rounded-2xl shadow-xl shadow-slate-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95"
              >
                {isBundling ? <span className="animate-spin h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full" /> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>}
                {isBundling ? "打包中..." : "打包导出素材"}
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 gap-12">
            {state.plan.storyboard.map((shot, i) => {
              const isLoadingImg = loadingShots.has(i);
              const isLoadingVid = loadingShotVideos.has(i);
              const isVertical = state.aspectRatio === '9:16';
              const isTransitionShot = i === 1 || i === 2;
              const hasNextPreview = !!state.plan?.storyboard[i + 1]?.previewUrl;
              const shotDurationSeconds = parseShotDurationSeconds(shot.duration);
              const shotVideoCost = resolveActionCost('SHOT_VIDEO', shotDurationSeconds);

              return (
                <div key={i} className="group relative flex flex-col md:flex-row h-auto gap-0 md:gap-8 transition-all">
                  {/* Visual Editor Section */}
                  <div 
                    className={`${isVertical ? 'w-full md:w-[280px]' : 'w-full md:w-[480px]'} bg-slate-950 relative flex items-center justify-center flex-shrink-0 rounded-[2.5rem] shadow-2xl shadow-slate-200 overflow-hidden ring-1 ring-slate-200/50 group-hover:shadow-indigo-100 transition-shadow`}
                    style={{ aspectRatio: isVertical ? '9/16' : '16/9' }}
                  >
                    <div className="w-full h-full relative group/media">
                      {shot.videoUrl ? (
                        <video
                          src={shot.videoUrl}
                          controls
                          autoPlay
                          loop
                          className="w-full h-full object-cover"
                          onLoadedMetadata={(event) => handleShotVideoMetadataLoaded(i, event)}
                        />
                      ) : shot.previewUrl ? (
                        <img src={shot.previewUrl} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center p-8 bg-slate-900">
                          {isLoadingImg ? (
                            <div className="flex flex-col items-center gap-4">
                              <span className="animate-spin h-8 w-8 border-3 border-indigo-500/20 border-t-indigo-500 rounded-full" />
                              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">正在绘制构图...</span>
                            </div>
                          ) : (
                            <button 
                              onClick={() => generateSingleShotImage(i)} 
                              className="text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-colors text-center leading-relaxed flex flex-col items-center gap-3 group-hover:text-indigo-400"
                            >
                              <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                              </div>
                              {`生成分镜视觉（${IMAGE_GEN_COST_POINTS}积分）`}
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {isLoadingVid && (
                      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center text-white z-20 p-8 text-center animate-in fade-in duration-300">
                         <div className="relative mb-6">
                           <span className="absolute inset-0 animate-ping h-8 w-8 bg-indigo-500/50 rounded-full" />
                           <span className="relative block h-8 w-8 border-3 border-white/20 border-t-indigo-400 rounded-full animate-spin" />
                         </div>
                         <p className="text-[11px] font-black uppercase tracking-[0.2em] mb-2 text-indigo-400">极速渲染中</p>
                         <p className="text-[9px] font-medium opacity-40 leading-relaxed italic">
                           {isTransitionShot && hasNextPreview ? "正在与下一分镜对齐转场路径..." : "正在模拟电影级光影流动"}
                         </p>
                      </div>
                    )}

                    <div className="absolute top-6 left-6 flex flex-col gap-2 z-10 pointer-events-none">
                      <div className="flex items-center gap-2">
                         <span className="px-3 py-1 bg-black/80 text-white text-[9px] font-black rounded-full uppercase backdrop-blur-xl border border-white/10 shadow-lg">SHOT 0{i + 1}</span>
                         <span className="px-3 py-1 bg-indigo-600/90 text-white text-[9px] font-black rounded-full uppercase shadow-lg shadow-indigo-500/20">{shot.stage}</span>
                         {shot.videoUrl && (
                           <span className="px-3 py-1 bg-emerald-500/90 text-white text-[9px] font-black rounded-full uppercase shadow-lg shadow-emerald-500/20">
                             {`时长 ${formatDuration(shotVideoDurations[i])}`}
                           </span>
                         )}
                      </div>
                    </div>
                  </div>

                  {/* Creative Control Section */}
                  <div className="flex-1 py-8 md:py-4 flex flex-col min-w-0">
                    <div className="flex-1 space-y-8">
                      <div className="space-y-4">
                        <div className="flex justify-between items-center px-1">
                          <div className="flex items-center gap-2">
                             <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block">分镜导演描述</label>
                             <button 
                                onClick={() => handleExpandDescription(i)}
                                disabled={loadingExpansions.has(i)}
                                className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[9px] font-black rounded-full border border-indigo-100 hover:bg-indigo-100 transition-all flex items-center gap-1 disabled:opacity-50"
                             >
                               {loadingExpansions.has(i) ? (
                                 <span className="animate-spin h-2.5 w-2.5 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full" />
                               ) : (
                                 <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11l-7-7-7 7m14 6l-7-7-7 7" /></svg>
                               )}
                               AI 扩写
                             </button>
                          </div>
                          <div className="flex items-center gap-3">
                            {isTransitionShot && (
                              <div className="flex items-center gap-2 text-[9px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 shadow-sm">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                                智能转场已就绪
                              </div>
                            )}
                            <button 
                              onClick={() => handleRegenerateDescription(i)}
                              disabled={loadingDescriptions.has(i)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all active:rotate-180 duration-500 disabled:opacity-50"
                              title="重新生成描述"
                            >
                              {loadingDescriptions.has(i) ? (
                                <span className="animate-spin h-3.5 w-3.5 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full block" />
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                              )}
                            </button>
                          </div>
                        </div>
                        <div className="relative group/text">
                          <textarea 
                            className="w-full text-[13px] text-slate-700 font-semibold bg-white border border-slate-200 rounded-3xl p-5 focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/30 resize-none outline-none leading-relaxed h-32 lg:h-28 transition-all shadow-sm group-hover/text:shadow-md"
                            value={shot.description} 
                            onChange={(e) => handleTextChange(i, 'description', e.target.value)} 
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">参考字幕文案</label>
                          <div className="w-full text-[11px] font-bold text-slate-500 bg-slate-50 border border-slate-100 rounded-2xl p-4 outline-none truncate italic shadow-inner">
                            "{shot.overlayText}"
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">电影运镜</label>
                          <div className="px-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-black text-slate-600 flex items-center gap-3 shadow-inner">
                            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                            {shot.cameraMovement}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-indigo-500 uppercase tracking-widest block px-1">视频时长</label>
                          <div className="px-3 py-3 bg-slate-50 border border-slate-100 rounded-2xl shadow-inner space-y-2">
                            <div className="flex items-center justify-between text-[10px] font-black text-slate-600">
                              <span>{shotDurationSeconds}s</span>
                              <span>{shotVideoCost}积分</span>
                            </div>
                            {selectedVideoEngine === 'grokv3' ? (
                              <div className="w-full py-2 text-center text-[10px] font-black rounded-lg border border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed">
                                固定 10s
                              </div>
                            ) : selectedVideoEngine === 'jimeng' ? (
                              <input
                                type="range"
                                min={5}
                                max={10}
                                step={5}
                                value={shotDurationSeconds}
                                onChange={(e) => handleTextChange(i, 'duration', `${e.target.value}s`)}
                                className="w-full accent-indigo-600"
                              />
                            ) : selectedVideoEngine === 'veo31' ? (
                              <div className="grid grid-cols-2 gap-2">
                                {VEO_DURATION_OPTIONS.map((seconds) => (
                                  <button
                                    key={seconds}
                                    type="button"
                                    onClick={() => handleTextChange(i, 'duration', `${seconds}s`)}
                                    className={`py-1.5 text-[10px] font-black rounded-lg border transition-all ${shotDurationSeconds === seconds ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                                  >
                                    {seconds}s
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <input
                                type="range"
                                min={4}
                                max={15}
                                step={1}
                                value={shotDurationSeconds}
                                onChange={(e) => handleTextChange(i, 'duration', `${e.target.value}s`)}
                                className="w-full accent-indigo-600"
                              />
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        {shot.previewUrl && (
                          <button 
                            onClick={() => handleDownloadImage(shot.previewUrl!, i)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-600 rounded-2xl text-[10px] font-black transition-all border border-slate-200 shadow-sm active:scale-95"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            下载分镜原画
                          </button>
                        )}
                        {shot.videoUrl && (
                          <button 
                            onClick={() => handleDownloadVideo(shot.videoUrl!, i)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-2xl text-[10px] font-black transition-all border border-indigo-100 shadow-sm active:scale-95"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            下载视频素材
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="pt-8 flex gap-3 mt-auto">
                      <button 
                        onClick={() => generateSingleShotImage(i)}
                        disabled={isLoadingImg || isLoadingVid}
                        className="flex-1 py-4 px-4 border border-slate-200 rounded-2xl text-[10px] font-black text-slate-500 hover:bg-slate-50 transition-all disabled:opacity-50 active:scale-95"
                      >
                        {`重新绘制构图（${IMAGE_GEN_COST_POINTS}积分）`}
                      </button>
                      <div className="flex-[2] space-y-2">
                        {shotTaskIds[i] && (
                          <p className="text-[10px] font-black text-indigo-600 leading-relaxed px-1">
                            请记下这个任务ID，可使用这个ID在上方查询进度和下载视频。
                          </p>
                        )}
                        <div className="px-3 py-2 bg-indigo-50/70 border border-indigo-100 rounded-xl text-[10px] font-bold text-indigo-700 break-all">
                          任务ID：{shotTaskIds[i] || '-'}
                        </div>
                        <button 
                          onClick={() => handleGenerateShotVideo(i)}
                          disabled={!shot.previewUrl || isLoadingImg || isLoadingVid}
                          className={`w-full py-4 px-6 rounded-2xl text-[10px] font-black transition-all flex items-center justify-center gap-3 shadow-xl ${
                            !shot.previewUrl || isLoadingImg || isLoadingVid
                            ? 'bg-slate-100 text-slate-300 shadow-none'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-200 active:scale-95'
                          }`}
                        >
                          {isLoadingVid ? (
                            <span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                          ) : (
                            `${shot.videoUrl ? "重新渲染分镜" : (isTransitionShot && hasNextPreview ? "渲染转场视频" : "渲染全屏视频")}（${shotVideoCost}积分）`
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  return <WorkbenchLayout sidebar={Sidebar} content={MainContent} />;
};

export default App;
