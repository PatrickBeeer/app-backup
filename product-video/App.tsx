
import React, { useEffect, useRef, useState } from 'react';
import { AppState, AdPlan, Shot, AppProps, type AudienceOption } from './types';
import {
  analyzeProductAndAudiences,
  generateAudienceStoryboard,
  generateVideo,
  regenerateShotDescription,
  expandShotDescriptionAI,
  queryVideoTaskProgress,
  type VideoEngine,
  type ProductAnalysisResult,
} from './services/geminiService';
import { WorkbenchLayout } from './components/WorkbenchLayout';
import JSZip from 'jszip';
import { uploadAssetToCOSWithPresignedURL } from '../../shared_services/geminiProxyService';
import {
  createTaskQueueItem,
  getLatestVideoTask,
  recordTaskManagerObject,
  updateTaskQueueVideoResult,
} from './services/taskManagerService';
import { buildStandaloneBackendUrl } from './services/standaloneHost';
import { rebuildVideoFromClipsDataUrl } from './services/videoTrimService';

const PILOT_APP_ID = 'product-video';
const PILOT_APP_NAME = 'AI 产品视频';
const SEEDANCE_VIDEO_GEN_COST_PER_SECOND = 15;
const VEO_VIDEO_COST_MAP: Record<number, number> = {
  4: 30,
  8: 50,
};
const DEFAULT_VIDEO_DURATION_SECONDS = 4;
// 各引擎支持的单段视频时长（秒）：修改画面时按上限把原视频切成若干段逐段重绘，再拼回成片。
const ENGINE_GENERATION_DURATIONS: Record<VideoEngine, number[]> = {
  seedance2: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  kling: [5, 10],
  jimeng: [5, 10],
  veo31: [4, 8],
  grokv3: [10],
};

// 为目标片段长度选择生成时长：优先取 ≥ 片段长度的最短支持值，否则取最大支持值。
function resolveGenerationDuration(engine: VideoEngine, segmentSeconds: number): number {
  const options = ENGINE_GENERATION_DURATIONS[engine] ?? [5];
  const ceiling = options.find((seconds) => seconds >= segmentSeconds);
  return ceiling ?? options[options.length - 1];
}

// 把整条时长切成若干「引擎单次可生成」的等长片段，逐段重绘后拼回。
function planEditSegments(totalSeconds: number, engine: VideoEngine): number {
  const maxSeconds = Math.max(...(ENGINE_GENERATION_DURATIONS[engine] ?? [5]));
  const safeTotal = Math.max(1, totalSeconds);
  return Math.max(1, Math.ceil(safeTotal / maxSeconds));
}
const MAX_IMAGE_DIMENSION = 1024;
const IMAGE_COMPRESS_QUALITY = 0.85;
const GROK_FIXED_DURATION_SECONDS = 10;
const GROK_VIDEO_COST_POINTS = 20;
const JIMENG_VIDEO_DURATION_OPTIONS = [5, 10] as const;
const JIMENG_VIDEO_COST_MAP: Record<number, number> = { 5: 75, 10: 150 };
const KLING_VIDEO_DURATION_OPTIONS = [5, 10] as const;
const VIDEO_POLL_INTERVAL_MS = 8_000;
const VIDEO_POLL_MAX_FAILURES = 5;
const VIDEO_POLL_MAX_WAIT_MS = 20 * 60 * 1000;
const VIDEO_MODEL_BY_ENGINE: Record<VideoEngine, string> = {
  seedance2: 'doubao-seedance-2-0-fast-260128',
  veo31: 'veo_3_1',
  grokv3: 'grok-video-3-pro',
  kling: 'kling-3.0',
  jimeng: 'jimeng_i2v_first_v30',
};

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

// 从原视频中提取一帧"画面内容"（默认取 30% 处）转为 JPEG data URL，
// 供提示词修改画面时作为参考帧。刻意不取第 0 帧：初次渲染的首帧是产品图，
// 取中段帧才能代表视频的真实画面，保证修改后的新视频首帧是原视频画面而非产品图。
async function extractVideoReferenceFrameDataUrl(
  videoUrl: string,
  seekRatio = 0.3,
  seekSeconds?: number,
): Promise<string> {
  const readable = /^https?:\/\//i.test(videoUrl)
    ? buildStandaloneBackendUrl(`/api/kling/media?url=${encodeURIComponent(videoUrl)}`)
    : videoUrl;
  const response = await fetch(readable);
  if (!response.ok) {
    throw new Error(`读取当前视频失败（HTTP ${response.status}）。`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = objectUrl;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('无法读取当前视频画面。'));
    });
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 5;
    const requestedTime = seekSeconds !== undefined ? seekSeconds : duration * seekRatio;
    const targetTime = Math.min(
      Math.max(requestedTime, 0.05),
      Math.max(duration - 0.05, 0.05),
    );
    await new Promise<void>((resolve) => {
      const timeoutId = window.setTimeout(resolve, 3000);
      video.onseeked = () => {
        window.clearTimeout(timeoutId);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timeoutId);
        resolve();
      };
      video.currentTime = targetTime;
    });
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 1280;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('无法处理视频画面。');
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
  } finally {
    video.removeAttribute('src');
    URL.revokeObjectURL(objectUrl);
  }
}

function normalizeTaskQueueStatus(status: string, videoUrl?: string | null): TaskQueueStatus {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'succeed' || normalized === 'succeeded' || normalized === 'success' || normalized === 'completed') {
    return 'finished';
  }
  if (normalized === 'failed' || normalized === 'fail' || normalized === 'error' || normalized === 'rejected') {
    return 'failed';
  }
  if (videoUrl) {
    return 'finished';
  }
  return 'queued';
}

