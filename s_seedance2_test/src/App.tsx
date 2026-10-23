import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import seedanceConfig from '../config/config.json';
import {createSeedanceTask, generateSeedreamImage, getSeedanceTask, isTerminalTaskStatus} from './services/seedanceService';
import type {
  ExperienceMode,
  SeedanceCreatePayload,
  SeedanceModel,
  SeedanceTaskResponse,
  SeedreamGeneratePayload,
  SeedreamGenerateResponse,
  SeedreamModel,
} from './types';

type RequestTab = 'seedance' | 'seedream';
type UploadSource = 'file' | 'url';

interface FormState {
  model: SeedanceModel;
  resolution: '480p' | '720p' | '1080p';
  ratio: 'adaptive' | '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16';
  duration: number;
  seed: number;
  cameraFixed: boolean;
  watermark: boolean;
  generateAudio: boolean;
  returnLastFrame: boolean;
}

interface ModeInputState {
  prompt: string;
  firstFrameFile: File | null;
  lastFrameFile: File | null;
  referenceImageFile: File | null;
  referenceImageUrl: string;
  referenceImageSource: UploadSource;
  referenceVideoFile: File | null;
  referenceVideoUrl: string;
  referenceVideoSource: UploadSource;
  extendVideoFiles: File[];
}

interface SeedreamFormState {
  model: SeedreamModel;
  prompt: string;
  size: string;
  outputFormat: 'png' | 'jpeg';
  watermark: boolean;
  imageSource: 'none' | UploadSource;
  imageFile: File | null;
  imageUrl: string;
}

interface UploadedTempAsset {
  uploadUrl: string;
  publicUrl: string;
}

const FIXED_API_KEY = String((seedanceConfig as {volcen_key?: string})?.volcen_key || '').trim();
const DEFAULT_UPLOAD_BASE_URL = String((import.meta as any)?.env?.VITE_SEEDANCE_UPLOAD_BASE_URL || '').trim();

const MODE_META: Record<ExperienceMode, {label: string; description: string}> = {
  text_to_video: {
    label: '文生视频',
    description: '只需要输入提示词，最适合快速体验。',
  },
  image_first_frame: {
    label: '图生视频-首帧',
    description: '上传 1 张首帧图片，配合提示词生成视频。',
  },
  image_first_last: {
    label: '图生视频-首尾帧',
    description: '上传首帧与尾帧，控制视频开头和结尾画面。',
  },
  multimodal_reference: {
    label: '多模态参考',
    description: '可同时上传参考图片与参考视频，提示词控制风格与动作。',
  },
  video_extend: {
    label: '延长视频',
    description: '上传 1-3 段参考视频，让模型继续生成后续镜头。',
  },
};

const defaultFormState: FormState = {
  model: 'doubao-seedance-2-0-260128',
  resolution: '720p',
  ratio: '16:9',
  duration: 8,
  seed: -1,
  cameraFixed: false,
  watermark: true,
  generateAudio: true,
  returnLastFrame: false,
};

const defaultModeInputState: ModeInputState = {
  prompt: '',
  firstFrameFile: null,
  lastFrameFile: null,
  referenceImageFile: null,
  referenceImageUrl: '',
  referenceImageSource: 'file',
  referenceVideoFile: null,
  referenceVideoUrl: '',
  referenceVideoSource: 'file',
  extendVideoFiles: [],
};

const defaultSeedreamFormState: SeedreamFormState = {
  model: 'doubao-seedream-5-0-lite-260128',
  prompt: '',
  size: '2048x2048',
  outputFormat: 'png',
  watermark: false,
  imageSource: 'none',
  imageFile: null,
  imageUrl: '',
};

