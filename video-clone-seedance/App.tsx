import React, { useEffect, useRef, useState } from 'react';
import {
  CPRT_MODEL_OPTIONS,
  CPRT_RATIO_OPTIONS,
  videoCloneBffService,
} from './services/videoCloneBffService';
import { WorkbenchLayout } from './components/WorkbenchLayout';
import { uploadAsset } from './services/assetUploadService';
import { createTaskQueueItem } from './services/taskQueueService';
import {
  DEFAULT_CPRT_MODEL,
  DEFAULT_CPRT_RESOLUTION,
  MAX_PROMPT_LENGTH,
  MAX_REFERENCE_AUDIOS,
  MAX_REFERENCE_IMAGES,
} from './shared/cprtContract';
import type { AppProps } from './types';
import { calculateVideoPointCost } from './shared/pricing';

const PILOT_APP_ID = 'video-clone-seedance';
const PILOT_APP_NAME = 'Seedance视频复刻';
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024; // CPRT：每个参考视频 50 MB
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 应用侧限制每张参考图片 10 MB（CPRT 上限 30 MB）
const MAX_AUDIO_SIZE_BYTES = 15 * 1024 * 1024; // CPRT：每段参考音频 15 MB
const MAX_TOTAL_AUDIO_SECONDS = 15; // CPRT：所有参考音频总时长 ≤ 15s
const AUDIO_FILE_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.wma'];
const AUTO_POLL_INTERVAL_MS = 3000;
const DEFAULT_VIDEO_DURATION_SECONDS = 4;
const DEFAULT_REFERENCE_VIDEO_URL = 'https://unityshop-public-1342713514.cos.ap-guangzhou.myqcloud.com/unityshop_samples/video_clone/%E9%A3%9E%E4%B9%A620260827-115528.mp4';
const DEFAULT_REFERENCE_IMAGE_URL = 'https://unityshop-public-1342713514.cos.ap-guangzhou.myqcloud.com/unityshop_samples/video_clone/20260827-115600.jpg';
const DEFAULT_CLONE_PROMPT = '将参考视频中的人物替换成参考图片中的人物。场景、光线、人物动作、表情、眼神、拿着的物品与参考视频一致；人物长相、服饰穿着、体型与参考图片一致；人物相貌必须与参考图片高度一致。';

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

type ReferenceImage = {
  id: string;
  previewUrl: string;
  remoteUrl: string | null;
  uploading: boolean;
};

type ReferenceAudio = {
  id: string;
  fileName: string;
  previewUrl: string;
  remoteUrl: string | null;
  durationSeconds: number | null;
  uploading: boolean;
};

function isAudioFile(file: File): boolean {
  return file.type.startsWith('audio/') || AUDIO_FILE_EXTENSIONS.includes(getFileExtension(file.name));
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

function formatTaskName(label: string): string {
  const trimmedLabel = String(label || '').trim();
  if (!trimmedLabel) {
    return PILOT_APP_NAME;
  }
  return `${PILOT_APP_NAME} - ${trimmedLabel}`;
}

function isRemoteHttpUrl(assetUrl: string): boolean {
  return /^https?:\/\//i.test(String(assetUrl || '').trim());
}

function resolveUploadedAssetUrl(upload: AssetUrlCandidate | null | undefined): string {
  return String(upload?.url || '').trim()
    || String(upload?.signed_url || '').trim()
    || String(upload?.public_url || '').trim();
}

function getFileExtension(fileName: string): string {
  const match = String(fileName || '').match(/\.[a-zA-Z0-9]+$/);
  return match ? match[0].toLowerCase() : '';
}

function formatDuration(seconds?: number | null): string {
  if (!Number.isFinite(seconds) || (seconds ?? 0) <= 0) {
    return '--';
  }
  const rounded = Number(seconds);
  return Number.isInteger(rounded) ? `${rounded}s` : `${rounded.toFixed(1)}s`;
}

function normalizeTaskQueueStatus(status: string, hasVideo: boolean): 'queued' | 'running' | 'finished' | 'failed' {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'completed' && hasVideo) {
    return 'finished';
  }
  if (normalized === 'failed') {
    return 'failed';
  }
  if (normalized === 'queued') {
    return 'queued';
  }
  return 'running';
}

function formatTaskStatus(status?: string): string {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'queued') return '已提交，排队中';
  if (normalized === 'running') return '视频生成中';
  if (normalized === 'completed') return '已完成';
  if (normalized === 'failed') return '生成失败';
  return status ? `状态：${status}` : '等待状态';
}

function isRealPersonModeRejection(message: string): boolean {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('realpersonmode') || normalized.includes('真人素材') || normalized.includes('real-person');
}

function toFriendlyErrorMessage(message: string): string {
  if (isRealPersonModeRejection(message)) {
    return '当前模式不支持真人素材：参考视频/图片中包含真人时，请开启「真人模式」后重新生成。';
  }
  return message;
}

const RATIO_LABELS: Record<string, string> = {
  adaptive: '自适应',
  '16:9': '16:9',
  '4:3': '4:3',
  '1:1': '1:1',
  '3:4': '3:4',
  '9:16': '9:16',
  '21:9': '21:9',
};

