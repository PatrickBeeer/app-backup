import React, { useState, useCallback, useRef } from 'react';
import { AppProps } from '../../types';
import { Header } from './components/Header';
import { ImageUploader } from './components/ImageUploader';
import { SellingPointsDisplay } from './components/SellingPointsDisplay';
import { GeneratedImageGrid } from './components/GeneratedImageGrid';
import { analyzeProductImages, generateSingleImage, ProductAnalysis } from './services/geminiService';
import { fetchCurrentUserId, saveAsset } from '../../shared_services/localGeneratedAssetCache';
import type { GeneratedImage, ImageFile, AspectRatio, ImageSize } from './types';
const REQUEST_DISPATCH_INTERVAL_MS = 250;

// Local feature flag for the device-local generated-asset cache. Disable to
// stop this app from writing cache entries; generation/billing are unaffected.
const ENABLE_LOCAL_ASSET_CACHE = true;
const ASSET_CACHE_APP_ID = 's_skincare-product-image';
const ASSET_CACHE_PROVIDER = 'gemini-3.1-flash-image-preview';

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const getInitialImages = (promptText: string = '上传后自动规划...'): GeneratedImage[] => [
  { id: 1, title: '视觉一：全案氛围', description: '统一产品主图风格，低饱和色彩营造高级氛围', prompt: promptText, copy: { mainTitle: '', subTitle: '' }, src: '', isLoading: false },
  { id: 2, title: '视觉二：功效核心', description: '可视化卖点直击，传达产品价值', prompt: promptText, copy: { mainTitle: '', subTitle: '' }, src: '', isLoading: false },
  { id: 3, title: '视觉三：模特对话', description: '极简影棚风，纯净色调互动感', prompt: promptText, copy: { mainTitle: '', subTitle: '' }, src: '', isLoading: false },
  { id: 4, title: '视觉四：微距肤感', description: '极致特写泡沫/料体细腻质感', prompt: promptText, copy: { mainTitle: '', subTitle: '' }, src: '', isLoading: false },
  { id: 5, title: '视觉五：标准展示', description: '高调性白底图，极致清晰的产品肖像', prompt: promptText, copy: { mainTitle: '', subTitle: '' }, src: '', isLoading: false },
];

