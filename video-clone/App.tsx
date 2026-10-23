
import React, { useEffect, useRef, useState } from 'react';
import { Download, Image, LoaderCircle, Mic, Monitor, RefreshCw, Smartphone, Sparkles, Video } from 'lucide-react';
import { AppState, AdPlan, Shot, type FaceSelectionPoint } from './types';
import { analyzeProduct, generateVideo, generateShotImage, regenerateShotDescription, expandShotDescriptionAI, queryVideoTaskProgress, type VideoEngine } from './services/geminiService';
import { videoCloneBffService } from './services/videoCloneBffService';
import { WorkbenchLayout } from './components/WorkbenchLayout';
import JSZip from 'jszip';
import { AppProps } from '../../types';
import { createPresignedCOSUpload, uploadAssetToCOSWithPresignedURL } from '../../shared_services/geminiProxyService';
import { createTaskQueueItem, recordTaskManagerObject } from '../../services/taskManagerService';

const PILOT_APP_ID = 'video-clone';
const PILOT_APP_NAME = '视频复刻';
const IMAGE_GEN_COST_POINTS = 10;
const CLONE_FRAME_COUNT = 1;
const CLONE_FRAME_COST_PER_IMAGE = 8;
const SEEDANCE_VIDEO_GEN_COST_PER_SECOND = 24;
const KLING_DURATION_OPTIONS = [4, 5, 10] as const;
const VEO_DURATION_OPTIONS = [4, 8] as const;
const KLING_720P_VIDEO_COST_PER_SECOND = 12;
const KLING_1080P_VIDEO_COST_PER_SECOND = 16;
const AUDIO_GEN_COST_PER_RUN = 10;
const DEFAULT_VIDEO_DURATION_SECONDS = 4;
const AUTO_POLL_INTERVAL_MS = 3000;
const DEFAULT_REFERENCE_VIDEO_URL = 'https://unityshop-public-1342713514.cos.ap-guangzhou.myqcloud.com/unityshop_samples/video_clone/%E9%A3%9E%E4%B9%A620260827-115528.mp4';
const DEFAULT_REFERENCE_IMAGE_URL = 'https://unityshop-public-1342713514.cos.ap-guangzhou.myqcloud.com/unityshop_samples/video_clone/20260827-115600.jpg';
const DEFAULT_CLONE_FINAL_PROMPT = '请将视频中的人物形象替换成图片中的人物形象，包括五官、脸型、发型、肤色、体型、气质与装束；参考视频只用于动作、表演、走位、镜头语言、运镜、构图与节奏，不作为人物身份参考。最终结果须严格符合图片中的人物形象。';
const VIDEO_MODEL_BY_ENGINE: Record<VideoEngine, string> = {
  seedance2: 'doubao-seedance-2-0-fast-260128',
  kling: 'kling-3.0',
};

type SidebarTab = 'selling_video' | 'storyboard';

type TaskQueueStatus = 'queued' | 'running' | 'finished' | 'failed';
type UploadedAssetInfo = {
  url: string;
  mimeType: string;
  sizeBytes: number;
  fileName: string;
};

type AssetUrlCandidate = {
  url?: string;
  signed_url?: string;
  public_url?: string;
};

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

function isRemoteHttpUrl(assetUrl: string): boolean {
  return /^https?:\/\//i.test(String(assetUrl || '').trim());
}

