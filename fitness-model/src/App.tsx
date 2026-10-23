import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  Dumbbell,
  Edit2,
  Image as ImageIcon,
  Layout,
  Loader2,
  Maximize2,
  Plus,
  RefreshCw,
  Settings2,
  Type,
  Upload,
  User,
  Video,
  X,
} from 'lucide-react';
import {
  analyzeFitnessProductImage,
  createFitnessVideoQueueTask,
  editFitnessImage,
  generateFitnessImage,
  persistGeneratedImageTask,
  queryFitnessVideoQueueTask,
  queryFitnessVideoTaskProgress,
  submitFitnessVideoTask,
} from './services/geminiService';

type PlatformBridge = {
  checkBalance: (amount: number) => boolean;
  showRecharge?: () => void;
  refreshCredits?: () => Promise<void>;
};

type AppProps = {
  platform?: PlatformBridge;
  costs?: Record<string, number>;
};

type HistoryItem = {
  id: string;
  timestamp: number;
  images: string[];
  videos: Record<number, string>;
  equipmentDesc: string;
  prompt: string;
  aspectRatio: string;
};

const MODEL_TYPES = [
  { id: 'full_body', label: '全身模特', icon: User, prompt: 'full body athletic model' },
  { id: 'knee', label: '膝盖局部', icon: Maximize2, prompt: 'close up of a muscular leg and knee' },
  { id: 'wrist', label: '手腕局部', icon: Maximize2, prompt: 'close up of a wrist and forearm' },
  { id: 'ankle', label: '脚踝局部', icon: Maximize2, prompt: 'close up of an ankle and foot' },
  { id: 'elbow', label: '手肘局部', icon: Maximize2, prompt: 'close up of an elbow and arm' },
  { id: 'waist', label: '腰部局部', icon: Maximize2, prompt: 'close up of an athletic waist and core' },
];

const GENDERS = [
  { id: 'random', label: '随机', prompt: '' },
  { id: 'female', label: '女性', prompt: 'female' },
  { id: 'male', label: '男性', prompt: 'male' },
];

const BACKGROUNDS = [
  { id: 'gym', label: '健身房', prompt: 'in a modern high-end gym background' },
  { id: 'outdoor', label: '户外运动', prompt: 'outdoors in a sunny park or running track background' },
  { id: 'studio', label: '纯色摄影棚', prompt: 'in a professional photography studio with clean minimalist background' },
  { id: 'home', label: '居家健身', prompt: 'in a cozy and aesthetic modern Chinese home setting, warm neutral tones, Xiaohongshu style home decor, soft sunlight, plants, minimalist wabi-sabi or warm cream style interior' },
];

const ETHNICITIES = [
  { id: 'random', label: '随机人种', prompt: '' },
  { id: 'asian', label: '亚洲人', prompt: 'Asian' },
  { id: 'asian_influencer', label: '亚洲网红风', prompt: 'Asian fitness influencer, Xiaohongshu style, aesthetic lifestyle photography, soft natural lighting, trendy workout outfit' },
  { id: 'caucasian', label: '白人', prompt: 'Caucasian' },
  { id: 'african', label: '黑人', prompt: 'African' },
  { id: 'hispanic', label: '拉丁裔', prompt: 'Hispanic' },
  { id: 'middle_eastern', label: '中东人', prompt: 'Middle Eastern' },
];

const ASPECT_RATIOS = [
  { id: '1:1', label: '1:1 (正方形)' },
  { id: '3:4', label: '3:4 (竖屏)' },
  { id: '9:16', label: '9:16 (手机)' },
  { id: '16:9', label: '16:9 (宽屏)' },
];

const RESOLUTIONS = [
  { id: '1K', label: '1K 标准' },
  { id: '2K', label: '2K 高清' },
];

const HISTORY_STORAGE_KEY = 'fitness-model-history';
const FALLBACK_COSTS = {
  ANALYZE_IMAGE: 0,
  GENERATE_IMAGE: 10,
  EDIT_IMAGE: 10,
  GENERATE_VIDEO: 30,
};

function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && Array.isArray(item.images)).map((item) => ({
          id: String(item.id || Date.now()),
          timestamp: Number(item.timestamp || Date.now()),
          images: Array.isArray(item.images) ? item.images.map((value) => String(value || '')) : [],
          videos: item.videos && typeof item.videos === 'object' ? item.videos : {},
          equipmentDesc: String(item.equipmentDesc || ''),
          prompt: String(item.prompt || ''),
          aspectRatio: String(item.aspectRatio || '1:1'),
        }))
      : [];
  } catch {
    return [];
  }
}

function persistHistory(history: HistoryItem[]) {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Ignore storage quota limits and keep in-memory history usable.
  }
}

