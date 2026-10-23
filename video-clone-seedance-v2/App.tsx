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
  VOICE_LANGUAGE_OPTIONS,
  MAX_PROMPT_LENGTH,
  MAX_REFERENCE_IMAGES,
  type VoiceLanguage,
  type BackgroundMode,
} from './shared/cprtContract';
import {
  BAILIAN_CLONE_AUDIO_EXTENSIONS,
  BAILIAN_CLONE_AUDIO_MAX_BYTES,
} from './shared/speechContract';
import type { AppProps } from './types';
import { calculateVideoPointCost } from './shared/pricing';

const PILOT_APP_ID = 'video-clone-seedance-v2';
const PILOT_APP_NAME = 'Seedance视频复刻v2';
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024; // CPRT：每个参考视频 50 MB
const MAX_IMAGE_SIZE_BYTES = 30 * 1024 * 1024; // CPRT：每张参考图片 30 MB
const AUTO_POLL_INTERVAL_MS = 3000;
const DEFAULT_VIDEO_DURATION_SECONDS = 4;
const DEFAULT_REFERENCE_VIDEO_URL = 'https://unityshop-public-1342713514.cos.ap-guangzhou.myqcloud.com/unityshop_samples/video_clone/%E9%A3%9E%E4%B9%A620260827-115528.mp4';
const DEFAULT_REFERENCE_IMAGE_URL = 'https://unityshop-public-1342713514.cos.ap-guangzhou.myqcloud.com/unityshop_samples/video_clone/20260827-115600.jpg';
const DEFAULT_CLONE_PROMPT = '将参考视频中的人物替换成参考图片中的人物。人物口型与动作对准参考音频';

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

type UploadedMedia = {
  previewUrl: string;
  remoteUrl: string | null;
  uploading: boolean;
  fileName: string;
};

