import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppProps } from '../../types';
import { UploadZone } from './components/UploadZone';
import { ProcessSteps } from './components/ProcessSteps';
import { AppStatus, FileData, ProductAnalysis } from './types';
import {
  generateCompositeImage,
  submitProductVideoTask,
  queryProductVideoTaskProgress,
  CameraStyle,
  analyzeProduct,
  ProductVideoEngine,
  DEFAULT_PRODUCT_VIDEO_ENGINE,
  getProductVideoModel,

  normalizeProductVideoDurationSeconds,
  resolveProductVideoBillingTask,
  PRODUCT_VIDEO_DURATION_MIN_SECONDS,
  PRODUCT_VIDEO_DURATION_MAX_SECONDS,
  PRODUCT_VIDEO_DEFAULT_DURATION_SECONDS,
} from './services/geminiService';
import { uploadAssetToCOSWithPresignedURL } from '../../shared_services/geminiProxyService';
import { createTaskQueueItem, recordTaskManagerObject, updateTaskQueueItem } from '../../services/taskManagerService';
import { Wand2, Video, RotateCcw, Download, Film, AlertCircle, Target, Zap, ChevronUp, Star, RefreshCw, Layout, Plus, Trash2, Check, Dices, Settings2, ArrowRight, Box, Scan, Sparkles } from 'lucide-react';
const COSTS = { GENERATE_DISPLAY: 10, GENERATE_VIDEO: 25 };
const APP_ID = 's_product-display';

// Mirrors the v4 app's per-second billing key lookup. The backend pricing record
// may expose any of these aliases for the per-second cost, with a per-duration
// override (`seedance_video_${n}s`) taking precedence when present.
// Mirrors the v4 app's fallback per-second rate when no pricing record is
// available. Kept in sync with `SEEDANCE_VIDEO_GEN_COST_PER_SECOND` in
// `s_selling-point-visual-video_v4/App.tsx`.
const SEEDANCE_VIDEO_COST_PER_SECOND_KEYS = [
  'seedance_video_per_second',
  'SEEDANCE_VIDEO_PER_SECOND',
  'seedance_video_cost_per_second',
] as const;
const SEEDANCE_VIDEO_FALLBACK_PER_SECOND = 15;



type QueueStatus = 'queued' | 'running' | 'finished' | 'failed';

function normalizeTaskQueueStatus(status: string, videoUrl?: string | null): QueueStatus {
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
}

function isTransientVideoTaskNotFoundError(error: unknown): boolean {
  const message = String((error as any)?.message || '').trim().toLowerCase();
  return (
    message.includes('task_not_exist') ||
    message.includes('task not exist') ||
    message.includes('task_not_ex')
  );
}

function isTerminalVideoTaskStatus(status: string): boolean {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'failed' || normalized === 'error' || normalized === 'cancelled' || normalized === 'completed' || normalized === 'success' || normalized === 'succeeded';
}

async function assetUrlToBlob(assetUrl: string): Promise<Blob> {
  const response = await fetch(assetUrl);
  if (!response.ok) {
    throw new Error(`asset fetch failed: HTTP ${response.status}`);
  }
  return response.blob();
}