function resolveUploadedAssetUrl(upload: AssetUrlCandidate | null | undefined): string {
  return String(upload?.url || '').trim()
    || String(upload?.signed_url || '').trim()
    || String(upload?.public_url || '').trim();
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
    const detectionTimeSec = Math.min(Math.max(video.duration / 2, 0), 1);
    if (detectionTimeSec > 0.01) {
      video.currentTime = detectionTimeSec;
      await new Promise<void>((resolve) => { video.onseeked = () => resolve(); });
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 360;
    const context = canvas.getContext('2d');
    if (!context) return { hasFace: true, selection: FALLBACK_FACE_SELECTION, headSelectionPoints: createHeadSelectionPoints(FALLBACK_FACE_SELECTION), reliable: false };
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const faces = await new FaceDetectorCtor({ fastMode: true, maxDetectedFaces: 5 }).detect(canvas);
    if (!Array.isArray(faces) || faces.length === 0) {
      return { hasFace: false, selection: null, headSelectionPoints: [], reliable: true };
    }

    const face = faces
      .map((item: any) => item?.boundingBox)
      .filter(Boolean)
      .sort((a: any, b: any) => (Number(b.width) * Number(b.height)) - (Number(a.width) * Number(a.height)))[0];
    if (!face) return { hasFace: true, selection: FALLBACK_FACE_SELECTION, headSelectionPoints: createHeadSelectionPoints(FALLBACK_FACE_SELECTION), reliable: false };

    const x = Math.min(1, Math.max(0, (Number(face.x ?? face.left ?? 0) + Number(face.width ?? 0) / 2) / canvas.width));
    const y = Math.min(1, Math.max(0, (Number(face.y ?? face.top ?? 0) + Number(face.height ?? 0) / 2) / canvas.height));
    const selection = {
      x: Number.isFinite(x) ? x : FALLBACK_FACE_SELECTION.x,
      y: Number.isFinite(y) ? y : FALLBACK_FACE_SELECTION.y,
      timeSec: detectionTimeSec,
    };
    return {
      hasFace: true,
      selection,
      headSelectionPoints: createHeadSelectionPoints(
        selection,
        Number(face.width || 0) / canvas.width,
        Number(face.height || 0) / canvas.height,
      ),
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

function getFileExtension(fileName: string): string {
  const matched = String(fileName || '').toLowerCase().match(/(\.[a-z0-9]+)$/);
  return matched?.[1] || '';
}

function isCombinedCloneJobId(taskId: string): boolean {
  return String(taskId || '').startsWith('video_clone_');
}

function validateReferenceVideoInspection(input: {
  fileName: string;
  sizeBytes: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  pixelArea: number | null;
  aspectRatio: number | null;
}): string | null {
  const extension = getFileExtension(input.fileName);
  if (extension !== '.mp4' && extension !== '.mov') {
    return '请上传 `.mp4` 或 `.mov` 格式的参考视频。';
  }
  if (input.sizeBytes > 200 * 1024 * 1024) {
    return '参考视频文件大小需小于 200MB。';
  }

  const duration = Number(input.durationSeconds);
  if (!Number.isFinite(duration) || duration < 3 || duration > 15) {
    return '参考视频时长需在 3 到 15 秒之间。';
  }

  const width = Number(input.width);
  const height = Number(input.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return '无法读取参考视频的宽高信息。';
  }
  if (width < 700 || width > 4553 || height < 700 || height > 4553) {
    return '视频宽高尺寸需介于700px（含）和4553px（含）之间。';
  }

  const pixelArea = Number(input.pixelArea);
  if (Number.isFinite(pixelArea) && pixelArea > 8294400) {
    return '视频像素总面积不能超过 8294400。';
  }

  const aspectRatio = Number(input.aspectRatio);
  if (!Number.isFinite(aspectRatio) || aspectRatio < 0.4 || aspectRatio > 2) {
    return '视频的宽高比需在 0.4 ~ 2 之间。';
  }

  const fps = Number(input.fps);
  if (!Number.isFinite(fps) || fps < 24 || fps > 60) {
    return '参考视频帧率需在 24fps 到 60fps 之间。';
  }

  return null;
}

function normalizeTaskQueueStatus(status: string, videoUrl?: string | null): TaskQueueStatus {
  if (String(videoUrl || '').trim()) {
    return 'finished';
  }

  switch (String(status || '').trim().toLowerCase()) {
    case 'finished':
    case 'succeeded':
    case 'succeed':
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
    case 'submitted':
    case 'submit':
      return 'queued';
    default:
      return 'running';
  }
}

function formatRatioValue(value: number | null | undefined): string {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) {
    return '--';
  }
  const rounded = Number(value);
  return rounded >= 1 ? `${rounded.toFixed(2)}:1` : `1:${(1 / rounded).toFixed(2)}`;
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
  const [selectedVideoEngine] = useState<VideoEngine>('kling');
  const [seedanceDebugNotice, setSeedanceDebugNotice] = useState<string | null>(null);
  const [generatedFrameUrls, setGeneratedFrameUrls] = useState<string[]>([]);
  const [isGeneratingFrames, setIsGeneratingFrames] = useState(false);
  const [directVideoGeneration, setDirectVideoGeneration] = useState(false);

  const [state, setState] = useState<AppState & { customSellingPoints: string; clonePrompt: string }>({
    image: null,
    referenceVideo: null,
    referenceVideoDurationSec: null,
    referenceVideoHasFace: false,
    plan: null,
    videoUrl: null,
    isAnalyzing: false,
    isGeneratingImages: false,
    isGeneratingVideo: false,
    error: null,
    aspectRatio: '9:16',
    editedPrompt: '',
    customSellingPoints: '',
    clonePrompt: '',
    shotCount: 4,
  });
  const uploadedReferenceVideoRef = useRef<UploadedAssetInfo | null>(null);
  const uploadedVoiceSampleRef = useRef<UploadedAssetInfo | null>(null);
  const autoPollTimerRef = useRef<number | null>(null);
  const referenceVideoPlayerRef = useRef<HTMLVideoElement | null>(null);
  const resultVideoPlayerRef = useRef<HTMLVideoElement | null>(null);
  const isSyncingVideoPlaybackRef = useRef(false);

  const parseShotDurationSeconds = (durationText?: string): number => {
    const matched = String(durationText || '').match(/(\d+)/);
    const parsed = matched ? Number(matched[1]) : Number.NaN;
    const raw = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_VIDEO_DURATION_SECONDS;
    if (selectedVideoEngine === 'kling') {
      return Math.min(15, Math.max(4, Math.round(raw)));
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

  const resolveVideoBillingTask = (videoSeconds?: number, hasReferenceVideo?: boolean): string => {
    const seconds = Number(videoSeconds ?? DEFAULT_VIDEO_DURATION_SECONDS);
    const effectiveSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_VIDEO_DURATION_SECONDS;
    if (selectedVideoEngine === 'kling') {
      return outputResolution === '720p' ? 'kling_720p_video_per_second' : 'kling_1080p_video_per_second';
    }

    const normalizedDuration = Math.min(15, Math.max(4, Math.round(effectiveSeconds)));
    return `seedance_video_${normalizedDuration}s`;
  };

  const resolveAudioGenerationCost = (): number => {
    const configuredCost = Number(activeCosts.audio_gen);
    if (Number.isFinite(configuredCost) && configuredCost >= 0) {
      return configuredCost;
    }
    return AUDIO_GEN_COST_PER_RUN;
  };

  const resolveKlingPerSecondCost = (): number => {
    const billingTask = resolveVideoBillingTask();
    const configuredCost = Number(activeCosts[billingTask]);
    if (Number.isFinite(configuredCost) && configuredCost > 0) {
      return configuredCost;
    }
    return outputResolution === '720p' ? KLING_720P_VIDEO_COST_PER_SECOND : KLING_1080P_VIDEO_COST_PER_SECOND;
  };

  const resolveActionCost = (actionType: string, videoSeconds?: number, hasReferenceVideo?: boolean): number => {
    if (actionType === 'CLONE_FRAMES') {
      return CLONE_FRAME_COUNT * CLONE_FRAME_COST_PER_IMAGE;
    }
    if (actionType === 'SHOT_IMAGE') {
      const configuredCost = Number(activeCosts.shot_image);
      if (Number.isFinite(configuredCost) && configuredCost > 0) {
        return configuredCost;
      }
      return IMAGE_GEN_COST_POINTS;
    }
    if (actionType === 'SHOT_VIDEO' || actionType === 'FULL_VIDEO') {
      const billingTask = resolveVideoBillingTask(videoSeconds, hasReferenceVideo);
      const seconds = Number(videoSeconds ?? DEFAULT_VIDEO_DURATION_SECONDS);
      const effectiveSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_VIDEO_DURATION_SECONDS;
      if (selectedVideoEngine === 'kling') {
        const normalizedDuration = Math.min(15, Math.max(actionType === 'FULL_VIDEO' ? 3 : 4, Math.round(effectiveSeconds)));
        const videoCost = normalizedDuration * resolveKlingPerSecondCost();
        if (actionType === 'FULL_VIDEO' && hasReferenceVideo) {
          return videoCost + resolveAudioGenerationCost();
        }
        return videoCost;
      }
      const configuredCost = Number(activeCosts[billingTask]);
      if (Number.isFinite(configuredCost) && configuredCost > 0) {
        return configuredCost;
      }
      return Math.round(effectiveSeconds) * SEEDANCE_VIDEO_GEN_COST_PER_SECOND;
    }
    if (actionType === 'PLAN_ANALYSIS') {
      return Number(activeCosts.plan_analysis ?? 0);
    }
    return Number(activeCosts[actionType] ?? 0);
  };

  const resolveBillingTask = (actionType: string, videoSeconds?: number, hasReferenceVideo?: boolean): string => {
    if (actionType === 'PLAN_ANALYSIS') {
      return 'plan_analysis';
    }
    if (actionType === 'CLONE_FRAMES') {
      return 'clone_frames';
    }
    if (actionType === 'SHOT_IMAGE') {
      return 'shot_image';
    }

    return resolveVideoBillingTask(videoSeconds, hasReferenceVideo);
  };

  const ensureActionAllowed = (actionType: string, options?: { videoSeconds?: number; hasReferenceVideo?: boolean }): boolean => {
    const amount = resolveActionCost(actionType, options?.videoSeconds, options?.hasReferenceVideo);
    if (!Number.isFinite(amount) || amount <= 0) {
      return true;
    }

    if (!activePlatform.checkBalance(amount)) {
      setState(prev => ({ ...prev, error: `积分不足，需要 ${amount} 积分。` }));
      return false;
    }
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
  const [finalVideoDurationSec, setFinalVideoDurationSec] = useState<number | null>(null);
  const [dubbingTargetLanguage, setDubbingTargetLanguage] = useState<string>('original');
  const [isGeneratingDubbing] = useState(false);
  const [dubbingStage] = useState<string>('');
  const [dubbingError] = useState<string | null>(null);
  const [dubbedVideoUrl] = useState<string | null>(null);
  const [referenceVideoAspectRatio, setReferenceVideoAspectRatio] = useState<number | null>(null);
  const [referenceImageAspectRatio, setReferenceImageAspectRatio] = useState<number | null>(null);
  const [resultVideoAspectRatio, setResultVideoAspectRatio] = useState<number | null>(null);
  const [shotVideoDurations, setShotVideoDurations] = useState<Record<number, number>>({});
  const [shotTaskIds, setShotTaskIds] = useState<Record<number, string>>({});
  const [activeSidebarTab] = useState<SidebarTab>('selling_video');
  const [directVideoDurationSec, setDirectVideoDurationSec] = useState<number>(DEFAULT_VIDEO_DURATION_SECONDS);
  const [outputResolution, setOutputResolution] = useState<'720p' | '1080p'>('1080p');
  const [voiceSampleName, setVoiceSampleName] = useState<string>('');
  const [isUploadingReferenceVideo, setIsUploadingReferenceVideo] = useState(false);
  const [referenceUploadDots, setReferenceUploadDots] = useState(1);
  const isKlingEngine = selectedVideoEngine === 'kling';
  const effectiveDirectVideoDurationSec = directVideoDurationSec;
  // Reference video is enabled for both seedance2 and kling. For kling, a
  // reference video triggers the multi-elements face-swap flow (kling-v1-6).
  const isReferenceVideoDisabled = false;
  const outputSpecOptions: Array<{ value: '9:16' | '16:9'; label: string }> = [
    { value: '9:16', label: '竖屏 9:16' },
    { value: '16:9', label: '横屏 16:9' },
  ];
  const resolutionOptions: Array<{ value: '720p' | '1080p'; label: string }> = [
    { value: '720p', label: '720p' },
    { value: '1080p', label: '1080p' },
  ];

  const reportTaskQueuePersistenceFailure = (contextLabel: string, error: unknown) => {
    console.error(`[${PILOT_APP_ID}] ${contextLabel} task persistence failed`, error);
    setProviderNotice(`${contextLabel}已完成，但写入任务面板失败。`);
  };

  const clearCloneGenerationArtifacts = () => {
    clearAutoPollTimer();
    setGeneratedFrameUrls([]);
    setLatestTaskId('');
    setQueryTaskId('');
    setQueryTaskStatus('');
    setFinalVideoDurationSec(null);
  };

  const clearAutoPollTimer = () => {
    if (autoPollTimerRef.current !== null) {
      window.clearTimeout(autoPollTimerRef.current);
      autoPollTimerRef.current = null;
    }
  };

  const scheduleAutoPoll = (taskId: string) => {
    clearAutoPollTimer();
    if (!isAutoPollingEnabled || state.videoUrl) {
      return;
    }
    const trimmedTaskId = String(taskId || '').trim();
    if (!trimmedTaskId) {
      return;
    }
    autoPollTimerRef.current = window.setTimeout(() => {
      void fetchTaskProgress(trimmedTaskId, { showLoading: false, showNotice: false });
    }, AUTO_POLL_INTERVAL_MS);
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
      videoDeploymentKey?: 'motion_control' | 'omni' | 'kling_3' | 'turbo';
      videoDeploymentName?: string;
      shotIndex?: number;
      stage?: string;
      previewUrl?: string;
      taskPayload?: Record<string, unknown>;
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
        video_deployment_key: options.videoDeploymentKey,
        video_deployment_name: options.videoDeploymentName,
        shot_index: options.shotIndex,
        stage: options.stage,
        preview_url: options.previewUrl,
        ...(options.taskPayload || {}),
      },
    });
  };

  useEffect(() => {
    if (!isReferenceVideoDisabled || !state.referenceVideo) {
      return;
    }
    setState((prev) => ({ ...prev, referenceVideo: null }));
  }, [isReferenceVideoDisabled, state.referenceVideo]);

  useEffect(() => {
    setState((prev) => {
      if (prev.referenceVideo || prev.videoUrl || prev.image) {
        return prev;
      }
      return {
        ...prev,
        image: DEFAULT_REFERENCE_IMAGE_URL,
        referenceVideo: DEFAULT_REFERENCE_VIDEO_URL,
        referenceVideoHasFace: true,
        videoUrl: null,
      };
    });
  }, []);

  useEffect(() => {
    if (!isKlingEngine || !state.referenceVideo) return;
    const referenceDuration = Number(state.referenceVideoDurationSec);
    if (!Number.isFinite(referenceDuration) || directVideoDurationSec <= referenceDuration) return;
    setDirectVideoDurationSec(Math.max(3, Math.min(15, Number(referenceDuration.toFixed(2)))));
  }, [directVideoDurationSec, isKlingEngine, state.referenceVideo, state.referenceVideoDurationSec]);

  useEffect(() => {
    if (!state.referenceVideo || !state.videoUrl) {
      return;
    }
    const timer = window.setTimeout(() => {
      ensureVideosStaySynchronized();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [state.referenceVideo, state.videoUrl]);

  useEffect(() => {
    if (!isUploadingReferenceVideo) {
      setReferenceUploadDots(1);
      return;
    }
    const timer = window.setInterval(() => {
      setReferenceUploadDots((dots) => (dots >= 3 ? 1 : dots + 1));
    }, 400);
    return () => window.clearInterval(timer);
  }, [isUploadingReferenceVideo]);

  useEffect(() => {
    // When embedded in the main-site app shell iframe (same origin), reflect
    // this app's tab title onto the host page so the browser tab shows it.
    if (window.parent === window) {
      return;
    }
    try {
      window.parent.document.title = document.title;
    } catch {
      // Cross-origin parent: ignore.
    }
  }, []);

  const isTerminalTaskStatus = (status: string): boolean => {
    const normalized = String(status || '').trim().toLowerCase();
    return normalized === 'succeeded' || normalized === 'succeed' || normalized === 'success' || normalized === 'completed' || normalized === 'failed' || normalized === 'error' || normalized === 'cancelled' || normalized === 'canceled' || normalized === 'expired';
  };

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

  const isKlingWorkerLeaseExpired = (message: string): boolean => {
    const normalized = String(message || '').toLowerCase();
    return normalized.includes('worker lease expired') || normalized.includes('max attempts reached');
  };

  const toFriendlyVideoErrorMessage = (message: string, fallbackMessage: string): string => {
    if (isKlingWorkerLeaseExpired(message)) {
      return 'Kling 服务当前执行异常，请稍后重试。若多次重试仍失败，说明上游视频生成服务暂时不可用。';
    }
    return fallbackMessage;
  };

  const extractTaskIdFromMessage = (message: string): string => {
    const match = message.match(/task_id=([a-zA-Z0-9_-]+)/);
    return match?.[1]?.trim() || '';
  };

  const handleVideoGenerationError = (message: string, fallbackMessage: string) => {
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

    setState(p => ({ ...p, error: toFriendlyVideoErrorMessage(message, fallbackMessage) }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        clearCloneGenerationArtifacts();
        setProviderNotice(null);
        setFinalVideoDurationSec(null);
        setShotVideoDurations({});
        setShotTaskIds({});
        setState(p => ({ ...p, image: reader.result as string, plan: null, videoUrl: null, error: null }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isReferenceVideoDisabled) {
      setProviderNotice('当前引擎暂不支持参考视频。');
      return;
    }
    const file = e.target.files?.[0];
    if (file) {
      const extension = getFileExtension(file.name);
      if (extension !== '.mp4' && extension !== '.mov') {
        setState(p => ({ ...p, error: '请上传 `.mp4` 或 `.mov` 格式的参考视频。' }));
        e.target.value = '';
        return;
      }
      if (file.size > 200 * 1024 * 1024) {
        setState(p => ({ ...p, error: '参考视频文件大小需小于 200MB。' }));
        return;
      }

      uploadedReferenceVideoRef.current = null;
      setIsUploadingReferenceVideo(true);
      setProviderNotice('正在上传并校验参考视频...');
      setState(p => ({ ...p, error: null }));

      try {
        clearCloneGenerationArtifacts();
        const uploadedReference = await uploadAssetToCOSWithPresignedURL(file, {
          fileName: file.name || `reference-video-${Date.now()}${extension || '.mp4'}`,
          objectPath: `standalone/${PILOT_APP_ID}/reference_videos`,
          appID: PILOT_APP_ID,
          camAppID: PILOT_APP_ID,
        });

        const uploadedReferenceUrl =
          String(uploadedReference.url || '').trim()
          || String(uploadedReference.signed_url || '').trim()
          || String(uploadedReference.public_url || '').trim();
        if (!uploadedReferenceUrl) {
          throw new Error('参考视频上传后未返回可访问地址。');
        }

        const [faceDetection, durationSec, inspection] = await Promise.all([
          detectFaceInVideo(file),
          readVideoDuration(file),
          videoCloneBffService.inspectReferenceVideo(uploadedReferenceUrl),
        ]);

        const validationError = validateReferenceVideoInspection({
          fileName: file.name,
          sizeBytes: file.size,
          durationSeconds: inspection.durationSeconds ?? durationSec,
          width: inspection.width,
          height: inspection.height,
          fps: inspection.fps,
          pixelArea: inspection.pixelArea,
          aspectRatio: inspection.aspectRatio,
        });
        if (validationError) {
          setState(p => ({ ...p, error: validationError }));
          uploadedReferenceVideoRef.current = null;
          setProviderNotice(null);
          e.target.value = '';
          return;
        }

        uploadedReferenceVideoRef.current = {
          url: uploadedReferenceUrl,
          mimeType: file.type || (extension === '.mov' ? 'video/quicktime' : 'video/mp4'),
          sizeBytes: file.size,
          fileName: file.name || `reference${extension || '.mp4'}`,
        };

        const inspectedDuration = Number(inspection.durationSeconds ?? durationSec ?? DEFAULT_VIDEO_DURATION_SECONDS);
        const suggestedDuration = Math.max(3, Math.min(15, Number(inspectedDuration.toFixed(2))));
        setDirectVideoDurationSec(suggestedDuration);
        setProviderNotice(faceDetection.hasFace
          ? (faceDetection.reliable ? '参考视频校验通过，已自动识别人物头部。' : '参考视频校验通过，已按默认策略处理人物头部。')
          : '参考视频校验通过，但未识别到清晰的人物头部。');
        setFinalVideoDurationSec(null);
        setShotVideoDurations({});
        setShotTaskIds({});
        setState(p => ({
          ...p,
          // Keep preview and submission on the same uploaded asset URL.
          referenceVideo: uploadedReferenceUrl,
          referenceVideoDurationSec: inspection.durationSeconds ?? durationSec,
          referenceVideoHasFace: faceDetection.hasFace,
          plan: null,
          videoUrl: null,
          error: null,
        }));
      } catch (error) {
        uploadedReferenceVideoRef.current = null;
        setProviderNotice(null);
        setState(p => ({
          ...p,
          error: error instanceof Error ? error.message : '参考视频校验失败。',
        }));
        e.target.value = '';
      } finally {
        setIsUploadingReferenceVideo(false);
      }
    }
  };

  const handleVoiceSampleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    const extension = getFileExtension(file.name);
    const allowedExtensions = new Set(['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.webm']);
    if (!allowedExtensions.has(extension)) {
      setState(p => ({ ...p, error: '请上传 mp3、wav、m4a、aac、flac、ogg 或 webm 格式的音色样本。' }));
      e.target.value = '';
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setState(p => ({ ...p, error: '音色样本文件大小需小于 25MB。' }));
      e.target.value = '';
      return;
    }

    uploadedVoiceSampleRef.current = null;
    setProviderNotice('正在上传音色样本...');
    setState(p => ({ ...p, error: null }));

    try {
      const uploadedSample = await uploadAssetToCOSWithPresignedURL(file, {
        fileName: file.name || ('voice-sample-' + Date.now() + (extension || '.mp3')),
        objectPath: 'standalone/' + PILOT_APP_ID + '/voice_samples',
        appID: PILOT_APP_ID,
        camAppID: PILOT_APP_ID,
        contentType: file.type || 'audio/mpeg',
      });

      const uploadedSampleUrl =
        String(uploadedSample.url || '').trim()
        || String(uploadedSample.signed_url || '').trim()
        || String(uploadedSample.public_url || '').trim();
      if (!uploadedSampleUrl) {
        throw new Error('音色样本上传后未返回可访问地址。');
      }

      uploadedVoiceSampleRef.current = {
        url: uploadedSampleUrl,
        mimeType: file.type || 'audio/mpeg',
        sizeBytes: file.size,
        fileName: file.name || ('voice-sample' + (extension || '.mp3')),
      };
      setVoiceSampleName(file.name || '已上传音色样本');
      setProviderNotice('音色样本上传完成。');
    } catch (error) {
      uploadedVoiceSampleRef.current = null;
      setVoiceSampleName('');
      setProviderNotice(null);
      setState(p => ({
        ...p,
        error: error instanceof Error ? error.message : '音色样本上传失败。',
      }));
      e.target.value = '';
    }
  };

  const handleGenerateCloneFrames = async () => {
    if (isKlingEngine) {
      if (!state.image) {
        setProviderNotice('请先上传包含完整人脸和发型的目标图片。');
        return;
      }
      if (state.referenceVideo && !state.referenceVideoHasFace) {
        setProviderNotice('参考视频中未检测到人物头部，无法替换人脸和发型。');
        return;
      }
    }
    if (!state.image || !state.referenceVideo) {
      setProviderNotice('请先上传目标图片和参考视频。');
      return;
    }

    if (!ensureActionAllowed('CLONE_FRAMES')) return;

    setProviderNotice('正在提取关键帧并替换人物...');
    clearCloneGenerationArtifacts();
    setIsGeneratingFrames(true);
    setState((prev) => ({ ...prev, videoUrl: null, error: null }));

    try {
      const seedreamPrompt = String(state.clonePrompt || '').trim() || undefined;
      const imageUpload = isRemoteHttpUrl(state.image)
        ? { url: String(state.image).trim() }
        : await uploadAssetToCOSWithPresignedURL(await assetUrlToBlob(state.image), {
          fileName: `target-face-${Date.now()}.png`,
          objectPath: `standalone/${PILOT_APP_ID}/target_images`,
          appID: PILOT_APP_ID,
          camAppID: PILOT_APP_ID,
        });

      if (!uploadedReferenceVideoRef.current?.url && !isRemoteHttpUrl(state.referenceVideo)) {
        throw new Error('参考视频上传状态异常，请重新上传参考视频后再试。');
      }

      const referenceVideoUpload = uploadedReferenceVideoRef.current?.url
        ? { url: uploadedReferenceVideoRef.current.url }
        : isRemoteHttpUrl(state.referenceVideo)
          ? { url: String(state.referenceVideo).trim() }
          : await uploadAssetToCOSWithPresignedURL(await assetUrlToBlob(state.referenceVideo), {
            fileName: `reference-source-${Date.now()}.mp4`,
            objectPath: `standalone/${PILOT_APP_ID}/reference_source_videos`,
            appID: PILOT_APP_ID,
            camAppID: PILOT_APP_ID,
          });

      const imageUrl = resolveUploadedAssetUrl(imageUpload);
      const referenceVideoUrl = resolveUploadedAssetUrl(referenceVideoUpload);
      if (!imageUrl || !referenceVideoUrl) {
        throw new Error('生成素材上传后未返回可访问地址。');
      }

      const generation = await videoCloneBffService.generateCloneFrames({
        imageUrl,
        referenceVideoUrl,
        durationSeconds: effectiveDirectVideoDurationSec,
        seedreamPrompt,
      });
      const nextFrameUrls = Array.isArray(generation.frameUrls) ? generation.frameUrls.filter(Boolean) : [];
      if (!nextFrameUrls.length) {
        throw new Error('截取帧生成失败，未返回可用图片。');
      }

      setGeneratedFrameUrls(nextFrameUrls);
      void activePlatform.refreshCredits?.();
      setProviderNotice(`已生成 ${nextFrameUrls.length} 张截取帧，可继续生成完整视频。`);
    } catch (err: any) {
      const errMessage = String(err?.message || '未知错误');
      setState((prev) => ({ ...prev, error: `截取帧生成失败: ${errMessage}` }));
      setProviderNotice(null);
    } finally {
      setIsGeneratingFrames(false);
    }
  };

  const handleDirectGenerateVideo = async () => {
    if (isKlingEngine) {
      if (!state.image) {
        setProviderNotice('请先上传包含完整人脸和发型的目标图片。');
        return;
      }
      if (state.referenceVideo && !state.referenceVideoHasFace) {
        setProviderNotice('参考视频中未检测到人物头部，无法替换人脸和发型。');
        return;
      }
    }
    if (!state.image && !state.referenceVideo) return;
    if (!directVideoGeneration && generatedFrameUrls.length === 0) {
      setProviderNotice('请先生成截取帧。');
      return;
    }

    const voiceSampleAsset = uploadedVoiceSampleRef.current;

    const hasReferenceVideo = Boolean(state.referenceVideo);
    if (!ensureActionAllowed('FULL_VIDEO', { videoSeconds: effectiveDirectVideoDurationSec, hasReferenceVideo })) return;

    setProviderNotice(null);
    setFinalVideoDurationSec(null);
    setState(p => ({ ...p, isGeneratingVideo: true, error: null }));
    try {
      if (!state.image || !state.referenceVideo) {
        throw new Error('请先上传目标图片和参考视频。');
      }

      const prompt = DEFAULT_CLONE_FINAL_PROMPT;

      const selectedDuration = effectiveDirectVideoDurationSec;
      const needsServerTrim = Number(state.referenceVideoDurationSec) > selectedDuration + 0.25;
      setProviderNotice(
        needsServerTrim
          ? `正在准备原始参考视频，服务器会裁剪为 ${formatDuration(selectedDuration)}...`
          : '正在准备生成所需素材...',
      );
      const imageUploadPromise = isRemoteHttpUrl(state.image)
        ? Promise.resolve({ url: String(state.image).trim() })
        : uploadAssetToCOSWithPresignedURL(await assetUrlToBlob(state.image), {
          fileName: `target-face-${Date.now()}.png`,
          objectPath: `standalone/${PILOT_APP_ID}/target_images`,
          appID: PILOT_APP_ID,
          camAppID: PILOT_APP_ID,
        });
      if (!uploadedReferenceVideoRef.current?.url && !isRemoteHttpUrl(state.referenceVideo)) {
        throw new Error('参考视频上传状态异常，请重新上传参考视频后再试。');
      }
      const referenceVideoUploadPromise = uploadedReferenceVideoRef.current?.url
        ? Promise.resolve({ url: uploadedReferenceVideoRef.current.url })
        : isRemoteHttpUrl(state.referenceVideo)
          ? Promise.resolve({ url: String(state.referenceVideo).trim() })
          : uploadAssetToCOSWithPresignedURL(await assetUrlToBlob(state.referenceVideo), {
            fileName: `reference-source-${Date.now()}.mp4`,
            objectPath: `standalone/${PILOT_APP_ID}/reference_source_videos`,
            appID: PILOT_APP_ID,
            camAppID: PILOT_APP_ID,
          });
      const preparedReferenceTargetPromise = needsServerTrim
        ? createPresignedCOSUpload({
          fileName: `prepared-reference-${Date.now()}.mp4`,
          objectPath: `standalone/${PILOT_APP_ID}/prepared_reference_videos`,
          appID: PILOT_APP_ID,
          camAppID: PILOT_APP_ID,
          contentType: 'video/mp4',
        })
        : Promise.resolve(null);
      const [imageUpload, referenceVideoUpload, preparedReferenceTarget] = await Promise.all([
        imageUploadPromise,
        referenceVideoUploadPromise,
        preparedReferenceTargetPromise,
      ]);

      const imageUrl = resolveUploadedAssetUrl(imageUpload);
      const referenceVideoUrl = resolveUploadedAssetUrl(referenceVideoUpload);
      const preparedReferenceUploadUrl = String(preparedReferenceTarget?.upload_url || '').trim();
      const preparedReferencePublicUrl = resolveUploadedAssetUrl(preparedReferenceTarget);
      if (!imageUrl || !referenceVideoUrl) {
        throw new Error('生成素材上传后未返回可访问地址。');
      }
      if (needsServerTrim && (!preparedReferenceUploadUrl || !preparedReferencePublicUrl)) {
        throw new Error('裁剪后参考视频上传目标配置不完整。');
      }

      const sourceAudioTarget = await createPresignedCOSUpload({
        fileName: `reference-audio-${Date.now()}.wav`,
        objectPath: `standalone/${PILOT_APP_ID}/reference_audios`,
        appID: PILOT_APP_ID,
        camAppID: PILOT_APP_ID,
        contentType: 'audio/wav',
      });
      const sourceAudioUploadUrl = String(sourceAudioTarget.upload_url || '').trim();
      const sourceAudioPublicUrl = resolveUploadedAssetUrl(sourceAudioTarget);
      if (!sourceAudioUploadUrl || !sourceAudioPublicUrl) {
        throw new Error('参考音频上传目标配置不完整。');
      }

      const audioResultTarget = await createPresignedCOSUpload({
        fileName: `voice-changer-${Date.now()}.mp3`,
        objectPath: `standalone/${PILOT_APP_ID}/generated_audio`,
        appID: PILOT_APP_ID,
        camAppID: PILOT_APP_ID,
        contentType: 'audio/mpeg',
      });
      const resultUploadUrl = String(audioResultTarget.upload_url || '').trim();
      const resultPublicUrl = resolveUploadedAssetUrl(audioResultTarget);
      if (!resultUploadUrl || !resultPublicUrl) {
        throw new Error('音频结果上传目标配置不完整。');
      }

      const mergedVideoTarget = await createPresignedCOSUpload({
        fileName: `final-video-${Date.now()}.mp4`,
        objectPath: `standalone/${PILOT_APP_ID}/generated_videos`,
        appID: PILOT_APP_ID,
        camAppID: PILOT_APP_ID,
        contentType: 'video/mp4',
      });
      const mergedVideoUploadUrl = String(mergedVideoTarget.upload_url || '').trim();
      const mergedVideoPublicUrl = resolveUploadedAssetUrl(mergedVideoTarget);
      if (!mergedVideoUploadUrl || !mergedVideoPublicUrl) {
        throw new Error('最终视频上传目标配置不完整。');
      }

      setProviderNotice(directVideoGeneration
        ? '正在使用原始参考图片，启动 Kling 3.0 Motion Control...'
        : '正在使用已生成截取帧，启动 Kling 3.0 Motion Control...');
      const generation = await videoCloneBffService.startCloneJob({
        imageUrl,
        referenceVideoUrl,
        sourceAudioUrl: referenceVideoUrl,
        referenceVideoDurationSeconds: Number(state.referenceVideoDurationSec),
        preparedReferenceUploadUrl: preparedReferenceUploadUrl || undefined,
        preparedReferenceUploadHeaders: preparedReferenceTarget?.headers || {},
        preparedReferencePublicUrl: preparedReferencePublicUrl || undefined,
        sourceAudioUploadUrl,
        sourceAudioUploadHeaders: sourceAudioTarget.headers || {},
        sourceAudioPublicUrl,
        sourceAudioDurationSeconds: Number(state.referenceVideoDurationSec),
        voiceSampleUrl: voiceSampleAsset?.url,
        voiceSampleMimeType: voiceSampleAsset?.mimeType,
        voiceSampleFileName: voiceSampleAsset?.fileName,
        resultUploadUrl,
        resultUploadHeaders: audioResultTarget.headers || {},
        resultPublicUrl,
        mergedVideoUploadUrl,
        mergedVideoUploadHeaders: mergedVideoTarget.headers || {},
        mergedVideoPublicUrl,
        aspectRatio: state.aspectRatio,
        durationSeconds: effectiveDirectVideoDurationSec,
        resolution: outputResolution,
        prompt,
        generatedFrameUrls,
        directVideoGeneration,
        videoDeploymentKey: 'motion_control',
      });
      void activePlatform.refreshCredits?.();

      setLatestTaskId(generation.jobId);
      setQueryTaskId(generation.jobId);
      setQueryTaskStatus(generation.status || 'queued');
      scheduleAutoPoll(generation.jobId);

      try {
        await persistVideoTask('完整卖点视频', {
          taskId: generation.videoTaskId,
          status: generation.status,
          videoUrl: null,
        }, {
          durationSeconds: effectiveDirectVideoDurationSec,
          prompt,
          videoDeploymentKey: generation.videoDeploymentKey || 'omni',
          videoDeploymentName: generation.videoDeploymentName || 'Kling 3.0 Motion Control',
          taskPayload: {
            clone_job_id: generation.jobId,
            cloneJobId: generation.jobId,
            raw_video_task_id: generation.videoTaskId,
            rawVideoTaskId: generation.videoTaskId,
            task_id: generation.jobId,
            taskId: generation.jobId,
          },
        });
        activePlatform.openTaskManager?.();
      } catch (persistError) {
        reportTaskQueuePersistenceFailure('视频任务', persistError);
      }

      setProviderNotice(`任务已提交，当前使用 ${generation.videoDeploymentName || 'Kling 3.0 Motion Control'}，系统会自动轮询任务进度。`);
      setState(p => ({ ...p, isGeneratingVideo: false }));
    } catch (err: any) {
      setState(p => ({ ...p, isGeneratingVideo: false }));
      const errMessage = String(err?.message || '未知错误');
      handleVideoGenerationError(errMessage, `视频生成失败: ${errMessage}`);
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
    // Mirror ref-version: shot videos never use the reference video (Kling shot
    // videos are plain I2V from the shot image; seedance keeps ref guidance).
    const hasReferenceVideo = !isKlingEngine && Boolean(state.referenceVideo);
    if (!ensureActionAllowed('SHOT_VIDEO', { videoSeconds: duration, hasReferenceVideo })) return null;
    const billingTask = resolveBillingTask('SHOT_VIDEO', duration, hasReferenceVideo);

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

      const generation = await generateVideo(shotPrompt, state.image, state.aspectRatio, shot.previewUrl, lastFrameImage, isKlingEngine ? undefined : (state.referenceVideo || undefined), duration, selectedVideoEngine, billingTask);
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
      if (isCombinedCloneJobId(trimmedTaskId)) {
        const result = await videoCloneBffService.getCloneJob(trimmedTaskId);
        setQueryTaskStatus(result.status || 'unknown');
        setLatestTaskId(result.jobId);
        setQueryTaskId(result.jobId);

        if (result.status === 'completed' && result.videoUrl) {
          clearAutoPollTimer();
          setFinalVideoDurationSec(null);
          setState(p => ({ ...p, videoUrl: result.videoUrl, error: null }));
          if (showNotice) {
            setProviderNotice('视频与音频都已生成完成，正在加载成片...');
          }
        } else if (result.status === 'failed') {
          clearAutoPollTimer();
          const message = String(result.errorMessage || '生成失败。');
          const friendlyMessage = toFriendlyVideoErrorMessage(message, message);
          setState(p => ({ ...p, error: friendlyMessage }));
          setProviderNotice(`任务失败：${friendlyMessage}`);
        } else {
          if (showNotice) {
            setProviderNotice('任务仍在运行中，请稍候...');
          }
          scheduleAutoPoll(result.jobId || trimmedTaskId);
        }
      } else {
        const result = await queryVideoTaskProgress(trimmedTaskId, selectedVideoEngine);
        setQueryTaskStatus(result.status || 'unknown');
        setLatestTaskId(result.taskId);
        setQueryTaskId(result.taskId);

        if (result.videoUrl) {
          clearAutoPollTimer();
          setFinalVideoDurationSec(null);
          setState(p => ({ ...p, videoUrl: result.videoUrl, error: null }));
          if (showNotice) {
            setProviderNotice('任务已完成，视频已加载。');
          }
        } else {
          if (showNotice) {
            setProviderNotice('任务仍在进行中，稍后可使用任务ID在此页面查询进度。');
          }
          if (!isTerminalTaskStatus(result.status || 'unknown')) {
            scheduleAutoPoll(result.taskId || trimmedTaskId);
          } else {
            clearAutoPollTimer();
          }
        }
      }
    } catch (err: any) {
      clearAutoPollTimer();
      const errMessage = String(err?.message || '查询任务失败');
      if (showNotice) {
        setState(p => ({ ...p, error: `查询任务失败: ${errMessage}` }));
      }
    } finally {
      if (showLoading) {
        setIsQueryingTask(false);
      }
    }
  };

  const handleQueryTaskProgress = async () => {
    await fetchTaskProgress(queryTaskId, { showLoading: true, showNotice: true });
  };

  const handleStopWaiting = () => {
    clearAutoPollTimer();
    setIsAutoPollingEnabled(false);
    setProviderNotice('已停止自动等待。你仍然可以手动查询任务进度。');
  };

  useEffect(() => () => {
    clearAutoPollTimer();
  }, []);

  const handleDownloadImage = (url: string, index: number) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `广告分镜画面-${index + 1}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleKlingDurationChange = (seconds: number) => {
    if (state.referenceVideo) {
      setProviderNotice('参考视频上传后，生成时长将锁定为该视频时长。');
      return;
    }
    const referenceDuration = Number(state.referenceVideoDurationSec);
    if (state.referenceVideo && Number.isFinite(referenceDuration) && seconds > referenceDuration) {
      setProviderNotice(`生成时长不能超过参考视频的 ${formatDuration(referenceDuration)}。`);
      return;
    }
    setDirectVideoDurationSec(seconds);
    setProviderNotice(null);
  };

  const handleReferenceVideoMetadataLoaded = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const width = Number(event.currentTarget.videoWidth);
    const height = Number(event.currentTarget.videoHeight);
    const duration = Number(event.currentTarget.duration);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      setReferenceVideoAspectRatio(width / height);
    }
    if (Number.isFinite(duration) && duration > 0) {
      setState(prev => ({ ...prev, referenceVideoDurationSec: duration }));
      if (!uploadedReferenceVideoRef.current) {
        setDirectVideoDurationSec(Math.max(3, Math.min(15, Number(duration.toFixed(2)))));
      }
    }
  };

  const handleFinalVideoMetadataLoaded = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const width = Number(event.currentTarget.videoWidth);
    const height = Number(event.currentTarget.videoHeight);
    const duration = Number(event.currentTarget.duration);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      setResultVideoAspectRatio(width / height);
    }
    if (Number.isFinite(duration) && duration > 0) {
      setFinalVideoDurationSec(duration);
    }
  };

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

  const syncVideoPlayers = (source: HTMLVideoElement | null, target: HTMLVideoElement | null, syncPlayback = false) => {
    if (!source || !target || isSyncingVideoPlaybackRef.current) {
      return;
    }

    isSyncingVideoPlaybackRef.current = true;
    try {
      if (Math.abs(source.currentTime - target.currentTime) > 0.12) {
        target.currentTime = source.currentTime;
      }
      if (target.playbackRate !== source.playbackRate) {
        target.playbackRate = source.playbackRate;
      }
      if (syncPlayback) {
        if (source.paused) {
          target.pause();
        } else {
          void target.play().catch(() => {});
        }
      }
    } finally {
      window.requestAnimationFrame(() => {
        isSyncingVideoPlaybackRef.current = false;
      });
    }
  };

  const ensureVideosStaySynchronized = () => {
    const referenceVideo = referenceVideoPlayerRef.current;
    const resultVideo = resultVideoPlayerRef.current;
    if (!referenceVideo || !resultVideo) {
      return;
    }

    referenceVideo.muted = true;
    resultVideo.muted = true;
    syncVideoPlayers(resultVideo, referenceVideo, false);
    void Promise.allSettled([
      resultVideo.play().catch(() => {}),
      referenceVideo.play().catch(() => {}),
    ]);
  };

  const effectiveReferenceAspectRatio = referenceVideoAspectRatio || 16 / 9;
  const generatedVideoFrameRatio = resultVideoAspectRatio ? String(resultVideoAspectRatio) : (state.aspectRatio === '16:9' ? '16 / 9' : '9 / 16');
  const taskStatusLabel = queryTaskStatus || (state.videoUrl ? 'completed' : 'idle');

  const Sidebar = (
    <div className="space-y-8 pb-10">
      <div className="hidden lg:block pb-6 border-b border-slate-100">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none">人物动作复刻 <span className="text-indigo-600 block text-lg mt-1">Motion Clone</span></h1>
      </div>

      <div className="space-y-6">
        <section>
          <div className={state.referenceVideo ? 'space-y-4' : 'grid grid-cols-2 gap-3'}>
            <div className={state.referenceVideo ? 'w-1/2' : 'w-full'}>
              <label className="min-h-8 text-[10px] leading-4 font-black text-slate-500 uppercase tracking-widest flex items-start mb-2 px-1">上传图片</label>
              <label className="block group cursor-pointer">
                <div className="w-full aspect-square bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center overflow-hidden transition-all group-hover:border-indigo-400 group-hover:bg-indigo-50/30 group-hover:shadow-inner">
                  {state.image ? (
                    <img
                      src={state.image}
                      alt="已上传图片"
                      onLoad={(event) => {
                        const width = Number(event.currentTarget.naturalWidth);
                        const height = Number(event.currentTarget.naturalHeight);
                        if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
                          setReferenceImageAspectRatio(width / height);
                        }
                      }}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 bg-white rounded-xl shadow-sm flex items-center justify-center mb-1 text-indigo-500 group-hover:scale-110 transition-transform">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      </div>
                      <span className="text-[9px] text-slate-400 font-bold uppercase">上传图片</span>
                    </div>
                  )}
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
            </div>

            {activeSidebarTab === 'selling_video' && (
              <div className="w-full">
                <label className="min-h-8 text-[10px] leading-4 font-black text-slate-500 uppercase tracking-widest flex items-start mb-2 px-1">
                  参考视频（3-15s）
                  {isReferenceVideoDisabled && <span className="ml-2 text-[9px] text-slate-400">当前引擎暂不支持</span>}
                </label>
                <label className={`block group ${isReferenceVideoDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                  <div className={`relative w-full border-2 rounded-3xl flex flex-col items-center justify-center overflow-hidden transition-all ${isReferenceVideoDisabled ? 'bg-slate-100 border-slate-200 opacity-60' : `${state.referenceVideo ? 'bg-slate-950' : 'bg-slate-50'} border-slate-200 group-hover:border-indigo-400 group-hover:shadow-inner`}`} style={{ aspectRatio: state.referenceVideo ? '16 / 25' : '1 / 1' }}>
                    {state.referenceVideo ? (
                      <div className="relative w-full h-full bg-black flex items-center justify-center">
                        <video
                          ref={referenceVideoPlayerRef}
                          src={state.referenceVideo}
                          muted
                          autoPlay
                          loop
                          playsInline
                          preload="metadata"
                          onLoadedMetadata={(event) => {
                            handleReferenceVideoMetadataLoaded(event);
                            ensureVideosStaySynchronized();
                          }}
                          onPlay={() => syncVideoPlayers(referenceVideoPlayerRef.current, resultVideoPlayerRef.current, true)}
                          onPause={() => syncVideoPlayers(referenceVideoPlayerRef.current, resultVideoPlayerRef.current, true)}
                          onSeeking={() => syncVideoPlayers(referenceVideoPlayerRef.current, resultVideoPlayerRef.current, false)}
                          onTimeUpdate={(event) => {
                            syncVideoPlayers(referenceVideoPlayerRef.current, resultVideoPlayerRef.current, false);
                            if (event.currentTarget.currentTime >= effectiveDirectVideoDurationSec - 0.05) {
                              event.currentTarget.currentTime = 0;
                            }
                          }}
                          className="w-full h-full object-contain cursor-pointer"
                          aria-label="参考视频预览，点击重新上传"
                        />
                        <div className="absolute inset-x-2 bottom-2 px-2 py-1.5 rounded-lg bg-black/65 text-white text-[8px] font-bold text-center pointer-events-none">
                          点击重新上传视频
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
                    {isUploadingReferenceVideo && (
                      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white pointer-events-none">
                        <span className="animate-spin h-7 w-7 border-[3px] border-indigo-600/30 border-t-indigo-600 rounded-full mb-2" />
                        <span className="text-[10px] font-black text-indigo-600">上传中{'.'.repeat(referenceUploadDots)}</span>
                      </div>
                    )}
                  </div>
                  <input id="reference-video-input" type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} disabled={isReferenceVideoDisabled || isUploadingReferenceVideo} />
                </label>
                {state.referenceVideo && !isUploadingReferenceVideo && (
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
                disabled={state.isGeneratingVideo || isGeneratingDubbing || isGeneratingFrames}
                onClick={() => setState(prev => ({ ...prev, aspectRatio: ratio, videoUrl: null }))}
                className={`py-3 text-[10px] font-black rounded-xl border transition-all disabled:cursor-not-allowed disabled:opacity-60 ${state.aspectRatio === ratio ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
              >
                {ratio}
              </button>
            ))}
          </div>
        </section>

        {activeSidebarTab === 'selling_video' && (
          <section>
            <label htmlFor="clone-prompt" className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">
              可选提示词
            </label>
            <textarea
              id="clone-prompt"
              value={state.clonePrompt}
              onChange={(event) => {
                clearCloneGenerationArtifacts();
                setState(prev => ({ ...prev, clonePrompt: event.target.value, videoUrl: null }));
              }}
              disabled={state.isGeneratingVideo || isGeneratingDubbing || isGeneratingFrames}
              rows={5}
              placeholder="留空时将使用默认关键帧人物替换提示词；如需补充主体气质、动作细节或服饰约束，可在这里覆盖。"
              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-[11px] leading-relaxed text-slate-700 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100 disabled:opacity-60"
            />
            <p className="mt-2 px-1 text-[9px] leading-relaxed text-slate-400">
              这是可选项。留空会自动使用默认的关键帧人物替换提示词；Kling 视频生成会继续使用内置动作保持提示词。
            </p>
          </section>
        )}

        {activeSidebarTab === 'selling_video' && (
          <section>
            <label htmlFor="direct-video-generation" className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
              <span>
                <span className="block text-[11px] font-black text-slate-800">直接生成视频</span>
                <span className="mt-1 block text-[10px] leading-relaxed text-slate-500">跳过截取帧生成，直接使用上传的参考图片生成视频，不收取截取帧积分。</span>
              </span>
              <input
                id="direct-video-generation"
                type="checkbox"
                role="switch"
                checked={directVideoGeneration}
                onChange={(event) => setDirectVideoGeneration(event.target.checked)}
                disabled={state.isGeneratingVideo || isGeneratingFrames}
                className="h-5 w-5 shrink-0 cursor-pointer accent-indigo-600 disabled:cursor-not-allowed"
              />
            </label>
          </section>
        )}

        <section>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">输出规格</label>
          <div className="grid grid-cols-2 gap-2">
            {(['720p', '1080p'] as const).map((resolution) => (
              <button
                key={resolution}
                type="button"
                disabled={state.isGeneratingVideo || isGeneratingDubbing || isGeneratingFrames}
                onClick={() => setOutputResolution(resolution)}
                className={`py-3 text-[10px] font-black rounded-xl border transition-all disabled:cursor-not-allowed disabled:opacity-60 ${outputResolution === resolution ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
              >
                {resolution}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[9px] leading-relaxed text-slate-400 px-1 text-center">跟随参考视频构图，不裁剪；1080p 清晰度更高</p>
        </section>

        {false && activeSidebarTab === 'selling_video' && (
          <section>
            <label htmlFor="pre-generation-language" className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">
              视频说话语言
            </label>
            <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-emerald-50/60 p-3">
              <select
                id="pre-generation-language"
                value={dubbingTargetLanguage}
                onChange={(event) => setDubbingTargetLanguage(event.target.value)}
                disabled={state.isGeneratingVideo || isGeneratingDubbing}
                className="w-full min-h-11 rounded-xl border border-white bg-white px-3 text-[11px] font-black text-slate-700 outline-none shadow-sm transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:opacity-60"
              >
                <option value="original">保持参考视频原语言</option>
                <option value="zh">转换为中文（普通话）</option>
                <option value="en">转换为英语</option>
                <option value="ja">转换为日语</option>
                <option value="ko">转换为韩语</option>
              </select>
              <p className="mt-2 px-1 text-[9px] leading-relaxed font-medium text-indigo-600/80">
                生成时自动完成换脸、翻译配音和口型同步，无需生成后再次操作。
              </p>
              {dubbingTargetLanguage !== 'original' && (
                <p className="mt-1 px-1 text-[9px] leading-relaxed font-medium text-amber-600">
                  目标语言会额外消耗 ElevenLabs 配音额度和可灵口型同步额度。
                </p>
              )}
            </div>
          </section>
        )}

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
                min={3}
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
                <span>3 秒</span>
                <span>15 秒</span>
              </div>
            )}
            {!directVideoGeneration && (
              <p className="mt-2 text-[11px] font-bold text-slate-500 px-1">
                截取帧：{resolveActionCost('CLONE_FRAMES')} 积分（{CLONE_FRAME_COUNT} 张，每张 {CLONE_FRAME_COST_PER_IMAGE} 积分）
              </p>
            )}
            <p className="mt-1 text-[11px] font-bold text-slate-500 px-1">
              完整视频：{resolveActionCost('FULL_VIDEO', effectiveDirectVideoDurationSec, Boolean(state.referenceVideo))} 积分
            </p>
            {selectedVideoEngine === 'kling' && (
              <p className="mt-1 text-[10px] font-medium text-slate-400 px-1">
                生成时长不能超过参考视频；系统会自动识别并替换上传图片对应的人脸与发型，身体、动作、服装、产品、背景和镜头保持参考视频。{dubbingTargetLanguage === 'original' ? '声音保持不变。' : '声音将自动翻译并同步口型。'}
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
              {!directVideoGeneration && (
                <button
                  onClick={handleGenerateCloneFrames}
                  disabled={!state.image || !state.referenceVideo || state.isGeneratingVideo || isGeneratingDubbing || isGeneratingFrames}
                  className="w-full py-5 bg-indigo-600 text-white rounded-3xl font-black text-sm shadow-xl shadow-indigo-200 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-300 disabled:shadow-none transition-all active:scale-[0.98] flex items-center justify-center gap-2 overflow-hidden relative"
                >
                  {isGeneratingFrames && (
                    <span className="absolute inset-0 bg-indigo-500/50 animate-pulse" />
                  )}
                  {isGeneratingFrames ? (
                    <><span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />截取帧生成中...</>
                  ) : `生成截取帧（${resolveActionCost('CLONE_FRAMES')}积分）`}
                </button>
              )}
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
          <span>{providerNotice}</span>
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
          <section className="rounded-[2rem] border border-indigo-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-400">Output</p>
                <h2 className="mt-1 text-lg font-black text-slate-900">生成结果</h2>
              </div>
              <div className="flex items-center gap-2">
                {!directVideoGeneration && generatedFrameUrls.length > 0 && <span className="rounded-full bg-indigo-50 px-3 py-1 text-[9px] font-black text-indigo-600">已生成截取帧</span>}
                {state.videoUrl && <span className="rounded-full bg-emerald-50 px-3 py-1 text-[9px] font-black text-emerald-600">已完成视频</span>}
              </div>
            </div>
            <div className="space-y-6">
              <div>
                {!directVideoGeneration && (
                  <>
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-base font-black text-slate-900">截取帧</h3>
                        <p className="mt-1 text-[11px] text-slate-400">先生成 1 张关键截取帧，再基于这张图片生成完整视频。</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[9px] font-black text-slate-500">{CLONE_FRAME_COUNT} 张</span>
                    </div>
                    {generatedFrameUrls.length > 0 || isGeneratingFrames ? (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        {(isGeneratingFrames ? Array.from({ length: CLONE_FRAME_COUNT }, (_, index) => `loading-${index}`) : generatedFrameUrls).map((frameUrl, index) => (
                          <div key={String(frameUrl)} className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-50 shadow-sm" style={{ aspectRatio: `${effectiveReferenceAspectRatio}` }}>
                            {isGeneratingFrames ? (
                              <div className="flex h-full w-full items-center justify-center bg-slate-100">
                                <span className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600" />
                              </div>
                            ) : (
                              <img src={String(frameUrl)} alt={`截取帧 ${index + 1}`} className="h-full w-full object-cover" />
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="min-h-[280px] rounded-[1.5rem] border border-dashed border-indigo-200 bg-indigo-50/40 flex flex-col items-center justify-center px-8 text-center">
                        <div className="w-16 h-16 rounded-3xl bg-white shadow-sm flex items-center justify-center text-indigo-500 mb-5"><svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7h16M4 12h16M4 17h16" /></svg></div>
                        <h3 className="text-lg font-black text-slate-800">等待生成截取帧</h3>
                        <p className="mt-2 max-w-xs text-[11px] leading-relaxed text-slate-400">点击左侧“生成截取帧”后，关键帧会显示在这里。</p>
                      </div>
                    )}
                  </>
                )}
                {directVideoGeneration && (
                  <p className="rounded-2xl border border-indigo-100 bg-indigo-50/40 px-4 py-3 text-[11px] text-indigo-700">
                    直接使用上传的参考图片和参考视频生成，不生成截取帧。
                  </p>
                )}
                <div className="mt-5">
                  <button
                    onClick={handleDirectGenerateVideo}
                    disabled={!state.image || !state.referenceVideo || (!directVideoGeneration && generatedFrameUrls.length === 0) || state.isGeneratingVideo || isGeneratingDubbing || isGeneratingFrames}
                    className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-emerald-100 hover:bg-emerald-700 disabled:bg-slate-100 disabled:text-slate-300 disabled:shadow-none transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    {state.isGeneratingVideo || isGeneratingDubbing ? (
                      <><span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />{isGeneratingDubbing ? '正在翻译并同步口型...' : '视频生成中...'}</>
                    ) : `生成完整视频（${resolveActionCost('FULL_VIDEO', effectiveDirectVideoDurationSec, Boolean(state.referenceVideo))}积分）`}
                  </button>
                </div>
              </div>

              {state.videoUrl ? (
                <>
                  <div className="border-t border-slate-100 pt-6">
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-black rounded-full border border-emerald-100">时长：{finalVideoDurationSec ? formatDuration(finalVideoDurationSec) : '读取中...'}</span>
                      {dubbedVideoUrl && <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-black rounded-full border border-indigo-100">{dubbingTargetLanguage === 'original' ? '原声音版' : '口型版'}</span>}
                    </div>
                    <div
                      className="w-full overflow-hidden rounded-[1.5rem] bg-transparent flex items-center justify-center"
                      style={{ aspectRatio: generatedVideoFrameRatio, maxHeight: '100vh' }}
                    >
                      <video
                        ref={resultVideoPlayerRef}
                        key={dubbedVideoUrl || state.videoUrl}
                        src={dubbedVideoUrl || state.videoUrl}
                        controls
                        muted
                        autoPlay
                        loop
                        playsInline
                        preload="metadata"
                        onLoadedMetadata={(event) => {
                          handleFinalVideoMetadataLoaded(event);
                          ensureVideosStaySynchronized();
                        }}
                        onPlay={() => syncVideoPlayers(resultVideoPlayerRef.current, referenceVideoPlayerRef.current, true)}
                        onPause={() => syncVideoPlayers(resultVideoPlayerRef.current, referenceVideoPlayerRef.current, true)}
                        onSeeking={() => syncVideoPlayers(resultVideoPlayerRef.current, referenceVideoPlayerRef.current, false)}
                        onTimeUpdate={() => syncVideoPlayers(resultVideoPlayerRef.current, referenceVideoPlayerRef.current, false)}
                        className="h-full w-full object-contain"
                      />
                    </div>
                    {(dubbingStage || dubbingError) && <div className={`mt-4 flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[11px] font-bold ${dubbingError ? 'border border-red-100 bg-red-50 text-red-600' : 'border border-indigo-100 bg-indigo-50 text-indigo-700'}`} aria-live="polite">{!dubbingError && <span className={`w-2 h-2 rounded-full bg-indigo-500 ${isGeneratingDubbing ? 'animate-pulse' : ''}`} />}<span>{dubbingError || dubbingStage}</span></div>}
                    <div className="mt-5 flex justify-center"><button onClick={() => { const a = document.createElement('a'); a.href = dubbedVideoUrl || state.videoUrl!; a.download = `${dubbedVideoUrl ? '多语言广告视频' : '广告视频'}_${Date.now()}.mp4`; a.click(); }} className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl shadow-xl shadow-emerald-100 transition-all active:scale-95 flex items-center gap-2"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>{dubbedVideoUrl ? '下载多语言视频' : '下载最终视频'}</button></div>
                  </div>
                </>
              ) : !directVideoGeneration && generatedFrameUrls.length === 0 && !isGeneratingFrames ? null : (
                <div className="rounded-[1.5rem] border border-dashed border-emerald-200 bg-emerald-50/40 px-6 py-8 text-center">
                  <h3 className="text-lg font-black text-slate-800">等待完整视频</h3>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{directVideoGeneration ? '上传图片和参考视频后，点击上方按钮即可生成完整视频。' : '截取帧准备完成后，点击上方按钮即可生成完整视频。'}</p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {!state.plan && !state.isAnalyzing && !state.videoUrl && !state.referenceVideo && (
        <div className="py-24 lg:py-40 text-center max-w-lg mx-auto">
          <div className="w-20 h-20 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-inner">
            <svg className="w-10 h-10 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">准备好打造爆款视频了吗？</h2>
          <p className="text-sm text-slate-400 mt-4 leading-relaxed font-medium">
             上传图片和参考视频；系统会自动识别人脸与发型，其余画面和声音保持参考视频。
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
