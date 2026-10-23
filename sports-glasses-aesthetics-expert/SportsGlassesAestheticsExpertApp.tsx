import React, { useState, useCallback, useEffect } from 'react';
import { AppProps } from '../../types';
import { ImageUploader } from './components/ImageUploader';
import { HistoryRecordCard } from './components/HistoryRecordCard';
import { generateStyledImage } from './services/geminiService';
import { GenerationType, GenerationRecord, UploadedImage, AspectRatio, GeneratedImage } from './types';
import { DEFAULT_PROMPTS, MODEL_STYLES_OPTIONS, MODEL_VARIATIONS, POSTER_VARIATIONS } from './constants';

const APP_ID = 'sports-glasses-aesthetics-expert';
const DEFAULT_GENERATE_IMAGE_COST = 10;

export const SportsGlassesAestheticsExpertApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [history, setHistory] = useState<GenerationRecord[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatio>('1:1');
  const [zoomedImageSrc, setZoomedImageSrc] = useState<string | null>(null);
  const [selectedGenerationTypes, setSelectedGenerationTypes] = useState<GenerationType[]>([
    GenerationType.Poster,
    GenerationType.Model,
  ]);
  const [selectedModelStyle, setSelectedModelStyle] = useState<string>(MODEL_STYLES_OPTIONS[0].id);
  const [expandedRecords, setExpandedRecords] = useState<Set<string>>(new Set());
  const [prompts, setPrompts] = useState<Record<GenerationType, string>>(DEFAULT_PROMPTS);

  // 从 localStorage 加载历史记录
  useEffect(() => {
    try {
      const storedHistory = localStorage.getItem(`${APP_ID}_generationHistory`);
      if (storedHistory) {
        setHistory(JSON.parse(storedHistory));
      }
    } catch (e) {
      console.error('Failed to load history from localStorage', e);
    }
  }, []);

  // 保存历史记录到 localStorage
  useEffect(() => {
    try {
      if (history.length > 0) {
        localStorage.setItem(`${APP_ID}_generationHistory`, JSON.stringify(history));
      }
    } catch (e) {
      console.error('Failed to save history to localStorage', e);
    }
  }, [history]);

  const handleImageUpload = (files: File[]) => {
    const imagePromises = files.map(file => {
      return new Promise<UploadedImage>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = (reader.result as string).split(',')[1];
          resolve({ base64: base64String, mimeType: file.type });
        };
        reader.onerror = () => {
          reject(new Error('读取图片文件失败。'));
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(imagePromises)
      .then(newImages => {
        setUploadedImages(newImages);
        setError(null);
      })
      .catch(err => {
        setError(err.message);
      });
  };

  const handleGenerate = useCallback(async () => {
    if (uploadedImages.length === 0) {
      setError('请先上传至少一张图片。');
      return;
    }
    if (selectedGenerationTypes.length === 0) {
      setError('请至少选择一个生成类型。');
      return;
    }

    // 计算总积分消耗（按类型数量），成本缺失时使用兜底值。
    const unitCostRaw = Number(costs?.GENERATE_IMAGE ?? DEFAULT_GENERATE_IMAGE_COST);
    const unitCost = Number.isFinite(unitCostRaw) ? Math.max(0, unitCostRaw) : DEFAULT_GENERATE_IMAGE_COST;
    const totalCost = selectedGenerationTypes.length * unitCost;

    await platform.refreshCredits();
    
    // 检查余额（不扣除）
    if (totalCost > 0 && !platform.checkBalance(totalCost)) {
      setError(`积分不足：本次生成需要 ${totalCost} 积分。`);
      return;
    }

    setIsGenerating(true);
    setError(null);
    
    // 创建初始状态
    const imageStatesToGenerate: GeneratedImage[] = selectedGenerationTypes
      .map(type => ({
        id: type.toLowerCase(),
        title: {
          [GenerationType.Poster]: '静物场景',
          [GenerationType.Model]: '模特图',
        }[type],
        src: null,
        status: 'loading' as const,
        type: type,
        prompt: prompts[type],
        error: undefined,
      }));

    const newRecordId = Date.now().toString();
    const newRecord: GenerationRecord = {
      id: newRecordId,
      timestamp: Date.now(),
      uploadedImages: uploadedImages,
      aspectRatio: selectedAspectRatio,
      generatedImages: imageStatesToGenerate,
    };
    
    setHistory(prev => [newRecord, ...prev]);
    setExpandedRecords(prev => new Set(prev).add(newRecordId));
    
    try {
      const generationPromises = imageStatesToGenerate.map(imageState => {
        // 生成随机种子
        const seed = Math.floor(Math.random() * 2147483647);
        
        let finalPrompt = imageState.prompt;
        
        // 为 Poster 类型注入随机变化
        if (imageState.type === GenerationType.Poster) {
          const randomVar = POSTER_VARIATIONS[Math.floor(Math.random() * POSTER_VARIATIONS.length)];
          finalPrompt += `。关键视觉细节：${randomVar}。`;
        } else if (imageState.type === GenerationType.Model) {
          const styleConfig = MODEL_STYLES_OPTIONS.find(s => s.id === selectedModelStyle);
          const randomVar = MODEL_VARIATIONS[Math.floor(Math.random() * MODEL_VARIATIONS.length)];
          
          if (styleConfig) {
            finalPrompt += ` ${styleConfig.prompt}`;
          }
          finalPrompt += ` 视觉细节：${randomVar}。`;
        }

        return generateStyledImage(uploadedImages, finalPrompt, selectedAspectRatio, seed)
          .then(src => ({ ...imageState, src, status: 'success' as const }))
          .catch(reason => {
            console.error(`Failed to generate ${imageState.title}:`, reason);
            const errorMessage = reason instanceof Error ? reason.message : '未知错误';
            return { ...imageState, status: 'error' as const, error: errorMessage };
          });
      });

      const updatedImages = await Promise.all(generationPromises);

      // 检查是否全部成功
      const allSuccess = updatedImages.every(img => img.status === 'success');
      const successCount = updatedImages.filter(img => img.status === 'success').length;

      // 更新历史记录
      setHistory(prev => prev.map(record =>
        record.id === newRecordId
          ? { ...record, generatedImages: updatedImages }
          : record
      ));

      if (allSuccess) {
        await platform.refreshCredits?.();
        setError(null);
      } else {
        const failedCount = selectedGenerationTypes.length - successCount;
        const firstError = updatedImages.find(img => img.status === 'error')?.error;
        setError(`生成失败：${failedCount} 张图片生成失败，未扣除积分。${firstError ? ` 原因：${firstError}` : '请重试。'}`);
      }

    } catch (err) {
      console.error('An unexpected error occurred during image generation:', err);
      const errorMessage = err instanceof Error ? err.message : '发生意外错误，请重试。';
      setError(errorMessage);
      setHistory(prev => prev.map(record => 
        record.id === newRecordId 
          ? {...record, generatedImages: record.generatedImages.map(img => ({ ...img, status: 'error', error: '批量生成时发生意外错误。' }))}
          : record
      ));
    } finally {
      setIsGenerating(false);
    }
  }, [uploadedImages, selectedAspectRatio, selectedGenerationTypes, prompts, selectedModelStyle, platform, costs]);

  const handleDownload = (src: string, title: string) => {
    const timestamp = Date.now();
    const filename = `${title.replace(/\s/g, '_')}_${timestamp}.png`;
    
    const link = document.createElement('a');
    link.href = src;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleRecordExpansion = (recordId: string) => {
    setExpandedRecords(prev => {
      const newSet = new Set(prev);
      if (newSet.has(recordId)) {
        newSet.delete(recordId);
      } else {
        newSet.add(recordId);
      }
      return newSet;
    });
  };

  return (
    <div className="animate-fade-in space-y-8">
      {/* Header */}
      {/* <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <button
          onClick={platform.onBack}
          className="flex items-center text-slate-700 hover:text-blue-600 transition-colors min-w-[44px] min-h-[44px] p-2 font-medium"
        >
          <span className="mr-2">←</span> 返回控制台
        </button>
      </div> */}

      <div className="flex flex-col min-h-screen bg-slate-50 text-slate-800 font-sans">
        <div className="flex items-center border-b border-slate-200 px-6 py-3 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
          <button
            onClick={platform.onBack}
            className="flex items-center text-slate-700 hover:text-blue-600 transition-colors font-medium py-1.5 px-2 rounded-lg hover:bg-slate-100"
          >
            <span className="mr-2 text-lg">←</span> 返回控制台
          </button>
        </div>
        <main className="flex-grow container mx-auto px-4 py-8 w-full">
          <div className="max-w-5xl mx-auto w-full space-y-12">
            {/* Main Application Card */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 md:p-12">
              <div className="max-w-3xl mx-auto flex flex-col items-center gap-10">
                {/* Header Section */}
                <div className="w-full text-center space-y-2">
                  <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
                    <span className="text-slate-800">运动眼镜</span> <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">美学专家</span>
                  </h1>
                  <p className="text-lg text-slate-600 font-medium">智能生成专业级商业视觉素材</p>
                </div>

                <ImageUploader 
                  onImageUpload={handleImageUpload} 
                  onGenerate={handleGenerate}
                  isGenerating={isGenerating}
                  hasImages={uploadedImages.length > 0}
                  aspectRatio={selectedAspectRatio}
                  onAspectRatioChange={setSelectedAspectRatio}
                  selectedTypes={selectedGenerationTypes}
                  onSelectedTypesChange={setSelectedGenerationTypes}
                  prompts={prompts}
                  onPromptChange={(type, val) => setPrompts(prev => ({...prev, [type]: val}))}
                  selectedModelStyle={selectedModelStyle}
                  onModelStyleChange={setSelectedModelStyle}
                  disabled={isGenerating}
                />
                {error && (
                  <div className="text-red-400 bg-red-900/20 border border-red-800 px-6 py-3 rounded-xl w-full text-center font-medium">
                    {error}
                  </div>
                )}
              </div>
            </div>

            {/* History Section */}
            <section className="w-full">
              <h2 className="text-2xl font-bold text-slate-800 mb-6 px-4">最近生成</h2>
              {history.length > 0 ? (
                <div className="space-y-6">
                  {history.map(record => (
                    <HistoryRecordCard
                      key={record.id}
                      record={record}
                      isExpanded={expandedRecords.has(record.id)}
                      onToggleExpand={() => toggleRecordExpansion(record.id)}
                      onZoom={setZoomedImageSrc}
                      onDownload={handleDownload}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 bg-white/50 backdrop-blur-xl rounded-2xl border border-slate-200 border-dashed">
                  <div className="inline-block p-4 rounded-full bg-slate-100 mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                  <p className="text-slate-600 font-medium">暂无生成记录</p>
                  <p className="text-slate-500 text-sm mt-1">上传图片开始您的创作之旅</p>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>

      {/* Lightbox */}
      {zoomedImageSrc && (
        <div 
          className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 cursor-zoom-out p-4" 
          onClick={() => setZoomedImageSrc(null)}
        >
          <div className="relative max-w-5xl w-full max-h-full flex items-center justify-center">
            <img 
              src={zoomedImageSrc} 
              alt="放大的图片" 
              className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl" 
              onClick={e => e.stopPropagation()} 
            />
            <button 
              onClick={() => setZoomedImageSrc(null)} 
              className="absolute top-4 right-4 text-white/90 hover:text-white transition-colors bg-white/10 hover:bg-white/20 rounded-full p-2 touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="关闭"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