export default function App({ platform: activePlatform, costs }: AppProps) {
  const activeCosts = costs ?? {};
  const [providerNotice, setProviderNotice] = useState<string | null>(null);
  const [selectedVideoEngine] = useState<VideoEngine>('seedance2');

  const [state, setState] = useState<
    AppState & {
      customSellingPoints: string;
      scripts: AdPlan[];
      selectedScriptIndex: number | null;
      isGeneratingScripts: boolean;
      scriptGenError: string | null;
      analysis: ProductAnalysisResult | null;
      analyzeError: string | null;
      productName: string;
      selectedVideoDuration: number;
      hasModel: boolean;
    }
  >({
    image: null,
    plan: null,
    videoUrl: null,
    isAnalyzing: false,
    isGeneratingImages: false,
    isGeneratingVideo: false,
    error: null,
    aspectRatio: '9:16',
    editedPrompt: '',
    customSellingPoints: '',
    shotCount: 1,
    hasModel: true,
    scripts: [],
    selectedScriptIndex: null,
    isGeneratingScripts: false,
    scriptGenError: null,
    analysis: null,
    analyzeError: null,
      productName: '',
      selectedVideoDuration: DEFAULT_VIDEO_DURATION_SECONDS,
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
    if (normalized === 'processing' || normalized === 'running') return '视频生成中';
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

    const normalizedDuration = Math.min(15, Math.max(4, Math.round(effectiveSeconds)));
    return `seedance_video_${normalizedDuration}s`;
  };

  const resolveActionCost = (actionType: string, videoSeconds?: number): number => {
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

    return resolveVideoBillingTask(videoSeconds);
  };

  const ensureActionAllowed = (actionType: string, options?: { videoSeconds?: number }): boolean => {
    void actionType;
    void options;
    return true;
  };

  const [loadingShotVideos, setLoadingShotVideos] = useState<Set<number>>(new Set());
  const [loadingDescriptions, setLoadingDescriptions] = useState<Set<number>>(new Set());
  const [loadingExpansions, setLoadingExpansions] = useState<Set<number>>(new Set());
  const [isBundling, setIsBundling] = useState(false);
  const [latestTaskId, setLatestTaskId] = useState<string>('');
  const [queryTaskId, setQueryTaskId] = useState<string>('');
  const [isQueryingTask, setIsQueryingTask] = useState(false);
  const [queryTaskStatus, setQueryTaskStatus] = useState<string>('');
  const [isAutoPollingEnabled, setIsAutoPollingEnabled] = useState(true);
  const pollingInFlightRef = useRef(false);
  const consecutivePollFailuresRef = useRef(0);
  const generationStartedAtRef = useRef<number | null>(null);
  const shotTaskIdsRef = useRef<Record<number, string>>({});
  const [shotVideoDurations, setShotVideoDurations] = useState<Record<number, number>>({});
  const [shotTaskIds, setShotTaskIds] = useState<Record<number, string>>({});
  const [videoEditPrompts, setVideoEditPrompts] = useState<Record<number, string>>({});
  const [shotVideoSizes, setShotVideoSizes] = useState<Record<number, { width: number; height: number }>>({});
  const [applyingVideoEdits, setApplyingVideoEdits] = useState<Set<number>>(new Set());
  const [videoEditProgress, setVideoEditProgress] = useState<Record<number, string>>({});
  const [videoEditErrors, setVideoEditErrors] = useState<Record<number, string>>({});
  const shotOriginalVideosRef = useRef<Record<number, string>>({});

  const clearShotVideoEditState = (index: number) => {
    delete shotOriginalVideosRef.current[index];
    setVideoEditPrompts((prev) => {
      if (!(index in prev)) return prev;
      const next = { ...prev };
      delete next[index];
      return next;
    });
    setVideoEditErrors((prev) => {
      if (!(index in prev)) return prev;
      const next = { ...prev };
      delete next[index];
      return next;
    });
    setVideoEditProgress((prev) => {
      if (!(index in prev)) return prev;
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  useEffect(() => {
    shotTaskIdsRef.current = shotTaskIds;
  }, [shotTaskIds]);
  const reportTaskQueuePersistenceFailure = (contextLabel: string, error: unknown) => {
    console.error(`[${PILOT_APP_ID}] ${contextLabel} task persistence failed`, error);
    setProviderNotice(`${contextLabel}已完成，但写入任务面板失败。`);
  };

  const persistVideoTask = async (
    title: string,
    generation: { taskId: string | null; status: string; videoUrl: string | null },
    options: {
      durationSeconds: number;
      prompt: string;
      shotIndex?: number;
      stage?: string;
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
      },
    });
  };

  const isTerminalTaskStatus = (status: string): boolean => {
    const normalized = String(status || '').trim().toLowerCase();
    return (
      normalized === 'succeed' ||
      normalized === 'succeeded' ||
      normalized === 'success' ||
      normalized === 'completed' ||
      normalized === 'fail' ||
      normalized === 'failed' ||
      normalized === 'error' ||
      normalized === 'cancelled' ||
      normalized === 'expired' ||
      normalized === 'rejected' ||
      normalized === 'not_found'
    );
  };

  useEffect(() => {
    const savedTask = getLatestVideoTask();
    if (!savedTask) return;
    setLatestTaskId(savedTask.taskId);
    setQueryTaskId(savedTask.taskId);
    setQueryTaskStatus(savedTask.status || 'queued');
    if (savedTask.videoUrl) {
      setState((p) => ({ ...p, videoUrl: savedTask.videoUrl, isGeneratingVideo: false, error: null }));
      return;
    }
    if (!isTerminalTaskStatus(savedTask.status)) {
      generationStartedAtRef.current = Date.now();
      consecutivePollFailuresRef.current = 0;
      setProviderNotice('已恢复最近提交的视频任务，正在当前页面继续查询生成进度。');
      setState((p) => ({ ...p, isGeneratingVideo: true, error: null }));
    }
  }, []);

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
    if (isAbortedVideoRequest(message)) {
      const raw = message || 'signal is aborted without reason';
      setProviderNotice('请求超时或网络中断，请重试。');
      setState((p) => ({
        ...p,
        error: `视频生成请求被中断。可能原因：任务耗时过长触发超时、网络波动、浏览器中止请求。原始信息：${raw}`,
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
      setState((p) => ({ ...p, error: null }));
      return;
    }

    setState((p) => ({ ...p, error: fallbackMessage }));
  };

  const compressImageFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        try {
          const longest = Math.max(img.naturalWidth, img.naturalHeight);
          const scale = longest > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / longest : 1;
          const width = Math.max(1, Math.round(img.naturalWidth * scale));
          const height = Math.max(1, Math.round(img.naturalHeight * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('无法创建画布');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', IMAGE_COMPRESS_QUALITY));
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('产品图片加载失败'));
      };
      img.src = objectUrl;
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) return;
      if (file.size > 10 * 1024 * 1024) {
        setState((prev) => ({ ...prev, error: '产品图片不能超过 10MB。' }));
        return;
      }
      const applyImage = (dataUrl: string) => {
        setProviderNotice(null);
        setShotVideoDurations({});
        setShotTaskIds({});
        setState((p) => ({
          ...p,
          image: dataUrl,
          scripts: [],
          selectedScriptIndex: null,
          plan: null,
          videoUrl: null,
          error: null,
          scriptGenError: null,
          analysis: null,
          analyzeError: null,
          selectedVideoDuration: DEFAULT_VIDEO_DURATION_SECONDS,
        }));
      };
      try {
        // 上传时压缩产品图，避免原图（最高 10MB）直接发给推理模型导致请求超时。
        const compressed = await compressImageFile(file);
        applyImage(compressed);
      } catch {
        const reader = new FileReader();
        reader.onloadend = () => applyImage(reader.result as string);
        reader.onerror = () => setState((prev) => ({ ...prev, error: '产品图片读取失败，请重新选择。' }));
        reader.readAsDataURL(file);
      }
    }
  };

  const handleRunAnalysis = async () => {
    if (!state.image) return;
    if (!ensureActionAllowed('PLAN_ANALYSIS')) return;

    setState((p) => ({
      ...p,
      isAnalyzing: true,
      analysis: null,
      analyzeError: null,
      isGeneratingScripts: false,
      scripts: [],
      selectedScriptIndex: null,
      plan: null,
      videoUrl: null,
      scriptGenError: null,
      error: null,
    }));
    try {
      const analysis = await analyzeProductAndAudiences(state.image);
      void activePlatform.refreshCredits?.();
      setState((p) => ({
        ...p,
        isAnalyzing: false,
        analysis,
        productName: analysis.productName,
      }));
    } catch (err: any) {
      console.error(err);
      const errorMsg = `产品分析失败：${err?.message || '请重试。'}`;
      setState((p) => ({
        ...p,
        isAnalyzing: false,
        analyzeError: errorMsg,
      }));
    }
  };

  // 点击某个人群后，针对该人群生成 1 条专属广告脚本；
  // 生成完成后渲染区由下方“{state.plan && ...}”分支接管，并自动滚动到视野中。
  const renderAreaRef = useRef<HTMLDivElement | null>(null);
  const handleSelectAudience = async (audience: AudienceOption) => {
    if (!state.image || !state.analysis) return;
    if (state.isGeneratingScripts) return;
    if (!ensureActionAllowed('PLAN_ANALYSIS')) return;

    setShotTaskIds({});
    setShotVideoDurations({});
    setState((p) => ({
      ...p,
      isGeneratingScripts: true,
      scriptGenError: null,
      plan: null,
      videoUrl: null,
      selectedScriptIndex: null,
    }));

    try {
      const plan = await generateAudienceStoryboard(
        state.image,
        audience,
        Math.max(1, state.shotCount || 1),
        state.analysis.category,
        state.hasModel,
      );
      void activePlatform.refreshCredits?.();
      const duration = state.selectedVideoDuration;
      const finalPlan: AdPlan = {
        ...plan,
        storyboard: plan.storyboard.map((shot) => ({ ...shot, duration: shot.duration || `${duration}s` })),
      };
      setState((p) => ({
        ...p,
        plan: finalPlan,
        scripts: [finalPlan],
        selectedScriptIndex: 0,
        isGeneratingScripts: false,
      }));
      // 自动滚动到渲染区
      requestAnimationFrame(() => {
        renderAreaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch (err: any) {
      console.error(err);
      const errorMsg = `人群脚本生成失败：${err?.message || '请重试。'}`;
      setState((p) => ({
        ...p,
        isGeneratingScripts: false,
        scriptGenError: errorMsg,
      }));
    }
  };

  const writeShotVideo = (index: number, videoUrl: string, options?: { isLocalEdit?: boolean }) => {
    const isLocalEdit = Boolean(options?.isLocalEdit);
    if (!isLocalEdit) {
      clearShotVideoEditState(index);
    }
    setState((p) => {
      if (!p.plan) return p;
      const newStoryboard = [...p.plan.storyboard];
      if (!newStoryboard[index]) return p;
      newStoryboard[index] = { ...newStoryboard[index], videoUrl };
      return { ...p, plan: { ...p.plan, storyboard: newStoryboard }, videoUrl, isGeneratingVideo: false, error: null };
    });
    setProviderNotice(isLocalEdit ? '画面修改已应用到视频。' : '场景视频已生成。');
  };

  // 提交视频任务后同步轮询，直到拿到可播放地址或任务终止；不再依赖独立的自动轮询 effect。
  const pollVideoUntilReady = async (taskId: string, index: number, timeoutMs = 5 * 60 * 1000): Promise<string | null> => {
    const startedAt = Date.now();
    const intervalMs = 4000;
    while (Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      try {
        const result = await queryVideoTaskProgress(taskId, selectedVideoEngine);
        setQueryTaskStatus(result.status || 'unknown');
        setLatestTaskId(result.taskId);
        setQueryTaskId(result.taskId);
        if (result.videoUrl) {
          return result.videoUrl;
        }
        const normalized = String(result.status || '').trim().toLowerCase();
        if (['failed', 'fail', 'error', 'cancelled', 'expired'].includes(normalized)) {
          throw new Error(`视频生成失败：任务状态为 ${result.status || 'unknown'}`);
        }
      } catch (err: any) {
        if (['failed', 'fail', 'error', 'cancelled', 'expired'].some((s) => String(err?.message || '').includes(s))) {
          throw err;
        }
        // 瞬时查询失败（如任务尚未就绪）继续等待
      }
    }
    throw new Error(`视频任务等待超过 ${Math.round(timeoutMs / 60000)} 分钟仍未完成，可稍后点击“立即查询”重试。`);
  };

  const handleGenerateShotVideo = async (index: number) => {
    if (!state.plan || !state.image) return;
    const shot = state.plan.storyboard[index];
    const duration = parseShotDurationSeconds(shot.duration);
    if (!ensureActionAllowed('SHOT_VIDEO', { videoSeconds: duration })) return null;
    const billingTask = resolveBillingTask('SHOT_VIDEO', duration);

    setLoadingShotVideos((prev) => new Set(prev).add(index));
    setShotVideoDurations((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    setShotTaskIds((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    setState((p) => ({ ...p, isGeneratingVideo: true, error: null }));
    setIsAutoPollingEnabled(true);
    try {
      setProviderNotice(null);
      const styleHint = !state.hasModel && state.plan?.videoStyle
        ? ` Video style for this audience (no model): ${state.plan.videoStyle}.`
        : '';
      const castHint = state.hasModel
        ? ' A real person/model matching the audience must appear naturally in frame.'
        : ' STRICTLY NO PEOPLE: no human body, no face, no hands, no silhouette in any frame; show only the product and its environment.';
      const shotPrompt = `Commercial shot: ${shot.description}.${styleHint}${castHint} FULL FRAME COVERAGE, NO BORDERS. ACTION COMPLETED IN ${duration} SECONDS.`;

      // 首帧固定使用用户上传的产品图，不再依赖分镜图。
      const generation = await generateVideo(
        shotPrompt,
        state.image,
        state.aspectRatio,
        state.image,
        undefined,
        duration,
        selectedVideoEngine,
        billingTask,
      );
      void activePlatform.refreshCredits?.();

      if (generation.taskId) {
        setLatestTaskId(generation.taskId);
        setQueryTaskId(generation.taskId);
        setShotTaskIds((prev) => ({ ...prev, [index]: generation.taskId! }));
      }

      try {
        await persistVideoTask(`场景 ${index + 1} 视频任务`, generation, {
          durationSeconds: duration,
          prompt: shotPrompt,
          shotIndex: index,
          stage: shot.stage,
        });
      } catch (persistError) {
        reportTaskQueuePersistenceFailure(`场景 ${index + 1} 视频任务`, persistError);
      }

      if (generation.videoUrl) {
        writeShotVideo(index, generation.videoUrl);
        return generation.videoUrl;
      }

      if (!generation.taskId) {
        throw new Error('视频生成失败：未返回任务ID，请重试。');
      }

      const videoUrl = await pollVideoUntilReady(generation.taskId, index);
      if (videoUrl) {
        writeShotVideo(index, videoUrl);
        return videoUrl;
      }
      return null;
    } catch (err: any) {
      const errMessage = String(err?.message || '未知错误');
      handleVideoGenerationError(errMessage, `视频生成失败: ${errMessage}`);
      return null;
    } finally {
      setLoadingShotVideos((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

  const handleDownloadAll = async () => {
    if (!state.plan) return;
    setIsBundling(true);
    const zip = new JSZip();
    const folder = zip.folder('广告素材包');

    try {
      for (let i = 0; i < state.plan.storyboard.length; i++) {
        const shot = state.plan.storyboard[i];
        if (shot.videoUrl) {
          const vidBlob = await fetch(shot.videoUrl).then((r) => r.blob());
          folder?.file(`场景_${i + 1}_视频.mp4`, vidBlob);
        }
      }
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `广告素材包_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Bundling failed', err);
      setState((p) => ({ ...p, error: '打包下载失败，请尝试单独下载。' }));
    } finally {
      setIsBundling(false);
    }
  };

  const handleDownloadVideo = (url: string, index: number) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `产品场景视频-${index + 1}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const updateVideoEditPrompt = (index: number, text: string) => {
    setVideoEditPrompts((prev) => ({ ...prev, [index]: text }));
  };

  // 按提示词修改已生成视频的画面内容：
  // 不是从产品图重新生成一条新片，而是把原视频按引擎上限切成若干段，
  // 每段都以「原视频该时刻的真实画面帧」为底图重绘，只改动提示词描述的部分，
  // 最后按原顺序拼回，并沿用原视频的音轨。
  const handleApplyVideoEdit = async (index: number) => {
    const shot = state.plan?.storyboard[index];
    if (!shot?.videoUrl) {
      setVideoEditErrors((prev) => ({ ...prev, [index]: '当前场景还没有已生成的视频。' }));
      return;
    }
    const editPromptText = String(videoEditPrompts[index] || '').trim();
    if (!editPromptText) {
      setVideoEditErrors((prev) => ({ ...prev, [index]: '请先描述想把画面改成什么样。' }));
      return;
    }
    const totalDuration =
      shotVideoDurations[index] && shotVideoDurations[index] > 0
        ? shotVideoDurations[index]
        : parseShotDurationSeconds(shot.duration);
    if (!(totalDuration > 0.5)) {
      setVideoEditErrors((prev) => ({ ...prev, [index]: '无法读取当前视频时长，请刷新后重试。' }));
      return;
    }

    const segmentCount = planEditSegments(totalDuration, selectedVideoEngine);
    const segmentDuration = totalDuration / segmentCount;

    setVideoEditErrors((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    setApplyingVideoEdits((prev) => new Set(prev).add(index));
    setVideoEditProgress((prev) => ({
      ...prev,
      [index]: segmentCount > 1 ? `正在生成第 1/${segmentCount} 段画面` : '正在按提示词重绘画面',
    }));
    // 记录原始视频，便于一键恢复。
    if (!(index in shotOriginalVideosRef.current)) {
      shotOriginalVideosRef.current[index] = shot.videoUrl;
    }

    try {
      const generatedClips: { url: string; durationSec: number }[] = [];

      for (let seg = 0; seg < segmentCount; seg += 1) {
        const segStart = seg * segmentDuration;
        // 第一段刻意不取第 0 帧：原视频开场常与产品图高度重合，
        // 取该段 35% 处能保证重绘后的首帧是原视频的真实画面。
        const seekTime = seg === 0
          ? Math.min(segStart + Math.max(0.1, segmentDuration * 0.35), totalDuration - 0.05)
          : Math.min(segStart + 0.05, Math.max(0.05, totalDuration - 0.05));
        if (segmentCount > 1) {
          setVideoEditProgress((prev) => ({ ...prev, [index]: `正在生成第 ${seg + 1}/${segmentCount} 段画面` }));
        }

        const frameDataUrl = await extractVideoReferenceFrameDataUrl(shot.videoUrl, 0.3, seekTime);
        const generationDuration = resolveGenerationDuration(selectedVideoEngine, segmentDuration);
        const billingTask = resolveBillingTask('SHOT_VIDEO', generationDuration);
        const isFirstSegment = seg === 0;
        const editPrompt = [
          'Commercial shot content modification based on the provided reference frame.',
          `Original scene context: ${shot.description}.`,
          `Modify the footage exactly as described: ${editPromptText}.`,
          isFirstSegment
            ? 'The reference frame is a real frame from the existing video. Start the shot from it and keep everything the description does not mention — same product, same environment, same lighting, color grading, camera angle and motion.'
            : 'Start from the provided reference frame so this part cuts seamlessly onto the previous part. Keep everything the description does not mention — same product, same environment, same lighting, color grading and camera motion.',
          state.hasModel
            ? 'Keep the person/model consistent with the reference frame.'
            : 'STRICTLY NO PEOPLE: no human body, no face, no hands, no silhouette in any frame.',
          'Do NOT introduce a different scene, a different product or a different camera setup. Only change what the modification asks for.',
          'FULL FRAME COVERAGE, NO BORDERS.',
          `ACTION COMPLETED IN ${generationDuration} SECONDS.`,
        ].join(' ');

        const generation = await generateVideo(
          editPrompt,
          frameDataUrl,
          state.aspectRatio,
          frameDataUrl,
          undefined,
          generationDuration,
          selectedVideoEngine,
          billingTask,
        );
        void activePlatform.refreshCredits?.();

        if (generation.taskId) {
          setLatestTaskId(generation.taskId);
          setQueryTaskId(generation.taskId);
          setShotTaskIds((prev) => ({ ...prev, [index]: generation.taskId! }));
        }

        try {
          await persistVideoTask(`场景 ${index + 1} 画面修改任务${segmentCount > 1 ? `（第 ${seg + 1}/${segmentCount} 段）` : ''}`, generation, {
            durationSeconds: generationDuration,
            prompt: editPrompt,
            shotIndex: index,
            stage: shot.stage,
          });
        } catch (persistError) {
          reportTaskQueuePersistenceFailure(`场景 ${index + 1} 画面修改任务`, persistError);
        }

        let clipUrl = generation.videoUrl;
        if (!clipUrl && generation.taskId) {
          clipUrl = await pollVideoUntilReady(generation.taskId, index);
        }
        if (!clipUrl) {
          throw new Error(`第 ${seg + 1} 段画面未返回视频地址，可稍后用任务ID查询结果。`);
        }
        generatedClips.push({ url: clipUrl, durationSec: segmentDuration });
      }

      setVideoEditProgress((prev) => ({ ...prev, [index]: '正在拼回原视频并保留原声' }));
      // 本地重建：新画面按顺序拼成完整时长，声音沿用原视频音轨。
      const mergedUrl = await rebuildVideoFromClipsDataUrl(
        shot.videoUrl,
        generatedClips,
        shotVideoSizes[index],
      );
      writeShotVideo(index, mergedUrl, { isLocalEdit: true });
      setProviderNotice(
        segmentCount > 1
          ? `已按提示词重绘全部 ${segmentCount} 段画面并拼回，时长与原声保持原样。`
          : '已按提示词修改视频画面，时长与原声保持原样。',
      );
    } catch (err: any) {
      const errMessage = String(err?.message || '未知错误');
      setVideoEditErrors((prev) => ({ ...prev, [index]: `画面修改失败：${errMessage}` }));
    } finally {
      setApplyingVideoEdits((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
      setVideoEditProgress((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
    }
  };

  const handleResetVideoEdit = (index: number) => {
    const originalUrl = shotOriginalVideosRef.current[index];
    if (originalUrl) {
      writeShotVideo(index, originalUrl, { isLocalEdit: true });
      setProviderNotice('已恢复原始视频。');
    }
    clearShotVideoEditState(index);
  };

  const fetchTaskProgress = async (
    taskId: string,
    options: { showLoading?: boolean; showNotice?: boolean } = {},
  ) => {
    const { showLoading = true, showNotice = true } = options;
    const trimmedTaskId = taskId.trim();
    if (!trimmedTaskId) {
      setState((p) => ({ ...p, error: '请输入任务ID。' }));
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
        consecutivePollFailuresRef.current = 0;
        generationStartedAtRef.current = null;
        const matchedIndex = Number(
          Object.keys(shotTaskIdsRef.current).find(
            (key) => shotTaskIdsRef.current[Number(key)] === result.taskId,
          ) ?? -1,
        );
        setState((p) => {
          const newStoryboard = p.plan ? [...p.plan.storyboard] : null;
          if (newStoryboard && matchedIndex >= 0 && newStoryboard[matchedIndex]) {
            clearShotVideoEditState(matchedIndex);
            newStoryboard[matchedIndex] = {
              ...newStoryboard[matchedIndex],
              videoUrl: result.videoUrl,
            };
          } else if (newStoryboard && newStoryboard.length === 1 && !newStoryboard[0].videoUrl) {
            // 单场景应用：手动查询任意任务时，兜底写入唯一场景
            clearShotVideoEditState(0);
            newStoryboard[0] = { ...newStoryboard[0], videoUrl: result.videoUrl };
          }
          return {
            ...p,
            plan: newStoryboard ? { ...p.plan!, storyboard: newStoryboard } : p.plan,
            videoUrl: result.videoUrl,
            isGeneratingVideo: false,
            error: null,
          };
        });
        if (showNotice) {
          setProviderNotice('任务已完成，视频已加载。');
        }
      } else if (isTerminalTaskStatus(result.status)) {
        consecutivePollFailuresRef.current = 0;
        generationStartedAtRef.current = null;
        const message =
          normalizedStatus === 'succeed' ||
          normalizedStatus === 'succeeded' ||
          normalizedStatus === 'success' ||
          normalizedStatus === 'completed'
            ? '视频任务已完成，但模型未返回可播放的视频地址。'
            : `视频生成失败：任务状态为 ${result.status || 'unknown'}。`;
        setState((p) => ({ ...p, isGeneratingVideo: false, error: message }));
        setProviderNotice(null);
      } else {
        if (!normalizedStatus || normalizedStatus === 'unknown') {
          consecutivePollFailuresRef.current += 1;
          if (consecutivePollFailuresRef.current >= VIDEO_POLL_MAX_FAILURES) {
            setIsAutoPollingEnabled(false);
            setState((p) => ({
              ...p,
              isGeneratingVideo: false,
              error: '视频连续未返回有效任务状态，已停止自动等待。请点击“立即查询”重试。',
            }));
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
      consecutivePollFailuresRef.current += 1;
      if (showNotice || consecutivePollFailuresRef.current >= VIDEO_POLL_MAX_FAILURES) {
        setState((p) => ({
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
    setState((p) => ({ ...p, isGeneratingVideo: true, error: null }));
    await fetchTaskProgress(queryTaskId, { showLoading: true, showNotice: true });
  };

  const handleStopWaiting = () => {
    setIsAutoPollingEnabled(false);
    generationStartedAtRef.current = null;
    setState((p) => ({ ...p, isGeneratingVideo: false }));
    setProviderNotice('已停止页面自动等待；服务器中的任务不会被取消，可稍后点击“立即查询”。');
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
        setState((p) => ({ ...p, isGeneratingVideo: false, error: '视频任务等待超过 20 分钟，已停止自动等待。可稍后点击“立即查询”。' }));
        return;
      }
      if (pollingInFlightRef.current) return;
      pollingInFlightRef.current = true;
      void fetchTaskProgress(candidateTaskId, { showLoading: false, showNotice: false })
        .finally(() => {
          pollingInFlightRef.current = false;
        });
    };

    const firstPollId = window.setTimeout(poll, 1200);
    const timerId = window.setInterval(poll, VIDEO_POLL_INTERVAL_MS);

    return () => {
      window.clearTimeout(firstPollId);
      window.clearInterval(timerId);
    };
  }, [isAutoPollingEnabled, latestTaskId, queryTaskId, queryTaskStatus, state.videoUrl]);

  const handleShotVideoMetadataLoaded = (index: number, event: React.SyntheticEvent<HTMLVideoElement>) => {
    const duration = Number(event.currentTarget.duration);
    if (Number.isFinite(duration) && duration > 0) {
      setShotVideoDurations((prev) => ({ ...prev, [index]: duration }));
    }
    const videoWidth = Number(event.currentTarget.videoWidth);
    const videoHeight = Number(event.currentTarget.videoHeight);
    if (videoWidth > 0 && videoHeight > 0) {
      setShotVideoSizes((prev) => {
        const existing = prev[index];
        if (existing && existing.width === videoWidth && existing.height === videoHeight) return prev;
        return { ...prev, [index]: { width: videoWidth, height: videoHeight } };
      });
    }
  };

  const handleRegenerateDescription = async (index: number) => {
    if (!state.plan || !state.image) return;
    const shot = state.plan.storyboard[index];
    setLoadingDescriptions((prev) => new Set(prev).add(index));
    try {
      const result = await regenerateShotDescription(state.image, shot.stage, state.plan.audience);
      setState((p) => {
        if (!p.plan) return p;
        const newStoryboard = [...p.plan.storyboard];
        newStoryboard[index] = {
          ...newStoryboard[index],
          description: result.description,
          cameraMovement: result.cameraMovement,
          overlayText: result.overlayText,
        };
        return { ...p, plan: { ...p.plan, storyboard: newStoryboard } };
      });
    } catch (err: any) {
      setState((p) => ({ ...p, error: `场景 ${index + 1} 描述生成失败` }));
    } finally {
      setLoadingDescriptions((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

  const handleExpandDescription = async (index: number) => {
    if (!state.plan || !state.image) return;
    const shot = state.plan.storyboard[index];
    setLoadingExpansions((prev) => new Set(prev).add(index));
    try {
      const expanded = await expandShotDescriptionAI(state.image, shot.description);
      handleTextChange(index, 'description', expanded);
    } catch (err: any) {
      setState((p) => ({ ...p, error: `场景 ${index + 1} 描述扩写失败` }));
    } finally {
      setLoadingExpansions((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

  const handleTextChange = (index: number, field: keyof Shot, val: string) => {
    setState((p) => {
      if (!p.plan) return p;
      const newStoryboard = [...p.plan.storyboard];
      newStoryboard[index] = { ...newStoryboard[index], [field]: val } as Shot;
      return { ...p, plan: { ...p.plan, storyboard: newStoryboard } };
    });
  };

  const Sidebar = (
    <div className="space-y-8 pb-10">
      <div className="hidden lg:block pb-6 border-b border-slate-100">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none">
          AI 产品视频 <span className="text-indigo-600 block text-lg mt-1">Product Ad Video</span>
        </h1>
        <p className="mt-2 text-[10px] text-slate-400 font-medium leading-relaxed">
          上传产品图，AI 联想目标人群并生成可编辑的场景视频脚本。
        </p>
      </div>

      <section>
        <label className="min-h-8 text-[10px] leading-4 font-black text-slate-500 uppercase tracking-widest flex items-start mb-2 px-1">
          上传产品图
        </label>
        <label className="block group cursor-pointer">
          <div className="w-full aspect-square bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center overflow-hidden transition-all group-hover:border-indigo-400 group-hover:bg-indigo-50/30 group-hover:shadow-inner">
            {state.image ? (
              <img src={state.image} alt="已上传产品图" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 bg-white rounded-xl shadow-sm flex items-center justify-center mb-1 text-indigo-500 group-hover:scale-110 transition-transform">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="text-[9px] text-slate-400 font-bold uppercase">上传产品图</span>
              </div>
            )}
          </div>
          <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        </label>
      </section>

      <section>
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">画幅</label>
        <div className="grid grid-cols-2 gap-2">
          {(['9:16', '16:9'] as const).map((ratio) => (
            <button
              key={ratio}
              type="button"
              disabled={state.isGeneratingVideo}
              onClick={() => setState((prev) => ({ ...prev, aspectRatio: ratio, videoUrl: null }))}
              className={`py-3 text-[10px] font-black rounded-xl border transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                state.aspectRatio === ratio ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {ratio}
            </button>
          ))}
        </div>
      </section>

      <section>
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">人物模特</label>
        <div className="grid grid-cols-2 gap-2">
          {([{ value: true, label: '有模特' }, { value: false, label: '无模特' }] as const).map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => setState((p) => ({ ...p, hasModel: option.value, plan: null, videoUrl: null, scripts: [], selectedScriptIndex: null, analysis: null, analyzeError: null }))}
              className={`py-3 text-[10px] font-black rounded-xl border transition-all ${
                state.hasModel === option.value ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[9px] text-slate-400 font-medium px-1">切换后需重新生成脚本</p>
      </section>

      <section>
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">视频时长</label>
        <div className="grid grid-cols-5 gap-2">
          {[4, 5, 8, 10, 15].map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => setState((p) => ({ ...p, selectedVideoDuration: sec }))}
              className={`py-3 text-[10px] font-black rounded-xl border transition-all ${
                state.selectedVideoDuration === sec
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {sec}s
            </button>
          ))}
        </div>
        <p className="mt-2 text-[9px] text-slate-400 font-medium px-1">时长会改变脚本的画面描述节奏，生成前确定</p>
      </section>

      <section>
        <button
          onClick={handleRunAnalysis}
          disabled={!state.image || state.isAnalyzing || state.isGeneratingScripts}
          className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-40 disabled:shadow-none"
        >
          {state.isAnalyzing ? (
            <>
              <span className="animate-spin h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full" />
              AI 正在分析产品与人群...
            </>
          ) : (
            'AI 分析产品与人群'
          )}
        </button>
      </section>

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

      {state.error && (
        <div className="p-4 bg-rose-50 text-rose-600 text-[11px] font-bold rounded-2xl border border-rose-100">
          {state.error}
        </div>
      )}

      {providerNotice && (
        <div className="p-4 bg-amber-50 text-amber-700 text-[11px] font-bold rounded-2xl border border-amber-200 flex items-start justify-between gap-3 shadow-sm">
          <span>{providerNotice}</span>
          <button
            type="button"
            onClick={() => setProviderNotice(null)}
            className="shrink-0 text-amber-500 hover:text-amber-700 transition-colors"
            aria-label="关闭提示"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );

  const MainContent = (
    <div className="space-y-10 pb-24 lg:pb-20 px-2 lg:px-0">
      {!state.plan && !state.isGeneratingScripts && !state.image && (
        <div className="py-24 lg:py-40 text-center max-w-lg mx-auto">
          <div className="w-20 h-20 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-inner">
            <svg className="w-10 h-10 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">用一张产品图，生成爆款短视频</h2>
          <p className="text-sm text-slate-400 mt-4 leading-relaxed font-medium">
            上传产品图，AI 直接生成 3 个不同创意方向的完整视频脚本，选一个编辑并渲染成片。
          </p>
        </div>
      )}

      {state.isGeneratingScripts && (
        <div className="py-24 text-center">
          <span className="animate-spin h-10 w-10 border-4 border-indigo-200/40 border-t-indigo-500 rounded-full inline-block" />
          <p className="mt-6 text-sm font-black text-slate-500">AI 正在创作 3 个视频脚本…</p>
        </div>
      )}

      {state.scriptGenError && !state.isGeneratingScripts && (
        <div className="p-4 bg-rose-50 text-rose-600 text-[11px] font-bold rounded-2xl border border-rose-100">
          {state.scriptGenError}
        </div>
      )}

      {state.isAnalyzing && !state.analysis && (
        <div className="py-16 text-center">
          <span className="animate-spin h-10 w-10 border-4 border-indigo-200/40 border-t-indigo-500 rounded-full inline-block" />
          <p className="mt-6 text-sm font-black text-slate-500">AI 正在分析产品与适合人群…</p>
        </div>
      )}

      {state.analyzeError && !state.isAnalyzing && (
        <div className="p-4 bg-rose-50 text-rose-600 text-[11px] font-bold rounded-2xl border border-rose-100">
          {state.analyzeError}
        </div>
      )}

      {state.analysis && (
        <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1 bg-white/20 text-white text-[11px] font-black rounded-full">产品与人群分析</span>
            <span className="text-[11px] text-white/80 font-medium">{state.analysis.category}</span>
            {state.analysis.productName && (
              <span className="text-[11px] text-white/80 font-medium">· {state.analysis.productName}</span>
            )}
          </div>

          <div className="p-5 space-y-6">
            {/* 产品分析 */}
            <section>
              <div className="flex items-center gap-2">
                <span className="w-1 h-4 bg-indigo-500 rounded-full" />
                <h3 className="text-[13px] font-black text-slate-800">产品分析</h3>
              </div>
              {state.analysis.productAnalysis && (
                <p className="mt-2 text-[12px] leading-relaxed text-slate-600">{state.analysis.productAnalysis}</p>
              )}
              {state.analysis.highlights.length > 0 && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {state.analysis.highlights.map((h, hi) => (
                    <div key={hi} className="flex gap-2 items-start rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
                      <span className="shrink-0 text-[10px] font-black text-indigo-600 bg-indigo-100 rounded-md px-2 py-0.5 mt-0.5">{h.label}</span>
                      <span className="text-[11px] leading-relaxed text-slate-600">{h.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 适合的人群（点击任一人群卡片即为其生成 1 条专属广告脚本，并跳转到下方渲染区） */}
            <section>
              <div className="flex items-center gap-2">
                <span className="w-1 h-4 bg-violet-500 rounded-full" />
                <h3 className="text-[13px] font-black text-slate-800">适合的人群（{state.analysis.audiences.length}）</h3>
                {state.isGeneratingScripts && (
                  <span className="ml-auto text-[10px] font-black text-indigo-600 bg-indigo-50 rounded-full px-2 py-0.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                    正在为选中人群生成脚本…
                  </span>
                )}
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {state.analysis.audiences.map((a) => {
                  const isSelected =
                    state.plan?.audience?.id === a.id ||
                    (state.isGeneratingScripts && state.scriptGenError == null);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => handleSelectAudience(a)}
                      disabled={state.isGeneratingScripts}
                      className={`relative text-left rounded-2xl border p-4 space-y-2.5 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50/60 shadow-md shadow-indigo-100 ring-2 ring-indigo-200'
                          : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40 hover:shadow-md cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-black text-slate-900">{a.name}</span>
                        <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 rounded-full px-2 py-0.5 shrink-0">{a.ageRange}</span>
                      </div>
                      {a.profile && (
                        <p className="text-[11px] leading-relaxed text-slate-500"><span className="font-black text-slate-600">画像：</span>{a.profile}</p>
                      )}
                      <div className="h-px bg-slate-100" />
                      {a.painPoint && (
                        <p className="text-[11px] leading-relaxed text-slate-500"><span className="font-black text-rose-500">痛点　</span>{a.painPoint}</p>
                      )}
                      {a.sellingPoint && (
                        <p className="text-[11px] leading-relaxed text-slate-500"><span className="font-black text-emerald-600">卖点　</span>{a.sellingPoint}</p>
                      )}
                      {a.sceneDirection && (
                        <p className="text-[11px] leading-relaxed text-slate-500"><span className="font-black text-sky-600">场景　</span>{a.sceneDirection}</p>
                      )}
                      <div className="pt-1 flex items-center justify-between text-[10px] font-black">
                        <span className={isSelected ? 'text-indigo-600' : 'text-slate-400'}>
                          {isSelected ? '已选中 · 正在生成脚本' : '点击用此人群生成脚本'}
                        </span>
                        <span className={`flex items-center gap-1 ${isSelected ? 'text-indigo-600' : 'text-slate-300 group-hover:text-indigo-400'}`}>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {state.scriptGenError && (
                <p className="mt-3 px-3 py-2 bg-rose-50 text-rose-600 text-[11px] font-bold rounded-xl border border-rose-100">
                  {state.scriptGenError}
                </p>
              )}
            </section>

            <p className="text-[10px] text-slate-400 font-medium">点击上方任意一个人群卡片，即针对该人群生成 1 条专属广告脚本并跳转到下方渲染区。</p>
          </div>
        </div>
      )}

      {!state.plan && state.isGeneratingScripts && (
        <div className="rounded-3xl border border-indigo-100 bg-white p-6 flex flex-col items-center gap-3">
          <span className="animate-spin h-6 w-6 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full" />
          <p className="text-[12px] font-black text-slate-700">正在为选中的人群生成专属脚本…</p>
          <p className="text-[10px] text-slate-400">大约需要 15~25 秒</p>
        </div>
      )}

      {state.plan && (
        <div ref={renderAreaRef} className="space-y-8">
          <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6">
            <div>
              <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-widest flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                1 个场景 · 可直接编辑后生成视频
              </p>
              {state.plan.audience && (
                <p className="mt-2 text-[11px] font-black text-slate-500">
                  目标人群：{state.plan.audience.name}
                  <span className="ml-2 font-medium text-slate-400">{state.plan.audience.ageRange}</span>
                </p>
              )}
              {state.plan.videoStyle && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="px-3 py-1 bg-violet-50 text-violet-700 text-[10px] font-black rounded-full border border-violet-100">
                    无模特 · 人群偏好片型：{state.plan.videoStyle}
                  </span>
                  {state.plan.videoStyleReason && (
                    <span className="text-[10px] font-medium text-slate-500 leading-relaxed">
                      {state.plan.videoStyleReason}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-3 w-full xl:w-auto">
              <button
                onClick={handleDownloadAll}
                disabled={isBundling}
                className="flex-1 sm:flex-none px-6 py-4 bg-slate-900 hover:bg-black text-white text-[11px] font-black rounded-2xl shadow-xl shadow-slate-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95"
              >
                {isBundling ? (
                  <span className="animate-spin h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full" />
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                )}
                {isBundling ? '打包中...' : '打包导出素材'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-12">
            {state.plan.storyboard.map((shot, i) => {
              const isLoadingVid = loadingShotVideos.has(i);
              const isVertical = state.aspectRatio === '9:16';
              const isTransitionShot = i === 1 || i === 2;
              const shotDurationSeconds = parseShotDurationSeconds(shot.duration);
              const shotVideoCost = resolveActionCost('SHOT_VIDEO', shotDurationSeconds);
              const canRenderVideo = Boolean(state.image) && !isLoadingVid;
              const isApplyingEdit = applyingVideoEdits.has(i);
              const hasEditedVideo = Boolean(shotOriginalVideosRef.current[i]);
              const editPromptValue = videoEditPrompts[i] || '';
              const editTotalDuration =
                shotVideoDurations[i] && shotVideoDurations[i] > 0
                  ? shotVideoDurations[i]
                  : parseShotDurationSeconds(shot.duration);
              const editSegmentCount = planEditSegments(editTotalDuration, selectedVideoEngine);
              const editSegmentDuration = editTotalDuration / editSegmentCount;
              const editGenerationDuration = resolveGenerationDuration(
                selectedVideoEngine,
                editSegmentDuration,
              );
              const editTotalCost =
                editSegmentCount * resolveActionCost('SHOT_VIDEO', editGenerationDuration);
              const editProgressText = videoEditProgress[i] || '';

              return (
                <div key={i} className="group relative flex flex-col md:flex-row h-auto gap-0 md:gap-8 transition-all">
                  {/* Visual Editor Section */}
                  <div
                    className={`${
                      isVertical ? 'w-full md:w-[280px]' : 'w-full md:w-[480px]'
                    } bg-slate-950 relative flex items-center justify-center flex-shrink-0 rounded-[2.5rem] shadow-2xl shadow-slate-200 overflow-hidden ring-1 ring-slate-200/50 group-hover:shadow-indigo-100 transition-shadow`}
                    style={{ aspectRatio: isVertical ? '9/16' : '16/9' }}
                  >
                    <div className="w-full h-full relative">
                      {shot.videoUrl ? (
                        <video
                          src={shot.videoUrl}
                          controls
                          autoPlay
                          loop
                          className="w-full h-full object-cover"
                          onLoadedMetadata={(event) => handleShotVideoMetadataLoaded(i, event)}
                        />
                      ) : (
                        <div className="w-full h-full relative flex items-center justify-center bg-slate-900">
                          {state.image ? (
                            <img src={state.image} className="w-full h-full object-cover opacity-50" />
                          ) : null}
                          <span className="absolute text-[10px] font-black text-slate-300 uppercase tracking-widest bg-black/55 px-3 py-1.5 rounded-full">
                            首帧：产品图 · 待渲染
                          </span>
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
                          {isTransitionShot ? '正在与下一场景对齐转场路径...' : '正在模拟电影级光影流动'}
                        </p>
                      </div>
                    )}

                    {isApplyingEdit && (
                      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center text-white z-30 p-8 text-center">
                        <span className="relative block h-8 w-8 border-4 border-white/20 border-t-indigo-400 rounded-full animate-spin mb-4" />
                        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-indigo-400">
                          {editProgressText || '正在修改画面'}
                        </p>
                        <p className="text-[9px] text-white/40 italic mt-2">以原视频画面为底图重绘，改完拼回原时长并保留原声…</p>
                      </div>
                    )}

                    <div className="absolute top-6 left-6 flex flex-col gap-2 z-10 pointer-events-none">
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-black/80 text-white text-[9px] font-black rounded-full uppercase backdrop-blur-xl border border-white/10 shadow-lg">
                          场景 0{i + 1}
                        </span>
                        <input
                          type="text"
                          value={shot.stage}
                          onChange={(e) => handleTextChange(i, 'stage', e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="px-3 py-1 bg-indigo-600/90 text-white text-[9px] font-black rounded-full uppercase shadow-lg shadow-indigo-500/20 border border-white/20 outline-none w-28 pointer-events-auto focus:bg-indigo-600"
                        />
                        {shot.videoUrl && (
                          <span className="px-3 py-1 bg-emerald-500/90 text-white text-[9px] font-black rounded-full uppercase shadow-lg shadow-emerald-500/20">
                            {`时长 ${formatDuration(shotVideoDurations[i])}`}
                          </span>
                        )}
                        {shot.videoUrl && hasEditedVideo && (
                          <span className="px-3 py-1 bg-violet-500/90 text-white text-[9px] font-black rounded-full uppercase shadow-lg shadow-violet-500/20 border border-white/20">
                            已修改画面
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
                            <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block">场景导演描述</label>
                            <button
                              onClick={() => handleExpandDescription(i)}
                              disabled={loadingExpansions.has(i)}
                              className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[9px] font-black rounded-full border border-indigo-100 hover:bg-indigo-100 transition-all flex items-center gap-1 disabled:opacity-50"
                            >
                              {loadingExpansions.has(i) ? (
                                <span className="animate-spin h-2.5 w-2.5 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full" />
                              ) : (
                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11l-7-7-7 7m14 6l-7-7-7 7" />
                                </svg>
                              )}
                              AI 扩写
                            </button>
                          </div>
                          <div className="flex items-center gap-3">
                            {isTransitionShot && (
                              <div className="flex items-center gap-2 text-[9px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 shadow-sm">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                                </svg>
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
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </div>
                        <div className="relative">
                          <textarea
                            className="w-full text-[13px] text-slate-700 font-semibold bg-white border border-slate-200 rounded-3xl p-5 focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/30 resize-none outline-none leading-relaxed h-32 lg:h-28 transition-all shadow-sm group-hover:shadow-md"
                            value={shot.description}
                            onChange={(e) => handleTextChange(i, 'description', e.target.value)}
                          />
                        </div>
                      </div>

                      {shot.videoUrl && (
                        <div className="rounded-3xl border border-indigo-100 bg-indigo-50/40 p-5 space-y-4">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="w-1 h-4 bg-indigo-500 rounded-full" />
                              <h4 className="text-[12px] font-black text-slate-800">画面编辑</h4>
                              <span className="px-2 py-0.5 bg-white text-indigo-500 text-[9px] font-black rounded-full border border-indigo-100">
                                按提示词改画面内容
                              </span>
                            </div>
                            {hasEditedVideo && (
                              <button
                                onClick={() => handleResetVideoEdit(i)}
                                className="px-3 py-1.5 bg-white text-slate-500 hover:text-indigo-600 border border-slate-200 rounded-full text-[10px] font-black transition-all"
                              >
                                恢复原始视频
                              </button>
                            )}
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between px-1 flex-wrap gap-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">想把画面改成什么样？</label>
                              <span className="text-[10px] font-black text-indigo-600">
                                原视频 {editTotalDuration.toFixed(1)}s
                                {editSegmentCount > 1 ? ` · 分 ${editSegmentCount} 段重绘` : ''}
                              </span>
                            </div>
                            <textarea
                              value={editPromptValue}
                              onChange={(e) => updateVideoEditPrompt(i, e.target.value)}
                              placeholder="直接描述要改的画面内容，例如：把背景换成清晨的木质餐桌，光线更暖，产品旁多一杯热咖啡"
                              className="w-full text-[13px] text-slate-700 font-semibold bg-white border border-slate-200 rounded-3xl p-5 focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/30 resize-none outline-none leading-relaxed h-24 shadow-sm"
                            />
                          </div>

                          {videoEditErrors[i] && (
                            <p className="text-[10px] font-bold text-rose-500 px-1">{videoEditErrors[i]}</p>
                          )}

                          <div className="flex items-center gap-4 flex-wrap">
                            <button
                              onClick={() => handleApplyVideoEdit(i)}
                              disabled={isApplyingEdit || !editPromptValue.trim()}
                              className={`px-6 py-3 rounded-2xl text-[10px] font-black transition-all flex items-center gap-2 shadow-xl ${
                                isApplyingEdit || !editPromptValue.trim()
                                  ? 'bg-slate-100 text-slate-300 shadow-none'
                                  : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-200 active:scale-95'
                              }`}
                            >
                              {isApplyingEdit ? (
                                <span className="animate-spin h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full" />
                              ) : null}
                              {isApplyingEdit ? '正在修改画面…' : `应用修改（${editTotalCost}积分）`}
                            </button>
                            <p className="text-[9px] text-slate-400 font-medium italic leading-relaxed flex-1 min-w-[180px]">
                              以原视频每一段的真实画面帧为底图重绘，只改动你描述的内容，其余光影、产品、运镜与镜头结构保持原样，最后拼回原时长并沿用原声——不是从产品图重新生成一条新片。修改后可随时「恢复原始视频」。
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-3">
                        {shot.videoUrl && (
                          <button
                            onClick={() => handleDownloadVideo(shot.videoUrl!, i)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-2xl text-[10px] font-black transition-all border border-indigo-100 shadow-sm active:scale-95"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            下载视频素材
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="pt-8 flex gap-3 mt-auto">
                      <div className="w-full space-y-2">
                        {shotTaskIds[i] && (
                          <p className="text-[10px] font-black text-indigo-600 leading-relaxed px-1">
                            请记下这个任务ID，可使用这个ID在上方查询进度和下载视频。
                          </p>
                        )}
                        <div className="px-3 py-2 bg-indigo-50/70 border border-indigo-100 rounded-xl text-[10px] font-bold text-indigo-700 break-all">
                          任务ID：{shotTaskIds[i] || '-'}
                        </div>
                        <div className="px-1 text-[10px] font-black text-slate-400">
                          {hasEditedVideo ? '首帧：原视频画面' : '首帧：产品图'}
                        </div>
                        <button
                          onClick={() => handleGenerateShotVideo(i)}
                          disabled={!canRenderVideo}
                          className={`w-full py-4 px-6 rounded-2xl text-[10px] font-black transition-all flex items-center justify-center gap-3 shadow-xl ${
                            !canRenderVideo
                              ? 'bg-slate-100 text-slate-300 shadow-none'
                              : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-200 active:scale-95'
                          }`}
                        >
                          {isLoadingVid ? (
                            <span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                          ) : (
                            `${shot.videoUrl ? '重新渲染场景' : (isTransitionShot ? '渲染转场视频' : '渲染场景视频')}（${shotVideoCost}积分）`
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
}