export default function App({ platform, costs }: AppProps) {
  const activePlatform = useMemo<PlatformBridge>(
    () =>
      platform || {
        checkBalance: () => true,
        showRecharge: () => {},
        refreshCredits: async () => {},
      },
    [platform],
  );
  const activeCosts = { ...FALLBACK_COSTS, ...(costs || {}) };
  const [equipment, setEquipment] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [useCustomPrompt, setUseCustomPrompt] = useState(false);
  const [selectedModel, setSelectedModel] = useState(MODEL_TYPES[0]);
  const [selectedBg, setSelectedBg] = useState(BACKGROUNDS[0]);
  const [selectedEthnicity, setSelectedEthnicity] = useState(ETHNICITIES[0]);
  const [selectedGender, setSelectedGender] = useState(GENDERS[0]);
  const [selectedRatio, setSelectedRatio] = useState(ASPECT_RATIOS[0]);
  const [selectedRes, setSelectedRes] = useState(RESOLUTIONS[0]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [zoomedImageIndex, setZoomedImageIndex] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'generate' | 'history'>('generate');
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);
  const [isGeneratingIndex, setIsGeneratingIndex] = useState<number | null>(null);
  const [videoLoadingIndices, setVideoLoadingIndices] = useState<Set<number>>(new Set());
  const [generatedVideos, setGeneratedVideos] = useState<Record<number, string>>({});
  const [editingImageIndex, setEditingImageIndex] = useState<number | null>(null);
  const [editPromptText, setEditPromptText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editingVideoIndex, setEditingVideoIndex] = useState<number | null>(null);
  const [videoPromptText, setVideoPromptText] = useState('A dynamic, high quality commercial video showcasing this active scenario, realistic lighting, professional camera movement');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queuePollersRef = useRef<Record<number, number>>({});
  const providerPollersRef = useRef<Record<number, number>>({});

  useEffect(() => {
    persistHistory(history);
  }, [history]);

  useEffect(() => {
    return () => {
      Object.values(queuePollersRef.current).forEach((timerId) => window.clearInterval(timerId));
      Object.values(providerPollersRef.current).forEach((timerId) => window.clearInterval(timerId));
    };
  }, []);

  const ensureBalance = (amount: number, message: string) => {
    if (amount <= 0) {
      return true;
    }
    const enough = activePlatform.checkBalance(amount);
    if (!enough) {
      setError(message);
      activePlatform.showRecharge?.();
      return false;
    }
    return true;
  };

  const stopQueuePolling = (index: number) => {
    const timerId = queuePollersRef.current[index];
    if (timerId) {
      window.clearInterval(timerId);
      delete queuePollersRef.current[index];
    }
  };

  const stopProviderPolling = (index: number) => {
    const timerId = providerPollersRef.current[index];
    if (timerId) {
      window.clearInterval(timerId);
      delete providerPollersRef.current[index];
    }
  };

  const updateHistoryRecord = (
    historyId: string | null,
    updater: (record: HistoryItem) => HistoryItem,
  ) => {
    if (!historyId) {
      return;
    }

    setHistory((prev) => prev.map((record) => (record.id === historyId ? updater(record) : record)));
  };

  const analyzeImage = async (file: File, base64: string) => {
    setIsAnalyzing(true);
    try {
      if (!ensureBalance(activeCosts.ANALYZE_IMAGE, '积分不足，无法分析图片。')) {
        return;
      }
      const description = await analyzeFitnessProductImage({ image: base64 });
      setEquipment(description);
      void activePlatform.refreshCredits?.();
    } catch (err) {
      console.error('Image analysis failed:', err);
      setError('图片分析失败，请重试。');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    const combinedFiles = [...imageFiles, ...files].slice(0, 3);
    setImageFiles(combinedFiles);
    
    const newPreviews: string[] = [];
    const readPromises = combinedFiles.map(file => {
      return new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          newPreviews.push(reader.result as string);
          resolve();
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readPromises).then(() => {
      setImagePreviews(newPreviews);
      if (combinedFiles[0] && newPreviews[0] && imageFiles.length === 0) {
        analyzeImage(combinedFiles[0], newPreviews[0]);
      }
    });

    e.target.value = '';
  };

  const removeImage = (indexToRemove: number) => {
    setImageFiles(prev => prev.filter((_, index) => index !== indexToRemove));
    setImagePreviews(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const buildImagePrompt = () => {
    const ethnicityStr = selectedEthnicity.prompt ? `${selectedEthnicity.prompt} ` : '';
    const genderStr = selectedGender.prompt ? `${selectedGender.prompt} ` : '';
    const preserveInstruction =
      'CRITICAL: Strictly preserve the product appearance, texture, color, logo, structure, and scale from the uploaded product image.';
    const realisticStyle =
      'Highly realistic ecommerce photography, natural skin texture, realistic lighting, no CGI plastic feel, premium sportswear commercial look.';

    if (useCustomPrompt) {
      return `${preserveInstruction} ${customPrompt}. ${realisticStyle}`;
    }

    if (selectedEthnicity.id === 'asian_influencer') {
      return `${preserveInstruction} Create a Xiaohongshu-style fitness lifestyle photo of a trendy Asian ${genderStr}fitness influencer wearing ${equipment.trim()}. The shot is a ${selectedModel.prompt}. The setting is ${selectedBg.prompt}. ${realisticStyle}`;
    }

    const equipmentText = equipment.trim() || 'the product in the uploaded image';
    return `${preserveInstruction} Create a photorealistic fitness lifestyle image of an athletic ${ethnicityStr}${genderStr}model wearing ${equipmentText}. The shot is a ${selectedModel.prompt}. The setting is ${selectedBg.prompt}. ${realisticStyle}`;
  };

  const createHistoryEntry = (images: string[], prompt: string, equipmentDesc: string) => {
    const historyId = `${Date.now()}`;
    const record: HistoryItem = {
      id: historyId,
      timestamp: Date.now(),
      images,
      videos: {},
      equipmentDesc,
      prompt,
      aspectRatio: selectedRatio.id,
    };
    setCurrentHistoryId(historyId);
    setHistory((prev) => [record, ...prev]);
  };

  const generateImage = async () => {
    if (!useCustomPrompt && !equipment.trim() && imageFiles.length === 0) {
      setError('请上传产品图片或输入器材描述');
      return;
    }
    if (useCustomPrompt && !customPrompt.trim()) {
      setError('请输入自定义提示词');
      return;
    }

    if (!ensureBalance(activeCosts.GENERATE_IMAGE * 2, '积分不足，无法生成图片。')) {
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedImages([]);

    try {
      const prompt = buildImagePrompt();
      const rawImages = await Promise.all(
        Array.from({ length: 2 }, () =>
          generateFitnessImage({
            productImages: imagePreviews,
            prompt,
            aspectRatio: selectedRatio.id,
            imageSize: selectedRes.id as '1K' | '2K',
          }),
        ),
      );

      const persistedImages: string[] = [];
      for (let index = 0; index < rawImages.length; index += 1) {
        const persistedImage = await persistGeneratedImageTask({
          imageUrl: rawImages[index],
          imageIndex: index,
          prompt,
          aspectRatio: selectedRatio.id,
          equipmentDesc: equipment.trim() || 'custom prompt',
        });
        persistedImages.push(persistedImage);
      }

      setGeneratedImages(persistedImages);
      setGeneratedVideos({});
      createHistoryEntry(persistedImages, prompt, equipment.trim() || customPrompt.trim());
      void activePlatform.refreshCredits?.();
    } catch (err: any) {
      console.error(err);
      setError(err.message || '生成失败，请检查网络或重试');
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadImage = (index: number) => {
    if (!generatedImages[index]) return;
    const link = document.createElement('a');
    link.href = generatedImages[index];
    link.download = `fitmodel-${Date.now()}-${index + 1}.png`;
    link.click();
  };

  const downloadAllImages = () => {
    generatedImages.forEach((_, idx) => downloadImage(idx));
  };

  const regenerateSingleImage = async (index: number) => {
    if (!ensureBalance(activeCosts.GENERATE_IMAGE, '积分不足，无法重新生成图片。')) {
      return;
    }

    setIsGeneratingIndex(index);
    setError(null);

    try {
      const prompt = buildImagePrompt();
      const newImage = await generateFitnessImage({
        productImages: imagePreviews,
        prompt,
        aspectRatio: selectedRatio.id,
        imageSize: selectedRes.id as '1K' | '2K',
      });
      const persistedImage = await persistGeneratedImageTask({
        imageUrl: newImage,
        imageIndex: index,
        prompt,
        aspectRatio: selectedRatio.id,
        equipmentDesc: equipment.trim() || customPrompt.trim(),
      });

      setGeneratedImages(prev => {
        const next = [...prev];
        next[index] = persistedImage;
        return next;
      });
      setGeneratedVideos((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
      updateHistoryRecord(currentHistoryId, (record) => {
        const nextImages = [...record.images];
        nextImages[index] = persistedImage;
        const nextVideos = { ...record.videos };
        delete nextVideos[index];
        return { ...record, images: nextImages, videos: nextVideos };
      });
      void activePlatform.refreshCredits?.();
    } catch (err: any) {
      console.error(err);
      setError(err.message || '重绘失败');
    } finally {
      setIsGeneratingIndex(null);
    }
  };

  const openVideoModal = (index: number) => {
    setEditingVideoIndex(index);
    setVideoPromptText('A dynamic, high quality commercial video showcasing this active scenario, realistic lighting, professional camera movement');
  };

  const syncVideoResult = (index: number, videoUrl: string) => {
    setGeneratedVideos((prev) => ({ ...prev, [index]: videoUrl }));
    updateHistoryRecord(currentHistoryId, (record) => ({
      ...record,
      videos: {
        ...record.videos,
        [index]: videoUrl,
      },
    }));
  };

  const clearVideoLoading = (index: number) => {
    setVideoLoadingIndices((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  };

  const startQueueVideoPolling = (index: number, taskQueueId: number) => {
    stopQueuePolling(index);
    queuePollersRef.current[index] = window.setInterval(async () => {
      try {
        const result = await queryFitnessVideoQueueTask(taskQueueId);
        if (result.query.videoUrl) {
          syncVideoResult(index, result.query.videoUrl);
          clearVideoLoading(index);
          stopQueuePolling(index);
          stopProviderPolling(index);
          void activePlatform.refreshCredits?.();
          return;
        }

        if (String(result.task.status || '').trim().toLowerCase() === 'failed') {
          setError(result.task.last_error || result.query.error || '视频生成失败。');
          clearVideoLoading(index);
          stopQueuePolling(index);
        }
      } catch (err: any) {
        console.warn('Queue video polling failed', err);
      }
    }, 8000);
  };

  const startProviderVideoPolling = (index: number, providerTaskId: string) => {
    stopProviderPolling(index);
    providerPollersRef.current[index] = window.setInterval(async () => {
      try {
        const result = await queryFitnessVideoTaskProgress(providerTaskId);
        if (result.videoUrl) {
          syncVideoResult(index, result.videoUrl);
          clearVideoLoading(index);
          stopProviderPolling(index);
          return;
        }

        const normalizedStatus = String(result.status || '').trim().toLowerCase();
        if (normalizedStatus === 'failed' || normalizedStatus === 'error' || normalizedStatus === 'cancelled') {
          setError('视频生成失败，请重试。');
          clearVideoLoading(index);
          stopProviderPolling(index);
        }
      } catch (err: any) {
        console.warn('Provider video polling failed', err);
      }
    }, 8000);
  };

  const handleGenerateVideo = async () => {
    if (editingVideoIndex === null) return;
    const index = editingVideoIndex;

    if (!ensureBalance(activeCosts.GENERATE_VIDEO, '积分不足，无法生成视频。')) {
      return;
    }

    if (!generatedImages[index]) {
      return;
    }

    setVideoLoadingIndices((prev) => new Set(prev).add(index));
    setError(null);
    setEditingVideoIndex(null);

    try {
      const aspectRatio = selectedRatio.id === '16:9' ? '16:9' : '9:16';
      const generation = await submitFitnessVideoTask({
        image: generatedImages[index],
        prompt:
          videoPromptText ||
          'A dynamic, high quality commercial video showcasing this active scenario, realistic lighting, professional camera movement',
        aspectRatio,
      });

      if (generation.videoUrl) {
        syncVideoResult(index, generation.videoUrl);
        clearVideoLoading(index);
        void activePlatform.refreshCredits?.();
        return;
      }

      try {
        const queueTask = await createFitnessVideoQueueTask({
          imageIndex: index,
          prompt: videoPromptText,
          previewUrl: generatedImages[index],
          aspectRatio,
          generation,
        });
        startQueueVideoPolling(index, queueTask.id);
      } catch (queueError) {
        console.warn('Video task queue persistence failed, falling back to provider polling', queueError);
        if (generation.taskId) {
          startProviderVideoPolling(index, generation.taskId);
        } else {
          throw queueError;
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || '生成视频失败，请重试');
      clearVideoLoading(index);
    }
  };

  const handleEditSingle = async () => {
    if (editingImageIndex === null || !editPromptText.trim() || !generatedImages[editingImageIndex]) return;
    if (!ensureBalance(activeCosts.EDIT_IMAGE, '积分不足，无法修改图片。')) {
      return;
    }

    setIsEditing(true);
    setError(null);

    try {
      const newImage = await editFitnessImage({
        image: generatedImages[editingImageIndex],
        prompt: editPromptText,
        aspectRatio: selectedRatio.id,
        imageSize: selectedRes.id as '1K' | '2K',
      });
      const persistedImage = await persistGeneratedImageTask({
        imageUrl: newImage,
        imageIndex: editingImageIndex,
        prompt: editPromptText,
        aspectRatio: selectedRatio.id,
        equipmentDesc: equipment.trim() || customPrompt.trim(),
      });

      setGeneratedImages(prev => {
        const next = [...prev];
        next[editingImageIndex] = persistedImage;
        return next;
      });
      setGeneratedVideos((prev) => {
        const next = { ...prev };
        delete next[editingImageIndex];
        return next;
      });

      updateHistoryRecord(currentHistoryId, (record) => {
        const nextImages = [...record.images];
        nextImages[editingImageIndex] = persistedImage;
        const nextVideos = { ...record.videos };
        delete nextVideos[editingImageIndex];
        return { ...record, images: nextImages, videos: nextVideos };
      });

      setEditingImageIndex(null);
      setEditPromptText('');
      void activePlatform.refreshCredits?.();
    } catch (err: any) {
      console.error(err);
      setError(err.message || '修改失败');
    } finally {
      setIsEditing(false);
    }
  };

  const restoreWorkspace = (record: HistoryItem) => {
    setCurrentHistoryId(record.id);
    setGeneratedImages(record.images);
    setGeneratedVideos(record.videos || {});
    setEquipment(record.equipmentDesc);
    setCustomPrompt(record.prompt);
    setSelectedRatio(ASPECT_RATIOS.find((ratio) => ratio.id === record.aspectRatio) || ASPECT_RATIOS[0]);
    setActiveTab('generate');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans selection:bg-lime-400 selection:text-black">
      {/* Header */}
      <header className="bg-zinc-950 border-b border-zinc-800 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-lime-400 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(163,230,53,0.4)]">
              <Dumbbell className="text-zinc-950 w-6 h-6" />
            </div>
            <h1 className="text-xl font-black tracking-tighter uppercase text-lime-400">运动器材模特生成器</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-6 text-sm font-bold uppercase tracking-wide text-zinc-500">
              <button 
                onClick={() => setActiveTab('generate')}
                className={`transition-colors ${activeTab === 'generate' ? 'text-lime-400' : 'hover:text-white'}`}
              >
                生成器
              </button>
              <button 
                onClick={() => setActiveTab('history')}
                className={`transition-colors flex items-center gap-2 ${activeTab === 'history' ? 'text-lime-400' : 'hover:text-white'}`}
              >
                我的作品 {history.length > 0 && <span className="bg-lime-400 text-black text-[10px] px-2 py-0.5 rounded-full">{history.length}</span>}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {activeTab === 'generate' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Controls Panel */}
        <div className="lg:col-span-5 space-y-6">
          <section className="bg-zinc-900/50 rounded-xl p-6 border border-zinc-800 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black uppercase tracking-tight flex items-center gap-2 text-white">
                <Layout className="w-5 h-5 text-lime-400" /> 1. 产品内容
              </h2>
              <button 
                onClick={() => setUseCustomPrompt(!useCustomPrompt)}
                className="text-xs font-bold text-lime-400 hover:text-lime-300 transition-colors flex items-center gap-1"
              >
                <Type className="w-3 h-3" /> {useCustomPrompt ? '自动分析' : '手动指令'}
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-zinc-400 mb-2 uppercase tracking-wide">实拍图直传</label>
                <div 
                  className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center transition-all min-h-[160px] ${
                    imagePreviews.length > 0
                      ? 'border-lime-500/50 bg-zinc-900'
                      : 'border-zinc-700 hover:border-lime-400/50 bg-zinc-900 cursor-pointer'
                  }`}
                  onClick={() => {
                    if (imagePreviews.length === 0) {
                      fileInputRef.current?.click();
                    }
                  }}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept="image/*" 
                    multiple
                    className="hidden" 
                  />
                  {imagePreviews.length > 0 ? (
                    <div className="w-full">
                       <div className="grid grid-cols-3 gap-3 mb-4">
                          {imagePreviews.map((preview, idx) => (
                             <div key={idx} className="relative aspect-video rounded-lg overflow-hidden group">
                                <img src={preview} alt={'Preview ' + idx} className="w-full h-full object-cover border border-gray-200 rounded-lg" />
                                <button 
                                  onClick={(e) => { e.stopPropagation(); removeImage(idx); }} 
                                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                             </div>
                          ))}
                          {imagePreviews.length < 3 && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} 
                                className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-700 rounded-lg aspect-video hover:bg-zinc-800 hover:border-lime-400/50 transition-colors"
                              >
                                  <Plus className="w-5 h-5 text-zinc-500 mb-1" />
                                  <span className="text-xs text-zinc-400 font-medium">添加图片</span>
                              </button>
                          )}
                       </div>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-zinc-500 mb-2" />
                      <p className="text-sm font-bold text-zinc-300">点击上传产品图片 (最多3张)</p>
                    </>
                  )}
                </div>
              </div>

              {useCustomPrompt ? (
                <div>
                  <label className="block text-sm font-bold text-zinc-400 mb-2 uppercase tracking-wide">自定义指令 (Prompt)</label>
                  <textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="例如: A fitness model wearing..."
                    className="w-full h-32 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 text-white focus:ring-2 focus:ring-lime-400 focus:border-transparent transition-all resize-none text-sm"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-bold text-zinc-400 mb-2 uppercase tracking-wide">智能特征提取</label>
                  <div className="relative">
                    <textarea
                      value={equipment}
                      onChange={(e) => setEquipment(e.target.value)}
                      disabled={isAnalyzing}
                      placeholder={isAnalyzing ? "AI 分析中..." : "例如：黑色透气面料护膝..."}
                      className={`w-full h-24 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 text-white focus:ring-2 focus:ring-lime-400 focus:border-transparent transition-all resize-none text-sm ${
                        isAnalyzing ? 'opacity-50' : ''
                      }`}
                    />
                    {isAnalyzing && (
                      <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80 rounded-xl backdrop-blur-sm">
                        <div className="flex items-center gap-2 text-xs font-bold text-lime-400">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          视觉解析中...
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="bg-zinc-900/50 rounded-xl p-6 border border-zinc-800 backdrop-blur-sm">
            <h2 className="text-lg font-black uppercase tracking-tight mb-4 flex items-center gap-2 text-white">
              <Settings2 className="w-5 h-5 text-lime-400" /> 2. 生成参数
            </h2>
            <div className="space-y-6">
              {!useCustomPrompt && (
                <>
                  <div>
                    <label className="block text-sm font-bold text-zinc-400 mb-3 uppercase tracking-wide">模特展示部位</label>
                    <div className="grid grid-cols-3 gap-2">
                      {MODEL_TYPES.map((type) => (
                        <button
                          key={type.id}
                          onClick={() => setSelectedModel(type)}
                          className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all gap-1 font-bold ${
                            selectedModel.id === type.id
                              ? 'border-lime-400 bg-lime-400/10 text-lime-400 shadow-[0_0_10px_rgba(163,230,53,0.2)]'
                              : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-white'
                          }`}
                        >
                          <type.icon className="w-4 h-4" />
                          <span className="text-[10px]">{type.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-6">
                    <div>
                      <label className="block text-sm font-bold text-zinc-400 mb-2 uppercase tracking-wide">模特性别</label>
                      <select 
                        value={selectedGender.id}
                        onChange={(e) => setSelectedGender(GENDERS.find(g => g.id === e.target.value) || GENDERS[0])}
                        className="w-full px-3 py-2.5 rounded-xl border border-zinc-700 text-sm focus:ring-2 focus:ring-lime-400 focus:border-transparent outline-none bg-zinc-900 hover:bg-zinc-800 transition-colors text-white font-medium"
                      >
                        {GENDERS.map(gender => (
                          <option key={gender.id} value={gender.id}>{gender.label}</option>
                         ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-zinc-400 mb-2 uppercase tracking-wide">模特人种</label>
                      <select 
                        value={selectedEthnicity.id}
                        onChange={(e) => setSelectedEthnicity(ETHNICITIES.find(eth => eth.id === e.target.value) || ETHNICITIES[0])}
                        className="w-full px-3 py-2.5 rounded-xl border border-zinc-700 text-sm focus:ring-2 focus:ring-lime-400 focus:border-transparent outline-none bg-zinc-900 hover:bg-zinc-800 transition-colors text-white font-medium"
                      >
                        {ETHNICITIES.map(eth => (
                          <option key={eth.id} value={eth.id}>{eth.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-bold text-zinc-400 mb-2 uppercase tracking-wide">背景环境</label>
                      <select 
                        value={selectedBg.id}
                        onChange={(e) => setSelectedBg(BACKGROUNDS.find(bg => bg.id === e.target.value) || BACKGROUNDS[0])}
                        className="w-full px-3 py-2.5 rounded-xl border border-zinc-700 text-sm focus:ring-2 focus:ring-lime-400 focus:border-transparent outline-none bg-zinc-900 hover:bg-zinc-800 transition-colors text-white font-medium"
                      >
                        {BACKGROUNDS.map(bg => (
                          <option key={bg.id} value={bg.id}>{bg.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-zinc-400 mb-3 uppercase tracking-wide">图片比例</label>
                  <select 
                    value={selectedRatio.id}
                    onChange={(e) => setSelectedRatio(ASPECT_RATIOS.find(r => r.id === e.target.value) || ASPECT_RATIOS[0])}
                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-700 text-sm focus:ring-2 focus:ring-lime-400 focus:border-transparent outline-none bg-zinc-900 hover:bg-zinc-800 transition-colors text-white font-medium"
                  >
                    {ASPECT_RATIOS.map(ratio => (
                      <option key={ratio.id} value={ratio.id}>{ratio.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-400 mb-3 uppercase tracking-wide">输出清晰度</label>
                  <select 
                    value={selectedRes.id}
                    onChange={(e) => setSelectedRes(RESOLUTIONS.find(r => r.id === e.target.value) || RESOLUTIONS[0])}
                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-700 text-sm focus:ring-2 focus:ring-lime-400 focus:border-transparent outline-none bg-zinc-900 hover:bg-zinc-800 transition-colors text-white font-medium"
                  >
                    {RESOLUTIONS.map(res => (
                      <option key={res.id} value={res.id}>{res.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </section>

          <button
            onClick={generateImage}
            disabled={isGenerating}
            className={`w-full py-4 rounded-xl font-black text-lg uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(163,230,53,0.3)] ${
              isGenerating
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed shadow-none'
                : 'bg-lime-400 text-black hover:bg-lime-500 hover:shadow-[0_0_30px_rgba(163,230,53,0.5)] active:scale-[0.98]'
            }`}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <ImageIcon className="w-6 h-6" />
                立即生成
              </>
            )}
          </button>

          {error && (
            <div className="bg-red-500/10 text-red-400 p-4 rounded-xl flex items-center gap-3 text-sm font-bold border border-red-500/20">
              <AlertCircle className="w-5 h-5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Preview Panel */}
        <div className="lg:col-span-7">
          <div className="bg-zinc-900 rounded-3xl p-4 shadow-2xl border border-zinc-800 min-h-[600px] flex flex-col">
            <div className="flex items-center justify-between mb-4 px-2">
              <h2 className="text-lg font-black uppercase tracking-tight text-white flex items-center gap-2">
                <span className="w-2 h-6 bg-lime-400 rounded-sm inline-block"></span> 预览结果
              </h2>
              {generatedImages.length > 0 && (
                <div className="flex items-center gap-3">
                  <button 
                    onClick={downloadAllImages}
                    className="flex items-center gap-2 text-sm font-bold text-lime-400 hover:text-lime-300 transition-colors uppercase tracking-wide"
                  >
                    <Download className="w-4 h-4" /> 下载全部 ({generatedImages.length})
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 relative rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-800 flex items-center justify-center">
                {isGenerating ? (
                  <div className="flex flex-col items-center gap-4 text-center p-8">
                    <div className="relative">
                      <div className="w-16 h-16 border-4 border-zinc-800 border-t-lime-400 rounded-full animate-spin" />
                      <ImageIcon className="absolute inset-0 m-auto w-6 h-6 text-lime-400" />
                    </div>
                    <div>
                      <p className="font-black text-xl tracking-tight text-white uppercase">AI 正在创作您的模特图</p>
                      <p className="text-sm font-bold text-zinc-500 mt-1 uppercase tracking-wide">正在以 {selectedRes.label} 渲染，请稍候...</p>
                    </div>
                  </div>
                ) : generatedImages.length > 0 ? (
                  <div className="w-full h-full p-4 overflow-y-auto">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 h-full items-center justify-center place-items-center">
                      {generatedImages.map((img, idx) => (
                        <div key={idx} className="relative group w-full h-full flex flex-col items-center justify-center">
                          {isGeneratingIndex === idx ? (
                            <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur flex flex-col items-center justify-center z-10 rounded-lg border border-lime-400/30">
                              <Loader2 className="w-8 h-8 animate-spin text-lime-400 mb-2" />
                              <span className="text-sm font-bold uppercase tracking-wide text-white">正在重绘...</span>
                            </div>
                          ) : videoLoadingIndices.has(idx) ? (
                            <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur flex flex-col items-center justify-center z-10 rounded-lg border border-lime-400/30">
                              <Loader2 className="w-8 h-8 animate-spin text-lime-400 mb-2" />
                              <span className="text-sm font-bold uppercase tracking-wide text-white">正在生成视频中...</span>
                              <span className="text-xs font-bold text-lime-400/80 mt-1">大约需要 1-2 分钟</span>
                            </div>
                          ) : null}
                          
                          {generatedVideos[idx] ? (
                            <video 
                              src={generatedVideos[idx]} 
                              controls 
                              autoPlay 
                              loop 
                              className={`max-w-full max-h-full object-contain rounded-lg shadow-lg ${
                                selectedRatio.id === '1:1'
                                  ? 'aspect-square'
                                  : selectedRatio.id === '3:4'
                                    ? 'aspect-[3/4]'
                                    : selectedRatio.id === '9:16'
                                      ? 'aspect-[9/16]'
                                      : 'aspect-[16/9]'
                              }`}
                            />
                          ) : (
                            <img 
                              src={img} 
                              alt={`Generated Model ${idx + 1}`} 
                              className={`max-w-full max-h-full object-contain rounded-lg shadow-lg cursor-zoom-in transition-transform group-hover:scale-[1.01] ${
                                selectedRatio.id === '1:1'
                                  ? 'aspect-square'
                                  : selectedRatio.id === '3:4'
                                    ? 'aspect-[3/4]'
                                    : selectedRatio.id === '9:16'
                                      ? 'aspect-[9/16]'
                                      : 'aspect-[16/9]'
                              }`}
                              onClick={() => setZoomedImageIndex(idx)}
                              referrerPolicy="no-referrer"
                            />
                          )}
                          <div className="absolute top-3 right-3 flex flex-col gap-2 z-20">
                            {!generatedVideos[idx] ? (
                              <button 
                                onClick={(e) => { e.stopPropagation(); openVideoModal(idx); }}
                                className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-3 py-2 rounded-lg shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center text-sm font-bold gap-1.5"
                                title="一键生成动态视频"
                              >
                                <Video className="w-4 h-4" />
                                动起来
                              </button>
                            ) : (
                              <button 
                                onClick={(e) => { e.stopPropagation(); openVideoModal(idx); }}
                                className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-3 py-2 rounded-lg shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center text-sm font-bold gap-1.5"
                                title="修改提示词并重新生成视频"
                              >
                                <Video className="w-4 h-4" />
                                视频已生成
                              </button>
                            )}
                            <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={(e) => { e.stopPropagation(); setEditingImageIndex(idx); }}
                                className="bg-zinc-950/90 backdrop-blur text-white px-3 py-2 rounded-lg shadow-md hover:bg-lime-400 hover:text-black transition-colors flex items-center justify-center text-xs font-bold gap-1.5 border border-zinc-700 hover:border-lime-400"
                                title="局部自定义修改"
                              >
                                <Edit2 className="w-4 h-4" />
                                局部修改
                              </button>
                            </div>
                            <div className="flex flex-col gap-2 items-end opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                              <button 
                                onClick={(e) => { e.stopPropagation(); regenerateSingleImage(idx); }}
                                className="bg-zinc-950/90 backdrop-blur text-white p-2 rounded-lg shadow-md hover:bg-lime-400 hover:text-black border border-zinc-700 hover:border-lime-400 flex items-center justify-center transition-colors"
                                title="不满意，重新生成这张"
                              >
                                <RefreshCw className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); downloadImage(idx); }}
                                className="bg-zinc-950/90 backdrop-blur text-white p-2 rounded-lg shadow-md hover:bg-lime-400 hover:text-black border border-zinc-700 hover:border-lime-400 flex items-center justify-center transition-colors"
                                title="下载此图片"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 text-center p-8 text-zinc-600">
                    <div className="w-20 h-20 bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center mb-2">
                      <ImageIcon className="w-10 h-10 text-zinc-700" />
                    </div>
                    <div>
                      <p className="font-black text-xl uppercase tracking-tight text-zinc-500">暂无生成结果</p>
                      <p className="text-sm font-bold tracking-wide mt-1">在左侧输入指令信息并点击生成</p>
                    </div>
                  </div>
                )}
            </div>

            <div className="mt-6 grid grid-cols-3 gap-4">
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                <div className="w-8 h-8 bg-lime-400/10 rounded-lg flex items-center justify-center mb-2 border border-lime-400/20">
                  <CheckCircle2 className="w-5 h-5 text-lime-400" />
                </div>
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">输出画质</p>
                <p className="text-sm font-black text-white px-0 rounded-md inline-block uppercase tracking-wide">{selectedRes.label}</p>
              </div>
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                <div className="w-8 h-8 bg-lime-400/10 rounded-lg flex items-center justify-center mb-2 border border-lime-400/20">
                  <CheckCircle2 className="w-5 h-5 text-lime-400" />
                </div>
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">画幅比例</p>
                <p className="text-sm font-black text-white px-0 rounded-md inline-block uppercase tracking-wide">{selectedRatio.id}</p>
              </div>
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                <div className="w-8 h-8 bg-lime-400/10 rounded-lg flex items-center justify-center mb-2 border border-lime-400/20">
                  <CheckCircle2 className="w-5 h-5 text-lime-400" />
                </div>
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">版权</p>
                <p className="text-sm font-black text-white px-0 rounded-md inline-block uppercase tracking-wide">可商用授权</p>
              </div>
            </div>
          </div>
        </div>
        </div>
        ) : (
          <div className="space-y-8">
            <h2 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2 text-white"><Clock className="w-6 h-6 text-lime-400" /> 生成历史</h2>
            {history.length === 0 ? (
              <div className="bg-zinc-900 rounded-3xl p-12 text-center text-zinc-600 border border-zinc-800 shadow-sm">
                <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="font-bold tracking-wide">暂无作品，去生成器创作吧</p>
              </div>
            ) : (
              <div className="grid gap-6">
                {history.map((record) => (
                  <div key={record.id} className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                      <div className="flex items-center gap-3 text-sm text-zinc-500">
                        <span className="font-bold text-white uppercase tracking-wider">{new Date(record.timestamp).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="truncate max-w-xl px-3 py-1.5 bg-zinc-950 rounded-lg text-sm text-zinc-400 border border-zinc-800 font-medium">
                          <span className="text-lime-400 font-bold">描述:</span> {record.equipmentDesc}
                        </div>
                        <button 
                          onClick={() => restoreWorkspace(record)}
                          className="text-sm font-bold bg-lime-400 text-black px-4 py-2 rounded-lg hover:bg-lime-500 transition-colors flex items-center uppercase tracking-wide"
                        >
                          继续编辑 <ArrowRight className="w-4 h-4 ml-1" />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {record.images.map((img, j) => {
                        const videoUrl = record.videos?.[j];
                        return (
                        <div key={j} className="relative group aspect-square rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800">
                          {videoUrl ? (
                            <video src={videoUrl} controls autoPlay loop className="w-full h-full object-cover" />
                          ) : (
                            <img src={img} alt="History result" className="w-full h-full object-contain" />
                          )}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3 backdrop-blur-sm">
                            <button 
                              onClick={() => restoreWorkspace(record)} 
                              className="bg-lime-400 text-black px-4 py-2 rounded-lg hover:bg-lime-500 transition-transform hover:scale-105 font-bold text-sm flex items-center justify-center gap-2" 
                              title="将此组还原到工作区进行重新编辑"
                            >
                              <Edit2 className="w-4 h-4" /> 重新编辑此组
                            </button>
                            <a 
                              href={videoUrl || img} 
                              download={`fitmodel-history-${record.id}-${j}.${videoUrl ? 'mp4' : 'png'}`} 
                              className="bg-zinc-800 text-white border border-zinc-700 px-4 py-2 rounded-lg hover:bg-zinc-700 transition-transform hover:scale-105 font-bold text-sm flex items-center justify-center gap-2" 
                              title="下载"
                            >
                              <Download className="w-4 h-4" /> 下载{videoUrl ? '视频' : '图片'}
                            </a>
                          </div>
                        </div>
                      )})}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Edit Modal */}
      {editingImageIndex !== null && generatedImages[editingImageIndex] && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-zinc-900 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-zinc-800 text-white">
              <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="font-black text-lg flex items-center gap-2 uppercase tracking-tight">
                  <Edit2 className="w-5 h-5 text-lime-400" /> 局部自定义修改
                </h3>
                <button 
                  onClick={() => { setEditingImageIndex(null); setEditPromptText(''); }}
                  className="p-2 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400 hover:text-white inline-block"
                  disabled={isEditing}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6">
                <div className="flex justify-center mb-6 bg-zinc-950 rounded-2xl p-4 border border-zinc-800">
                  <img 
                    src={generatedImages[editingImageIndex]} 
                    alt="Target Edit" 
                    className="h-48 object-contain rounded-lg shadow-sm" 
                  />
                </div>
                <label className="block text-sm font-bold text-zinc-400 mb-2 uppercase tracking-wide">想要修改什么？</label>
                <textarea 
                  value={editPromptText}
                  onChange={(e) => setEditPromptText(e.target.value)}
                  placeholder="英文指示，例如: change the shoes to red"
                  className="w-full h-24 px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 focus:ring-2 focus:ring-lime-400 focus:border-transparent transition-all resize-none mb-4 text-white"
                  disabled={isEditing}
                />
                <button 
                  onClick={handleEditSingle}
                  disabled={isEditing || !editPromptText.trim()}
                  className="w-full bg-lime-400 text-black py-3 rounded-xl font-black uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-lime-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isEditing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      修改中...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      确认修改
                    </>
                  )}
                </button>
              </div>
            </div>
        </div>
      )}

      {/* Video Modal */}
      {editingVideoIndex !== null && generatedImages[editingVideoIndex] && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-zinc-900 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-zinc-800 text-white">
              <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="font-black text-lg flex items-center gap-2 uppercase tracking-tight">
                  <Video className="w-5 h-5 text-lime-400" /> 自定义视频运镜提示词
                </h3>
                <button 
                  onClick={() => setEditingVideoIndex(null)}
                  className="p-2 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6">
                <div className="flex justify-center mb-6 bg-zinc-950 rounded-2xl p-4 border border-zinc-800 relative max-h-48">
                  {generatedVideos[editingVideoIndex] ? (
                    <video src={generatedVideos[editingVideoIndex]} className="h-full object-contain rounded-lg shadow-sm" controls />
                  ) : (
                    <img src={generatedImages[editingVideoIndex]} alt="Target Edit" className="h-48 object-contain rounded-lg shadow-sm" />
                  )}
                </div>
                <label className="block text-sm font-bold text-zinc-400 mb-2 uppercase tracking-wide">运镜或视觉提示词 (英文)</label>
                <textarea 
                  value={videoPromptText}
                  onChange={(e) => setVideoPromptText(e.target.value)}
                  placeholder="例如: zoom in slowly, cinematic lighting, panning shot"
                  className="w-full h-24 px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 focus:ring-2 focus:ring-lime-400 focus:border-transparent transition-all resize-none mb-4 text-white"
                />
                <button 
                  onClick={handleGenerateVideo}
                  disabled={!videoPromptText.trim()}
                  className="w-full bg-lime-400 text-black py-3 rounded-xl font-black uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-lime-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Video className="w-5 h-5" /> 开始生成视频
                </button>
              </div>
            </div>
        </div>
      )}

      {/* Zoom Modal */}
      {zoomedImageIndex !== null && generatedImages[zoomedImageIndex] && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 md:p-12 backdrop-blur-md">
            <button 
              onClick={() => setZoomedImageIndex(null)}
              className="absolute top-6 right-6 p-3 bg-zinc-800 rounded-full text-white hover:bg-zinc-700 transition-colors border border-zinc-700"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={generatedImages[zoomedImageIndex]} 
              alt="Zoomed Result" 
              className="max-w-full max-h-full object-contain shadow-2xl rounded-lg border border-zinc-800"
              referrerPolicy="no-referrer"
            />
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4">
              <button 
                onClick={() => downloadImage(zoomedImageIndex)}
                className="bg-lime-400 text-black px-8 py-4 rounded-xl font-black uppercase tracking-wide flex items-center gap-2 hover:bg-lime-500 transition-colors shadow-xl"
              >
                <Download className="w-5 h-5" /> 下载保存
              </button>
            </div>
        </div>
      )}
    </div>
  );
}