/** 人声样本 + 百炼声音复刻状态。 */
type VoiceReferenceAudio = {
  /** 本地预览地址（URL.createObjectURL，用于 <audio> 试听原始样本）。 */
  previewUrl: string;
  /** 上传后返回的地址（BFF 会自动改写成公网地址给百炼下载）。 */
  remoteUrl: string | null;
  fileName: string;
  /** 样本是否仍在上传。 */
  uploading: boolean;
  /** 是否已在百炼创建复刻音色。 */
  enrolling: boolean;
  /** 百炼返回的复刻音色 ID。 */
  voiceId: string | null;
  /** 上传 / 复刻失败信息（展示在样本卡片上）。 */
  error: string | null;
};

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
  const raw = String(message || '').trim();
  if (!raw) {
    return '生成失败。';
  }
  if (isRealPersonModeRejection(raw)) {
    return '当前模式不支持真人素材：参考视频/图片中包含真人时，请开启「真人模式」后重新生成。';
  }
  if (/copyright/i.test(raw)) {
    return '参考图片命中平台版权策略：请更换为自己拥有版权的人物参考图后重试（避免明星、网红、动漫角色或明显像公众人物的 AI 生成图）。';
  }
  if (/format is unsupported|unsupported.*format|invalid (file|video|image)|unsupported (file|media)/i.test(raw)) {
    return '素材格式不支持：请确认上传的是完好的 JPG/PNG 图片与 MP4 视频（不要只改扩展名），再重新生成。';
  }
  // 内容审核：使用更精准的关键词，避免把含 content/sensitive 字样的普通报错（如限流、参数错误）误判为审核拦截。
  if (/(内容审核|审核不通过|未通过审核|素材.*(审核|不合规)|moderation|content (review|check|audit).*(fail|reject|not pass)|sensitive content|policy (violation|reject)|违规内容|敏感内容|not approved.*content)/i.test(raw)) {
    // 从服务端送审错误里提取素材类型、文件名与平台编号，把提示压缩成几行可操作的短句。
    const assetLabel = /参考视频/.test(raw) ? '参考视频' : /参考音频/.test(raw) ? '参考音频' : '参考图';
    const urlMatch = raw.match(/https?:\/\/[^/]+\/assets\/([^)?\s`]+)/i);
    const fileName = urlMatch ? decodeURIComponent(urlMatch[1]).replace(/^[a-f0-9-]{36}-/, '') : '';
    const assetId = (raw.match(/asset-[A-Za-z0-9-]+/) || [])[0] || '';
    return [
      `${assetLabel}未通过平台内容审核，请更换素材后重试。`,
      fileName ? `已拦截素材：${fileName}` : '',
      '素材须为本人或已授权的真人内容，且不能含第三方肖像、品牌 logo 或水印。',
      assetId ? `如需向平台反馈，可引用编号：${assetId}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
  return raw;
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

const VOICE_LANGUAGE_LABELS: Record<VoiceLanguage, string> = {
  keep: '保持原语言',
  'zh-CN': '中国普通话',
  'en-US': '美国英语',
  'ja-JP': '日本日语',
  'ko-KR': '韩国韩语',
  'fr-FR': '法国法语',
  'de-DE': '德国德语',
  'es-ES': '西班牙语',
  'pt-BR': '巴西葡语',
  'ar-SA': '阿拉伯语',
};

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

  // 提示词与生成参数
  const [prompt, setPrompt] = useState<string>(DEFAULT_CLONE_PROMPT);
  const [model, setModel] = useState<string>(DEFAULT_CPRT_MODEL);
  const [resolution, setResolution] = useState<string>(DEFAULT_CPRT_RESOLUTION);
  const [ratio, setRatio] = useState<string>('adaptive');
  const [durationSeconds, setDurationSeconds] = useState<number>(DEFAULT_VIDEO_DURATION_SECONDS);
  const [realPersonMode, setRealPersonMode] = useState<boolean>(true);
  const [voiceReplacementEnabled, setVoiceReplacementEnabled] = useState<boolean>(false);
  const [voiceLanguage, setVoiceLanguage] = useState<VoiceLanguage>('keep');
  const [voiceScript, setVoiceScript] = useState<string>('');
  /**
   * 用户上传的人声样本及其声音复刻状态（百炼 Qwen-Audio-TTS）：
   * 上传 → 拿公网地址调 create_clone_voice 即时复刻 → voiceId 用于合成/试听。
   */
  const [voiceReferenceAudio, setVoiceReferenceAudio] = useState<VoiceReferenceAudio | null>(null);
  const [isPreviewingVoice, setIsPreviewingVoice] = useState<boolean>(false);
  const voiceAudioInputRef = useRef<HTMLInputElement | null>(null);
  const [generationOptionsCollapsed, setGenerationOptionsCollapsed] = useState<boolean>(false);
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>('keep');
  const [backgroundPrompt, setBackgroundPrompt] = useState<string>('');
  const [backgroundReferenceImage, setBackgroundReferenceImage] = useState<UploadedMedia | null>(null);

  // 结果与任务
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [originalVideoUrl, setOriginalVideoUrl] = useState<string | null>(null);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuditRejection, setIsAuditRejection] = useState<boolean>(false);
  const [providerNotice, setProviderNotice] = useState<string | null>(null);
  /** 生成阶段已合成的配音地址：成片音轨没换成目标语言时，用来在后处理阶段覆盖音轨。 */
  const [dubbedAudioUrl, setDubbedAudioUrl] = useState<string | null>(null);
  /**
   * 本次生成由百炼复刻音色合成的配音（ref 供轮询完成后的自动 finalize 读取，避免闭包过期）。
   * kind === 'tts' 时 finalize 必须把这段音频强制覆盖进成片，保证成片声音就是复刻音色。
   */
  const dubbedAudioRef = useRef<{ taskId: string; url: string; kind: 'tts' | 'source' | null } | null>(null);
  /** 生成完成后是否正在进行后处理（套用运镜 / 覆盖音轨）。 */
  const [isFinalizing, setIsFinalizing] = useState(false);

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
    || Boolean(backgroundReferenceImage?.uploading)
    || referenceImages.some((item) => !item.remoteUrl);

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
        setOriginalVideoUrl(result.originalVideoUrl || result.videoUrl);
        // 有复刻配音待合成时先不展示原始成片（音轨还是模型自带的），
        // 等 finalize 把配音版 URL 换上来再播，避免用户先听到旧声音。
        const pendingDub = dubbedAudioRef.current?.kind === 'tts'
          && dubbedAudioRef.current.taskId === trimmedTaskId;
        if (!pendingDub) {
          setVideoUrl(result.videoUrl);
        }
        setError(null);
        setIsGeneratingVideo(false);
        if (showNotice) {
          setProviderNotice(pendingDub ? '视频生成完成，正在合成复刻音色成片...' : '视频生成完成，正在加载...');
        }
        // 仅在需要替换复刻配音时后处理；否则保留模型原始成片。
        if (pendingDub) {
          void handleFinalizeVideo(result.videoUrl, trimmedTaskId);
        }
      } else if (result.status === 'failed') {
        clearAutoPollTimer();
        const message = toFriendlyErrorMessage(String(result.errorMessage || '生成失败。'));
        setError(message);
        setIsAuditRejection(/内容审核|审核不通过|未通过审核|素材.*(审核|不合规)|moderation|sensitive content|违规内容|敏感内容|not approved.*content/i.test(message));
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
          voice_replacement: {
            enabled: voiceReplacementEnabled,
            language: voiceLanguage,
            script: voiceReplacementEnabled ? voiceScript.trim() : '',
            voice_id: voiceReferenceAudio?.voiceId || null,
            voice_audio_url: voiceReferenceAudio?.remoteUrl || null,
          },
          background_replacement: {
            mode: backgroundMode,
            prompt: backgroundPrompt.trim(),
            image_url: backgroundReferenceImage?.remoteUrl || null,
          },
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
      setOriginalVideoUrl(null);
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

  const handleBackgroundImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('请上传背景参考图片。');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setError(`背景参考图片需小于 ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB。`);
      return;
    }

    const previewUrl = createOwnedPreviewUrl(file);
    setBackgroundReferenceImage((previous) => {
      releaseOwnedPreviewUrl(previous?.previewUrl);
      return {
        previewUrl,
        remoteUrl: null,
        uploading: true,
        fileName: file.name || `background-reference-${Date.now()}.png`,
      };
    });
    setBackgroundMode('replace');
    setProviderNotice('正在上传背景参考图...');
    setError(null);
    setVideoUrl(null);

    try {
      const uploaded = await uploadAsset(file, {
        fileName: file.name || `background-reference-${Date.now()}.png`,
        objectPath: `standalone/${PILOT_APP_ID}/background_references`,
        contentType: file.type || 'image/png',
      });
      const remoteUrl = resolveUploadedAssetUrl(uploaded);
      if (!remoteUrl) {
        throw new Error('背景参考图上传后未返回可访问地址。');
      }
      setBackgroundReferenceImage((previous) => previous ? { ...previous, remoteUrl, uploading: false } : previous);
      setProviderNotice('背景参考图已上传。');
    } catch (err: any) {
      setBackgroundReferenceImage((previous) => {
        releaseOwnedPreviewUrl(previous?.previewUrl);
        return null;
      });
      setProviderNotice(null);
      setError(err instanceof Error ? err.message : '背景参考图上传失败。');
    }
  };

  const removeBackgroundReferenceImage = () => {
    setBackgroundReferenceImage((previous) => {
      releaseOwnedPreviewUrl(previous?.previewUrl);
      return null;
    });
    setVideoUrl(null);
  };

  /** 上传人声样本：本地校验 → 上传资产 → 百炼声音复刻（即时返回 voiceId）。 */
  const handleVoiceAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) {
      return;
    }
    const extension = getFileExtension(file.name);
    if (!BAILIAN_CLONE_AUDIO_EXTENSIONS.includes(extension as (typeof BAILIAN_CLONE_AUDIO_EXTENSIONS)[number])) {
      setError(`人声样本仅支持 ${BAILIAN_CLONE_AUDIO_EXTENSIONS.join(' / ')} 格式。`);
      return;
    }
    if (file.size > BAILIAN_CLONE_AUDIO_MAX_BYTES) {
      setError(`人声样本需小于 ${BAILIAN_CLONE_AUDIO_MAX_BYTES / 1024 / 1024}MB，建议时长 10~20 秒。`);
      return;
    }

    const previewUrl = createOwnedPreviewUrl(file);
    setVoiceReferenceAudio((previous) => {
      releaseOwnedPreviewUrl(previous?.previewUrl);
      return {
        previewUrl,
        remoteUrl: null,
        fileName: file.name || `voice-reference-${Date.now()}${extension}`,
        uploading: true,
        enrolling: false,
        voiceId: null,
        error: null,
      };
    });
    setError(null);
    setProviderNotice('正在上传人声样本...');
    setVideoUrl(null);

    try {
      const uploaded = await uploadAsset(file, {
        fileName: file.name || `voice-reference-${Date.now()}${extension}`,
        objectPath: `standalone/${PILOT_APP_ID}/voice_references`,
        contentType: file.type || 'audio/mpeg',
      });
      const remoteUrl = resolveUploadedAssetUrl(uploaded);
      if (!remoteUrl) {
        throw new Error('人声样本上传后未返回可访问地址。');
      }
      setVoiceReferenceAudio((previous) => (
        previous ? { ...previous, remoteUrl, uploading: false, enrolling: true } : previous
      ));
      setProviderNotice('正在创建复刻音色（约几秒）...');

      // BFF 会把本地资产地址改写成公网隧道地址供百炼下载。
      const enrolled = await videoCloneBffService.createCloneVoice(remoteUrl);
      setVoiceReferenceAudio((previous) => (
        previous
          ? { ...previous, remoteUrl: enrolled.audioUrl || remoteUrl, enrolling: false, voiceId: enrolled.voiceId, error: null }
          : previous
      ));
      setProviderNotice('复刻音色已创建，可以试听或直接生成。');
    } catch (err) {
      setVoiceReferenceAudio((previous) => {
        if (previous) {
          return { ...previous, uploading: false, enrolling: false, error: err instanceof Error ? err.message : '声音复刻失败。' };
        }
        return previous;
      });
      setProviderNotice(null);
      setError(err instanceof Error ? err.message : '人声样本上传或声音复刻失败。');
    }
  };

  const removeVoiceReferenceAudio = () => {
    setVoiceReferenceAudio((previous) => {
      releaseOwnedPreviewUrl(previous?.previewUrl);
      return null;
    });
    setVideoUrl(null);
  };

  /** 用复刻音色合成一句试听词并直接播放（base64 mp3）。 */
  const handlePreviewCloneVoice = async () => {
    const reference = voiceReferenceAudio;
    if (!reference?.voiceId || reference.uploading || reference.enrolling || isPreviewingVoice) {
      return;
    }
    setIsPreviewingVoice(true);
    setError(null);
    try {
      const result = await videoCloneBffService.previewVoice(
        reference.voiceId,
        voiceLanguage,
        reference.remoteUrl || undefined,
      );
      if (result.voiceId && result.voiceId !== reference.voiceId) {
        // 音色失效后服务端用样本重新复刻：回写新 voiceId。
        setVoiceReferenceAudio((previous) => (
          previous ? { ...previous, voiceId: result.voiceId, error: null } : previous
        ));
      }
      const audio = new Audio(`data:audio/mpeg;base64,${result.audioBase64}`);
      await audio.play();
    } catch (err) {
      setError(err instanceof Error ? err.message : '复刻音色试听失败。');
    } finally {
      setIsPreviewingVoice(false);
    }
  };

  const handleModelChange = (nextModel: string) => {
    setModel(nextModel);
    const nextModelOption = CPRT_MODEL_OPTIONS.find((item) => item.key === nextModel);
    if (nextModelOption && !nextModelOption.resolutions.includes(resolution)) {
      setResolution(nextModelOption.resolutions[0]);
    }
  };

  const handleGenerate = async (realPersonModeOverride?: boolean) => {
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
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setProviderNotice('请填写提示词。');
      return;
    }
    if (trimmedPrompt.length > MAX_PROMPT_LENGTH) {
      setProviderNotice(`提示词不能超过 ${MAX_PROMPT_LENGTH} 个字符。`);
      return;
    }
    if (backgroundReferenceImage?.uploading) {
      setProviderNotice('背景素材仍在上传中，请稍候。');
      return;
    }
    if (backgroundMode === 'replace' && backgroundReferenceImage && !backgroundReferenceImage.remoteUrl) {
      setError('背景参考图上传状态异常，请重新上传图片后再试。');
      return;
    }
    if (voiceReplacementEnabled) {
      const needsClonedVoice = voiceLanguage !== 'keep' || Boolean(voiceScript.trim());
      if (needsClonedVoice) {
        // 换语言或手填台词都要 TTS 合成 → 必须有复刻成功的音色。
        // 「保持原语言 + 不填台词」在生成后合回原声，不需要样本。
        const voiceSample = voiceReferenceAudio;
        if (!voiceSample) {
          setProviderNotice('请先上传一段 10~20 秒的清晰人声样本，用于声音复刻。');
          return;
        }
        if (voiceSample.uploading || voiceSample.enrolling) {
          setProviderNotice('人声样本仍在上传 / 复刻中，请稍候。');
          return;
        }
        if (!voiceSample.voiceId) {
          setError(voiceSample.error || '声音复刻未完成，请删除样本后重新上传。');
          return;
        }
      }
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
      setOriginalVideoUrl(null);
    setDubbedAudioUrl(null);
    dubbedAudioRef.current = null;
    setIsGeneratingVideo(true);
    try {
      const generation = await videoCloneBffService.startCloneJob({
        referenceVideoUrl: effectiveReferenceVideoUrl,
        imageUrls: referenceImages.map((item) => String(item.remoteUrl)),
        prompt: trimmedPrompt,
        model,
        resolution: effectiveResolution,
        durationSeconds,
        ratio,
        realPersonMode: Boolean(realPersonModeOverride ?? realPersonMode),
        voiceReplacement: {
          enabled: voiceReplacementEnabled,
          language: voiceLanguage,
          script: voiceReplacementEnabled ? voiceScript.trim() : undefined,
          voiceId: voiceReferenceAudio?.voiceId || undefined,
          voiceAudioUrl: voiceReferenceAudio?.remoteUrl || undefined,
        },
        backgroundReplacement: {
          mode: backgroundMode,
          prompt: backgroundPrompt.trim() || undefined,
          imageUrl: backgroundReferenceImage?.remoteUrl || undefined,
        },
      });

      setLatestTaskId(generation.taskId);
      setQueryTaskId(generation.taskId);
      setQueryTaskStatus(generation.status || 'queued');
      setDubbedAudioUrl(generation.voiceAudioUrl || null);
      dubbedAudioRef.current = generation.voiceAudioUrl
        ? { taskId: generation.taskId, url: generation.voiceAudioUrl, kind: generation.voiceAudioKind ?? null }
        : null;
      // 服务端可能现场复刻或在音色失效后重新复刻：回写最终使用的 voiceId。
      if (generation.voiceId) {
        setVoiceReferenceAudio((previous) => (
          previous && previous.voiceId !== generation.voiceId
            ? { ...previous, voiceId: generation.voiceId, error: null }
            : previous
        ));
      }
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

      // 不跳转新页面：生成结果在原页面轮询展示（任务管理面板在新页面会打断生成体验）。
      const notices = ['任务已提交，系统会自动轮询任务进度。'];
      if (generation.voiceAutoScript) {
        setVoiceScript(generation.voiceAutoScript.translatedText);
        notices.push(`自动识别原台词：${generation.voiceAutoScript.originalText}`);
        notices.push(
          `已翻译为${VOICE_LANGUAGE_LABELS[voiceLanguage] || voiceLanguage}：${generation.voiceAutoScript.translatedText}`
          + '（已填入台词框，可修改后重新生成）',
        );
      }
      setProviderNotice(notices.join('\n'));
    } catch (err: any) {
      setIsGeneratingVideo(false);
      const errMessage = toFriendlyErrorMessage(String(err?.message || '未知错误'));
      // 审核拦截既可能在提交阶段（CPRT 直接拒），也可能在轮询阶段（failedReason 命中）。
      setIsAuditRejection(/内容审核|审核不通过|未通过审核|素材.*(审核|不合规)|moderation|sensitive content|违规内容|敏感内容|not approved.*content/i.test(errMessage));
      if (/insufficient credits|点数不足/i.test(errMessage)) {
        activePlatform.showRecharge?.();
      }
      setError(`视频生成失败: ${errMessage}`);
      setProviderNotice(`视频生成失败：${errMessage}`);
    }
  };

  const handleFinalizeVideo = async (generatedVideoUrl: string, completedTaskId?: string) => {
    setIsFinalizing(true);
    setError(null);
    try {
      // 复刻音色合成的配音（kind='tts'）必须强制覆盖成片音轨：
      // 即梦只把 audioUrls 当对口型参考，输出音轨未必是这段音频。
      // 仅当完成的就是「本次提交的任务」时才覆盖，避免手动查询旧任务时错套配音。
      const dubbed = dubbedAudioRef.current;
      const forceDubUrl = dubbed?.kind === 'tts'
        && (!completedTaskId || dubbed.taskId === completedTaskId)
        ? dubbed.url
        : undefined;
      const result = await videoCloneBffService.finalizeVideo({
        videoUrl: generatedVideoUrl,
        voiceAudioUrl: forceDubUrl,
        jobId: completedTaskId,
      });
      if (result.videoUrl) {
        setVideoUrl(result.videoUrl);
        setProviderNotice(
          result.audioReplaced
              ? '已把复刻音色配音合成进成片（画面保持模型原样，仅替换音轨）。'
              : '视频生成完成，画面保持模型原样。',
        );
      }
    } catch (err: any) {
      // finalize 失败时兜底展示平台原始成片，避免用户什么都看不到。
      setVideoUrl(generatedVideoUrl);
      setError(`自动后处理失败：${String(err?.message || '未知错误')}。平台原始成片仍可正常播放。`);
    } finally {
      setIsFinalizing(false);
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
            参考视频（2-15s）
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
            参考图片（1-3张）
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
          <label htmlFor="clone-prompt" className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">
            提示词
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
          <p className="mt-2 px-1 text-[9px] leading-relaxed text-slate-400">
            支持 1-20480 字符。参考视频提供动作，参考图片提供人物形象。
          </p>
        </section>

        <section className="space-y-3">
          <div className="w-full flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 transition-all hover:border-slate-300">
            <div className="flex flex-1 flex-col items-start">
              <span className="text-[11px] font-black text-slate-800">AI 换声 / 换语言</span>
              <span className="mt-0.5 text-[9px] text-slate-400 leading-relaxed text-left">
                  换语言时合成复刻配音；保留原声时先静音送审，生成后合回原音轨
              </span>
            </div>
            <button
              type="button"
              disabled={isGeneratingVideo}
              onClick={() => {
                setVoiceReplacementEnabled((prev) => !prev);
                setVideoUrl(null);
              }}
              className={`relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${voiceReplacementEnabled ? 'bg-indigo-600' : 'bg-slate-200'}`}
              aria-label="开启或关闭 AI 换声"
            >
              <span className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform ${voiceReplacementEnabled ? 'translate-x-[22px]' : 'translate-x-[3px]'}`} style={{ height: 18, width: 18 }} />
            </button>
          </div>
          {voiceReplacementEnabled && (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <label className="block">
                <span className="mb-2 block px-1 text-[10px] font-black uppercase tracking-widest text-slate-500">语音国家</span>
                <select
                  value={voiceLanguage}
                  disabled={isGeneratingVideo}
                  onChange={(event) => {
                    const nextLanguage = event.target.value as VoiceLanguage;
                    setVoiceLanguage(nextLanguage);
                    // 复刻音色与语种无关，切换语言不需要重建音色。
                    setVideoUrl(null);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[11px] font-bold text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {VOICE_LANGUAGE_OPTIONS.map((option) => (
                    <option key={option} value={option}>{VOICE_LANGUAGE_LABELS[option]}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block px-1 text-[10px] font-black uppercase tracking-widest text-slate-500">台词（留空自动识别并翻译）</span>
                <textarea
                  value={voiceScript}
                  disabled={isGeneratingVideo}
                  onChange={(event) => {
                    setVoiceScript(event.target.value);
                    setVideoUrl(null);
                  }}
                  rows={3}
                  placeholder="留空即可：换语言时会自动识别原视频台词并翻译成目标语言。你也可以直接填写或修改。"
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] leading-relaxed text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <span className="mt-1 block px-1 text-[9px] text-slate-400">
                    保持原语言 + 留空 → 生成后合回视频原声（嘴型可能与原声不完全同步）；换语言 + 留空 → 自动识别并翻译；填了台词 → 优先使用填写内容。
                </span>
              </label>
              <div>
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">音色参考（声音复刻）</span>
                  <span className="text-[9px] font-bold text-slate-400">百炼 Qwen-Audio-TTS</span>
                </div>
                <input
                  ref={voiceAudioInputRef}
                  type="file"
                  accept={BAILIAN_CLONE_AUDIO_EXTENSIONS.join(',')}
                  className="hidden"
                  onChange={handleVoiceAudioUpload}
                  disabled={isGeneratingVideo}
                />
                {!voiceReferenceAudio ? (
                  <button
                    type="button"
                    disabled={isGeneratingVideo}
                    onClick={() => voiceAudioInputRef.current?.click()}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-3.5 text-left transition hover:border-indigo-400 hover:bg-indigo-50/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-indigo-50 text-indigo-500">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 18.75a3.75 3.75 0 003.75-3.75v-4.5a3.75 3.75 0 10-7.5 0v4.5A3.75 3.75 0 0012 18.75zm0 0v2.25m-5.25-2.25h10.5M8.25 9.75H6m12 0h-2.25" /></svg>
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-black text-slate-800">上传人声样本，复刻专属音色</p>
                        <p className="mt-0.5 truncate text-[9px] font-bold text-slate-400">
                          mp3 / m4a / wav，建议 10~20 秒清晰人声，无背景音乐与其他人声，≤10MB
                        </p>
                      </div>
                    </div>
                    <span className="flex-none rounded-lg bg-indigo-600 px-3 py-1.5 text-[10px] font-black text-white">
                      上传样本
                    </span>
                  </button>
                ) : (
                  <div className="space-y-2 rounded-xl border border-slate-200 bg-white px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-full ${
                          voiceReferenceAudio.voiceId ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-500'
                        }`}>
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 18.75a3.75 3.75 0 003.75-3.75v-4.5a3.75 3.75 0 10-7.5 0v4.5A3.75 3.75 0 0012 18.75zm0 0v2.25m-5.25-2.25h10.5" /></svg>
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-black text-slate-800">{voiceReferenceAudio.fileName}</p>
                          <p className="mt-0.5 truncate text-[9px] font-bold">
                            {voiceReferenceAudio.uploading && <span className="text-amber-500">样本上传中…</span>}
                            {!voiceReferenceAudio.uploading && voiceReferenceAudio.enrolling && <span className="text-amber-500">正在创建复刻音色…</span>}
                            {!voiceReferenceAudio.uploading && !voiceReferenceAudio.enrolling && voiceReferenceAudio.error && <span className="text-rose-500">复刻失败：{voiceReferenceAudio.error}</span>}
                            {!voiceReferenceAudio.uploading && !voiceReferenceAudio.enrolling && voiceReferenceAudio.voiceId && <span className="text-emerald-600">复刻音色已就绪</span>}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-none items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isGeneratingVideo || !voiceReferenceAudio.voiceId || voiceReferenceAudio.uploading || voiceReferenceAudio.enrolling || isPreviewingVoice}
                          onClick={handlePreviewCloneVoice}
                          className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[10px] font-black text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isPreviewingVoice ? '试听中…' : '试听音色'}
                        </button>
                        <button
                          type="button"
                          disabled={isGeneratingVideo}
                          onClick={removeVoiceReferenceAudio}
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-black text-slate-500 transition hover:border-rose-300 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                    <audio controls src={voiceReferenceAudio.previewUrl} className="h-8 w-full" />
                  </div>
                )}
                <span className="mt-1.5 block px-1 text-[9px] leading-relaxed text-slate-400">
                    换语言或手填台词时需要上传样本来复刻音色；「保持原语言 + 台词留空」会在生成后合回原音轨，无需上传样本。
                </span>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <button
            type="button"
            disabled={isGeneratingVideo}
            onClick={() => setGenerationOptionsCollapsed((prev) => !prev)}
            className="w-full flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 transition-all hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="flex flex-col items-start">
              <span className="text-[11px] font-black text-slate-800">生成参数</span>
              <span className="mt-0.5 text-[9px] text-slate-400 leading-relaxed text-left">
                背景、模型档位、分辨率、画幅
              </span>
            </div>
            <svg className={`h-4 w-4 transform transition-transform text-slate-400 ${generationOptionsCollapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>
          {!generationOptionsCollapsed && (
            <div className="space-y-3">
              <section className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {(['keep', 'replace'] as BackgroundMode[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      disabled={isGeneratingVideo}
                      onClick={() => {
                        setBackgroundMode(option);
                        setVideoUrl(null);
                      }}
                      className={`py-3 text-[10px] font-black rounded-xl border transition-all disabled:cursor-not-allowed disabled:opacity-60 ${backgroundMode === option ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                    >
                      {option === 'keep' ? '保留背景' : '替换背景'}
                    </button>
                  ))}
                </div>
                {backgroundMode === 'replace' && (
                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <label className="block">
                      <span className="mb-2 block px-1 text-[10px] font-black uppercase tracking-widest text-slate-500">目标背景</span>
                      <textarea
                        value={backgroundPrompt}
                        maxLength={1000}
                        disabled={isGeneratingVideo}
                        onChange={(event) => {
                          setBackgroundPrompt(event.target.value);
                          setVideoUrl(null);
                        }}
                        rows={3}
                        placeholder="例如：把背景换成干净的白墙、柔和自然光；保持原有室内结构与光源方向"
                        className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 text-[11px] leading-relaxed text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </label>
                    <p className="px-1 text-[9px] leading-relaxed text-slate-400">
                      越小的改动越真：优先只换墙面颜色、灯光或摆设，保留原视频的空间结构与光源方向；
                      整段换到完全不同的场景最容易发假。<br />
                      想要更稳，直接上传一张真实拍摄的背景照片（下方「背景参考图」），比纯文字描述真实得多。
                    </p>
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-2 px-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">背景参考图</span>
                        {backgroundReferenceImage && (
                          <button type="button" onClick={removeBackgroundReferenceImage} className="text-[9px] font-black text-rose-500 hover:text-rose-600">
                            移除
                          </button>
                        )}
                      </div>
                      {backgroundReferenceImage ? (
                        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white">
                          <img src={backgroundReferenceImage.previewUrl} alt="背景参考图" className="h-32 w-full object-cover" />
                          {backgroundReferenceImage.uploading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                              <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600/30 border-t-indigo-600" />
                            </div>
                          )}
                        </div>
                      ) : (
                        <label className="block cursor-pointer rounded-xl border-2 border-dashed border-slate-200 bg-white px-3 py-4 text-center text-[10px] font-black text-indigo-600 transition hover:border-indigo-400 hover:bg-indigo-50/30">
                          上传背景参考图
                          <input type="file" accept="image/*" className="hidden" onChange={handleBackgroundImageUpload} />
                        </label>
                      )}
                    </div>
                  </div>
                )}
              </section>

              <section>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">模型档位</label>
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
                <p className="mt-2 px-1 text-[9px] leading-relaxed text-slate-400">
                  档位由低到高：Mini → Fast → 2.0 → 2.5。<br />
                  <span className="text-amber-600">要复刻运镜/手持晃动、或要换成其他国家的语言，建议用 2.0 或 2.5：低档位对参考视频的运镜与参考音频的遵循度明显更低。</span>
                </p>
              </section>

              <section>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-1">分辨率</label>
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
                <p className="mt-2 px-1 text-[9px] leading-relaxed text-slate-400">
                  当前模型可选分辨率以接口文档为准。
                </p>
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
            </div>
          )}
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
          <p className="mt-2 px-1 text-[9px] leading-relaxed text-amber-600">
            默认开启：参考视频与全部参考图片会加入对应真人素材槽位（video1、image1..N），换脸更稳；但即梦会对素材做严格权属审核（无授权真人/明星/网图/水印极易被拦）。被拦时点下方「关闭真人模式重试」即可（仅当次重试关闭，不影响之后的设置）。<br />
            手动关闭：换脸靠参考图+参考视频+提示词完成，平台只做常规审核，此时不会下发真人素材槽位。
          </p>
        </section>

        {error && (
          <div className="p-4 bg-rose-50 text-rose-600 text-[11px] font-bold rounded-2xl border border-rose-100 whitespace-pre-line leading-relaxed">
            {error}
            {isAuditRejection && (
              <button
                type="button"
                onClick={() => {
                  // 当次审核拦截重试：仅通过 handleGenerate(false) 对这一次请求关闭真人模式，
                  // 不改写开关状态，避免之后的生成被静默取消 conversionSlots 真人素材槽位。
                  setIsAuditRejection(false);
                  setError(null);
                  void handleGenerate(false);
                }}
                className="mt-3 block w-full rounded-xl bg-rose-600 px-3 py-2 text-[11px] font-black text-white shadow-sm transition hover:bg-rose-700"
              >
                关闭真人模式并重试（绕过严格审核）
              </button>
            )}
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
            onClick={() => handleGenerate()}
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
                <div className="flex flex-wrap items-center justify-center gap-3">
                    {originalVideoUrl && originalVideoUrl !== videoUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setVideoUrl(originalVideoUrl);
                          setProviderNotice('已切换到模型原始成片，画面未经运镜后处理。');
                        }}
                        className="px-6 py-4 bg-white hover:bg-slate-50 text-slate-700 font-black rounded-2xl border border-slate-200 transition-all"
                      >
                        查看模型原版
                      </button>
                    )}
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
                {isFinalizing && (
                  <p className="mt-3 px-1 text-center text-[9px] leading-relaxed text-slate-400">
                  正在合成复刻音色配音，请稍候…
                  </p>
                )}

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
            上传参考视频与 1-3 张参考图片；动作来自参考视频，人物形象来自参考图片，可开启真人模式。
          </p>
        </div>
      )}

    </div>
  );

  return <WorkbenchLayout sidebar={Sidebar} content={MainContent} />;
};

export default App;