const SEEDREAM_RESOLUTION_OPTIONS: Record<SeedreamModel, Array<{value: string; label: string}>> = {
  'doubao-seedream-5-0-lite-260128': [
    {value: '2048x2048', label: '2K · 1:1 · 2048x2048'},
    {value: '1728x2304', label: '2K · 3:4 · 1728x2304'},
    {value: '2304x1728', label: '2K · 4:3 · 2304x1728'},
    {value: '2848x1600', label: '2K · 16:9 · 2848x1600'},
    {value: '1600x2848', label: '2K · 9:16 · 1600x2848'},
    {value: '2496x1664', label: '2K · 3:2 · 2496x1664'},
    {value: '1664x2496', label: '2K · 2:3 · 1664x2496'},
    {value: '3136x1344', label: '2K · 21:9 · 3136x1344'},
    {value: '3072x3072', label: '3K · 1:1 · 3072x3072'},
    {value: '2592x3456', label: '3K · 3:4 · 2592x3456'},
    {value: '3456x2592', label: '3K · 4:3 · 3456x2592'},
    {value: '4096x2304', label: '3K · 16:9 · 4096x2304'},
    {value: '2304x4096', label: '3K · 9:16 · 2304x4096'},
    {value: '2496x3744', label: '3K · 2:3 · 2496x3744'},
    {value: '3744x2496', label: '3K · 3:2 · 3744x2496'},
    {value: '4704x2016', label: '3K · 21:9 · 4704x2016'},
  ],
  'doubao-seedream-5-0-260128': [
    {value: '2048x2048', label: '2K · 1:1 · 2048x2048'},
    {value: '1728x2304', label: '2K · 3:4 · 1728x2304'},
    {value: '2304x1728', label: '2K · 4:3 · 2304x1728'},
    {value: '2848x1600', label: '2K · 16:9 · 2848x1600'},
    {value: '1600x2848', label: '2K · 9:16 · 1600x2848'},
    {value: '2496x1664', label: '2K · 3:2 · 2496x1664'},
    {value: '1664x2496', label: '2K · 2:3 · 1664x2496'},
    {value: '3136x1344', label: '2K · 21:9 · 3136x1344'},
    {value: '3072x3072', label: '3K · 1:1 · 3072x3072'},
    {value: '2592x3456', label: '3K · 3:4 · 2592x3456'},
    {value: '3456x2592', label: '3K · 4:3 · 3456x2592'},
    {value: '4096x2304', label: '3K · 16:9 · 4096x2304'},
    {value: '2304x4096', label: '3K · 9:16 · 2304x4096'},
    {value: '2496x3744', label: '3K · 2:3 · 2496x3744'},
    {value: '3744x2496', label: '3K · 3:2 · 3744x2496'},
    {value: '4704x2016', label: '3K · 21:9 · 4704x2016'},
  ],
  'doubao-seedream-4-5-251128': [
    {value: '2048x2048', label: '2K · 1:1 · 2048x2048'},
    {value: '1728x2304', label: '2K · 3:4 · 1728x2304'},
    {value: '2304x1728', label: '2K · 4:3 · 2304x1728'},
    {value: '2848x1600', label: '2K · 16:9 · 2848x1600'},
    {value: '1600x2848', label: '2K · 9:16 · 1600x2848'},
    {value: '2496x1664', label: '2K · 3:2 · 2496x1664'},
    {value: '1664x2496', label: '2K · 2:3 · 1664x2496'},
    {value: '3136x1344', label: '2K · 21:9 · 3136x1344'},
    {value: '4096x4096', label: '4K · 1:1 · 4096x4096'},
    {value: '3520x4704', label: '4K · 3:4 · 3520x4704'},
    {value: '4704x3520', label: '4K · 4:3 · 4704x3520'},
    {value: '5504x3040', label: '4K · 16:9 · 5504x3040'},
    {value: '3040x5504', label: '4K · 9:16 · 3040x5504'},
    {value: '3328x4992', label: '4K · 2:3 · 3328x4992'},
    {value: '4992x3328', label: '4K · 3:2 · 4992x3328'},
    {value: '6240x2656', label: '4K · 21:9 · 6240x2656'},
  ],
  'doubao-seedream-4-0-250828': [
    {value: '1024x1024', label: '1K · 1:1 · 1024x1024'},
    {value: '864x1152', label: '1K · 3:4 · 864x1152'},
    {value: '1152x864', label: '1K · 4:3 · 1152x864'},
    {value: '1312x736', label: '1K · 16:9 · 1312x736'},
    {value: '736x1312', label: '1K · 9:16 · 736x1312'},
    {value: '832x1248', label: '1K · 2:3 · 832x1248'},
    {value: '1248x832', label: '1K · 3:2 · 1248x832'},
    {value: '1568x672', label: '1K · 21:9 · 1568x672'},
    {value: '2048x2048', label: '2K · 1:1 · 2048x2048'},
    {value: '1728x2304', label: '2K · 3:4 · 1728x2304'},
    {value: '2304x1728', label: '2K · 4:3 · 2304x1728'},
    {value: '2848x1600', label: '2K · 16:9 · 2848x1600'},
    {value: '1600x2848', label: '2K · 9:16 · 1600x2848'},
    {value: '2496x1664', label: '2K · 3:2 · 2496x1664'},
    {value: '1664x2496', label: '2K · 2:3 · 1664x2496'},
    {value: '3136x1344', label: '2K · 21:9 · 3136x1344'},
    {value: '4096x4096', label: '4K · 1:1 · 4096x4096'},
    {value: '3520x4704', label: '4K · 3:4 · 3520x4704'},
    {value: '4704x3520', label: '4K · 4:3 · 4704x3520'},
    {value: '5504x3040', label: '4K · 16:9 · 5504x3040'},
    {value: '3040x5504', label: '4K · 9:16 · 3040x5504'},
    {value: '3328x4992', label: '4K · 2:3 · 3328x4992'},
    {value: '4992x3328', label: '4K · 3:2 · 4992x3328'},
    {value: '6240x2656', label: '4K · 21:9 · 6240x2656'},
  ],
};

function getAutoFormDefaults(model: SeedanceModel, mode: ExperienceMode): Partial<FormState> {
  const isFast = model === 'doubao-seedance-2-0-fast-260128';
  const baseDuration = isFast ? 6 : 8;

  switch (mode) {
    case 'text_to_video':
      return {
        resolution: isFast ? '720p' : '1080p',
        ratio: '16:9',
        duration: baseDuration,
        returnLastFrame: false,
        cameraFixed: false,
      };
    case 'image_first_frame':
      return {
        resolution: '720p',
        ratio: '16:9',
        duration: baseDuration,
        returnLastFrame: false,
        cameraFixed: false,
      };
    case 'image_first_last':
      return {
        resolution: '720p',
        ratio: '16:9',
        duration: baseDuration,
        returnLastFrame: true,
        cameraFixed: false,
      };
    case 'multimodal_reference':
      return {
        resolution: '720p',
        ratio: '16:9',
        duration: baseDuration,
        returnLastFrame: false,
        cameraFixed: true,
      };
    case 'video_extend':
      return {
        resolution: '720p',
        ratio: 'adaptive',
        duration: baseDuration,
        returnLastFrame: false,
        cameraFixed: true,
      };
    default:
      return {};
  }
}