// 分区说明文字：仅当鼠标悬停在标题行的 ⓘ 图标上时以气泡形式短暂显示。
function InfoHint({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex items-center ml-1 cursor-help">
      <svg className="w-3 h-3 text-slate-300 transition-colors group-hover:text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      <span className="pointer-events-none absolute left-1/2 bottom-full z-50 mb-1.5 -translate-x-1/2 w-max max-w-[240px] rounded-xl bg-slate-900 px-3 py-2 text-[9px] font-bold leading-relaxed text-white opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 whitespace-normal">
        {text}
      </span>
    </span>
  );
}

const App: React.FC<Partial<AppProps>> = ({ platform }) => {
  const activePlatform = platform ?? defaultPlatform;

  // 参考视频
  const [referenceVideo, setReferenceVideo] = useState<string | null>(null);
  const uploadedReferenceVideoRef = useRef<UploadedAssetInfo | null>(null);
  const ownedPreviewUrlsRef = useRef<Set<string>>(new Set());
  const [isUploadingReferenceVideo, setIsUploadingReferenceVideo] = useState(false);
  const [referenceUploadDots, setReferenceUploadDots] = useState(1);

  // 参考图片（1-3 张）
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);

  // 参考音频（0-3 段，可选）
  const [referenceAudios, setReferenceAudios] = useState<ReferenceAudio[]>([]);
  const [isUploadingAudios, setIsUploadingAudios] = useState(false);

  // 提示词与生成参数
  const [prompt, setPrompt] = useState<string>(DEFAULT_CLONE_PROMPT);
  const [model, setModel] = useState<string>(DEFAULT_CPRT_MODEL);
  const [resolution, setResolution] = useState<string>(DEFAULT_CPRT_RESOLUTION);
  const [ratio, setRatio] = useState<string>('adaptive');
  const [durationSeconds, setDurationSeconds] = useState<number>(DEFAULT_VIDEO_DURATION_SECONDS);
  const [realPersonMode, setRealPersonMode] = useState<boolean>(true);

  // 结果与任务
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerNotice, setProviderNotice] = useState<string | null>(null);
  const [latestTaskId, setLatestTaskId] = useState('');
  const [queryTaskId, setQueryTaskId] = useState('');
  const [isQueryingTask, setIsQueryingTask] = useState(false);
  const [queryTaskStatus, setQueryTaskStatus] = useState('');
  const autoPollTimerRef = useRef<number | null>(null);
  const autoPollingEnabledRef = useRef(true);
  const consecutivePollFailuresRef = useRef(0);

  // 播放器
  const referenceVideoPlayerRef = useRef<HTMLVideoElement | null>(null);
  const resultVideoPlayerRef = useRef<HTMLVideoElement | null>(null);
  const isSyncingVideoPlaybackRef = useRef(false);
  const [referenceVideoAspectRatio, setReferenceVideoAspectRatio] = useState<number | null>(null);
  const [resultVideoAspectRatio, setResultVideoAspectRatio] = useState<number | null>(null);
  const [finalVideoDurationSec, setFinalVideoDurationSec] = useState<number | null>(null);

  const modelOptions = CPRT_MODEL_OPTIONS;
  const activeModel = modelOptions.find((item) => item.key === model) || modelOptions[0];
  const resolutionOptions = activeModel.resolutions;
  const effectiveResolution = resolutionOptions.includes(resolution) ? resolution : resolutionOptions[0];
  const generationPointCost = calculateVideoPointCost(model, effectiveResolution, durationSeconds);
  const hasGenerationInput = Boolean(referenceVideo) && referenceImages.length > 0;
  const isGenerationDisabled = !hasGenerationInput
    || isGeneratingVideo
    || isUploadingImages
    || isUploadingReferenceVideo
    || isUploadingAudios
    || referenceImages.some((item) => !item.remoteUrl)
    || referenceAudios.some((item) => !item.remoteUrl);

  const clearAutoPollTimer = () => {
    if (autoPollTimerRef.current !== null) {
      window.clearTimeout(autoPollTimerRef.current);
      autoPollTimerRef.current = null;
    }
  };

  const createOwnedPreviewUrl = (file: Blob): string => {
    const previewUrl = URL.createObjectURL(file);
    ownedPreviewUrlsRef.current.add(previewUrl);
    return previewUrl;
  };

  const releaseOwnedPreviewUrl = (previewUrl: string | null | undefined): void => {
    const normalized = String(previewUrl || '').trim();
    if (normalized && ownedPreviewUrlsRef.current.delete(normalized)) {
      URL.revokeObjectURL(normalized);
    }
  };

  const scheduleAutoPoll = (taskId: string, delayMs = AUTO_POLL_INTERVAL_MS) => {
    clearAutoPollTimer();
    if (!autoPollingEnabledRef.current || videoUrl) {
      return;
    }
    const trimmedTaskId = String(taskId || '').trim();
    if (!trimmedTaskId) {
      return;
    }
    autoPollTimerRef.current = window.setTimeout(() => {
      void fetchTaskProgress(trimmedTaskId, { showLoading: false, showNotice: false });
    }, delayMs);
  };

  const fetchTaskProgress = async (
    taskId: string,
    options: { showLoading?: boolean; showNotice?: boolean } = {}
  ) => {
    const { showLoading = true, showNotice = true } = options;
    const trimmedTaskId = taskId.trim();
    if (!trimmedTaskId) {
      setError('请输入任务ID。');
      return;
    }

    if (showNotice) {
      setProviderNotice(null);
    }
    if (showLoading) {
      setIsQueryingTask(true);
    }
    try {
      const result = await videoCloneBffService.getCloneJob(trimmedTaskId);
      consecutivePollFailuresRef.current = 0;
      setQueryTaskStatus(result.status || 'unknown');
      // Keep the public task ID returned by task creation. CPRT's query body can
      // contain a different internal numeric taskId that cannot be queried.
      setLatestTaskId(trimmedTaskId);
      setQueryTaskId(trimmedTaskId);

      if (result.status === 'completed' && result.videoUrl) {
        clearAutoPollTimer();
        setFinalVideoDurationSec(null);
        setVideoUrl(result.videoUrl);
        setError(null);
        setIsGeneratingVideo(false);
        if (showNotice) {
          setProviderNotice('视频生成完成，正在加载...');
        }
      } else if (result.status === 'failed') {
        clearAutoPollTimer();
        const message = toFriendlyErrorMessage(String(result.errorMessage || '生成失败。'));
        setError(message);
        setIsGeneratingVideo(false);
        if (showNotice) {
          setProviderNotice(`任务失败：${message}`);
        }
      } else {
        if (showNotice) {
          setProviderNotice('任务仍在运行中，请稍候...');
        }
        scheduleAutoPoll(trimmedTaskId);
      }
    } catch (err: any) {
      const errMessage = String(err?.message || '查询任务失败');
      consecutivePollFailuresRef.current += 1;
      if (showNotice) {
        setError(`查询任务暂时失败: ${errMessage}`);
      }
      if (autoPollingEnabledRef.current) {
        const retryDelay = Math.min(
          30_000,
          AUTO_POLL_INTERVAL_MS * (2 ** Math.min(consecutivePollFailuresRef.current, 3)),
        );
        scheduleAutoPoll(trimmedTaskId, retryDelay);
      }
    } finally {
      if (showLoading) {
        setIsQueryingTask(false);
      }
    }
  };

  const persistVideoTask = async (
    generation: { taskId: string; status: string; videoUrl: string | null; pointCost: number },
  ) => {
    const taskName = formatTaskName('复刻视频');
    try {
      await createTaskQueueItem({
        source_app_id: PILOT_APP_ID,
        item_type: 'video_task',
        status: normalizeTaskQueueStatus(generation.status, Boolean(generation.videoUrl)),
        payload: {
          title: taskName,
          name: taskName,
          task_id: generation.taskId,
          taskId: generation.taskId,
          query_status: generation.status,
          model,
          video_url: generation.videoUrl,
          videoUrl: generation.videoUrl,
          resolution: effectiveResolution,
          ratio,
          duration_seconds: durationSeconds,
          real_person_mode: realPersonMode,
          audio_count: referenceAudios.length,
          prompt,
          point_cost: generation.pointCost,
        },
      });
    } catch (persistError) {
      console.error(`[${PILOT_APP_ID}] task persistence failed`, persistError);
      setProviderNotice('任务已提交，但写入任务面板失败。');
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    const extension = getFileExtension(file.name);
    if (extension !== '.mp4' && extension !== '.mov') {
      setError('请上传 `.mp4` 或 `.mov` 格式的参考视频。');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      setError(`参考视频文件大小需小于 ${MAX_VIDEO_SIZE_BYTES / 1024 / 1024}MB。`);
      e.target.value = '';
      return;
    }

    uploadedReferenceVideoRef.current = null;
    setIsUploadingReferenceVideo(true);
    setProviderNotice('正在上传并校验参考视频...');
    setError(null);

    try {
      const uploadedReference = await uploadAsset(file, {
        fileName: file.name || `reference-video-${Date.now()}${extension || '.mp4'}`,
        objectPath: `standalone/${PILOT_APP_ID}/reference_videos`,
      });

      const uploadedReferenceUrl = resolveUploadedAssetUrl(uploadedReference);
      if (!uploadedReferenceUrl) {
        throw new Error('参考视频上传后未返回可访问地址。');
      }

      const inspection = await videoCloneBffService.inspectReferenceVideo(uploadedReferenceUrl);
      const inspectedDuration = Number(inspection.durationSeconds ?? 0);
      if (Number.isFinite(inspectedDuration) && inspectedDuration > 0 && (inspectedDuration < 2 || inspectedDuration > 15)) {
        throw new Error('参考视频时长需在 2-15 秒之间。');
      }

      uploadedReferenceVideoRef.current = {
        url: uploadedReferenceUrl,
        mimeType: file.type || (extension === '.mov' ? 'video/quicktime' : 'video/mp4'),
        sizeBytes: file.size,
        fileName: file.name || `reference${extension || '.mp4'}`,
      };
      const previewUrl = createOwnedPreviewUrl(file);
      setReferenceVideo((previous) => {
        releaseOwnedPreviewUrl(previous);
        return previewUrl;
      });

      if (Number.isFinite(inspectedDuration) && inspectedDuration > 0) {
        setDurationSeconds(Math.max(4, Math.min(15, Math.round(inspectedDuration))));
      }
      setVideoUrl(null);
      setProviderNotice('参考视频校验通过。');
    } catch (err: any) {
      uploadedReferenceVideoRef.current = null;
      setProviderNotice(null);
      setError(err instanceof Error ? err.message : '参考视频上传或校验失败。');
      e.target.value = '';
    } finally {
      setIsUploadingReferenceVideo(false);
    }
  };

  const uploadReferenceImage = async (imageId: string, file: File): Promise<void> => {
    setReferenceImages((prev) => prev.map((item) => (item.id === imageId ? { ...item, uploading: true } : item)));
    try {
      const uploaded = await uploadAsset(file, {
        fileName: file.name || `reference-image-${Date.now()}.png`,
        objectPath: `standalone/${PILOT_APP_ID}/reference_images`,
      });
      const remoteUrl = resolveUploadedAssetUrl(uploaded);
      if (!remoteUrl) {
        throw new Error('参考图片上传后未返回可访问地址。');
      }
      setReferenceImages((prev) => prev.map((item) => (item.id === imageId ? { ...item, remoteUrl, uploading: false } : item)));
    } catch (err: any) {
      setReferenceImages((prev) => {
        const failedImage = prev.find((item) => item.id === imageId);
        releaseOwnedPreviewUrl(failedImage?.previewUrl);
        return prev.filter((item) => item.id !== imageId);
      });
      setError(err instanceof Error ? err.message : '参考图片上传失败。');
    }
  };

  const handleReferenceImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    e.target.value = '';
    if (!files.length) {
      return;
    }

    const remaining = MAX_REFERENCE_IMAGES - referenceImages.length;
    if (remaining <= 0) {
      setProviderNotice(`参考图片最多 ${MAX_REFERENCE_IMAGES} 张。`);
      return;
    }

    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length !== files.length) {
      setProviderNotice('已忽略非图片文件。');
    }
    const oversized = imageFiles.filter((file) => file.size > MAX_IMAGE_SIZE_BYTES);
    if (oversized.length) {
      setProviderNotice(`参考图片每张需小于 ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB。`);
    }

    const validFiles = imageFiles
      .filter((file) => file.size <= MAX_IMAGE_SIZE_BYTES)
      .slice(0, remaining);
    const additions: ReferenceImage[] = validFiles.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        previewUrl: createOwnedPreviewUrl(file),
        remoteUrl: null,
        uploading: false,
      }));

    if (!additions.length) {
      return;
    }

    setReferenceImages((prev) => [...prev, ...additions]);
    setVideoUrl(null);
    setProviderNotice(`正在上传 ${additions.length} 张参考图片...`);
    setIsUploadingImages(true);

    await Promise.all(additions.map((addition, index) => uploadReferenceImage(addition.id, validFiles[index])));

    setIsUploadingImages(false);
    setProviderNotice(null);
  };

  const removeReferenceImage = (imageId: string) => {
    setReferenceImages((prev) => {
      const removedImage = prev.find((item) => item.id === imageId);
      releaseOwnedPreviewUrl(removedImage?.previewUrl);
      return prev.filter((item) => item.id !== imageId);
    });
    setVideoUrl(null);
  };

  const uploadReferenceAudio = async (audioId: string, file: File): Promise<void> => {
    setReferenceAudios((prev) => prev.map((item) => (item.id === audioId ? { ...item, uploading: true } : item)));
    try {
      const uploaded = await uploadAsset(file, {
        fileName: file.name || `reference-audio-${Date.now()}.mp3`,
        objectPath: `standalone/${PILOT_APP_ID}/reference_audios`,
      });
      const remoteUrl = resolveUploadedAssetUrl(uploaded);
      if (!remoteUrl) {
        throw new Error('参考音频上传后未返回可访问地址。');
      }

      // CPRT：单段参考音频时长需在 2-15 秒之间。
      const inspection = await videoCloneBffService.inspectReferenceAudio(remoteUrl);
      const durationSeconds = Number(inspection.durationSeconds ?? 0);
      if (Number.isFinite(durationSeconds) && durationSeconds > 0 && (durationSeconds < 2 || durationSeconds > 15)) {
        throw new Error('参考音频时长需在 2-15 秒之间。');
      }

      setReferenceAudios((prev) => prev.map((item) => (item.id === audioId ? {
        ...item,
        remoteUrl,
        durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null,
        uploading: false,
      } : item)));
    } catch (err: any) {
      setReferenceAudios((prev) => {
        const failedAudio = prev.find((item) => item.id === audioId);
        releaseOwnedPreviewUrl(failedAudio?.previewUrl);
        return prev.filter((item) => item.id !== audioId);
      });
      setError(err instanceof Error ? err.message : '参考音频上传或校验失败。');
    }
  };

  const handleReferenceAudiosUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    e.target.value = '';
    if (!files.length) {
      return;
    }

    const remaining = MAX_REFERENCE_AUDIOS - referenceAudios.length;
    if (remaining <= 0) {
      setProviderNotice(`参考音频最多 ${MAX_REFERENCE_AUDIOS} 段。`);
      return;
    }

    const audioFiles = files.filter(isAudioFile);
    if (audioFiles.length !== files.length) {
      setProviderNotice('已忽略非音频文件。');
    }
    const oversized = audioFiles.filter((file) => file.size > MAX_AUDIO_SIZE_BYTES);
    if (oversized.length) {
      setProviderNotice(`参考音频每段需小于 ${MAX_AUDIO_SIZE_BYTES / 1024 / 1024}MB。`);
    }

    const validFiles = audioFiles
      .filter((file) => file.size <= MAX_AUDIO_SIZE_BYTES)
      .slice(0, remaining);
    const additions: ReferenceAudio[] = validFiles.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fileName: file.name || 'reference-audio',
      previewUrl: createOwnedPreviewUrl(file),
      remoteUrl: null,
      durationSeconds: null,
      uploading: false,
    }));

    if (!additions.length) {
      return;
    }

    setReferenceAudios((prev) => [...prev, ...additions]);
    setVideoUrl(null);
    setProviderNotice(`正在上传 ${additions.length} 段参考音频...`);
    setIsUploadingAudios(true);

    await Promise.all(additions.map((addition, index) => uploadReferenceAudio(addition.id, validFiles[index])));

    setIsUploadingAudios(false);
    setProviderNotice(null);
  };

  const removeReferenceAudio = (audioId: string) => {
    setReferenceAudios((prev) => {
      const removedAudio = prev.find((item) => item.id === audioId);
      releaseOwnedPreviewUrl(removedAudio?.previewUrl);
      return prev.filter((item) => item.id !== audioId);
    });
    setVideoUrl(null);
  };

  const handleModelChange = (nextModel: string) => {
    setModel(nextModel);
    const nextModelOption = CPRT_MODEL_OPTIONS.find((item) => item.key === nextModel);
    if (nextModelOption && !nextModelOption.resolutions.includes(resolution)) {
      setResolution(nextModelOption.resolutions[0]);
    }
  };

  const handleGenerate = async () => {
    if (!referenceVideo) {
      setProviderNotice('请先上传参考视频。');
      return;
    }
    if (referenceImages.length === 0) {
      setProviderNotice('请至少上传 1 张参考图片。');
      return;
    }
    if (referenceImages.some((item) => !item.remoteUrl)) {
      setProviderNotice('参考图片仍在上传中，请稍候。');
      return;
    }
    if (referenceAudios.some((item) => !item.remoteUrl)) {
      setProviderNotice('参考音频仍在上传中，请稍候。');
      return;
    }
    const totalAudioSeconds = referenceAudios.reduce(
      (total, item) => total + (Number.isFinite(item.durationSeconds) ? Number(item.durationSeconds) : 0),
      0,
    );
    if (totalAudioSeconds > MAX_TOTAL_AUDIO_SECONDS) {
      setProviderNotice(`参考音频总时长不能超过 ${MAX_TOTAL_AUDIO_SECONDS} 秒（当前约 ${totalAudioSeconds.toFixed(1)} 秒），请移除部分音频。`);
      return;
    }
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setProviderNotice('请填写提示词。');
      return;
    }
    if (trimmedPrompt.length > MAX_PROMPT_LENGTH) {
      setProviderNotice(`提示词不能超过 ${MAX_PROMPT_LENGTH} 个字符。`);
      return;
    }

    const effectiveReferenceVideoUrl = uploadedReferenceVideoRef.current?.url
      || (isRemoteHttpUrl(referenceVideo) ? String(referenceVideo).trim() : '');
    if (!effectiveReferenceVideoUrl) {
      setError('参考视频上传状态异常，请重新上传参考视频后再试。');
      return;
    }

    setProviderNotice(null);
    setError(null);
    setVideoUrl(null);
    setIsGeneratingVideo(true);
    try {
      const generation = await videoCloneBffService.startCloneJob({
        referenceVideoUrl: effectiveReferenceVideoUrl,
        imageUrls: referenceImages.map((item) => String(item.remoteUrl)),
        audioUrls: referenceAudios.map((item) => String(item.remoteUrl)),
        prompt: trimmedPrompt,
        model,
        resolution: effectiveResolution,
        durationSeconds,
        ratio,
        realPersonMode,
      });

      setLatestTaskId(generation.taskId);
      setQueryTaskId(generation.taskId);
      setQueryTaskStatus(generation.status || 'queued');
      autoPollingEnabledRef.current = true;
      consecutivePollFailuresRef.current = 0;
      scheduleAutoPoll(generation.taskId);

      await persistVideoTask({
        taskId: generation.taskId,
        status: generation.status,
        videoUrl: null,
        pointCost: generation.pointCost,
      });
      await activePlatform.refreshCredits?.();
      activePlatform.openTaskManager?.();

      setProviderNotice('任务已提交，系统会自动轮询任务进度。');
    } catch (err: any) {
      setIsGeneratingVideo(false);
      const errMessage = toFriendlyErrorMessage(String(err?.message || '未知错误'));
      if (/insufficient credits|点数不足/i.test(errMessage)) {
        activePlatform.showRecharge?.();
      }
      setError(`视频生成失败: ${errMessage}`);
      setProviderNotice(`视频生成失败：${errMessage}`);
    }
  };

  const handleQueryTaskProgress = async () => {
    await fetchTaskProgress(queryTaskId, { showLoading: true, showNotice: true });
  };

  const handleStopWaiting = () => {
    clearAutoPollTimer();
    autoPollingEnabledRef.current = false;
    setProviderNotice('已停止自动等待。你仍然可以手动查询任务进度。');
  };

  const handleReferenceVideoMetadataLoaded = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const width = Number(event.currentTarget.videoWidth);
    const height = Number(event.currentTarget.videoHeight);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      setReferenceVideoAspectRatio(width / height);
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
    const referenceVideoElement = referenceVideoPlayerRef.current;
    const resultVideoElement = resultVideoPlayerRef.current;
    if (!referenceVideoElement || !resultVideoElement) {
      return;
    }

    referenceVideoElement.muted = true;
    resultVideoElement.muted = true;
    syncVideoPlayers(resultVideoElement, referenceVideoElement, false);
    void Promise.allSettled([
      resultVideoElement.play().catch(() => {}),
      referenceVideoElement.play().catch(() => {}),
    ]);
  };

  useEffect(() => {
    if (!referenceVideo && !videoUrl) {
      setReferenceVideo(DEFAULT_REFERENCE_VIDEO_URL);
      setReferenceImages([{ id: 'default-sample', previewUrl: DEFAULT_REFERENCE_IMAGE_URL, remoteUrl: DEFAULT_REFERENCE_IMAGE_URL, uploading: false }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  useEffect(() => {
    if (!referenceVideo || !videoUrl) {
      return;
    }
    const timer = window.setTimeout(() => {
      ensureVideosStaySynchronized();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [referenceVideo, videoUrl]);

  useEffect(() => () => {
    clearAutoPollTimer();
    for (const previewUrl of ownedPreviewUrlsRef.current) {
      URL.revokeObjectURL(previewUrl);
    }
    ownedPreviewUrlsRef.current.clear();
  }, []);

  const generatedVideoFrameRatio = resultVideoAspectRatio
    ? String(resultVideoAspectRatio)
    : referenceVideoAspectRatio
      ? String(referenceVideoAspectRatio)
      : ratio === '16:9'
        ? '16 / 9'
        : '9 / 16';
  const isTaskActive = isGeneratingVideo || (
    Boolean(latestTaskId)
    && !videoUrl
    && !['failed', 'completed'].includes(String(queryTaskStatus || '').toLowerCase())
  );

  const Sidebar = (
    <div className="space-y-8 pb-10">
      <div className="hidden lg:block pb-6 border-b border-slate-100">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none">Seedance视频复刻</h1>
        <p className="mt-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest">Seedance Motion Clone</p>
      </div>

      <div className="space-y-6">
        <section>
          <label className="min-h-8 text-[10px] leading-4 font-black text-slate-500 uppercase tracking-widest flex items-start mb-2 px-1">
            参考视频
            <InfoHint text="视频总时长 2-15s，体积小于 50 MB" />
          </label>
          <label className="block group cursor-pointer">
            <div
              className="relative w-full border-2 rounded-3xl flex flex-col items-center justify-center overflow-hidden transition-all bg-slate-950 border-slate-200 group-hover:border-indigo-400 group-hover:shadow-inner"
              style={{ aspectRatio: '16 / 25' }}
            >
              {referenceVideo ? (
                <div className="relative w-full h-full bg-black flex items-center justify-center">
                  <video
                    ref={referenceVideoPlayerRef}
                    src={referenceVideo}
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
                    onTimeUpdate={() => syncVideoPlayers(referenceVideoPlayerRef.current, resultVideoPlayerRef.current, false)}
                    className="w-full h-full object-contain cursor-pointer"
                    aria-label="参考视频预览，点击重新上传"
                  />
                  <div className="absolute inset-x-2 bottom-2 px-2 py-1.5 rounded-lg bg-black/65 text-white text-[8px] font-bold text-center pointer-events-none">
                    点击重新上传视频
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 bg-white rounded-xl shadow-sm flex items-center justify-center mb-1 text-indigo-500 group-hover:scale-110 transition-transform">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  </div>
                  <span className="text-[9px] text-slate-400 font-bold uppercase">上传视频</span>
                </div>
              )}
              {isUploadingReferenceVideo && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white pointer-events-none">
                  <span className="animate-spin h-7 w-7 border-[3px] border-indigo-600/30 border-t-indigo-600 rounded-full mb-2" />
                  <span className="text-[10px] font-black text-indigo-600">上传中{'.'.repeat(referenceUploadDots)}</span>
                </div>
              )}
            </div>
            <input id="reference-video-input" type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} disabled={isUploadingReferenceVideo} />
          </label>
          {referenceVideo && !isUploadingReferenceVideo && (
            <label htmlFor="reference-video-input" className="mt-2 block text-center text-[9px] font-black text-indigo-600 cursor-pointer">更换视频</label>
          )}
        </section>

        <section>
          <label className="min-h-8 text-[10px] leading-4 font-black text-slate-500 uppercase tracking-widest flex items-start mb-2 px-1">
            参考图片
            <InfoHint text="最多支持 3 张图片，每张 小于 10 MB" />
          </label>
          <div className="grid grid-cols-3 gap-2">
            {referenceImages.map((image) => (
              <div key={image.id} className="relative w-full aspect-square bg-slate-50 border-2 border-slate-200 rounded-2xl overflow-hidden group">
                <img src={image.previewUrl} alt="参考图片" className="w-full h-full object-cover" />
                {image.uploading && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white pointer-events-none">
                    <span className="animate-spin h-5 w-5 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeReferenceImage(image.id)}
                  className="absolute top-1 right-1 z-20 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                  aria-label="移除图片"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
            {referenceImages.length < MAX_REFERENCE_IMAGES && (
              <label className="block group cursor-pointer">
                <div className="w-full aspect-square bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center transition-all group-hover:border-indigo-400 group-hover:bg-indigo-50/30">
                  <div className="w-7 h-7 bg-white rounded-xl shadow-sm flex items-center justify-center text-indigo-500 group-hover:scale-110 transition-transform">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  </div>
                  <span className="mt-1 text-[9px] text-slate-400 font-bold uppercase">添加图片</span>
                </div>
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleReferenceImagesUpload} />
              </label>
            )}
          </div>
        </section>

        <section>
          <label className="min-h-8 text-[10px] leading-4 font-black text-slate-500 uppercase tracking-widest flex items-start mb-2 px-1">
            参考音频
            <InfoHint text="最多支持 3 个音频文件，时长 2-15s，每个文件 小于 15 MB" />
          </label>
          <div className="space-y-2">
            {referenceAudios.map((audio) => (
              <div key={audio.id} className="relative rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 flex items-center gap-2.5">
                <div className="w-8 h-8 flex-none bg-white rounded-xl shadow-sm flex items-center justify-center text-indigo-500">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19a3 3 0 11-6 0 3 3 0 016 0zm12-3a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-[10px] font-black text-slate-700" title={audio.fileName}>{audio.fileName}</p>
                  <p className="mt-0.5 text-[9px] font-bold text-slate-400">
                    {audio.uploading ? '校验中...' : audio.durationSeconds ? formatDuration(audio.durationSeconds) : '时长未知'}
                  </p>
                </div>
                <audio controls src={audio.previewUrl} preload="metadata" className="h-8 w-28 flex-none" />
                {audio.uploading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/80 pointer-events-none">
                    <span className="animate-spin h-5 w-5 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeReferenceAudio(audio.id)}
                  className="flex-none w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                  aria-label="移除音频"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
            {referenceAudios.length < MAX_REFERENCE_AUDIOS && (
              <label className="block group cursor-pointer">
                <div className="w-full rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 px-3 py-3 flex items-center justify-center gap-2 transition-all group-hover:border-indigo-400 group-hover:bg-indigo-50/30">
                  <div className="w-6 h-6 bg-white rounded-lg shadow-sm flex items-center justify-center text-indigo-500 group-hover:scale-110 transition-transform">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  </div>
                  <span className="text-[9px] text-slate-400 font-bold uppercase">添加音频</span>
                </div>
                <input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.wma" multiple className="hidden" onChange={handleReferenceAudiosUpload} />
              </label>
            )}
          </div>
        </section>

        <section>
          <label htmlFor="clone-prompt" className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center mb-2 px-1">
            提示词
            <InfoHint text="文本长度限制: 1 - 20480" />
          </label>
          <textarea
            id="clone-prompt"
            value={prompt}
            maxLength={MAX_PROMPT_LENGTH}
            onChange={(event) => {
              setPrompt(event.target.value);
              setVideoUrl(null);
            }}
            rows={5}
            placeholder="描述生成视频的内容，例如：将参考视频中的人物替换成参考图片中的人物..."
            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-[11px] leading-relaxed text-slate-700 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
          />
        </section>

        <section>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center mb-2 px-1">
            模型档位
            <InfoHint text="从左到右能力递增" />
          </label>
          <div className="grid grid-cols-4 gap-2">
            {modelOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                disabled={isGeneratingVideo}
                onClick={() => handleModelChange(option.key)}
                className={`py-3 text-[10px] font-black rounded-xl border transition-all disabled:cursor-not-allowed disabled:opacity-60 ${model === option.key ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center mb-2 px-1">
            分辨率
            <InfoHint text="当前模型可选分辨率以接口文档为准。" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            {resolutionOptions.map((option) => (
              <button
                key={option}
                type="button"
                disabled={isGeneratingVideo}
                onClick={() => setResolution(option)}
                className={`py-3 text-[10px] font-black rounded-xl border transition-all disabled:cursor-not-allowed disabled:opacity-60 ${effectiveResolution === option ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
              >
                {option}
              </button>
            ))}
          </div>
        </section>

        <section>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">画幅</label>
          <div className="grid grid-cols-4 gap-2">
            {CPRT_RATIO_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                disabled={isGeneratingVideo}
                onClick={() => setRatio(option)}
                className={`py-2.5 text-[10px] font-black rounded-xl border transition-all disabled:cursor-not-allowed disabled:opacity-60 ${ratio === option ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
              >
                {RATIO_LABELS[option] || option}
              </button>
            ))}
          </div>
        </section>

        <section>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">
            时长（{durationSeconds}s）
          </label>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <input
              type="range"
              min={4}
              max={15}
              step={1}
              value={durationSeconds}
              disabled={isGeneratingVideo}
              onChange={(event) => setDurationSeconds(Number(event.target.value))}
              className="h-2 w-full cursor-pointer accent-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="生成视频时长"
            />
            <div className="mt-2 flex justify-between text-[9px] font-bold text-slate-400">
              <span>4s</span>
              <span>15s</span>
            </div>
          </div>
        </section>

        <section>
          <button
            type="button"
            onClick={() => setRealPersonMode((prev) => !prev)}
            disabled={isGeneratingVideo}
            className="w-full flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 transition-all hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="flex flex-col items-start">
              <span className="text-[11px] font-black text-slate-800">真人模式</span>
              <span className="mt-0.5 text-[9px] text-slate-400 leading-relaxed text-left">
                开启后，参考视频与参考图片将加入对应真人素材槽位
              </span>
            </span>
            <span className={`relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors ${realPersonMode ? 'bg-indigo-600' : 'bg-slate-200'}`}>
              <span className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform ${realPersonMode ? 'translate-x-[22px]' : 'translate-x-[3px]'}`} style={{ height: 18, width: 18 }} />
            </span>
          </button>
        </section>

        {error && (
          <div className="p-4 bg-rose-50 text-rose-600 text-[11px] font-bold rounded-2xl border border-rose-100">
            {error}
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
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        <section className="sticky bottom-0 z-20 -mx-2 border-t border-slate-100 bg-white/95 px-2 pb-1 pt-4 backdrop-blur">
          <button
            onClick={handleGenerate}
            disabled={isGenerationDisabled}
            className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-emerald-100 hover:bg-emerald-700 disabled:bg-slate-100 disabled:text-slate-300 disabled:shadow-none transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {isGeneratingVideo ? (
              <><span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />视频生成中...（{generationPointCost}点）</>
            ) : `生成视频（${generationPointCost}点）`}
          </button>
        </section>
      </div>
    </div>
  );

  const MainContent = (
    <div className="space-y-10 pb-24 lg:pb-20 px-2 lg:px-0">
      {referenceVideo && (
        <div className="animate-in fade-in zoom-in duration-500">
          <section className="rounded-[2rem] border border-indigo-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-400">Output</p>
                <h2 className="mt-1 text-lg font-black text-slate-900">生成结果</h2>
              </div>
              {videoUrl && <span className="rounded-full bg-emerald-50 px-3 py-1 text-[9px] font-black text-emerald-600">已完成视频</span>}
            </div>

            {videoUrl ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-black rounded-full border border-emerald-100">时长：{finalVideoDurationSec ? formatDuration(finalVideoDurationSec) : '读取中...'}</span>
                  <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-black rounded-full border border-indigo-100">{activeModel.label} · {effectiveResolution}</span>
                  <span className="px-3 py-1 bg-slate-100 text-slate-600 text-[10px] font-black rounded-full border border-slate-200">{RATIO_LABELS[ratio] || ratio}{realPersonMode ? ' · 真人模式' : ''}</span>
                </div>
                <div
                  className="w-full overflow-hidden rounded-[1.5rem] bg-transparent flex items-center justify-center"
                  style={{ aspectRatio: generatedVideoFrameRatio, maxHeight: '100vh' }}
                >
                  <video
                    ref={resultVideoPlayerRef}
                    src={videoUrl}
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
                <div className="flex justify-center">
                  <button
                    onClick={() => {
                      const a = document.createElement('a');
                      a.href = videoUrl;
                      a.download = `复刻视频_${Date.now()}.mp4`;
                      a.click();
                    }}
                    className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl shadow-xl shadow-emerald-100 transition-all active:scale-95 flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    下载视频
                  </button>
                </div>
              </div>
            ) : isTaskActive ? (
              <div className="rounded-[1.5rem] border border-dashed border-indigo-200 bg-indigo-50/40 px-6 py-10 text-center">
                <div className="flex flex-col items-center gap-4">
                  <span className="animate-spin h-8 w-8 border-3 border-indigo-500/20 border-t-indigo-500 rounded-full" />
                  <div>
                    <h3 className="text-lg font-black text-slate-800">{formatTaskStatus(queryTaskStatus || 'running')}</h3>
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-400">任务已提交，可离开页面，稍后使用任务ID查询进度。</p>
                    {latestTaskId && (
                      <p className="mt-2 text-[9px] text-slate-400 font-mono break-all">任务ID：{latestTaskId}</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="min-h-[280px] rounded-[1.5rem] border border-dashed border-indigo-200 bg-indigo-50/40 flex flex-col items-center justify-center px-8 text-center">
                <div className="w-16 h-16 rounded-3xl bg-white shadow-sm flex items-center justify-center text-indigo-500 mb-5">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                </div>
                <h3 className="text-lg font-black text-slate-800">等待生成</h3>
                <p className="mt-2 max-w-xs text-[11px] leading-relaxed text-slate-400">上传参考视频与参考图片后，点击左侧“生成视频”按钮开始生成。</p>
              </div>
            )}

          </section>
        </div>
      )}

      {(latestTaskId || videoUrl) && (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Task</p>
              <h2 className="mt-1 text-lg font-black text-slate-900">任务查询</h2>
            </div>
            {latestTaskId && <span className="rounded-full bg-slate-100 px-3 py-1 text-[9px] font-black text-slate-500">{formatTaskStatus(queryTaskStatus)}</span>}
          </div>
          <div className="flex gap-2">
            <input
              value={queryTaskId}
              onChange={(event) => setQueryTaskId(event.target.value)}
              placeholder="输入任务ID查询进度"
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] font-mono text-slate-700 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
            />
            <button
              type="button"
              onClick={handleQueryTaskProgress}
              disabled={isQueryingTask || !queryTaskId.trim()}
              className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-[10px] font-black disabled:opacity-50"
            >
              {isQueryingTask ? '查询中...' : '立即查询'}
            </button>
            <button
              type="button"
              onClick={handleStopWaiting}
              className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-[10px] font-black text-slate-500"
            >
              停止等待
            </button>
          </div>
        </section>
      )}

      {!referenceVideo && !videoUrl && (
        <div className="py-24 lg:py-40 text-center max-w-lg mx-auto">
          <div className="w-20 h-20 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-inner">
            <svg className="w-10 h-10 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Seedance 视频复刻</h2>
          <p className="text-sm text-slate-400 mt-4 leading-relaxed font-medium">
            上传参考视频与 1-3 张参考图片，可选 0-3 段参考音频；动作来自参考视频，人物形象来自参考图片，声音来自参考音频，可开启真人模式。
          </p>
        </div>
      )}
    </div>
  );

  return <WorkbenchLayout sidebar={Sidebar} content={MainContent} />;
};

export default App;