export const SkincareMainImageApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [imageFiles, setImageFiles] = useState<ImageFile[]>([]);
  const [sellingPoints, setSellingPoints] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>(getInitialImages());
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [singleGeneratingCount, setSingleGeneratingCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const imageSetVersion = useRef(0);
  const cachedUserIdPromise = useRef<Promise<number | null> | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const imageSize: ImageSize = '1K';
  const singleCost = costs.GENERATE_SINGLE_IMAGE_PRO ?? 10;
  const allCost = costs.GENERATE_ALL_IMAGES_PRO ?? 50;

  // Resolve the signed-in user once per generation run. Null results are not
  // cached, so a guest who logs in later is picked up on the next run.
  const resolveUserId = useCallback((): Promise<number | null> => {
    if (!cachedUserIdPromise.current) {
      cachedUserIdPromise.current = fetchCurrentUserId().then((userId) => {
        if (userId === null) {
          cachedUserIdPromise.current = null;
        }
        return userId;
      });
    }
    return cachedUserIdPromise.current;
  }, []);

  // Fire-and-forget cache write AFTER the output is shown. Must never block
  // generation success, credit refresh, or surface errors to the user flow.
  const cacheGeneratedImage = useCallback(
    (imageSrc: string, title: string, userIdPromise: Promise<number | null>) => {
      if (!ENABLE_LOCAL_ASSET_CACHE || !imageSrc) {
        return;
      }
      void userIdPromise
        .then((userId) => {
          if (userId === null) {
            return;
          }
          void saveAsset({
            userId,
            appId: ASSET_CACHE_APP_ID,
            kind: 'image',
            source: imageSrc,
            title: `护肤品主图 · ${title}`,
            provider: ASSET_CACHE_PROVIDER,
          }).catch((cacheError: unknown) => {
            console.warn('[asset-cache] save skipped:', cacheError);
          });
        })
        .catch(() => {
          // identity resolution failure is silent; generation already succeeded
        });
    },
    [],
  );

  const handleImagesChange = async (files: ImageFile[]) => {
    const version = ++imageSetVersion.current;
    setImageFiles(files);
    setError(null);
    if (files.length === 0) {
      setIsAnalyzing(false);
      setSellingPoints(null);
      setGeneratedImages(getInitialImages());
      return;
    }

    setIsAnalyzing(true);
    setSellingPoints(null);
    setGeneratedImages(getInitialImages('AI 正在深度观察产品视觉特征...'));
    
    try {
      const analysis: ProductAnalysis = await analyzeProductImages(files);
      if (version !== imageSetVersion.current) return;
      setSellingPoints(analysis.keywords.join(', '));
      
      setGeneratedImages(prev => prev.map((img, idx) => ({
          ...img,
          prompt: analysis.prompts[idx] || img.prompt,
          copy: analysis.copies[idx] || img.copy
      })));
    } catch (e) {
      console.error(e);
      if (version !== imageSetVersion.current) return;
      setError(e instanceof Error ? e.message : '方案规划失败，请重试');
    } finally {
      if (version === imageSetVersion.current) setIsAnalyzing(false);
    }
  };

  const handlePromptChange = (id: number, newPrompt: string) => {
    setGeneratedImages(prev => prev.map(img => img.id === id ? { ...img, prompt: newPrompt } : img));
  };

  const handleSingleGenerate = async (id: number) => {
    if (imageFiles.length === 0) { setError('请先上传产品图片'); return; }
    if (isAnalyzing) { setError('方案正在撰写中...'); return; }
    if (!sellingPoints) { setError('方案规划失败，请重新上传产品图片'); return; }
    if (isGenerating) { return; }

    // 检查余额（不扣除）
    if (!platform.checkBalance(singleCost)) {
      return; // 余额不足会自动显示充值弹窗
    }

    const targetImage = generatedImages.find(img => img.id === id);
    if (!targetImage) return;

    setGeneratedImages(prev => prev.map(img => img.id === id ? { ...img, isLoading: true, error: undefined, src: '' } : img));
    setSingleGeneratingCount(prev => prev + 1);
    const version = imageSetVersion.current;
    // Snapshot identity at run start; never awaited before rendering/billing.
    const userIdPromise = resolveUserId();

    try {
      const imageSrc = await generateSingleImage(targetImage.prompt, imageFiles, aspectRatio, imageSize, id === 1 ? 'atmosphere' : 'standard');

      if (version === imageSetVersion.current) {
        setGeneratedImages(prev => prev.map(img => img.id === id ? { ...img, src: imageSrc, isLoading: false } : img));
        cacheGeneratedImage(imageSrc, targetImage.title, userIdPromise);
      }
      await platform.refreshCredits?.();
    } catch (e) {
      console.error(e);
      if (version === imageSetVersion.current) {
        setGeneratedImages(prev => prev.map(img => img.id === id ? { ...img, isLoading: false, error: '生成失败' } : img));
      }
    } finally {
      setSingleGeneratingCount(prev => Math.max(0, prev - 1));
    }
  };

  const handleGenerateAll = useCallback(async () => {
    if (imageFiles.length === 0) { setError('请先上传至少一张参考图'); return; }
    if (isAnalyzing) { setError('方案正在撰写中...'); return; }
    if (!sellingPoints) { setError('方案规划失败，请重新上传产品图片'); return; }
    if (singleGeneratingCount > 0) { setError('单图重生进行中，请稍候再执行全案生成。'); return; }

    // 检查余额（不扣除）
    if (!platform.checkBalance(allCost)) {
      return; // 余额不足会自动显示充值弹窗
    }

    setError(null);
    setIsGenerating(true);
    setGeneratedImages(prev => prev.map(img => ({ ...img, isLoading: true, src: '', error: undefined })));
    const version = imageSetVersion.current;
    // Snapshot identity once for the whole batch run.
    const userIdPromise = resolveUserId();

    try {
      const customPrompts = generatedImages.map(img => img.prompt);
      const slotTitles = generatedImages.map(img => img.title);

      const generationTasks: Array<Promise<boolean>> = [];
      for (let index = 0; index < customPrompts.length; index += 1) {
        const prompt = customPrompts[index];
        const task = generateSingleImage(prompt, imageFiles, aspectRatio, imageSize, index === 0 ? 'atmosphere' : 'standard')
          .then((imageSrc) => {
            if (version === imageSetVersion.current) {
              setGeneratedImages(prev =>
                prev.map((img, i) =>
                  i === index ? { ...img, src: imageSrc, isLoading: false } : img
                )
              );
              cacheGeneratedImage(imageSrc, slotTitles[index], userIdPromise);
            }
            return true;
          })
          .catch((singleErr: unknown) => {
            console.error(`生成图片 ${index + 1} 失败:`, singleErr);
            if (version === imageSetVersion.current) {
              setGeneratedImages(prev =>
                prev.map((img, i) =>
                  i === index ? { ...img, isLoading: false, error: '渲染超时' } : img
                )
              );
            }
            return false;
          });

        generationTasks.push(task);

        if (index < customPrompts.length - 1) {
          await wait(REQUEST_DISPATCH_INTERVAL_MS);
        }
      }

      const generationResults = await Promise.all(generationTasks);
      const successCount = generationResults.filter(Boolean).length;
      if (successCount > 0) {
        await platform.refreshCredits?.();
      }
    } catch (e) {
      console.error(e);
      setError('批量生成中断，请重试。');
    } finally {
      setIsGenerating(false);
    }
  }, [allCost, aspectRatio, cacheGeneratedImage, generatedImages, imageFiles, imageSize, isAnalyzing, platform, resolveUserId, sellingPoints, singleGeneratingCount]);

  const handleDownloadAll = useCallback(() => {
    const readyImages = generatedImages.filter(img => img.src);
    if (readyImages.length === 0) {
      alert('没有已生成的图片可供下载');
      return;
    }
    
    readyImages.forEach((img, index) => {
      setTimeout(() => {
        const link = document.createElement('a');
        link.href = img.src;
        link.download = `WashCleanser_MainImage_${index + 1}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }, index * 300); // 间隔下载以避免浏览器拦截
    });
  }, [generatedImages]);

  return (
    <div className="min-h-screen mesh-gradient">
      <div className="flex items-center border-b border-slate-200 px-6 py-3 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <button
          onClick={platform.onBack}
          className="flex items-center text-slate-700 hover:text-blue-600 transition-colors font-medium py-1.5 px-2 rounded-lg hover:bg-slate-100"
        >
          <span className="mr-2 text-lg">←</span> 返回控制台
        </button>
      </div>
      <Header />
      <main className="container mx-auto p-6 md:p-12 animate-slide-up">
        <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* Left Panel: Controls */}
          <div className="lg:col-span-4">
            <div className="glass-card luxury-shadow rounded-4xl p-8 space-y-10 sticky top-12">
              <div>
                <h2 className="text-2xl font-extrabold text-black tracking-tight mb-2">1. 上传视觉灵感</h2>
                <p className="text-slate-500 text-sm mb-6">上传 1-3 张参考图，AI 将以此为基准提取色彩与材质</p>
                <ImageUploader onImagesChange={handleImagesChange} />
              </div>
              
              {imageFiles.length > 0 && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
                      <div>
                        <h2 className="text-xl font-extrabold text-black tracking-tight mb-1">2. 智能规划已就绪</h2>
                        <p className="text-xs text-slate-400">已自动适配品牌视觉特征并构思营销文案</p>
                      </div>
                      
                      <div className="space-y-6">
                        <h2 className="text-lg font-bold text-black tracking-tight">3. 规格定义</h2>
                        
                        <div className="space-y-4">
                          <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">画布比例</label>
                          <div className="grid grid-cols-2 gap-3">
                              {(['1:1', '3:4'] as AspectRatio[]).map((ratio) => (
                                   <button
                                      key={ratio}
                                      onClick={() => setAspectRatio(ratio)}
                                      className={`py-3 px-4 rounded-2xl font-semibold text-sm transition-all duration-300 ${
                                          aspectRatio === ratio
                                          ? 'bg-black text-white shadow-lg scale-[1.02]'
                                          : 'bg-white/40 text-slate-600 hover:bg-white/60'
                                      }`}
                                      >
                                      {ratio === '1:1' ? '标准方图 (1:1)' : '天猫长图 (3:4)'}
                                  </button>
                              ))}
                          </div>
                        </div>

                      </div>

                      <div className="pt-6 space-y-4">
                        <button
                            onClick={handleGenerateAll}
                            disabled={isAnalyzing || !sellingPoints || isGenerating || singleGeneratingCount > 0}
                            className="w-full bg-black text-white font-bold py-4 px-5 rounded-2xl hover:bg-slate-800 transition-all shadow-xl active:scale-[0.98] disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <span className="text-sm tracking-tight">
                              {isAnalyzing ? '规划中...' : isGenerating ? '全案生成中...' : `全案生成 (${allCost} 积分)`}
                            </span>
                        </button>
                        
                        {generatedImages.some(img => img.src) && (
                          <button
                            onClick={handleDownloadAll}
                            className="w-full bg-white text-black border border-slate-200 font-bold py-4 px-6 rounded-2xl hover:bg-slate-50 transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-2"
                          >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            一键下载资料包
                          </button>
                        )}
                      </div>
                  </div>
              )}
               {error && (
                 <div className="p-4 bg-red-50/50 backdrop-blur-md border border-red-100 rounded-2xl text-red-700 text-xs font-medium animate-in fade-in duration-300">
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      {error}
                    </div>
                 </div>
               )}
            </div>
          </div>

          {/* Right Panel: Gallery */}
          <div className="lg:col-span-8 space-y-10">
            <SellingPointsDisplay points={sellingPoints} isLoading={isAnalyzing} />
            <GeneratedImageGrid 
              images={generatedImages} 
              onPromptChange={handlePromptChange} 
              onSingleGenerate={handleSingleGenerate} 
                disableRegenerate={isGenerating || isAnalyzing || !sellingPoints}
            />
          </div>
        </div>
      </main>
    </div>
  );
};