function resolveUploadBase(): string {
  const explicit = DEFAULT_UPLOAD_BASE_URL.replace(/\/+$/, '');
  if (explicit) {
    return explicit;
  }
  return window.location.origin.replace(/\/+$/, '');
}

function joinUrl(base: string, path: string): string {
  if (!path.startsWith('/')) {
    return `${base}/${path}`;
  }
  return `${base}${path}`;
}

function sanitizeFileName(rawName: string): string {
  return rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function extractVideoUrl(task: SeedanceTaskResponse | null): string {
  if (!task) {
    return '';
  }

  const candidates = [
    task.content?.video_url,
    (task as any).video_url,
    (task as any).data?.video_url,
    (task as any).result?.video_url,
    (task as any).videos?.[0]?.url,
    (task as any).videos?.[0]?.uri,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return '';
}

function extractLastFrameUrl(task: SeedanceTaskResponse | null): string {
  if (!task) {
    return '';
  }

  const candidates = [
    task.content?.last_frame_url,
    (task as any).last_frame_url,
    (task as any).data?.last_frame_url,
    (task as any).result?.last_frame_url,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return '';
}

function extractSeedreamImageUrl(response: SeedreamGenerateResponse | null): string {
  const url = response?.data?.[0]?.url;
  if (typeof url === 'string' && url.trim()) {
    return url.trim();
  }
  return '';
}

function buildSeedancePayload(form: FormState, content: Array<Record<string, unknown>>): SeedanceCreatePayload {
  return {
    model: form.model,
    content,
    resolution: form.resolution,
    ratio: form.ratio,
    duration: form.duration,
    seed: form.seed,
    camera_fixed: form.cameraFixed,
    watermark: form.watermark,
    generate_audio: form.generateAudio,
    return_last_frame: form.returnLastFrame,
  };
}

function buildPreviewContent(mode: ExperienceMode, inputs: ModeInputState): Array<Record<string, unknown>> {
  const content: Array<Record<string, unknown>> = [];
  const prompt = inputs.prompt.trim();

  if (prompt) {
    content.push({
      type: 'text',
      text: prompt,
    });
  }

  if (mode === 'image_first_frame' && inputs.firstFrameFile) {
    content.push({
      type: 'image_url',
      image_url: {url: `local://${inputs.firstFrameFile.name}`},
      role: 'first_frame',
    });
  }

  if (mode === 'image_first_last') {
    if (inputs.firstFrameFile) {
      content.push({
        type: 'image_url',
        image_url: {url: `local://${inputs.firstFrameFile.name}`},
        role: 'first_frame',
      });
    }
    if (inputs.lastFrameFile) {
      content.push({
        type: 'image_url',
        image_url: {url: `local://${inputs.lastFrameFile.name}`},
        role: 'last_frame',
      });
    }
  }

  if (mode === 'multimodal_reference') {
    if (inputs.referenceImageSource === 'url' && inputs.referenceImageUrl.trim()) {
      content.push({
        type: 'image_url',
        image_url: {url: inputs.referenceImageUrl.trim()},
        role: 'reference_image',
      });
    } else if (inputs.referenceImageFile) {
      content.push({
        type: 'image_url',
        image_url: {url: `local://${inputs.referenceImageFile.name}`},
        role: 'reference_image',
      });
    }

    if (inputs.referenceVideoSource === 'url' && inputs.referenceVideoUrl.trim()) {
      content.push({
        type: 'video_url',
        video_url: {url: inputs.referenceVideoUrl.trim()},
        role: 'reference_video',
      });
    } else if (inputs.referenceVideoFile) {
      content.push({
        type: 'video_url',
        video_url: {url: `local://${inputs.referenceVideoFile.name}`},
        role: 'reference_video',
      });
    }
  }

  if (mode === 'video_extend') {
    for (const file of inputs.extendVideoFiles.slice(0, 3)) {
      content.push({
        type: 'video_url',
        video_url: {url: `local://${file.name}`},
        role: 'reference_video',
      });
    }
  }

  return content;
}

export default function App() {
  const [requestTab, setRequestTab] = useState<RequestTab>('seedance');
  const [mode, setMode] = useState<ExperienceMode>('text_to_video');
  const [form, setForm] = useState<FormState>(defaultFormState);
  const [inputs, setInputs] = useState<ModeInputState>(defaultModeInputState);
  const [seedreamForm, setSeedreamForm] = useState<SeedreamFormState>(defaultSeedreamFormState);
  const [fileInputEpoch, setFileInputEpoch] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [currentTaskId, setCurrentTaskId] = useState<string>('');
  const [currentTask, setCurrentTask] = useState<SeedanceTaskResponse | null>(null);
  const [taskHistory, setTaskHistory] = useState<SeedanceTaskResponse[]>([]);
  const [isPolling, setIsPolling] = useState(false);
  const [seedreamSubmitting, setSeedreamSubmitting] = useState(false);
  const [seedreamError, setSeedreamError] = useState('');
  const [seedreamResponse, setSeedreamResponse] = useState<SeedreamGenerateResponse | null>(null);
  const pendingCleanupRef = useRef(new Map<string, UploadedTempAsset[]>());

  const upsertTaskHistory = useCallback((task: SeedanceTaskResponse) => {
    setTaskHistory((prev) => {
      const filtered = prev.filter((item) => item.id !== task.id);
      return [task, ...filtered].slice(0, 20);
    });
  }, []);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      ...getAutoFormDefaults(prev.model, mode),
    }));

    setInputs((prev) => ({
      ...prev,
      firstFrameFile: null,
      lastFrameFile: null,
      referenceImageFile: null,
      referenceImageUrl: '',
      referenceVideoFile: null,
      referenceVideoUrl: '',
      extendVideoFiles: [],
    }));
    setFileInputEpoch((prev) => prev + 1);
  }, [mode]);

  const seedreamResolutionOptions = useMemo(() => {
    return SEEDREAM_RESOLUTION_OPTIONS[seedreamForm.model] || [];
  }, [seedreamForm.model]);

  useEffect(() => {
    if (seedreamResolutionOptions.length === 0) {
      return;
    }
    const hasCurrent = seedreamResolutionOptions.some((option) => option.value === seedreamForm.size);
    if (!hasCurrent) {
      setSeedreamForm((prev) => ({
        ...prev,
        size: seedreamResolutionOptions[0].value,
      }));
    }
  }, [seedreamForm.size, seedreamResolutionOptions]);

  const cleanupTempAssets = useCallback(async (assets: UploadedTempAsset[]) => {
    if (assets.length === 0) {
      return;
    }

    await Promise.all(
      assets.map(async (asset) => {
        try {
          await fetch(asset.uploadUrl, {method: 'DELETE'});
        } catch {
          // Best effort cleanup; server may not support DELETE in all environments.
        }
      }),
    );
  }, []);

  const refreshTask = useCallback(
    async (taskId: string) => {
      if (!taskId || !FIXED_API_KEY) {
        return;
      }

      const task = await getSeedanceTask(taskId, FIXED_API_KEY);
      setCurrentTask(task);
      upsertTaskHistory(task);

      if (isTerminalTaskStatus(task.status)) {
        setIsPolling(false);
        const pendingAssets = pendingCleanupRef.current.get(task.id);
        if (pendingAssets && pendingAssets.length > 0) {
          pendingCleanupRef.current.delete(task.id);
          await cleanupTempAssets(pendingAssets);
        }
      }
    },
    [cleanupTempAssets, upsertTaskHistory],
  );

  useEffect(() => {
    if (!isPolling || !currentTaskId) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshTask(currentTaskId).catch((error) => {
        setErrorMessage(String((error as Error)?.message || '轮询任务失败'));
      });
    }, 8000);

    return () => window.clearInterval(timer);
  }, [currentTaskId, isPolling, refreshTask]);

  const previewPayload = useMemo(() => {
    try {
      const content = buildPreviewContent(mode, inputs);
      const payload = buildSeedancePayload(form, content);
      return JSON.stringify(payload, null, 2);
    } catch (error) {
      return `Payload 解析错误: ${String((error as Error)?.message || error)}`;
    }
  }, [form, inputs, mode]);

  const seedreamPreviewPayload = useMemo(() => {
    const payload: SeedreamGeneratePayload = {
      model: seedreamForm.model,
      prompt: seedreamForm.prompt.trim(),
      size: seedreamForm.size,
      output_format: seedreamForm.outputFormat,
      response_format: 'url',
      watermark: seedreamForm.watermark,
    };

    if (seedreamForm.imageSource === 'url' && seedreamForm.imageUrl.trim()) {
      payload.image = seedreamForm.imageUrl.trim();
    } else if (seedreamForm.imageSource === 'file' && seedreamForm.imageFile) {
      payload.image = `local://${seedreamForm.imageFile.name}`;
    }

    return JSON.stringify(payload, null, 2);
  }, [seedreamForm]);

  const videoUrl = extractVideoUrl(currentTask);
  const lastFrameUrl = extractLastFrameUrl(currentTask);
  const seedreamImageUrl = extractSeedreamImageUrl(seedreamResponse);

  const uploadTempAsset = useCallback(async (file: File): Promise<UploadedTempAsset> => {
    const base = resolveUploadBase();
    const normalizedName = sanitizeFileName(file.name || 'file.bin');
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${normalizedName}`;
    const encodedName = encodeURIComponent(fileName);
    const uploadPath = `/standalone/s_seedance2_test/temp_seedance2/${encodedName}`;
    const uploadUrl = joinUrl(base, uploadPath);

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: file,
    });

    if (!response.ok) {
      throw new Error(`上传素材失败（${file.name}），HTTP ${response.status}`);
    }

    return {
      uploadUrl,
      publicUrl: joinUrl(base, uploadPath),
    };
  }, []);

  const clearLocalMediaSelections = useCallback(() => {
    setInputs((prev) => ({
      ...prev,
      firstFrameFile: null,
      lastFrameFile: null,
      referenceImageFile: null,
      referenceImageUrl: '',
      referenceImageSource: 'file',
      referenceVideoFile: null,
      referenceVideoUrl: '',
      referenceVideoSource: 'file',
      extendVideoFiles: [],
    }));
    setFileInputEpoch((prev) => prev + 1);
  }, []);

  const buildContentAndUpload = useCallback(async (): Promise<{content: Array<Record<string, unknown>>; uploaded: UploadedTempAsset[]}> => {
    const content: Array<Record<string, unknown>> = [];
    const uploaded: UploadedTempAsset[] = [];

    const prompt = inputs.prompt.trim();
    if (prompt) {
      content.push({
        type: 'text',
        text: prompt,
      });
    }

    const pushUploadedImage = async (file: File, role: 'first_frame' | 'last_frame' | 'reference_image') => {
      const asset = await uploadTempAsset(file);
      uploaded.push(asset);
      content.push({
        type: 'image_url',
        image_url: {url: asset.publicUrl},
        role,
      });
    };

    const pushUploadedVideo = async (file: File, role: 'reference_video') => {
      const asset = await uploadTempAsset(file);
      uploaded.push(asset);
      content.push({
        type: 'video_url',
        video_url: {url: asset.publicUrl},
        role,
      });
    };

    if (mode === 'text_to_video') {
      if (!prompt) {
        throw new Error('文生视频模式需要填写提示词。');
      }
      return {content, uploaded};
    }

    if (mode === 'image_first_frame') {
      if (!inputs.firstFrameFile) {
        throw new Error('请上传首帧图片。');
      }
      await pushUploadedImage(inputs.firstFrameFile, 'first_frame');
      return {content, uploaded};
    }

    if (mode === 'image_first_last') {
      if (!inputs.firstFrameFile || !inputs.lastFrameFile) {
        throw new Error('请上传首帧和尾帧图片。');
      }
      await pushUploadedImage(inputs.firstFrameFile, 'first_frame');
      await pushUploadedImage(inputs.lastFrameFile, 'last_frame');
      return {content, uploaded};
    }

    if (mode === 'multimodal_reference') {
      const imageUrl = inputs.referenceImageUrl.trim();
      const videoUrl = inputs.referenceVideoUrl.trim();

      if (inputs.referenceImageSource === 'url') {
        if (imageUrl) {
          content.push({
            type: 'image_url',
            image_url: {url: imageUrl},
            role: 'reference_image',
          });
        }
      } else if (inputs.referenceImageFile) {
        await pushUploadedImage(inputs.referenceImageFile, 'reference_image');
      }

      if (inputs.referenceVideoSource === 'url') {
        if (videoUrl) {
          content.push({
            type: 'video_url',
            video_url: {url: videoUrl},
            role: 'reference_video',
          });
        }
      } else if (inputs.referenceVideoFile) {
        await pushUploadedVideo(inputs.referenceVideoFile, 'reference_video');
      }

      const hasImage = inputs.referenceImageSource === 'url' ? Boolean(imageUrl) : Boolean(inputs.referenceImageFile);
      const hasVideo = inputs.referenceVideoSource === 'url' ? Boolean(videoUrl) : Boolean(inputs.referenceVideoFile);

      if (!prompt && !hasImage && !hasVideo) {
        throw new Error('多模态参考模式至少需要提示词、参考图片或参考视频其中之一。');
      }
      return {content, uploaded};
    }

    const extendFiles = inputs.extendVideoFiles.slice(0, 3);
    if (extendFiles.length === 0) {
      throw new Error('延长视频模式请至少上传 1 个参考视频。');
    }
    for (const file of extendFiles) {
      await pushUploadedVideo(file, 'reference_video');
    }

    return {content, uploaded};
  }, [inputs, mode, uploadTempAsset]);

  async function onCreateTask() {
    let uploadedAssets: UploadedTempAsset[] = [];
    let createdTaskID = '';

    try {
      setErrorMessage('');

      if (!FIXED_API_KEY) {
        throw new Error('配置文件缺少固定 API Key（config/config.json -> volcen_key）。');
      }

      setSubmitting(true);

      const built = await buildContentAndUpload();
      uploadedAssets = built.uploaded;

      const payload = buildSeedancePayload(form, built.content);

      const created = await createSeedanceTask(payload, FIXED_API_KEY);
      createdTaskID = created.id;
      if (uploadedAssets.length > 0) {
        pendingCleanupRef.current.set(created.id, uploadedAssets);
      }

      setCurrentTaskId(created.id);
      setIsPolling(true);
      await refreshTask(created.id);
    } catch (error) {
      setErrorMessage(String((error as Error)?.message || '创建任务失败'));
      setIsPolling(false);
    } finally {
      if (!createdTaskID && uploadedAssets.length > 0) {
        await cleanupTempAssets(uploadedAssets);
      }
      clearLocalMediaSelections();
      setSubmitting(false);
    }
  }

  async function onGenerateSeedream() {
    let uploadedAsset: UploadedTempAsset | null = null;
    try {
      setSeedreamError('');
      setSeedreamResponse(null);

      if (!FIXED_API_KEY) {
        throw new Error('配置文件缺少固定 API Key（config/config.json -> volcen_key）。');
      }

      const prompt = seedreamForm.prompt.trim();
      if (!prompt) {
        throw new Error('Seedream 模式请填写提示词。');
      }

      setSeedreamSubmitting(true);

      const payload: SeedreamGeneratePayload = {
        model: seedreamForm.model,
        prompt,
        size: seedreamForm.size,
        output_format: seedreamForm.outputFormat,
        response_format: 'url',
        watermark: seedreamForm.watermark,
      };

      if (seedreamForm.imageSource === 'url') {
        const url = seedreamForm.imageUrl.trim();
        if (url) {
          payload.image = url;
        }
      } else if (seedreamForm.imageSource === 'file' && seedreamForm.imageFile) {
        uploadedAsset = await uploadTempAsset(seedreamForm.imageFile);
        payload.image = uploadedAsset.publicUrl;
      }

      const response = await generateSeedreamImage(payload, FIXED_API_KEY);
      setSeedreamResponse(response);
    } catch (error) {
      setSeedreamError(String((error as Error)?.message || 'Seedream 生图失败'));
    } finally {
      if (uploadedAsset) {
        await cleanupTempAssets([uploadedAsset]);
      }
      setSeedreamSubmitting(false);
    }
  }

  return (
    <div className="page">
      <header className="hero">
        <h1>Seedance / Seedream 体验版</h1>
        <p>请求配置已拆分为双标签：Seedance 2.0 视频生成 + Seedream 图像生成。</p>
      </header>

      <main className="layout">
        <section className="panel">
          <h2>请求配置</h2>

          <div className="tab-row">
            <button
              type="button"
              className={requestTab === 'seedance' ? 'tab-btn active' : 'tab-btn'}
              onClick={() => setRequestTab('seedance')}
            >
              Seedance 2.0
            </button>
            <button
              type="button"
              className={requestTab === 'seedream' ? 'tab-btn active' : 'tab-btn'}
              onClick={() => setRequestTab('seedream')}
            >
              Seedream
            </button>
          </div>

          <p className="hint">API Key 已固定读取 config/config.json，无需手动输入。</p>

          {requestTab === 'seedance' ? (
            <>
          <div className="field-grid two-col">
            <label>
              Model
              <select
                value={form.model}
                onChange={(event) => {
                  const nextModel = event.target.value as SeedanceModel;
                  setForm((prev) => ({
                    ...prev,
                    model: nextModel,
                    ...getAutoFormDefaults(nextModel, mode),
                  }));
                }}
              >
                <option value="doubao-seedance-2-0-260128">doubao-seedance-2-0-260128</option>
                <option value="doubao-seedance-2-0-fast-260128">doubao-seedance-2-0-fast-260128</option>
              </select>
            </label>

            <label>
              功能模式
              <select value={mode} onChange={(event) => setMode(event.target.value as ExperienceMode)}>
                {Object.entries(MODE_META).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="hint">{MODE_META[mode].description}</p>

          <h3>输入设置</h3>
          <label>
            提示词
            <textarea
              rows={4}
              value={inputs.prompt}
              onChange={(event) => setInputs((prev) => ({...prev, prompt: event.target.value}))}
              placeholder="描述你想生成的视频内容、镜头、风格和动作。"
            />
          </label>

          {mode === 'image_first_frame' ? (
            <label>
              首帧图片
              <input
                key={`first-frame-${fileInputEpoch}`}
                type="file"
                accept="image/*"
                onChange={(event) =>
                  setInputs((prev) => ({
                    ...prev,
                    firstFrameFile: event.target.files?.[0] || null,
                  }))
                }
              />
            </label>
          ) : null}

          {mode === 'image_first_last' ? (
            <div className="field-grid two-col">
              <label>
                首帧图片
                <input
                  key={`first-last-first-${fileInputEpoch}`}
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    setInputs((prev) => ({
                      ...prev,
                      firstFrameFile: event.target.files?.[0] || null,
                    }))
                  }
                />
              </label>

              <label>
                尾帧图片
                <input
                  key={`first-last-last-${fileInputEpoch}`}
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    setInputs((prev) => ({
                      ...prev,
                      lastFrameFile: event.target.files?.[0] || null,
                    }))
                  }
                />
              </label>
            </div>
          ) : null}

          {mode === 'multimodal_reference' ? (
            <div className="field-grid two-col">
              <label>
                参考图片（可选）
                <select
                  value={inputs.referenceImageSource}
                  onChange={(event) =>
                    setInputs((prev) => ({
                      ...prev,
                      referenceImageSource: event.target.value as UploadSource,
                      referenceImageFile: null,
                      referenceImageUrl: '',
                    }))
                  }
                >
                  <option value="file">上传文件</option>
                  <option value="url">使用 URL</option>
                </select>
                {inputs.referenceImageSource === 'file' ? (
                  <input
                    key={`multi-image-${fileInputEpoch}`}
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      setInputs((prev) => ({
                        ...prev,
                        referenceImageFile: event.target.files?.[0] || null,
                      }))
                    }
                  />
                ) : (
                  <input
                    type="url"
                    placeholder="https://example.com/reference-image.png"
                    value={inputs.referenceImageUrl}
                    onChange={(event) =>
                      setInputs((prev) => ({
                        ...prev,
                        referenceImageUrl: event.target.value,
                      }))
                    }
                  />
                )}
              </label>

              <label>
                参考视频（可选）
                <select
                  value={inputs.referenceVideoSource}
                  onChange={(event) =>
                    setInputs((prev) => ({
                      ...prev,
                      referenceVideoSource: event.target.value as UploadSource,
                      referenceVideoFile: null,
                      referenceVideoUrl: '',
                    }))
                  }
                >
                  <option value="file">上传文件</option>
                  <option value="url">使用 URL</option>
                </select>
                {inputs.referenceVideoSource === 'file' ? (
                  <input
                    key={`multi-video-${fileInputEpoch}`}
                    type="file"
                    accept="video/*"
                    onChange={(event) =>
                      setInputs((prev) => ({
                        ...prev,
                        referenceVideoFile: event.target.files?.[0] || null,
                      }))
                    }
                  />
                ) : (
                  <input
                    type="url"
                    placeholder="https://example.com/reference-video.mp4"
                    value={inputs.referenceVideoUrl}
                    onChange={(event) =>
                      setInputs((prev) => ({
                        ...prev,
                        referenceVideoUrl: event.target.value,
                      }))
                    }
                  />
                )}
              </label>
            </div>
          ) : null}

          {mode === 'video_extend' ? (
            <label>
              参考视频（1-3 个）
              <input
                key={`extend-videos-${fileInputEpoch}`}
                type="file"
                accept="video/*"
                multiple
                onChange={(event) =>
                  setInputs((prev) => ({
                    ...prev,
                    extendVideoFiles: Array.from(event.target.files || []).slice(0, 3),
                  }))
                }
              />
            </label>
          ) : null}

          {inputs.firstFrameFile ||
          inputs.lastFrameFile ||
          inputs.referenceImageFile ||
          inputs.referenceImageUrl ||
          inputs.referenceVideoFile ||
          inputs.referenceVideoUrl ||
          inputs.extendVideoFiles.length > 0 ? (
            <p className="hint">
              已选素材：
              {[
                inputs.firstFrameFile?.name,
                inputs.lastFrameFile?.name,
                inputs.referenceImageFile?.name,
                inputs.referenceImageUrl,
                inputs.referenceVideoFile?.name,
                inputs.referenceVideoUrl,
                ...inputs.extendVideoFiles.map((file) => file.name),
              ]
                .filter(Boolean)
                .join(' / ')}
            </p>
          ) : null}

          <h3>输出设置</h3>
          <div className="field-grid three-col">
            <label>
              分辨率
              <select
                value={form.resolution}
                onChange={(event) => setForm((prev) => ({...prev, resolution: event.target.value as FormState['resolution']}))}
              >
                <option value="480p">480p</option>
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
              </select>
            </label>

            <label>
              画幅比例
              <select value={form.ratio} onChange={(event) => setForm((prev) => ({...prev, ratio: event.target.value as FormState['ratio']}))}>
                <option value="adaptive">adaptive</option>
                <option value="21:9">21:9</option>
                <option value="16:9">16:9</option>
                <option value="4:3">4:3</option>
                <option value="1:1">1:1</option>
                <option value="3:4">3:4</option>
                <option value="9:16">9:16</option>
              </select>
            </label>

            <label>
              时长（秒）
              <input
                type="number"
                value={form.duration}
                onChange={(event) => setForm((prev) => ({...prev, duration: Number(event.target.value)}))}
                min={1}
                max={15}
              />
            </label>

            <label>
              随机种子
              <input
                type="number"
                value={form.seed}
                onChange={(event) => setForm((prev) => ({...prev, seed: Number(event.target.value)}))}
              />
            </label>
          </div>

          <div className="switch-grid">
            <label>
              <input
                type="checkbox"
                checked={form.generateAudio}
                onChange={(event) => setForm((prev) => ({...prev, generateAudio: event.target.checked}))}
              />
              生成音频
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.watermark}
                onChange={(event) => setForm((prev) => ({...prev, watermark: event.target.checked}))}
              />
              添加水印
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.returnLastFrame}
                onChange={(event) => setForm((prev) => ({...prev, returnLastFrame: event.target.checked}))}
              />
              返回尾帧图
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.cameraFixed}
                onChange={(event) => setForm((prev) => ({...prev, cameraFixed: event.target.checked}))}
              />
              固定运镜
            </label>
          </div>

          <div className="actions">
            <button type="button" onClick={onCreateTask} disabled={submitting}>
              {submitting ? '提交中...' : '创建任务'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (currentTaskId) {
                  void refreshTask(currentTaskId).catch((error) => {
                    setErrorMessage(String((error as Error)?.message || '刷新失败'));
                  });
                }
              }}
              disabled={!currentTaskId}
            >
              手动刷新状态
            </button>
          </div>

          {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

          <label>
            请求预览
            <textarea rows={12} readOnly value={previewPayload} className="code-preview" />
          </label>
            </>
          ) : (
            <>
              <p className="hint">参考 docs/seedream.md：使用 Ark 图片生成接口，返回 URL 展示结果。</p>

              <div className="field-grid two-col">
                <label>
                  Model
                  <select
                    value={seedreamForm.model}
                    onChange={(event) => {
                      const nextModel = event.target.value as SeedreamModel;
                      const nextSizes = SEEDREAM_RESOLUTION_OPTIONS[nextModel] || [];
                      setSeedreamForm((prev) => ({
                        ...prev,
                        model: nextModel,
                        size: nextSizes[0]?.value || prev.size,
                      }));
                    }}
                  >
                    <option value="doubao-seedream-5-0-lite-260128">doubao-seedream-5-0-lite-260128</option>
                    <option value="doubao-seedream-5-0-260128">doubao-seedream-5-0-260128</option>
                    <option value="doubao-seedream-4-5-251128">doubao-seedream-4-5-251128</option>
                    <option value="doubao-seedream-4-0-250828">doubao-seedream-4-0-250828</option>
                  </select>
                </label>

                <label>
                  输入图（可选）
                  <select
                    value={seedreamForm.imageSource}
                    onChange={(event) =>
                      setSeedreamForm((prev) => ({
                        ...prev,
                        imageSource: event.target.value as SeedreamFormState['imageSource'],
                        imageFile: null,
                        imageUrl: '',
                      }))
                    }
                  >
                    <option value="none">不使用输入图</option>
                    <option value="file">上传文件</option>
                    <option value="url">使用 URL</option>
                  </select>
                </label>
              </div>

              <label>
                提示词
                <textarea
                  rows={4}
                  value={seedreamForm.prompt}
                  onChange={(event) => setSeedreamForm((prev) => ({...prev, prompt: event.target.value}))}
                  placeholder="输入用于生图的描述，例如场景、风格、构图与主体。"
                />
              </label>

              {seedreamForm.imageSource === 'file' ? (
                <label>
                  输入图片文件
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      setSeedreamForm((prev) => ({
                        ...prev,
                        imageFile: event.target.files?.[0] || null,
                      }))
                    }
                  />
                </label>
              ) : null}

              {seedreamForm.imageSource === 'url' ? (
                <label>
                  输入图片 URL
                  <input
                    type="url"
                    value={seedreamForm.imageUrl}
                    placeholder="https://example.com/input-image.png"
                    onChange={(event) => setSeedreamForm((prev) => ({...prev, imageUrl: event.target.value}))}
                  />
                </label>
              ) : null}

              <div className="field-grid two-col">
                <label>
                  尺寸
                  <select value={seedreamForm.size} onChange={(event) => setSeedreamForm((prev) => ({...prev, size: event.target.value as SeedreamFormState['size']}))}>
                    {seedreamResolutionOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  输出格式
                  <select
                    value={seedreamForm.outputFormat}
                    onChange={(event) => setSeedreamForm((prev) => ({...prev, outputFormat: event.target.value as SeedreamFormState['outputFormat']}))}
                  >
                    <option value="png">png</option>
                    <option value="jpeg">jpeg</option>
                  </select>
                </label>
              </div>

              <div className="switch-grid">
                <label>
                  <input
                    type="checkbox"
                    checked={seedreamForm.watermark}
                    onChange={(event) => setSeedreamForm((prev) => ({...prev, watermark: event.target.checked}))}
                  />
                  添加水印
                </label>
              </div>

              <div className="actions">
                <button type="button" onClick={onGenerateSeedream} disabled={seedreamSubmitting}>
                  {seedreamSubmitting ? '生成中...' : '生成图片'}
                </button>
              </div>

              {seedreamError ? <p className="error-text">{seedreamError}</p> : null}

              <label>
                请求预览
                <textarea rows={12} readOnly value={seedreamPreviewPayload} className="code-preview" />
              </label>
            </>
          )}
        </section>

        <section className="panel output-panel">
          <h2>任务结果</h2>

          {requestTab === 'seedream' ? (
            <>
              <div className="status-grid">
                <p>
                  <span>生成状态</span>
                  <strong>{seedreamSubmitting ? '生成中' : seedreamResponse ? '已完成' : '-'}</strong>
                </p>
                <p>
                  <span>固定 Key</span>
                  <strong>{FIXED_API_KEY ? '已加载' : '未配置'}</strong>
                </p>
              </div>

              {seedreamImageUrl ? (
                <div className="result-block">
                  <h3>图片 URL</h3>
                  <a href={seedreamImageUrl} target="_blank" rel="noreferrer">
                    {seedreamImageUrl}
                  </a>
                  <img src={seedreamImageUrl} alt="seedream result" />
                </div>
              ) : null}

              {seedreamError ? <p className="error-text">错误: {seedreamError}</p> : null}

              <label>
                原始响应
                <textarea
                  rows={18}
                  readOnly
                  value={seedreamResponse ? JSON.stringify(seedreamResponse, null, 2) : ''}
                  className="code-preview"
                />
              </label>
            </>
          ) : (
            <>
          <div className="status-grid">
            <p>
              <span>当前任务 ID</span>
              <strong>{currentTaskId || '-'}</strong>
            </p>
            <p>
              <span>状态</span>
              <strong>{currentTask?.status || '-'}</strong>
            </p>
            <p>
              <span>轮询</span>
              <strong>{isPolling ? '进行中' : '未轮询'}</strong>
            </p>
            <p>
              <span>固定 Key</span>
              <strong>{FIXED_API_KEY ? '已加载' : '未配置'}</strong>
            </p>
          </div>

          {videoUrl ? (
            <div className="result-block">
              <h3>视频地址</h3>
              <a href={videoUrl} target="_blank" rel="noreferrer">
                {videoUrl}
              </a>
              <video controls src={videoUrl} />
            </div>
          ) : null}

          {lastFrameUrl ? (
            <div className="result-block">
              <h3>尾帧图地址</h3>
              <a href={lastFrameUrl} target="_blank" rel="noreferrer">
                {lastFrameUrl}
              </a>
              <img src={lastFrameUrl} alt="last frame" />
            </div>
          ) : null}

          {currentTask?.error?.message ? <p className="error-text">错误: {currentTask.error.message}</p> : null}

          <h3>最近任务</h3>
          <ul className="history-list">
            {taskHistory.map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentTaskId(task.id);
                    setCurrentTask(task);
                    setIsPolling(!isTerminalTaskStatus(task.status));
                  }}
                >
                  <span>{task.id}</span>
                  <span>{task.status || 'unknown'}</span>
                </button>
              </li>
            ))}
            {taskHistory.length === 0 ? <li className="empty">暂无任务</li> : null}
          </ul>

          <label>
            当前任务原始响应
            <textarea
              rows={18}
              readOnly
              value={currentTask ? JSON.stringify(currentTask, null, 2) : ''}
              className="code-preview"
            />
          </label>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
