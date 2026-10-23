import React, { useRef, useState, useEffect } from 'react';
import { 
  Upload, 
  X, 
  Download, 
  Loader2,
  Sparkles,
  Smartphone,
  Monitor,
  Video as VideoIcon,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { motion } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { AspectRatio } from '../types';
import {
  createTaskQueueItem,
  extractImageDataUrlFromResponsePayload,
  generateGeminiContent,
  generateSeedanceVideo,
  queryTaskQueueVideo,
  querySeedanceVideoTask,
  uploadAssetToCOSDataUrl,
  updateTaskQueueItem,
} from '../lib/backendApi';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface VideoGeneratorProps {
  referenceImage: string | null;
  setReferenceImage: (img: string | null) => void;
}

interface VideoResult {
  id: string;
  title: string;
  durationSeconds: number;
  firstFrameUrl?: string;
  videoUrl?: string;
  isStarting?: boolean;
  isGenerating: boolean;
  isGeneratingFrame: boolean;
  isQueryingTask?: boolean;
  error?: string | null;
  prompt?: string;
  engine?: VideoEngine;
  seedanceTaskId?: string;
  seedanceTaskStatus?: string;
  queueTaskId?: number;
  queueTaskStatus?: string;
}

type VideoEngine = 'seedance';
type QueueStatus = 'queued' | 'running' | 'finished' | 'failed';

function openTaskManagerPanel(): void {
  try {
    if (window.top) {
      window.top.postMessage(
        {
          type: 'unityshop-open-task-manager',
        },
        window.location.origin
      );

      if (window.top !== window) {
        return;
      }
    }
  } catch {
    // Fall through to direct task manager fallback.
  }

  const target = new URL('/task-manager/', window.location.origin);
  target.searchParams.set('ui_v', '20260506a');

  try {
    const popup = window.open(target.toString(), `task_manager_${Date.now()}`, 'popup=yes,width=1400,height=920');
    if (popup) {
      popup.focus();
      return;
    }
  } catch {
    // Fall through to current-window redirect.
  }

  window.location.assign(target.toString());
}

export function VideoGenerator({
  referenceImage,
  setReferenceImage,
}: VideoGeneratorProps) {
  const APP_ID = 'lighting-fixtures-v2';
  const DEFAULT_VIDEO_DURATION_SECONDS = 4;
  const MIN_VIDEO_DURATION_SECONDS = 4;
  const MAX_VIDEO_DURATION_SECONDS = 15;
  const SEEDANCE_VIDEO_COST_PER_SECOND = 15;
  const VIDEO_MODEL_BY_ENGINE: Record<VideoEngine, string> = {
    seedance: 'doubao-seedance-2-0-fast-260128',
  };

  const createInitialVideos = (): VideoResult[] => [
    { id: '1', title: '视频 A：全景展示', durationSeconds: DEFAULT_VIDEO_DURATION_SECONDS, isGenerating: false, isGeneratingFrame: false, engine: 'seedance' },
    { id: '2', title: '视频 B：细节特写', durationSeconds: DEFAULT_VIDEO_DURATION_SECONDS, isGenerating: false, isGeneratingFrame: false, engine: 'seedance' },
    { id: '3', title: '视频 C：环绕视角', durationSeconds: DEFAULT_VIDEO_DURATION_SECONDS, isGenerating: false, isGeneratingFrame: false, engine: 'seedance' },
    { id: '4', title: '视频 D：垂直平移', durationSeconds: DEFAULT_VIDEO_DURATION_SECONDS, isGenerating: false, isGeneratingFrame: false, engine: 'seedance' },
  ];

  const normalizeSeedanceDurationSeconds = (videoSeconds?: number): number => {
    const parsedSeconds = Number(videoSeconds);
    if (!Number.isFinite(parsedSeconds)) {
      return DEFAULT_VIDEO_DURATION_SECONDS;
    }

    const roundedSeconds = Math.round(parsedSeconds);
    return Math.min(MAX_VIDEO_DURATION_SECONDS, Math.max(MIN_VIDEO_DURATION_SECONDS, roundedSeconds));
  };

  const resolveSeedanceVideoCost = (videoSeconds?: number): number => {
    const normalizedSeconds = normalizeSeedanceDurationSeconds(videoSeconds);
    return normalizedSeconds * SEEDANCE_VIDEO_COST_PER_SECOND;
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [resolution, setResolution] = useState<'720p' | '1080p'>('720p');
  const [isGenerating, setIsGenerating] = useState(false);
  const [videos, setVideos] = useState<VideoResult[]>(createInitialVideos);
  const [masterScene, setMasterScene] = useState<string | null>(null);
  const [isGeneratingMaster, setIsGeneratingMaster] = useState(false);
  const [userPrompt, setUserPrompt] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const videosRef = useRef<VideoResult[]>([]);
  const videoActionLocksRef = useRef<Record<string, boolean>>({});
  const pollingTimersRef = useRef<Record<string, number>>({});
  const FRAME_IMAGE_COST = 10;

  const getVideoModelByEngine = (engine: VideoEngine): string => VIDEO_MODEL_BY_ENGINE[engine];

  const buildFallbackVideoPrompt = (index: number, currentMasterScene: string, durationSeconds: number) => {
    const movement =
      index === 0
        ? 'Slow cinematic pan from left to right, showcasing the lamp in its environment'
        : index === 1
          ? 'Slow cinematic zoom in on the lamp, highlighting its textures and light quality'
          : index === 2
            ? 'Slow cinematic orbit around the lamp, revealing its 3D form and the shadows it casts'
            : 'Slow cinematic vertical tilt up from the base of the lamp to the top';

    return [
      'Professional high-end commercial product video.',
      `Master scene reference: ${currentMasterScene}`,
      `Camera movement: ${movement}`,
      `Duration must be exactly ${durationSeconds} seconds.`,
      'Keep lamp product and environment fully consistent with the master scene.',
      'No static ending frame. Smooth cinematic motion throughout.',
      'No text, no logos, no captions.',
    ].join(' ');
  };

  const sanitizeProviderError = (message: string) =>
    message.replace(/gemini(-\d+\.\d+)?(-flash|-pro)?(-image-preview)?|veo(-\d+\.\d+)?/gi, 'AI');

  const isTransientVideoTaskNotFoundError = (error: unknown): boolean => {
    const message = String((error as any)?.message || '').toLowerCase();
    if (!message) {
      return false;
    }
    return (
      message.includes('task_not_exist') ||
      message.includes('task not exist') ||
      message.includes('task_not_ex')
    );
  };

  const normalizeTaskQueueStatus = (status: string, videoUrl?: string | null): QueueStatus => {
    const normalized = String(status || '').trim().toLowerCase();
    if (videoUrl) {
      return 'finished';
    }
    if (normalized === 'failed' || normalized === 'error' || normalized === 'cancelled') {
      return 'failed';
    }
    if (normalized === 'running' || normalized === 'processing' || normalized === 'in_progress') {
      return 'running';
    }
    return 'queued';
  };

  const isTerminalTaskStatus = (status: string): boolean => {
    const normalized = String(status || '').trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    return ['succeeded', 'success', 'completed', 'failed', 'error', 'cancelled', 'canceled'].includes(normalized);
  };

  const clearVideoPolling = (videoId: string) => {
    const timerId = pollingTimersRef.current[videoId];
    if (timerId) {
      window.clearTimeout(timerId);
      delete pollingTimersRef.current[videoId];
    }
  };

  const normalizeVideoUrl = async (videoUrl: string): Promise<string> => {
    if (!/^https?:\/\//i.test(videoUrl)) {
      return videoUrl;
    }

    // Do not fetch third-party video URLs in browser JS; it triggers CORS failures.
    try {
      const parsed = new URL(videoUrl, window.location.href);
      if (parsed.origin !== window.location.origin) {
        return videoUrl;
      }
    } catch {
      return videoUrl;
    }

    try {
      const response = await fetch(videoUrl);
      if (response.ok) {
        const blob = await response.blob();
        return URL.createObjectURL(blob);
      }
    } catch {
      // Keep original URL as fallback.
    }
    return videoUrl;
  };

  const persistVideoTask = async (
    index: number,
    generation: { taskId: string | null; status: string; videoUrl: string | null },
    prompt: string,
    engine: VideoEngine,
    firstFrameUrl: string,
    durationSeconds: number
  ) => {
    const taskName = `${videos[index].title}`;
    const aspect = aspectRatio === '1:1' ? '16:9' : aspectRatio;
    const previewURL = await uploadAssetToCOSDataUrl(firstFrameUrl, `video_preview_${index + 1}`) || firstFrameUrl;
    const payload: Record<string, unknown> = {
      title: taskName,
      name: taskName,
      task_id: generation.taskId,
      taskId: generation.taskId,
      query_status: generation.status || 'queued',
      model: getVideoModelByEngine(engine),
      engine,
      video_url: generation.videoUrl,
      videoUrl: generation.videoUrl,
      prompt,
      duration_seconds: durationSeconds,
      shot_index: index + 1,
      preview_url: previewURL,
      aspect_ratio: aspect,
    };

    return createTaskQueueItem({
      source_app_id: APP_ID,
      item_type: 'video_task',
      status: normalizeTaskQueueStatus(generation.status, generation.videoUrl),
      payload,
    });
  };

  const fetchProviderTaskProgress = async (index: number, explicitTaskId?: string, showLoading = true) => {
    const video = videosRef.current[index];
    const currentTaskId = String(explicitTaskId || video?.seedanceTaskId || '').trim();
    if (!video || !currentTaskId) {
      return;
    }

    if (showLoading) {
      setVideos((prev) => prev.map((v, i) => (i === index ? { ...v, isQueryingTask: true } : v)));
    }

    try {
      const engine = video.engine || 'seedance';
      const result = await querySeedanceVideoTask(currentTaskId);

      setVideos((prev) => {
        const next = [...prev];
        const current = next[index];
        if (!current) {
          return prev;
        }

        next[index] = {
          ...current,
          seedanceTaskId: result.taskId,
          seedanceTaskStatus: result.status || 'unknown',
          isQueryingTask: false,
          isGenerating: !result.videoUrl && !isTerminalTaskStatus(result.status),
          error: isTerminalTaskStatus(result.status) && !result.videoUrl
            ? `任务结束，未返回视频（状态：${result.status || 'unknown'}）`
            : current.error,
        };

        return next;
      });

      if (result.videoUrl) {
        const normalizedVideoUrl = await normalizeVideoUrl(result.videoUrl);
        setVideos((prev) => prev.map((v, i) => (
          i === index
            ? {
                ...v,
                videoUrl: normalizedVideoUrl,
                isGenerating: false,
                isQueryingTask: false,
                error: null,
              }
            : v
        )));
        clearVideoPolling(videosRef.current[index]?.id || '');
      }
    } catch (err) {
      if (isTransientVideoTaskNotFoundError(err)) {
        return;
      }

      const message = sanitizeProviderError(err instanceof Error ? err.message : '查询任务失败');
      setVideos((prev) => prev.map((v, i) => (i === index ? { ...v, isQueryingTask: false, error: message } : v)));
    } finally {
      if (!showLoading) {
        setVideos((prev) => prev.map((v, i) => (i === index ? { ...v, isQueryingTask: false } : v)));
      }
    }
  };

  const fetchQueueTaskProgress = async (index: number, explicitQueueTaskId?: number, showLoading = true) => {
    const fallbackTaskId = String(videosRef.current[index]?.seedanceTaskId || '').trim();
    const currentQueueTaskId = Number(explicitQueueTaskId ?? videosRef.current[index]?.queueTaskId ?? 0);
    if (!Number.isFinite(currentQueueTaskId) || currentQueueTaskId <= 0) {
      await fetchProviderTaskProgress(index, fallbackTaskId, showLoading);
      return;
    }

    if (showLoading) {
      setVideos((prev) => prev.map((v, i) => (i === index ? { ...v, isQueryingTask: true } : v)));
    }

    try {
      const result = await queryTaskQueueVideo(currentQueueTaskId);
      const taskStatus = String(result.query?.status || 'unknown').trim() || 'unknown';
      const taskID = String(result.query?.taskId || fallbackTaskId).trim();
      const taskError = String(result.query?.error || '').trim();

      setVideos((prev) => {
        const next = [...prev];
        const current = next[index];
        if (!current) {
          return prev;
        }

        next[index] = {
          ...current,
          seedanceTaskId: taskID || current.seedanceTaskId,
          seedanceTaskStatus: taskStatus,
          queueTaskStatus: result.task.status,
          isQueryingTask: false,
          isGenerating: !result.query.videoUrl && !isTerminalTaskStatus(taskStatus),
          error: isTerminalTaskStatus(taskStatus) && !result.query.videoUrl
            ? taskError || `任务结束，未返回视频（状态：${taskStatus}）`
            : current.error,
        };

        return next;
      });

      if (result.query.videoUrl) {
        const normalizedVideoUrl = await normalizeVideoUrl(result.query.videoUrl);
        setVideos((prev) => prev.map((v, i) => (
          i === index
            ? {
                ...v,
                videoUrl: normalizedVideoUrl,
                isGenerating: false,
                isQueryingTask: false,
                error: null,
              }
            : v
        )));
        clearVideoPolling(videosRef.current[index]?.id || '');
      }
    } catch (err) {
      if (isTransientVideoTaskNotFoundError(err)) {
        return;
      }

      const message = sanitizeProviderError(err instanceof Error ? err.message : '查询任务失败');
      setVideos((prev) => prev.map((v, i) => (i === index ? { ...v, isQueryingTask: false, error: message } : v)));
    } finally {
      if (!showLoading) {
        setVideos((prev) => prev.map((v, i) => (i === index ? { ...v, isQueryingTask: false } : v)));
      }
    }
  };

  const scheduleVideoAutoPolling = (index: number, taskId: string, queueTaskId?: number) => {
    const video = videosRef.current[index];
    if (!video) {
      return;
    }
    clearVideoPolling(video.id);

    const run = async () => {
      if (typeof queueTaskId === 'number' && queueTaskId > 0) {
        await fetchQueueTaskProgress(index, queueTaskId, false);
      } else {
        await fetchProviderTaskProgress(index, taskId, false);
      }

      const latest = videosRef.current[index];
      if (!latest || latest.videoUrl || isTerminalTaskStatus(String(latest.seedanceTaskStatus || ''))) {
        clearVideoPolling(video.id);
        return;
      }

      pollingTimersRef.current[video.id] = window.setTimeout(run, 8000);
    };

    pollingTimersRef.current[video.id] = window.setTimeout(run, 8000);
  };

  // Reset videos when reference image is removed
  useEffect(() => {
    if (!referenceImage) {
      setVideos(createInitialVideos());
      setMasterScene(null);
    }
  }, [referenceImage]);

  useEffect(() => {
    videosRef.current = videos;
  }, [videos]);

  useEffect(() => {
    return () => {
      Object.values(pollingTimersRef.current).forEach((timerId) => {
        window.clearTimeout(Number(timerId));
      });
      pollingTimersRef.current = {};
    };
  }, []);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setReferenceImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setReferenceImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const generateFirstFrame = async (index: number, currentMasterScene: string) => {
    setVideos(prev => prev.map((v, i) => i === index ? { ...v, isGeneratingFrame: true, error: null } : v));

    try {
      const framePromptResult = await generateGeminiContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { text: `Master Scene and Product: ${currentMasterScene}` },
            { text: `Based on the master scene above, generate a professional English prompt for a high-end commercial product photograph.
            This is the starting frame for video #${index + 1} of 4.
            The shot type should be: ${
              index === 0 ? 'A professional frontal hero shot of the lamp in the center of the room' :
              index === 1 ? 'A cinematic close-up macro shot focusing on the exquisite textures and materials of the lamp' : 
              index === 2 ? 'A cinematic 45-degree side angle shot showing the depth and structure of the lamp' : 
              'A cinematic wide-angle environmental shot showing the lamp illuminating the entire beautifully decorated room'
            }.
            CRITICAL: The lamp product and the environment MUST remain 100% identical to the Master Scene.
            Return ONLY the final image prompt text.` }
          ]
        }
      });

      const framePrompt = String(framePromptResult?.text || '').trim();
      if (!framePrompt) {
        throw new Error('未生成首帧提示词');
      }

      const frameAspectRatio: '16:9' | '9:16' = aspectRatio === '9:16' ? '9:16' : '16:9';

      const response = await generateGeminiContent({
        model: 'gemini-3.1-flash-image-preview',
        task: 'image_gen',
        billing_task: 'image_gen',
        contents: {
          parts: [
            { inlineData: { data: referenceImage!.split(',')[1], mimeType: referenceImage!.split(',')[0].split(':')[1].split(';')[0] } },
            {
              text: `Generate ONE photorealistic still image only based on this instruction.\nDo not return prompt text, markdown, JSON, or any explanation.\nInstruction: ${framePrompt}`,
            }
          ]
        },
        config: {
          imageConfig: {
            aspectRatio: frameAspectRatio,
              imageSize: '1K',
          },
        }
      });

      const generatedFrameUrl = extractImageDataUrlFromResponsePayload(response);

      if (!generatedFrameUrl) {
        console.warn('[lighting-fixtures-v2] frame generation response missing image payload', {
          hasCandidates: Array.isArray((response as any)?.candidates),
          hasOutput: Array.isArray((response as any)?.output),
          hasData: Boolean((response as any)?.data),
          hasResult: Boolean((response as any)?.result),
          textPreview: String((response as any)?.text || '').slice(0, 240),
        });
        throw new Error('未能生成首帧图片');
      }

      setVideos(prev => prev.map((v, i) => i === index ? { ...v, firstFrameUrl: generatedFrameUrl, isGeneratingFrame: false } : v));
      return generatedFrameUrl;
    } catch (err) {
      console.error('Frame generation error:', err);
      setVideos(prev => prev.map((v, i) => i === index ? { ...v, error: '首帧生成失败', isGeneratingFrame: false } : v));
      throw err;
    }
  };

  const generateSingleVideo = async (index: number) => {
    if (!referenceImage) {
      setError('请先上传产品图');
      return;
    }

    const targetVideo = videosRef.current[index];
    if (!targetVideo) {
      return;
    }

    if (
      targetVideo.isStarting ||
      targetVideo.isGenerating ||
      targetVideo.isGeneratingFrame ||
      targetVideo.isQueryingTask ||
      videoActionLocksRef.current[targetVideo.id]
    ) {
      return;
    }

    videoActionLocksRef.current[targetVideo.id] = true;
    setVideos((prev) => prev.map((v, i) => (i === index ? { ...v, isStarting: true, error: null } : v)));

    try {
      const durationSeconds = normalizeSeedanceDurationSeconds(targetVideo.durationSeconds);

      // 1. Ensure Master Scene is generated
      let currentMasterScene = masterScene;
      if (!currentMasterScene && !isGeneratingMaster) {
        setIsGeneratingMaster(true);
        try {
          const masterSceneResult = await generateGeminiContent({
            model: 'gemini-3-flash-preview',
            contents: {
              parts: [
                { inlineData: { data: referenceImage.split(',')[1], mimeType: referenceImage.split(',')[0].split(':')[1].split(';')[0] } },
                { text: `Based on this image and the selling points: "${userPrompt}", describe the scene and the product in detail. 
                CRITICAL: Identify the specific lamp product in the image. Describe its shape, material, color, and light quality.
                Describe the environment (room type, furniture, atmosphere) accurately.
                This description will be used as the base for 4 different videos. The goal is to keep the PRODUCT (the lamp) and the SCENE (the environment) 100% consistent across all videos.
                Return ONLY the detailed scene and product description in English.` }
              ]
            }
          });
          currentMasterScene = String(masterSceneResult?.text || '').trim();
          if (!currentMasterScene) {
            throw new Error('无法生成场景描述，请重试');
          }
          setMasterScene(currentMasterScene);
        } catch (err) {
          console.error('Master prompt generation error:', err);
          setError('无法生成场景描述，请重试');
          setIsGeneratingMaster(false);
          return;
        } finally {
          setIsGeneratingMaster(false);
        }
      }

      if (isGeneratingMaster) {
        setError('正在生成场景描述，请稍后重试');
        return;
      }

      // 2. Generate First Frame if missing
      let currentFirstFrame = videos[index].firstFrameUrl;
      if (!currentFirstFrame) {
        try {
          currentFirstFrame = await generateFirstFrame(index, currentMasterScene!);
        } catch (err) {
          return; // Error handled in generateFirstFrame
        }
      }

      setVideos(prev => prev.map((v, i) => i === index ? { ...v, isStarting: false, isGenerating: true, error: null } : v));

      // 3. Generate a unique camera movement prompt based on the master scene
      let videoPrompt = '';
      try {
        const actionPromptResult = await generateGeminiContent({
          model: 'gemini-3-flash-preview',
          contents: {
            parts: [
              { text: `Master Scene and Product: ${currentMasterScene}` },
              { text: `Based on the master scene above, generate a professional English prompt for a high-end commercial video. 
              This is for video #${index + 1} of 4.
              The prompt must focus on a specific camera movement: ${
                index === 0 ? 'Slow cinematic pan from left to right, showcasing the lamp in its environment' : 
                index === 1 ? 'Slow cinematic zoom in on the lamp, highlighting its textures and light quality' : 
                index === 2 ? 'Slow cinematic orbit around the lamp, revealing its 3D form and the shadows it casts' : 
                'Slow cinematic vertical tilt up from the base of the lamp to the top'
              }.
              CRITICAL: The entire camera movement MUST be completed within EXACTLY ${durationSeconds} seconds. 
              The lamp product and the environment MUST remain identical to the Master Scene.
              The video should look like a professional product commercial with no static frames at the end.
              Return ONLY the final prompt text.` }
            ]
          }
        });

        videoPrompt = String(actionPromptResult?.text || '').trim();
      } catch (promptErr) {
        console.warn('[lighting-fixtures-v2] action prompt generation failed, using local fallback prompt', promptErr);
      }

      if (!videoPrompt) {
        videoPrompt = buildFallbackVideoPrompt(index, currentMasterScene!, durationSeconds);
      }

      const activeEngine: VideoEngine = 'seedance';
      const normalizedAspectRatio = aspectRatio === '1:1' ? '16:9' : (aspectRatio as '16:9' | '9:16');
      const generation = await generateSeedanceVideo({
        prompt: videoPrompt,
        firstFrameDataUrl: currentFirstFrame,
        billingTask: 'seedance_video_gen',
        durationSeconds,
        aspectRatio: normalizedAspectRatio,
      });

      if (!generation.taskId && !generation.videoUrl) {
        throw new Error('视频任务提交成功但未返回任务ID');
      }

      let normalizedVideoUrl: string | undefined;
      if (generation.videoUrl) {
        normalizedVideoUrl = await normalizeVideoUrl(generation.videoUrl);
      }

      let queueTaskId: number | undefined;
      try {
        const persistedTask = await persistVideoTask(index, generation, videoPrompt, activeEngine, currentFirstFrame, durationSeconds);
        queueTaskId = persistedTask.id;
        openTaskManagerPanel();
      } catch (persistError) {
        console.warn('[lighting-fixtures-v2] video task persistence failed, continue with direct polling', persistError);
      }

      setVideos((prev) => prev.map((v, i) => (
        i === index
          ? {
              ...v,
              isStarting: false,
              videoUrl: normalizedVideoUrl,
              isGenerating: !normalizedVideoUrl,
              prompt: videoPrompt,
              engine: activeEngine,
              durationSeconds,
              seedanceTaskId: generation.taskId || undefined,
              seedanceTaskStatus: generation.status || (normalizedVideoUrl ? 'succeeded' : 'queued'),
              queueTaskId,
              queueTaskStatus: queueTaskId ? normalizeTaskQueueStatus(generation.status, normalizedVideoUrl) : undefined,
              error: null,
            }
          : v
      )));

      if (normalizedVideoUrl && queueTaskId) {
        try {
          await updateTaskQueueItem(queueTaskId, {
            status: 'finished',
            completed_at: new Date().toISOString(),
          });
        } catch (updateError) {
          console.warn('[lighting-fixtures-v2] queue completion patch failed', updateError);
        }
        return;
      }

      if (generation.taskId && !normalizedVideoUrl) {
        scheduleVideoAutoPolling(index, generation.taskId, queueTaskId);
      }
    } catch (err) {
      console.error('Video generation error:', err);
      const errorMessage = err instanceof Error ? err.message : '生成失败';
      const sanitizedError = sanitizeProviderError(errorMessage);
      setVideos(prev => prev.map((v, i) => i === index ? { ...v, isStarting: false, error: sanitizedError, isGenerating: false, isQueryingTask: false } : v));
    } finally {
      const latestVideoId = videosRef.current[index]?.id || targetVideo.id;
      delete videoActionLocksRef.current[latestVideoId];
      setVideos((prev) => prev.map((v, i) => (
        i === index && v.isStarting
          ? { ...v, isStarting: false }
          : v
      )));
    }
  };

  const generateAllFrames = async () => {
    if (!referenceImage) {
      setError('请先上传产品图');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // 1. Ensure Master Scene is generated
      let currentMasterScene = masterScene;
      if (!currentMasterScene) {
        const masterSceneResult = await generateGeminiContent({
          model: 'gemini-3-flash-preview',
          contents: {
            parts: [
              { inlineData: { data: referenceImage.split(',')[1], mimeType: referenceImage.split(',')[0].split(':')[1].split(';')[0] } },
              { text: `Based on this image and the selling points: "${userPrompt}", describe the scene and the product in detail. 
              CRITICAL: Identify the specific lamp product in the image. Describe its shape, material, color, and light quality.
              Describe the environment (room type, furniture, atmosphere) accurately.
              This description will be used as the base for 4 different videos. The goal is to keep the PRODUCT (the lamp) and the SCENE (the environment) 100% consistent across all videos.
              Return ONLY the detailed scene and product description in English.` }
            ]
          }
        });
        currentMasterScene = String(masterSceneResult?.text || '').trim();
        if (!currentMasterScene) {
          throw new Error('无法生成场景描述，请重试');
        }
        setMasterScene(currentMasterScene);
      }

      // 2. Generate missing frames sequentially to avoid several large image responses in flight.
      setVideos((prev) => prev.map((video) => (
        video.firstFrameUrl
          ? video
          : { ...video, error: null }
      )));

      const missingFrameIndexes = videosRef.current
        .map((video, index) => (video.firstFrameUrl ? -1 : index))
        .filter((index) => index >= 0);
      let failedFrameCount = 0;

      for (const index of missingFrameIndexes) {
        try {
          await generateFirstFrame(index, currentMasterScene!);
        } catch {
          failedFrameCount += 1;
        }
      }

      if (failedFrameCount > 0) {
        setError(`${failedFrameCount} 个首帧生成失败，请单独重试。`);
      }
    } catch (err) {
      console.error('Batch frame generation error:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadAll = () => {
    videos.forEach((video, index) => {
      if (video.videoUrl) {
        setTimeout(() => {
          handleDownload(video.videoUrl!, video.title);
        }, index * 500);
      }
    });
  };

  const handleDownload = (url: string, title: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title}-${Date.now()}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const updateVideoDuration = (index: number, durationSeconds: number) => {
    const normalizedDuration = normalizeSeedanceDurationSeconds(durationSeconds);
    setVideos((prev) => prev.map((video, videoIndex) => (
      videoIndex === index
        ? { ...video, durationSeconds: normalizedDuration }
        : video
    )));
  };

  const pendingFrameCount = videos.filter((v) => !v.firstFrameUrl).length;
  const isAnyFrameGenerating = videos.some((video) => video.isGeneratingFrame);

  return (
    <>
      {/* Settings Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: 380, opacity: 1 }}
        className="glass-panel relative z-20 flex flex-col overflow-hidden border-r border-white/40 bg-white/40"
      >
        <div className="flex h-20 items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-black text-white">
              <VideoIcon className="h-6 w-6" />
            </div>
            <span className="text-lg font-bold tracking-tight text-text-deep">视频生成配置</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-hide">

          {/* Reference Upload (Top) */}
          <section className="mb-10">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-cool">上传产品场景图 (必填)</h3>
              <span className="rounded-full bg-black/5 px-2 py-0.5 text-[8px] font-bold text-text-cool">首帧参考</span>
            </div>
            <div 
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "group relative flex aspect-video cursor-pointer flex-col items-center justify-center rounded-[1.5rem] bg-white/40 transition-all hover:bg-white/60",
                referenceImage && "p-0"
              )}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleUpload} 
                className="hidden" 
                accept="image/*"
              />
              {referenceImage ? (
                <>
                  <img src={referenceImage} alt="Reference" referrerPolicy="no-referrer" className="h-full w-full rounded-[1.5rem] object-contain p-2" />
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setReferenceImage(null);
                    }}
                    className="absolute top-3 right-3 rounded-full bg-black/80 p-2 text-white hover:bg-red-500 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </>
              ) : (
                <>
                  <Upload className="mb-2 h-6 w-6 text-text-cool group-hover:text-text-deep transition-colors" />
                  <p className="text-xs font-medium text-text-cool">点击上传灯具实景图</p>
                  <p className="mt-1 text-[9px] text-text-cool/60">该图将作为视频生成的第一帧</p>
                </>
              )}
            </div>
          </section>

          {/* User Prompt / Selling Points (Bottom) */}
          <section className="mb-10">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-cool">卖点/提示词 (可选)</h3>
              <Sparkles className="h-3 w-3 text-amber-500" />
            </div>
            <textarea 
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              placeholder="输入灯具的核心卖点，如：全光谱护眼、极简设计、智能调光等..."
              className="h-24 w-full resize-none rounded-2xl bg-white/40 p-4 text-xs font-medium outline-none focus:bg-white/60 transition-all placeholder:text-text-cool/40"
            />
          </section>

          {/* Output Settings */}
          <section className="mb-10">
            <h3 className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-text-cool">视频规格配置</h3>
            
            <div className="mb-6">
              <p className="mb-3 text-[10px] font-bold text-text-cool/70">比例选择</p>
              <div className="flex gap-3">
                {[
                  { id: '16:9', icon: Monitor },
                  { id: '9:16', icon: Smartphone },
                ].map((ratio) => (
                  <button
                    key={ratio.id}
                    onClick={() => setAspectRatio(ratio.id as AspectRatio)}
                    className={cn(
                      "flex flex-1 flex-col items-center justify-center rounded-2xl py-3 transition-all",
                      aspectRatio === ratio.id 
                        ? "bg-black text-white shadow-md" 
                        : "bg-white/40 text-text-cool hover:bg-white/60"
                    )}
                  >
                    <ratio.icon size={16} />
                    <span className="mt-1.5 text-[10px] font-bold">{ratio.id}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-3 text-[10px] font-bold text-text-cool/70">清晰度切换</p>
              <div className="flex rounded-2xl bg-white/40 p-1.5">
                {['720p', '1080p'].map((res) => (
                  <button
                    key={res}
                    onClick={() => setResolution(res as any)}
                    className={cn(
                      "flex-1 rounded-xl py-2 text-xs font-bold transition-all",
                      resolution === res 
                        ? "bg-black text-white shadow-sm" 
                        : "text-text-cool hover:text-text-deep"
                    )}
                  >
                    {res}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 rounded-2xl bg-white/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold text-text-cool/70">视频引擎</p>
                  <p className="mt-1 text-xs font-bold text-text-deep">Seedance 2.0</p>
                </div>
              </div>
              <p className="mt-3 text-[10px] font-medium text-text-cool/70">
                当前按秒计费：{SEEDANCE_VIDEO_COST_PER_SECOND}积分/秒，最终积分按视频时长计算。
              </p>
            </div>
          </section>

          <section className="mb-10">
            <h3 className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-text-cool">光影逻辑说明</h3>
            <div className="rounded-2xl bg-white/40 p-4">
              <p className="text-[10px] leading-relaxed text-text-cool">
                系统统一采用<span className="font-bold text-text-deep">“自然光+局部补光”</span>逻辑，确保背景阴影方向、软硬度在不同产品切换时保持 100% 一致，呈现极致商业质感。
              </p>
            </div>
          </section>
        </div>

        {/* Generate Button */}
        <div className="p-6">
          <button
            onClick={generateAllFrames}
            disabled={isGenerating || isAnyFrameGenerating || !referenceImage || pendingFrameCount === 0}
            className="group relative w-full overflow-hidden rounded-2xl bg-black py-5 font-bold text-white shadow-xl transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
          >
            <div className="relative z-10 flex items-center justify-center gap-3">
              {isGenerating ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>处理中...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  <span>{pendingFrameCount > 0 ? `生成全部首帧 (${pendingFrameCount * FRAME_IMAGE_COST}积分)` : '首帧已全部生成'}</span>
                </>
              )}
            </div>
          </button>
        </div>
      </motion.aside>

      {/* Main Viewport */}
      <main className="relative flex-1 overflow-y-auto scrollbar-hide bg-[#f0f2f5]">
        <div className="p-8">
          <div className="mb-8 flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight text-text-deep">视频生成预览</h2>
            <div className="flex items-center gap-4">
              <button
                onClick={handleDownloadAll}
                disabled={!videos.some(v => v.videoUrl)}
                className="flex items-center gap-2 rounded-2xl bg-white border border-black/10 px-6 py-3 text-xs font-bold text-text-deep shadow-lg transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
              >
                <Download size={16} />
                <span>一键下载视频</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            {videos.map((video, index) => (
              <div key={video.id} className="glass-panel group relative flex flex-col overflow-hidden rounded-[2rem] bg-white/60 p-6 shadow-xl transition-all hover:shadow-2xl">
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-text-deep">{video.title}</h3>
                  </div>
                  {video.firstFrameUrl && !video.videoUrl && !video.isGenerating && !video.isGeneratingFrame && !video.isStarting && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          void generateFirstFrame(index, masterScene!).catch(() => undefined);
                        }}
                        disabled={isGenerating || !referenceImage || video.isStarting || video.isGenerating || video.isGeneratingFrame || video.isQueryingTask}
                        className="flex items-center gap-1.5 rounded-full bg-black/5 px-4 py-1.5 text-[10px] font-bold text-text-deep hover:bg-black/10 transition-colors disabled:opacity-50"
                      >
                        <RefreshCw size={12} />
                        <span>{`重生成首帧 (${FRAME_IMAGE_COST}积分)`}</span>
                      </button>
                      <button
                        onClick={() => generateSingleVideo(index)}
                        disabled={isGenerating || !referenceImage || video.isStarting || video.isGenerating || video.isGeneratingFrame || video.isQueryingTask}
                        className="flex items-center gap-1.5 rounded-full bg-black px-4 py-1.5 text-[10px] font-bold text-white shadow-sm hover:bg-black/80 transition-colors disabled:opacity-50"
                      >
                        <Sparkles size={12} />
                        <span>{`生成视频 (${resolveSeedanceVideoCost(video.durationSeconds)}积分)`}</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className={cn(
                  "relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl bg-black/5 transition-all",
                  aspectRatio === '9:16' && "aspect-[9/16] max-h-[500px]"
                )}>
                  {video.isGenerating || video.isGeneratingFrame || video.isStarting ? (
                    <div className="flex flex-col items-center px-8 text-center">
                      <Loader2 className="h-8 w-8 animate-spin text-black/20" />
                      <p className="mt-4 text-[10px] font-bold text-text-cool animate-pulse tracking-widest uppercase">
                        {video.isStarting ? 'Preparing...' : (video.isGeneratingFrame ? 'Generating Frame...' : (video.videoUrl ? 'Finalizing...' : 'AI Generating Video...'))}
                      </p>
                      <p className="mt-2 text-[9px] text-text-cool/60 max-w-[200px]">
                        {video.isStarting
                          ? '正在初始化任务，请稍候...'
                          : (video.isGeneratingFrame 
                            ? '正在生成视频首帧画面，确保光影一致性...' 
                            : (video.videoUrl ? '正在更新视频内容，请稍候...' : '正在根据首帧画面构建 3D 动态场景，请稍候'))}
                      </p>
                    </div>
                  ) : video.videoUrl ? (
                    <video 
                      src={video.videoUrl} 
                      controls 
                      className="h-full w-full object-contain"
                    />
                  ) : video.firstFrameUrl ? (
                    <div className="relative h-full w-full group/frame">
                      <img 
                        src={video.firstFrameUrl} 
                        alt="First frame" 
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-contain opacity-60 group-hover/frame:opacity-80 transition-opacity" 
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="rounded-full bg-black/20 p-4 backdrop-blur-sm">
                          <VideoIcon className="h-8 w-8 text-white/40" />
                        </div>
                      </div>
                      <div className="absolute bottom-3 left-3 rounded-md bg-black/40 px-2 py-1 backdrop-blur-md">
                        <p className="text-[8px] font-bold text-white uppercase tracking-wider">首帧已就绪</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-text-cool/20">
                      <VideoIcon size={48} />
                      <p className="mt-2 text-[10px] font-bold">等待生成</p>
                    </div>
                  )}

                  {video.error && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50/90 p-4 text-center">
                      <AlertCircle className="mb-2 h-6 w-6 text-red-500" />
                      <p className="text-[10px] font-bold text-red-500">{video.error}</p>
                      <button
                        onClick={() => generateSingleVideo(index)}
                        disabled={video.isStarting || video.isGenerating || video.isGeneratingFrame || video.isQueryingTask}
                        className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-[10px] font-bold text-white disabled:opacity-50"
                      >
                        {video.firstFrameUrl
                          ? `重试 (${resolveSeedanceVideoCost(video.durationSeconds)}积分)`
                          : `重试 (${FRAME_IMAGE_COST + resolveSeedanceVideoCost(video.durationSeconds)}积分)`}
                      </button>
                    </div>
                  )}
                </div>

                {video.firstFrameUrl && !video.isGenerating && !video.isGeneratingFrame && !video.isStarting && !video.isQueryingTask && (
                  <div className="mt-4 rounded-2xl bg-black/5 px-4 py-3">
                    <input
                      type="range"
                      min={MIN_VIDEO_DURATION_SECONDS}
                      max={MAX_VIDEO_DURATION_SECONDS}
                      step={1}
                      value={normalizeSeedanceDurationSeconds(video.durationSeconds)}
                      onChange={(event) => updateVideoDuration(index, Number(event.target.value))}
                      className="mt-3 h-2 w-full cursor-pointer accent-black"
                    />
                    <div className="mt-2 flex items-center justify-between text-[10px] font-medium text-text-cool/60">
                      <span>{MIN_VIDEO_DURATION_SECONDS}s</span>
                      <span>{MAX_VIDEO_DURATION_SECONDS}s</span>
                    </div>
                  </div>
                )}

                {video.videoUrl && (
                  <div className="mt-6 flex gap-3">
                    <button
                      onClick={() => handleDownload(video.videoUrl!, video.title)}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-black py-3 px-6 text-xs font-bold text-white shadow-lg transition-all hover:scale-[1.02]"
                    >
                      <Download size={14} />
                      <span>下载视频</span>
                    </button>
                    <button
                      onClick={() => generateSingleVideo(index)}
                      className="flex items-center justify-center gap-2 rounded-xl bg-black/5 py-3 px-4 text-xs font-bold text-text-deep hover:bg-black/10 transition-all"
                    >
                      <RefreshCw size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