export const AIProductDisplayApp: React.FC<AppProps> = ({ platform, costs }) => {
  const displayCost = costs?.GENERATE_DISPLAY ?? COSTS.GENERATE_DISPLAY;
  const videoEngine: ProductVideoEngine = DEFAULT_PRODUCT_VIDEO_ENGINE;

  // Resolve a positive numeric value from the costs map for any of the provided keys.
  const lookupCostValue = (...keys: string[]): number | null => {
    if (!costs) return null;
    for (const key of keys) {
      const value = Number((costs as Record<string, any>)[key]);
      if (Number.isFinite(value) && value > 0) {
        return value;
      }
    }
    return null;
  };

  // Mirror the v4 app's billing resolution: prefer per-second pricing from
  // `costs`, fall back to the per-duration override (`seedance_video_${n}s`),
  // then to a hard-coded per-second rate. The legacy flat `GENERATE_VIDEO`
  // value is intentionally NOT used as a fallback here because it is a
  // duration-agnostic flat fee that would mask the per-second slider, and
  // the standalone host always injects it as a default. Backend deduction
  // still resolves the correct per-duration credits via `billing_task`
  // (`seedance_video_${n}s`) registered in `app_manager.app_pricing`.
  const computeSeedanceVideoCost = (durationSeconds: number): number => {
    const normalized = normalizeProductVideoDurationSeconds(durationSeconds);
    const perSecond = lookupCostValue(...SEEDANCE_VIDEO_COST_PER_SECOND_KEYS);
    if (perSecond !== null) {
      return Math.round(perSecond * normalized);
    }
    const perDurationKey = resolveProductVideoBillingTask(normalized);
    const perDurationCost = lookupCostValue(perDurationKey);
    if (perDurationCost !== null) {
      return perDurationCost;
    }
    return SEEDANCE_VIDEO_FALLBACK_PER_SECOND * normalized;
  };


  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [productImg, setProductImg] = useState<FileData | null>(null);
  const [bgImg, setBgImg] = useState<FileData | null>(null);
  const [bgVibe, setBgVibe] = useState<string>('');
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [persistedImageUrl, setPersistedImageUrl] = useState<string | null>(null);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [queueNotice, setQueueNotice] = useState<string | null>(null);
  const [pendingVideoTaskId, setPendingVideoTaskId] = useState<string | null>(null);
  const [pendingVideoTaskStatus, setPendingVideoTaskStatus] = useState<string | null>(null);
  const [pendingQueueTaskId, setPendingQueueTaskId] = useState<number | null>(null);

  // Randomization & Customization
  const [seed, setSeed] = useState<number>(Math.floor(Math.random() * 1000000));
  const [customMovement, setCustomMovement] = useState<string>('');

  // Video Settings
  const [videoAspectRatio, setVideoAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [cameraStyle, setCameraStyle] = useState<CameraStyle>('detail_focus');
  const [videoDurationSeconds, setVideoDurationSeconds] = useState<number>(PRODUCT_VIDEO_DEFAULT_DURATION_SECONDS);

  // Effective duration (clamped to seedance2.0 supported range) and the
  // resulting per-second cost. Recomputed on every render so the slider and
  // cost label stay in sync without an extra effect.
  const effectiveVideoDurationSeconds = normalizeProductVideoDurationSeconds(videoDurationSeconds);
  const videoCost = computeSeedanceVideoCost(effectiveVideoDurationSeconds);
  const videoBillingTask = resolveProductVideoBillingTask(effectiveVideoDurationSeconds);


  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (status === AppStatus.COMPLETED && generatedVideoUrl && videoRef.current) {
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          if (videoRef.current) {
            videoRef.current.muted = true;
            videoRef.current.play();
          }
        });
      }
    }
  }, [generatedVideoUrl, status]);

  useEffect(() => {
    if (productImg && status === AppStatus.IDLE) {
      handleAnalyze();
    }
  }, [productImg]);

  const handleAnalyze = async () => {
    if (!productImg) return;
    setStatus(AppStatus.ANALYZING_PRODUCT);
    try {
      const result = await analyzeProduct(productImg.base64, productImg.mimeType);
      setAnalysis({
        productType: result.productType || '',
        sellingPoints: result.sellingPoints || [],
        targetAudience: result.targetAudience || [],
        suggestedScenarios: result.suggestedScenarios || []
      });
      if (result.suggestedScenarios?.[0]) {
        setBgVibe(result.suggestedScenarios[0]);
      }
      setStatus(AppStatus.IDLE);
    } catch (err: any) {
      console.error('Analysis failed', err);
      setStatus(AppStatus.IDLE);
    }
  };

  const updateAnalysisField = (field: keyof ProductAnalysis, index: number, value: string) => {
    if (!analysis) return;
    const newAnalysis = { ...analysis } as any;
    if (Array.isArray(newAnalysis[field])) {
      (newAnalysis[field] as string[])[index] = value;
      setAnalysis(newAnalysis);
    }
  };

  const removeAnalysisItem = (field: keyof ProductAnalysis, index: number) => {
    if (!analysis) return;
    const newAnalysis = { ...analysis } as any;
    if (Array.isArray(newAnalysis[field])) {
      (newAnalysis[field] as string[]).splice(index, 1);
      setAnalysis(newAnalysis);
    }
  };

  const addAnalysisItem = (field: keyof ProductAnalysis) => {
    if (!analysis) return;
    const newAnalysis = { ...analysis } as any;
    if (Array.isArray(newAnalysis[field])) {
      (newAnalysis[field] as string[]).push('');
      setAnalysis(newAnalysis);
    }
  };

  const randomizeSeed = () => {
    setSeed(Math.floor(Math.random() * 1000000));
  };

  const reportTaskQueuePersistenceFailure = (contextLabel: string, error: unknown) => {
    console.error(`[${APP_ID}] ${contextLabel} task persistence failed`, error);
    setQueueNotice(`${contextLabel}已完成，但写入任务面板失败。`);
  };

  const persistGeneratedImageTask = async (imageDataUrl: string) => {
    const taskName = `${analysis?.productType || '产品'} 展示海报`;
    const blob = await assetUrlToBlob(imageDataUrl);
    const upload = await uploadAssetToCOSWithPresignedURL(blob, {
      fileName: `product-display-${Date.now()}.png`,
      objectPath: `standalone/${APP_ID}/generated_images`,
      appID: APP_ID,
      camAppID: APP_ID,
      contentType: blob.type || 'image/png',
    });

    const persistedURL =
      String(upload.url || '').trim() ||
      String(upload.signed_url || '').trim() ||
      String(upload.public_url || '').trim() ||
      imageDataUrl;
    setPersistedImageUrl(persistedURL);

    let objectRecord: Awaited<ReturnType<typeof recordTaskManagerObject>> | null = null;
    if (String(upload.bucket_name || '').trim() && String(upload.object_key || '').trim()) {
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
        console.warn(`[${APP_ID}] image object record failed, continue task creation`, error);
      }
    }

    try {
      await createTaskQueueItem({
        source_app_id: APP_ID,
        item_type: 'image_link',
        status: 'finished',
        payload: {
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
          aspect_ratio: videoAspectRatio,
          background_vibe: bgVibe,
          product_type: analysis?.productType,
        },
      });
    } catch (error) {
      await createTaskQueueItem({
        source_app_id: APP_ID,
        item_type: 'image_link',
        status: 'finished',
        payload: {
          title: taskName,
          name: taskName,
          image_url: persistedURL,
          url: persistedURL,
          aspect_ratio: videoAspectRatio,
          product_type: analysis?.productType,
        },
      });
      console.warn(`[${APP_ID}] image task persisted with minimal payload`, error);
    }
  };

  const persistVideoTask = async (generation: { taskId: string | null; status: string; videoUrl: string | null }) => {
    const taskName = `${analysis?.productType || '产品'} 展示视频`;
    return createTaskQueueItem({
      source_app_id: APP_ID,
      item_type: 'video_task',
      status: normalizeTaskQueueStatus(generation.status, generation.videoUrl),
      payload: {
        title: taskName,
        name: taskName,
        task_id: generation.taskId,
        taskId: generation.taskId,
        query_status: generation.status,
        model: getProductVideoModel(videoEngine),
        engine: videoEngine,
        video_url: generation.videoUrl,
        videoUrl: generation.videoUrl,
        prompt: bgVibe,
        duration_seconds: effectiveVideoDurationSeconds,
        billing_task: videoBillingTask,
        preview_url: persistedImageUrl || generatedImageUrl,
        aspect_ratio: videoAspectRatio,
        camera_style: cameraStyle,
        product_type: analysis?.productType,
      },
    });
  };

  const buildVideoTaskPayload = (taskId: string | null, status: string, videoUrl: string | null) => ({
    title: `${analysis?.productType || '产品'} 展示视频`,
    name: `${analysis?.productType || '产品'} 展示视频`,
    task_id: taskId,
    taskId: taskId,
    query_status: status,
    model: getProductVideoModel(videoEngine),
    engine: videoEngine,
    video_url: videoUrl,
    videoUrl: videoUrl,
    prompt: bgVibe,
    duration_seconds: effectiveVideoDurationSeconds,
    billing_task: videoBillingTask,

    preview_url: persistedImageUrl || generatedImageUrl,
    aspect_ratio: videoAspectRatio,
    camera_style: cameraStyle,
    product_type: analysis?.productType,
  });

  useEffect(() => {
    if (!pendingVideoTaskId || generatedVideoUrl || status === AppStatus.GENERATING_VIDEO) {
      return;
    }
    if (isTerminalVideoTaskStatus(pendingVideoTaskStatus || '')) {
      return;
    }

    let cancelled = false;
    const timerId = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await queryProductVideoTaskProgress(pendingVideoTaskId, videoEngine);
          if (cancelled) {
            return;
          }

          setPendingVideoTaskStatus(result.status || 'unknown');

          if (result.videoUrl) {
            setGeneratedVideoUrl(result.videoUrl);
            setPendingVideoTaskId(null);
            setPendingVideoTaskStatus(null);
            setQueueNotice('视频任务已完成，成片已加载。');
            setStatus(AppStatus.COMPLETED);

            if (pendingQueueTaskId !== null) {
              try {
                await updateTaskQueueItem(pendingQueueTaskId, {
                  status: 'finished',
                  completed_at: new Date().toISOString(),
                  payload: buildVideoTaskPayload(result.taskId, result.status || 'completed', result.videoUrl),
                });
              } catch (error) {
                if (!cancelled) {
                  reportTaskQueuePersistenceFailure('视频完成状态更新', error);
                }
              }
            }
            return;
          }

          const normalizedStatus = String(result.status || '').trim().toLowerCase();
          if (normalizedStatus === 'failed' || normalizedStatus === 'error' || normalizedStatus === 'cancelled') {
            setPendingVideoTaskId(null);
            setPendingVideoTaskStatus(result.status || 'failed');
            if (pendingQueueTaskId !== null) {
              try {
                await updateTaskQueueItem(pendingQueueTaskId, {
                  status: 'failed',
                  last_error: String(result.error || `视频生成失败 (${result.status || 'unknown'})`),
                });
              } catch (error) {
                if (!cancelled) {
                  reportTaskQueuePersistenceFailure('视频失败状态更新', error);
                }
              }
            }
            setStatus(AppStatus.ERROR);
            setErrorMsg(String(result.error || `视频生成失败 (${result.status || 'unknown'})`));
          }
        } catch (error) {
          if (cancelled) {
            return;
          }
          if (isTransientVideoTaskNotFoundError(error)) {
            return;
          }

          const message = String((error as any)?.message || '视频任务查询失败').trim() || '视频任务查询失败';
          setPendingVideoTaskId(null);
          setPendingVideoTaskStatus('failed');
          if (pendingQueueTaskId !== null) {
            try {
              await updateTaskQueueItem(pendingQueueTaskId, {
                status: 'failed',
                last_error: message,
              });
            } catch (updateError) {
              if (!cancelled) {
                reportTaskQueuePersistenceFailure('视频失败状态更新', updateError);
              }
            }
          }
          setStatus(AppStatus.ERROR);
          setErrorMsg(message);
          console.warn(`[${APP_ID}] background video task query failed`, error);
        }
      })();
    }, 8000);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [pendingVideoTaskId, pendingVideoTaskStatus, generatedVideoUrl, status, pendingQueueTaskId, bgVibe, persistedImageUrl, generatedImageUrl, videoAspectRatio, cameraStyle, analysis?.productType]);

  const handleGenerateImage = useCallback(async () => {
    if (!productImg) return;

    await platform.refreshCredits?.();

    if (!platform.checkBalance?.(displayCost)) {
      setErrorMsg(`积分不足，需要 ${displayCost} 积分。请先充值后再试。`);
      return;
    }

    setStatus(AppStatus.GENERATING_IMAGE);
    setErrorMsg(null);
    setQueueNotice(null);
    try {
      const url = await generateCompositeImage(
        productImg.base64,
        productImg.mimeType,
        bgImg?.base64 || null,
        bgImg?.mimeType || null,
        videoAspectRatio,
        bgVibe,
        analysis || undefined,
        seed
      );

      setGeneratedImageUrl(url);
      setPersistedImageUrl(null);
      await platform.refreshCredits?.();
      setStatus(AppStatus.IMAGE_REVIEW);
      void persistGeneratedImageTask(url).catch((error) => {
        reportTaskQueuePersistenceFailure('海报生成', error);
      });
    } catch (err: any) {
      setStatus(AppStatus.ERROR);
      setErrorMsg(err?.message || '生成失败');
    }
  }, [productImg, bgImg, videoAspectRatio, bgVibe, analysis, seed, platform, displayCost]);

  const handleGenerateVideo = async () => {
    if (!generatedImageUrl) return;

    await platform.refreshCredits?.();

    if (!platform.checkBalance?.(videoCost)) {
      setErrorMsg(`积分不足，需要 ${videoCost} 积分。请先充值后再试。`);
      return;
    }

    setStatus(AppStatus.GENERATING_VIDEO);
    setErrorMsg(null);
    setQueueNotice(null);
    setPendingVideoTaskId(null);
    setPendingVideoTaskStatus(null);
    setPendingQueueTaskId(null);
    let persistedVideoTaskID: number | null = null;
    try {
      const base64Data = generatedImageUrl.split(',')[1];
      const submitted = await submitProductVideoTask(
        base64Data,
        'image/png',
        videoAspectRatio,
        cameraStyle,
        videoEngine,
        analysis || undefined,
        seed,
        customMovement,
        effectiveVideoDurationSeconds,
        videoBillingTask
      );


      try {
        const persistedTask = await persistVideoTask(submitted);
        persistedVideoTaskID = persistedTask.id;
        setPendingQueueTaskId(persistedTask.id);
      } catch (error) {
        reportTaskQueuePersistenceFailure('视频生成', error);
      }
      await platform.refreshCredits?.();

      if (submitted.videoUrl) {
        setGeneratedVideoUrl(submitted.videoUrl);
        setPendingVideoTaskId(null);
        setPendingVideoTaskStatus(null);
        if (persistedVideoTaskID !== null) {
          try {
            await updateTaskQueueItem(persistedVideoTaskID, {
              status: 'finished',
              completed_at: new Date().toISOString(),
              payload: buildVideoTaskPayload(submitted.taskId, submitted.status || 'completed', submitted.videoUrl),
            });
          } catch (error) {
            reportTaskQueuePersistenceFailure('视频完成状态更新', error);
          }
        }
        setStatus(AppStatus.COMPLETED);
        return;
      }

      setPendingVideoTaskId(submitted.taskId || null);
      setPendingVideoTaskStatus(submitted.status || 'queued');
      setStatus(AppStatus.IMAGE_REVIEW);
      setQueueNotice(
        submitted.taskId
          ? `视频任务已提交，后台生成中。任务ID: ${submitted.taskId}。可稍后在任务面板查询进度。`
          : '视频任务已提交，后台生成中。可稍后在任务面板查询进度。'
      );
    } catch (err: any) {
      if (persistedVideoTaskID !== null) {
        try {
          await updateTaskQueueItem(persistedVideoTaskID, {
            status: 'failed',
            last_error: String(err?.message || '视频生成失败'),
          });
        } catch (updateError) {
          reportTaskQueuePersistenceFailure('视频失败状态更新', updateError);
        }
      }
      setStatus(AppStatus.ERROR);
      console.error('[s_product-display] video generation failed:', err);
      const rawMessage = String(err?.message || '').trim();
      const cleanedMessage = rawMessage.replace(/^VEO 状态查询连续失败（taskId:[^)]+）：\s*/, '');
      setErrorMsg(cleanedMessage || '视频生成失败，请稍后再试。');
    }
  };

  const handleReset = () => {
    setStatus(AppStatus.IDLE);
    setProductImg(null);
    setBgImg(null);
    setBgVibe('');
    setAnalysis(null);
    setGeneratedImageUrl(null);
    setPersistedImageUrl(null);
    setGeneratedVideoUrl(null);
    setErrorMsg(null);
    setQueueNotice(null);
    setPendingVideoTaskId(null);
    setPendingVideoTaskStatus(null);
    setPendingQueueTaskId(null);
    randomizeSeed();
  };

  const renderContent = () => {
    if (status === AppStatus.ANALYZING_PRODUCT) {
      return (
        <div className="flex flex-col items-center justify-center h-[60vh] space-y-12">
          <div className="relative group">
            <div className="absolute -inset-4 bg-emerald-500/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="relative w-56 h-72 rounded-[2rem] overflow-hidden border-2 border-emerald-500/30 shadow-md bg-slate-100">
              {productImg?.previewUrl && (
                <img src={productImg.previewUrl} className="w-full h-full object-cover grayscale opacity-30" />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-400/50 to-transparent w-full h-24 animate-[scan_2.5s_ease-in-out_infinite] shadow-xl"></div>
            </div>
          </div>
          <div className="text-center space-y-4 max-w-sm">
            <div className="flex items-center justify-center gap-3 text-emerald-600 font-black text-3xl tracking-tighter">
              <Scan className="animate-pulse" size={32} /> 深度审计中
            </div>
            <div className="space-y-2">
              <p className="text-slate-600 text-base font-medium leading-relaxed">正在挖掘产品核心卖点与受众画像...</p>
              <div className="flex gap-1.5 justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-bounce"></div>
              </div>
            </div>
          </div>
          <style>{`@keyframes scan { 0% { transform: translateY(-120%); } 100% { transform: translateY(350%); } }`}</style>
        </div>
      );
    }

    switch (status) {
      case AppStatus.IDLE:
        return (
          <div className="flex flex-col lg:flex-row gap-8 w-full animate-in fade-in duration-700 items-start">
            {/* Left: Fixed Asset Pane */}
            <div className="w-full lg:w-1/3 lg:sticky lg:top-24 space-y-6">
              <div className="bg-slate-100/60 border border-slate-200 rounded-3xl p-6 shadow-md">
                <UploadZone label="1. 上传产品素材" description="JPG/PNG 格式，建议白底或透明底" fileData={productImg} onFileSelect={setProductImg} />
              </div>
              {productImg && (
                <div className="bg-slate-100/60 border border-slate-200 rounded-3xl p-6 shadow-md animate-in slide-in-from-left-4 duration-500">
                  <UploadZone label="2. 上传参考图 (可选)" description="上传您喜欢的背景风格图" fileData={bgImg} onFileSelect={setBgImg} isOptional={true} />
                </div>
              )}
            </div>

            {/* Right: Strategy & Config Pane */}
            <div className="w-full lg:w-2/3 flex flex-col gap-6">
              {!productImg ? (
                <div className="flex flex-col items-center justify-center h-96 border-2 border-dashed border-slate-300 rounded-[3rem] text-slate-500 gap-4 bg-slate-50/50 transition-all hover:bg-slate-100">
                  <div className="p-6 bg-slate-300/30 rounded-full"><Box size={48} className="opacity-40" /></div>
                  <p className="text-lg font-medium text-slate-600">请先在左侧上传您的产品</p>
                </div>
              ) : (
                <>
                  {/* AI Audit Section */}
                  <div className="bg-white border border-emerald-200/50 rounded-[2.5rem] p-8 space-y-8 shadow-md relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-15 transition-opacity pointer-events-none">
                      <Wand2 size={120} className="text-emerald-600" />
                    </div>

                    <div className="flex items-center justify-between relative z-10">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-100 rounded-xl text-emerald-600"><Target size={20} /></div>
                        <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase">AI 营销审计报告</h3>
                      </div>
                      <span className="text-[10px] font-black text-emerald-600/60 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 flex items-center gap-1.5"><Check size={12}/> 点击文字直接校正内容</span>
                    </div>

                    {analysis ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-black text-slate-600 uppercase tracking-widest flex items-center gap-2">核心卖点建议</span>
                            <button onClick={() => addAnalysisItem('sellingPoints')} className="p-1.5 hover:bg-emerald-100 rounded-lg text-emerald-600/80 hover:text-emerald-700 transition-all"><Plus size={14}/></button>
                          </div>
                          <div className="flex flex-col gap-2.5">
                            {analysis.sellingPoints.map((p, i) => (
                              <div key={i} className="group relative flex items-center bg-slate-50 border border-slate-200 rounded-xl pr-2 focus-within:border-emerald-300 focus-within:bg-emerald-50 transition-all shadow-sm">
                                <input 
                                  value={p} 
                                  onChange={(e) => updateAnalysisField('sellingPoints', i, e.target.value)}
                                  className="w-full bg-transparent text-sm text-emerald-700 px-4 py-3 focus:outline-none"
                                />
                                <button onClick={() => removeAnalysisItem('sellingPoints', i)} className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500 transition-all"><Trash2 size={14}/></button>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-black text-slate-600 uppercase tracking-widest flex items-center gap-2">精准受众画像</span>
                            <button onClick={() => addAnalysisItem('targetAudience')} className="p-1.5 hover:bg-blue-100 rounded-lg text-blue-600/80 hover:text-blue-700 transition-all"><Plus size={14}/></button>
                          </div>
                          <div className="flex flex-col gap-2.5">
                            {analysis.targetAudience.map((a, i) => (
                              <div key={i} className="group relative flex items-center bg-slate-50 border border-slate-200 rounded-xl pr-2 focus-within:border-blue-300 focus-within:bg-blue-50 transition-all shadow-sm">
                                <input 
                                  value={a} 
                                  onChange={(e) => updateAnalysisField('targetAudience', i, e.target.value)}
                                  className="w-full bg-transparent text-sm text-blue-700 px-4 py-3 focus:outline-none"
                                />
                                <button onClick={() => removeAnalysisItem('targetAudience', i)} className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500 transition-all"><Trash2 size={14}/></button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-32 text-slate-500 italic">正在生成审计结果...</div>
                    )}
                  </div>

                  {/* Vibe Selection Section */}
                  <div className="bg-slate-100/60 border border-slate-200 rounded-[2.5rem] p-8 space-y-6 shadow-md">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                        <div className="p-2 bg-purple-100 rounded-xl text-purple-600"><Layout size={20} /></div>
                        商业拍摄方案
                      </h3>
                      <button onClick={randomizeSeed} className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-emerald-600 transition-colors bg-slate-200/60 px-3 py-1.5 rounded-lg border border-slate-300">
                        <Dices size={14} /> 种子: {seed}
                      </button>
                    </div>

                    <div className="space-y-4">
                      <textarea 
                        value={bgVibe} 
                        onChange={(e) => setBgVibe(e.target.value)} 
                        placeholder="描述您想要的背景氛围，或从下方选择 AI 方案..." 
                        rows={3}
                        className="w-full bg-white border border-slate-200 rounded-[1.5rem] px-6 py-4 text-sm text-slate-800 focus:outline-none focus:border-emerald-400 resize-none leading-relaxed transition-all shadow-sm" 
                      />
                      {analysis && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {analysis.suggestedScenarios.map((s, idx) => (
                            <button 
                              key={idx} 
                              onClick={() => setBgVibe(s)} 
                              className={`text-left text-xs p-4 rounded-2xl border transition-all duration-300 ${
                                bgVibe === s 
                                  ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-900/20 scale-[1.02]' 
                                  : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <div className="font-bold mb-1 flex items-center gap-1.5">
                                <Sparkles size={10} className={bgVibe === s ? 'text-white' : 'text-emerald-600'} />
                                方案 {idx + 1}
                              </div>
                              <div className="opacity-80 line-clamp-2">{s}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Footer */}
                  <div className="pt-4 flex justify-end">
                    <button disabled={!productImg} onClick={handleGenerateImage} className="group relative px-12 py-5 bg-gradient-to-br from-emerald-500 to-teal-700 disabled:from-slate-300 disabled:to-slate-400 rounded-2xl font-black text-xl text-white shadow-md transition-all hover:scale-[1.03] active:scale-[0.98] flex items-center gap-4 overflow-hidden">
                      <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-10 transition-opacity"></div>
                      <span>合成 AI 商业海报</span>
                      <ArrowRight size={24} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );

      case AppStatus.GENERATING_IMAGE:
      case AppStatus.GENERATING_VIDEO:
        const isVideo = status === AppStatus.GENERATING_VIDEO;
        return (
          <div className="flex flex-col items-center justify-center h-96 space-y-10 animate-in fade-in zoom-in-95 duration-500">
            <div className="relative">
              <div className={`absolute -inset-8 ${isVideo ? 'bg-purple-500/10' : 'bg-emerald-500/10'} blur-[60px] rounded-full animate-pulse`}></div>
              <div className={`w-32 h-32 border-4 border-slate-300 ${isVideo ? 'border-t-purple-500 shadow-md' : 'border-t-emerald-500 shadow-md'} rounded-full animate-spin relative z-10`}></div>
              {isVideo ? <Film className="absolute inset-0 m-auto text-purple-500 w-12 h-12" /> : <Sparkles className="absolute inset-0 m-auto text-emerald-500 w-12 h-12" />}
            </div>
            <div className="text-center relative z-10">
              <h3 className="text-4xl font-black text-slate-900 mb-4 tracking-tighter">{isVideo ? '正在渲染动态大片' : '正在重构光影空间'}</h3>
              <div className="flex items-center justify-center gap-3 text-slate-600 font-medium">
                <RefreshCw size={18} className="animate-spin" />
                <span className="text-base tracking-wide">AI 正在计算材质反光与真实阴影...</span>
              </div>
            </div>
          </div>
        );

      case AppStatus.IMAGE_REVIEW:
        return (
          <div className="flex flex-col w-full gap-10 animate-in slide-in-from-bottom-5 duration-700">
            <div className={`relative group w-full mx-auto rounded-[3rem] overflow-hidden shadow-lg border border-slate-200 bg-slate-50 ${videoAspectRatio === '16:9' ? 'max-w-5xl aspect-video' : 'max-w-md aspect-[9/16]'}`}>
              {generatedImageUrl && <img src={generatedImageUrl} alt="Generated" className="w-full h-full object-contain" />}
              <div className="absolute top-6 right-6 bg-emerald-500 backdrop-blur-md px-4 py-2 rounded-full text-[11px] font-black text-white border border-white/20 shadow-md flex items-center gap-2">
                <Check size={14}/> 静态预览已就绪
              </div>
            </div>

            <div className="flex flex-col items-center gap-8 w-full max-w-5xl mx-auto">
              <div className="w-full bg-slate-100/60 p-10 rounded-[3rem] border border-slate-200 shadow-md relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-100/30 blur-[100px] pointer-events-none"></div>

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6 border-b border-slate-200 pb-8 relative z-10">
                  <div className="flex flex-col">
                    <h3 className="text-2xl font-black text-slate-900 flex items-center gap-4 tracking-tighter">
                      <Scan size={32} className="text-emerald-600" /> 选择运镜风格
                    </h3>
                    <p className="text-xs text-slate-600 mt-2 uppercase tracking-[0.2em] font-black">AI 将根据镜头重点优化渲染路径</p>
                  </div>
                  <div className="flex bg-slate-200/50 rounded-2xl p-2 gap-2 border border-slate-300 shadow-sm">
                    <button onClick={() => setVideoAspectRatio('16:9')} className={`px-6 py-3 text-xs font-black rounded-xl transition-all ${videoAspectRatio === '16:9' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-600 hover:text-slate-900'}`}>横屏 16:9</button>
                    <button onClick={() => setVideoAspectRatio('9:16')} className={`px-6 py-3 text-xs font-black rounded-xl transition-all ${videoAspectRatio === '9:16' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-600 hover:text-slate-900'}`}>竖屏 9:16</button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-5 mb-8 relative z-10">
                  {[
                    { id: 'detail_focus', icon: Target, label: '材质特写', desc: '推镜展示细节' },
                    { id: 'hero_360', icon: RefreshCw, label: '360°旋转', desc: '全维度展示' },
                    { id: 'impact_dolly', icon: Zap, label: '动感推近', desc: '营造视觉冲击' },
                    { id: 'elegant_slide', icon: Star, label: '优雅平移', desc: '高端氛围感' },
                    { id: 'reveal_lift', icon: ChevronUp, label: '仰拍揭幕', desc: '新品隆重登场' },
                    { id: 'custom', icon: Settings2, label: '自定义', desc: '自由编辑运镜' },
                  ].map((style) => (
                    <button
                      key={style.id}
                      onClick={() => setCameraStyle(style.id as CameraStyle)}
                      className={`flex flex-col items-center justify-center p-6 rounded-[2rem] border-2 transition-all duration-300 group relative overflow-hidden ${
                        cameraStyle === style.id ? 'border-emerald-500 bg-emerald-100 text-emerald-700 scale-[1.05] shadow-md' : 'border-slate-200 bg-slate-100 text-slate-600 hover:border-slate-300 hover:text-slate-900 hover:bg-slate-200'
                      }`}
                    >
                      {cameraStyle === style.id && <div className="absolute top-0 right-0 p-2"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div></div>}
                      <style.icon size={32} className={`mb-4 transition-all duration-500 ${cameraStyle === style.id ? 'scale-110' : 'group-hover:scale-105 group-hover:text-emerald-600'}`} />
                      <span className="text-sm font-black mb-1.5 tracking-tight">{style.label}</span>
                      <span className="text-[10px] opacity-60 text-center leading-relaxed font-medium">{style.desc}</span>
                    </button>
                  ))}
                </div>

                {cameraStyle === 'custom' && (
                  <div className="mt-4 p-6 bg-slate-100 border border-emerald-200 rounded-[2rem] animate-in zoom-in-95 duration-500 shadow-sm relative z-10">
                    <label className="text-[10px] font-black text-emerald-700 uppercase tracking-widest block mb-4 flex items-center gap-2">
                      <Settings2 size={14}/> 自定义运镜描述
                    </label>
                    <textarea 
                      value={customMovement}
                      onChange={(e) => setCustomMovement(e.target.value)}
                      placeholder="例如: Fast orbital sweep from top angle with dynamic focus change..."
                      className="w-full bg-white border border-slate-200 rounded-2xl px-6 py-4 text-sm text-slate-800 focus:outline-none focus:border-emerald-400 min-h-[100px] resize-none shadow-sm"
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-5 w-full max-w-2xl">
                <div className="flex justify-center gap-6 w-full">
                  <button onClick={() => setStatus(AppStatus.IDLE)} className="px-10 py-5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-2xl flex items-center gap-3 font-bold transition-all border border-slate-300"><RotateCcw size={22} /> 重选素材</button>
                  <button onClick={handleGenerateVideo} className="px-14 py-5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black shadow-md transition-all hover:scale-[1.05] active:scale-[0.98] flex items-center gap-4 flex-1 justify-center">
                    <Video size={24} /> 渲染电影级高清视频（成功出片后扣费 {videoCost} 积分 / {effectiveVideoDurationSeconds}秒）
                  </button>
                </div>

                {/* Seedance 2.0 duration slider — billing scales linearly per second. */}
                <div className="bg-slate-100/70 border border-slate-200 rounded-2xl px-6 py-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <label htmlFor="product-video-duration" className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                      <Film size={14} className="text-emerald-600" /> 视频时长
                    </label>
                    <span className="text-xs font-black text-emerald-700 bg-emerald-100 border border-emerald-200 px-3 py-1 rounded-full">
                      {effectiveVideoDurationSeconds} 秒 · 共 {videoCost} 积分
                    </span>
                  </div>
                  <input
                    id="product-video-duration"
                    type="range"
                    min={PRODUCT_VIDEO_DURATION_MIN_SECONDS}
                    max={PRODUCT_VIDEO_DURATION_MAX_SECONDS}
                    step={1}
                    value={effectiveVideoDurationSeconds}
                    onChange={(e) => setVideoDurationSeconds(Number(e.target.value))}
                    className="w-full accent-emerald-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-bold text-slate-500 mt-2 tracking-wider">
                    <span>{PRODUCT_VIDEO_DURATION_MIN_SECONDS}s</span>
                    <span>按秒计费 · Seedance 2.0</span>
                    <span>{PRODUCT_VIDEO_DURATION_MAX_SECONDS}s</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        );

      case AppStatus.COMPLETED:
        return (
          <div className="flex flex-col w-full gap-10 animate-in zoom-in-95 duration-700">
            <div className={`w-full mx-auto rounded-[3.5rem] overflow-hidden shadow-lg border border-emerald-200 bg-slate-50 relative ${videoAspectRatio === '16:9' ? 'max-w-6xl aspect-video' : 'max-w-md aspect-[9/16]'}`}>
              {generatedVideoUrl && (
                <video ref={videoRef} src={generatedVideoUrl} controls loop playsInline className="w-full h-full object-cover" />
              )}
              <div className="absolute top-8 left-8 flex items-center gap-3 bg-emerald-500 backdrop-blur-md px-4 py-2 rounded-xl shadow-md">
                <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse shadow-[0_0_10px_white]"></div>
                <span className="text-[11px] font-black text-white uppercase tracking-[0.2em]">HD Master Rendered</span>
              </div>
            </div>
            <div className="flex flex-col items-center gap-10">
              <div className="flex flex-col sm:flex-row gap-6 w-full max-w-2xl">
                <button onClick={handleReset} className="px-12 py-5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-2xl font-black flex items-center justify-center gap-4 transition-all border border-slate-300"><RotateCcw size={24} /> 重新创作</button>
                {generatedVideoUrl && (
                  <a href={generatedVideoUrl} download="commercial_video.mp4" className="px-16 py-5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-2xl font-black shadow-md transition-all hover:scale-[1.05] flex items-center justify-center gap-4 flex-1">
                    <Download size={24} /> 下载超清成片
                  </a>
                )}
              </div>
            </div>
          </div>
        );

      case AppStatus.ERROR:
        return (
          <div className="flex flex-col items-center justify-center h-[50vh] space-y-8 text-center max-w-lg mx-auto">
            <div className="p-8 bg-red-100 rounded-full border border-red-300 shadow-md"><AlertCircle className="w-20 h-20 text-red-600" /></div>
            <div className="space-y-4">
              <h3 className="text-4xl font-black text-slate-900 tracking-tighter">生成任务遇到阻碍</h3>
              <p className="text-slate-600 text-lg font-medium leading-relaxed">{errorMsg}</p>
            </div>
            <button onClick={() => setStatus(AppStatus.IDLE)} className="px-12 py-4 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-2xl font-black border border-slate-300 transition-all flex items-center gap-3"><RotateCcw size={20}/> 尝试修复并返回</button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 selection:bg-blue-200/60">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-2xl sticky top-0 z-50 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={platform.onBack} className="px-3 py-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition-colors">← 返回</button>
            <h1 className="text-2xl font-black tracking-tighter text-slate-900">产品展示视频<span className="text-[10px] font-black border border-emerald-500/40 px-2.5 py-0.5 rounded-full text-emerald-600 align-top ml-2 shadow-[0_0_10px_rgba(16,185,129,0.15)]">PRO AI</span></h1>
          </div>
          <div className="text-xs text-slate-600">可用积分：{platform.credits}</div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12 flex flex-col items-center min-h-[calc(100vh-5rem)]">
        <div className="w-full max-w-4xl mb-12">
          <ProcessSteps status={status} />
        </div>

        <div className="w-full max-w-7xl bg-white border border-slate-200/80 rounded-[4rem] p-8 md:p-16 shadow-lg relative overflow-hidden transition-all duration-500">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-100/40 blur-[150px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-50/50 blur-[120px] rounded-full translate-y-1/2 -translate-x-1/2 pointer-events-none"></div>
          <div className="relative z-10 w-full">
            {renderContent()}
            {!errorMsg && status !== AppStatus.GENERATING_IMAGE && status !== AppStatus.GENERATING_VIDEO && !generatedImageUrl && (
              <div className="mt-6 text-center text-sm text-slate-600">生成成功后将扣费 {displayCost} 积分</div>
            )}
            {errorMsg && (
              <div className="mt-6 text-center text-sm text-red-600">{errorMsg}</div>
            )}
            {queueNotice && !errorMsg && (
              <div className="mt-6 text-center text-sm text-amber-700">{queueNotice}</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default AIProductDisplayApp;
