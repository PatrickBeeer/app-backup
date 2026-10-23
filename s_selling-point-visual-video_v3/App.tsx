
import React, { useEffect, useState } from 'react';
import { AppState, AdPlan, Shot } from './types';
import { analyzeProduct, generateVideo, generateShotImage, regenerateShotDescription, expandShotDescriptionAI, queryVideoTaskProgress, type VideoEngine } from './services/geminiService';
import { WorkbenchLayout } from './components/WorkbenchLayout';
import JSZip from 'jszip';
import { AppProps } from '../../types';
import { uploadAssetToCOSWithPresignedURL } from '../../shared_services/geminiProxyService';
import { createTaskQueueItem, recordTaskManagerObject } from '../../services/taskManagerService';

const PILOT_APP_ID = 's_selling-point-visual-video_v3';
const PILOT_APP_NAME = '卖点可视化（视频版）3.0';
const IMAGE_GEN_COST_POINTS = 10;
const SEEDANCE_VIDEO_GEN_COST_PER_SECOND = 15;
const SEEDANCE_VIDEO_COST_PER_SECOND_KEYS = [
  'seedance_video_per_second',
  'SEEDANCE_VIDEO_PER_SECOND',
  'seedance_video_cost_per_second',
] as const;
const VEO_DURATION_OPTIONS = [4, 8] as const;
const VEO_VIDEO_COST_MAP: Record<number, number> = {
  4: 30,
  8: 50,
};
const DEFAULT_VIDEO_DURATION_SECONDS = 4;
const GROK_FIXED_DURATION_SECONDS = 10;
const GROK_VIDEO_COST_POINTS = 20;
const VIDEO_MODEL_BY_ENGINE: Record<VideoEngine, string> = {
  seedance2: 'doubao-seedance-2-0-fast-260128',
  veo31: 'veo_3_1',
  grokv3: 'grok-video-3-pro',
};

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
  const selectedVideoEngine: VideoEngine = 'seedance2';
  const [seedanceDebugNotice, setSeedanceDebugNotice] = useState<string | null>(null);

  const [state, setState] = useState<AppState & { customSellingPoints: string }>({
    image: null,
    referenceVideo: null,
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
    return Math.min(15, Math.max(4, Math.round(raw)));
  };

  const formatDuration = (seconds?: number | null): string => {
    if (!Number.isFinite(seconds) || (seconds ?? 0) <= 0) {
      return '--';
    }
    const rounded = Number(seconds);
    return Number.isInteger(rounded) ? `${rounded}s` : `${rounded.toFixed(1)}s`;
  };

  const readPositiveCost = (...keys: string[]): number | null => {
    for (const key of keys) {
      const value = Number(activeCosts[key]);
      if (Number.isFinite(value) && value > 0) {
        return value;
      }
    }
    return null;
  };

  const normalizeSeedanceDurationSeconds = (videoSeconds?: number): number => {
    const seconds = Number(videoSeconds ?? DEFAULT_VIDEO_DURATION_SECONDS);
    const effectiveSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_VIDEO_DURATION_SECONDS;
    return Math.min(15, Math.max(4, Math.round(effectiveSeconds)));
  };

  const resolveSeedanceLegacyBillingTask = (videoSeconds?: number): string => {
    const normalizedDuration = normalizeSeedanceDurationSeconds(videoSeconds);
    return `seedance_video_${normalizedDuration}s`;
  };

  const resolveSeedanceVideoCost = (videoSeconds?: number): number => {
    const normalizedDuration = normalizeSeedanceDurationSeconds(videoSeconds);
    const configuredPerSecondCost = readPositiveCost(...SEEDANCE_VIDEO_COST_PER_SECOND_KEYS);
    if (configuredPerSecondCost !== null) {
      return normalizedDuration * configuredPerSecondCost;
    }

    const configuredLegacyCost = readPositiveCost(resolveSeedanceLegacyBillingTask(normalizedDuration));
    if (configuredLegacyCost !== null) {
      return configuredLegacyCost;
    }

    return normalizedDuration * SEEDANCE_VIDEO_GEN_COST_PER_SECOND;
  };

  const resolveVideoBillingTask = (videoSeconds?: number): string => {
    const seconds = Number(videoSeconds ?? DEFAULT_VIDEO_DURATION_SECONDS);
    const effectiveSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_VIDEO_DURATION_SECONDS;
    if (selectedVideoEngine === 'veo31' || selectedVideoEngine === 'grokv3') {
      const normalizedDuration = effectiveSeconds >= 8 ? 8 : 4;
      return `veo_video_${normalizedDuration}s`;
    }

    return resolveSeedanceLegacyBillingTask(effectiveSeconds);
  };

  const resolveActionCost = (actionType: string, videoSeconds?: number): number => {
    if (actionType === 'SHOT_IMAGE') {
      const configuredCost = readPositiveCost('shot_image', 'SHOT_IMAGE');
      if (configuredCost !== null) {
        return configuredCost;
      }
      return IMAGE_GEN_COST_POINTS;
    }
    if (actionType === 'SHOT_VIDEO' || actionType === 'FULL_VIDEO') {
      if (selectedVideoEngine === 'grokv3') {
        return GROK_VIDEO_COST_POINTS;
      }

      const billingTask = resolveVideoBillingTask(videoSeconds);
      const seconds = Number(videoSeconds ?? DEFAULT_VIDEO_DURATION_SECONDS);
      const effectiveSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_VIDEO_DURATION_SECONDS;
      if (selectedVideoEngine === 'veo31' || selectedVideoEngine === 'grokv3') {
        const configuredCost = readPositiveCost(billingTask);
        if (configuredCost !== null) {
          return configuredCost;
        }
        const normalizedDuration = effectiveSeconds >= 8 ? 8 : 4;
        return VEO_VIDEO_COST_MAP[normalizedDuration] || VEO_VIDEO_COST_MAP[4];
      }
      return resolveSeedanceVideoCost(effectiveSeconds);
    }
    if (actionType === 'PLAN_ANALYSIS') {
      return readPositiveCost('plan_analysis', 'PLAN_ANALYSIS') ?? 0;
    }
    return readPositiveCost(actionType) ?? 0;
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
    const amount = resolveActionCost(actionType, options?.videoSeconds);
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
  const [shotVideoDurations, setShotVideoDurations] = useState<Record<number, number>>({});
  const [shotTaskIds, setShotTaskIds] = useState<Record<number, string>>({});
  const activeSidebarTab: SidebarTab = 'storyboard';
  const [directVideoDurationSec, setDirectVideoDurationSec] = useState<number>(DEFAULT_VIDEO_DURATION_SECONDS);
  const isVeoFamilyEngine = selectedVideoEngine === 'veo31' || selectedVideoEngine === 'grokv3';
  const effectiveDirectVideoDurationSec = selectedVideoEngine === 'grokv3' ? GROK_FIXED_DURATION_SECONDS : directVideoDurationSec;
  const isReferenceVideoDisabled = isVeoFamilyEngine;
  const outputSpecOptions: Array<{ value: '9:16' | '16:9'; label: string }> = selectedVideoEngine === 'grokv3'
    ? [
        { value: '9:16', label: '720 x 1080' },
        { value: '16:9', label: '1080x720' },
      ]
    : [
        { value: '9:16', label: '竖屏 9:16' },
        { value: '16:9', label: '横屏 16:9' },
      ];

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

  const isTerminalTaskStatus = (status: string): boolean => {
    const normalized = String(status || '').trim().toLowerCase();
    return normalized === 'succeeded' || normalized === 'success' || normalized === 'completed' || normalized === 'failed' || normalized === 'error' || normalized === 'cancelled' || normalized === 'expired';
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

    setState(p => ({ ...p, error: fallbackMessage }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
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

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      const reader = new FileReader();
      reader.onloadend = () => {
        setProviderNotice(null);
        setFinalVideoDurationSec(null);
        setShotVideoDurations({});
        setShotTaskIds({});
        setState(p => ({ ...p, referenceVideo: reader.result as string, plan: null, videoUrl: null, error: null }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDirectGenerateVideo = async () => {
    if (!state.image && !state.referenceVideo) return;

    if (!ensureActionAllowed('FULL_VIDEO', { videoSeconds: effectiveDirectVideoDurationSec })) return;
    const billingTask = resolveBillingTask('FULL_VIDEO', effectiveDirectVideoDurationSec);

    setProviderNotice(null);
    setFinalVideoDurationSec(null);
    setState(p => ({ ...p, isGeneratingVideo: true, error: null }));
    try {
      const prompt = state.customSellingPoints || "High-end product commercial video. Cinematic lighting, smooth camera movement.";
      const generation = await generateVideo(
        prompt, 
        state.image || "", 
        state.aspectRatio, 
        undefined, 
        undefined, 
        state.referenceVideo || undefined,
        effectiveDirectVideoDurationSec,
        selectedVideoEngine,
        billingTask
      );
      void activePlatform.refreshCredits?.();

      if (generation.taskId) {
        setLatestTaskId(generation.taskId);
        setQueryTaskId(generation.taskId);
      }

      try {
        await persistVideoTask('完整卖点视频', generation, {
          durationSeconds: effectiveDirectVideoDurationSec,
          prompt,
        });
        activePlatform.openTaskManager?.();
      } catch (persistError) {
        reportTaskQueuePersistenceFailure('视频任务', persistError);
      }

      if (generation.videoUrl) {
        setQueryTaskStatus(generation.status);
        setFinalVideoDurationSec(null);
        setState(p => ({ ...p, videoUrl: generation.videoUrl, isGeneratingVideo: false }));
      } else {
        setProviderNotice('任务仍在进行中，稍后可使用任务ID在此页面查询进度。');
        setState(p => ({ ...p, isGeneratingVideo: false }));
      }
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

      const generation = await generateVideo(shotPrompt, state.image, state.aspectRatio, shot.previewUrl, lastFrameImage, undefined, duration, selectedVideoEngine, billingTask);
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
        activePlatform.openTaskManager?.();
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
      const pendingGenerations: Array<Promise<unknown>> = [];
      for (let i = 0; i < state.plan.storyboard.length; i++) {
        pendingGenerations.push(generateSingleShotImage(i));
      }
      await Promise.allSettled(pendingGenerations);
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
      setQueryTaskStatus(result.status || 'unknown');
      setLatestTaskId(result.taskId);
      setQueryTaskId(result.taskId);

      if (result.videoUrl) {
        setFinalVideoDurationSec(null);
        setState(p => ({ ...p, videoUrl: result.videoUrl, error: null }));
        if (showNotice) {
          setProviderNotice('任务已完成，视频已加载。');
        }
      } else {
        if (showNotice) {
          setProviderNotice('任务仍在进行中，稍后可使用任务ID在此页面查询进度。');
        }
      }
    } catch (err: any) {
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

    const timerId = window.setTimeout(() => {
      void fetchTaskProgress(candidateTaskId, { showLoading: false, showNotice: false });
    }, 8000);

    return () => window.clearTimeout(timerId);
  }, [isAutoPollingEnabled, latestTaskId, queryTaskId, queryTaskStatus, state.videoUrl]);

  const handleDownloadImage = async (url: string, index: number) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`failed to fetch image: ${response.status}`);
      }

      const sourceBlob = await response.blob();
      const pngBlob = await new Promise<Blob>((resolve, reject) => {
        if (sourceBlob.type === 'image/png') {
          resolve(sourceBlob);
          return;
        }

        const objectUrl = URL.createObjectURL(sourceBlob);
        const image = new Image();
        image.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth || image.width;
          canvas.height = image.naturalHeight || image.height;
          const context = canvas.getContext('2d');
          if (!context) {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('failed to create image canvas'));
            return;
          }
          context.drawImage(image, 0, 0);
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(objectUrl);
            if (!blob) {
              reject(new Error('failed to export png image'));
              return;
            }
            resolve(blob);
          }, 'image/png');
        };
        image.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('failed to decode image blob'));
        };
        image.src = objectUrl;
      });

      const downloadUrl = URL.createObjectURL(pngBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `广告分镜画面-${index + 1}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('failed to download storyboard image', error);
      setState((prev) => ({ ...prev, error: `分镜 ${index + 1} 原图下载失败` }));
    }
  };

  const handleFinalVideoMetadataLoaded = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const duration = Number(event.currentTarget.duration);
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

  const Sidebar = (
    <div className="space-y-8 pb-10">
      <div className="hidden lg:block pb-6 border-b border-slate-100">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none">卖点可视化 <span className="text-indigo-600 block text-lg mt-1">工作台</span></h1>
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-3">Advanced AI Commercial Engine</p>
      </div>

      <div className="space-y-6">
        <section>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">产品图</label>
              <label className="block group cursor-pointer">
                <div className="aspect-square bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center overflow-hidden transition-all group-hover:border-indigo-400 group-hover:bg-indigo-50/30 group-hover:shadow-inner">
                  {state.image ? (
                    <img src={state.image} className="w-full h-full object-contain" />
                  ) : (
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 bg-white rounded-xl shadow-sm flex items-center justify-center mb-1 text-indigo-500 group-hover:scale-110 transition-transform">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      </div>
                      <span className="text-[9px] text-slate-400 font-bold uppercase">上传图</span>
                    </div>
                  )}
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
            </div>

            {activeSidebarTab === 'selling_video' && (
              <div className="flex-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">
                  参考视频 (15s内)
                  {isReferenceVideoDisabled && <span className="ml-2 text-[9px] text-slate-400">当前引擎暂不支持</span>}
                </label>
                <label className={`block group ${isReferenceVideoDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                  <div className={`aspect-square border-2 border-dashed rounded-3xl flex flex-col items-center justify-center overflow-hidden transition-all ${isReferenceVideoDisabled ? 'bg-slate-100 border-slate-200 opacity-60' : 'bg-slate-50 border-slate-200 group-hover:border-indigo-400 group-hover:bg-indigo-50/30 group-hover:shadow-inner'}`}>
                    {state.referenceVideo ? (
                      <div className="w-full h-full bg-slate-900 flex items-center justify-center">
                        <svg className="w-8 h-8 text-white/50" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm11 3.5l-3.5 2V7.5l3.5 2z" /></svg>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <div className={`w-8 h-8 bg-white rounded-xl shadow-sm flex items-center justify-center mb-1 transition-transform ${isReferenceVideoDisabled ? 'text-slate-300' : 'text-emerald-500 group-hover:scale-110'}`}>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        </div>
                        <span className="text-[9px] text-slate-400 font-bold uppercase">{isReferenceVideoDisabled ? '当前模型不可用' : '上传视频'}</span>
                      </div>
                    )}
                  </div>
                  <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} disabled={isReferenceVideoDisabled} />
                </label>
              </div>
            )}
          </div>
        </section>

        <section>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">导演指令 / 视频卖点</label>
          <textarea
            className="w-full text-xs text-slate-800 font-medium bg-slate-50 border border-slate-200 rounded-2xl p-4 focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500/50 resize-none outline-none leading-relaxed h-24 transition-all placeholder:text-slate-300 shadow-sm"
            placeholder="描述您想要的视频场景或卖点..."
            value={state.customSellingPoints}
            onChange={(e) => setState(p => ({ ...p, customSellingPoints: e.target.value }))}
          />
        </section>

        <section>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">输出规格</label>
          <div className="flex gap-2">
            {outputSpecOptions.map((option) => (
              <button key={option.value} onClick={() => setState(p => ({ ...p, aspectRatio: option.value, plan: null, videoUrl: null }))} className={`flex-1 py-4 text-[10px] font-black rounded-2xl border transition-all ${state.aspectRatio === option.value ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100 translate-y-[-1px]' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                {option.label}
              </button>
            ))}
          </div>
        </section>

        {activeSidebarTab === 'selling_video' && (
          <section>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">
              视频时长: {effectiveDirectVideoDurationSec}s
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
                min={4}
                max={15}
                step={1}
                value={directVideoDurationSec}
                onChange={(e) => setDirectVideoDurationSec(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            )}
            <p className="mt-2 text-[11px] font-bold text-slate-500 px-1">
              预计消耗：{resolveActionCost('FULL_VIDEO', effectiveDirectVideoDurationSec)} 积分
            </p>
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
                onClick={handleDirectGenerateVideo}
                disabled={(!state.image && !state.referenceVideo) || state.isGeneratingVideo}
                className="w-full py-5 bg-indigo-600 text-white rounded-3xl font-black text-sm shadow-xl shadow-indigo-200 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-300 disabled:shadow-none transition-all active:scale-[0.98] flex items-center justify-center gap-2 overflow-hidden relative"
              >
                {state.isGeneratingVideo && (
                  <span className="absolute inset-0 bg-indigo-500/50 animate-pulse" />
                )}
                {state.isGeneratingVideo ? (
                  <><span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />视频生成中...</>
                ) : `直接生成完整视频（${resolveActionCost('FULL_VIDEO', effectiveDirectVideoDurationSec)}积分）`}
              </button>
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
      {state.videoUrl && (
        <div className="animate-in fade-in zoom-in duration-500 max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-3 h-8 bg-emerald-500 rounded-full shadow-lg shadow-emerald-200" />
            <h2 className="text-xl font-black text-slate-900 tracking-tight">生成结果预览</h2>
            <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-black rounded-full border border-emerald-100">
              时长：{finalVideoDurationSec ? formatDuration(finalVideoDurationSec) : '读取中...'}
            </span>
          </div>
          <div 
            className={`w-full bg-slate-950 rounded-[2.5rem] shadow-2xl overflow-hidden ring-1 ring-slate-800 flex items-center justify-center`}
            style={{ aspectRatio: state.aspectRatio === '9:16' ? '9/16' : '16/9', maxHeight: '70vh' }}
          >
            <video src={state.videoUrl} controls autoPlay loop className="h-full object-contain" onLoadedMetadata={handleFinalVideoMetadataLoaded} />
          </div>
          <div className="mt-6 flex justify-center">
             <button 
                onClick={() => { 
                  const a = document.createElement('a'); 
                  a.href = state.videoUrl!; 
                  a.download = `广告视频_${Date.now()}.mp4`; 
                  a.click(); 
                }}
                className="px-10 py-5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-3xl shadow-xl shadow-emerald-100 transition-all active:scale-95 flex items-center gap-2"
             >
               <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
               下载最终视频
             </button>
          </div>
          <div className="h-20" /> {/* Spacer */}
        </div>
      )}

      {!state.plan && !state.isAnalyzing && !state.videoUrl && (
        <div className="py-24 lg:py-40 text-center max-w-lg mx-auto">
          <div className="w-20 h-20 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-inner">
            <svg className="w-10 h-10 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">准备好打造爆款视频了吗？</h2>
          <p className="text-sm text-slate-400 mt-4 leading-relaxed font-medium">
             上传您的产品原图或参考视频，AI 将为您生成极具冲击力的视觉作品。
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

                    {shot.previewUrl && (
                      <div className="absolute bottom-6 right-6 z-10">
                        <button
                          onClick={() => void handleDownloadImage(shot.previewUrl!, i)}
                          className="flex items-center gap-2 px-4 py-2 bg-white/95 hover:bg-white text-slate-700 rounded-2xl text-[10px] font-black transition-all border border-white/60 shadow-lg backdrop-blur-xl active:scale-95"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          下载分镜原图
                        </button>
                      </div>
                    )}
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
