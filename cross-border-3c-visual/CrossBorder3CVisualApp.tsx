import React, { useState, useRef } from 'react';
import { AppProps } from '../../types';
import { generateVisualPlan, generateImageFromPrompt } from './services/geminiService';
import { VisualStyle, AspectRatio, PlanningResponse, ImageStrategy, TargetMarket } from './types';
import StrategyCard from './components/StrategyCard';

const styleLabels: Record<VisualStyle, string> = {
  [VisualStyle.CYBERPUNK]: '3C科技风格',
  [VisualStyle.APPLE]: '极简果系风格',
  [VisualStyle.COMMERCIAL]: '高端商务质感'
};

export const CrossBorder3CVisualApp: React.FC<AppProps> = ({ platform, costs }) => {
  const imageCost = costs?.GENERATE_IMAGE ?? 10;
  const [productImage, setProductImage] = useState<{ base64: string; mimeType: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [style, setStyle] = useState<VisualStyle>(VisualStyle.APPLE);
  const [ratio, setRatio] = useState<AspectRatio>(AspectRatio.SQUARE);
  const [market, setMarket] = useState<TargetMarket>(TargetMarket.USA);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<PlanningResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States for individual image results
  const [generatedImages, setGeneratedImages] = useState<Record<number, string>>({});
  const [generatingImages, setGeneratingImages] = useState<Record<number, boolean>>({});

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64String = result.split(',')[1];
        setProductImage({ base64: base64String, mimeType: file.type });
        setPreviewUrl(result);
        setPlan(null);
        setGeneratedImages({});
        setGeneratingImages({});
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGeneratePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productImage) {
      setError("请先上传产品图片");
      return;
    }

    setLoading(true);
    setError(null);
    setGeneratedImages({});
    setGeneratingImages({});
    
    try {
      const response = await generateVisualPlan(productImage.base64, productImage.mimeType, style, ratio, market);

      setPlan(response);
      await platform.refreshCredits?.();
    } catch (err: any) {
      setError(err?.message || "策划生成失败，请重试。");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePromptChange = (id: number, newPrompt: string) => {
    if (!plan) return;
    setPlan({
      ...plan,
      strategies: plan.strategies.map(s => s.id === id ? { ...s, aiPrompt: newPrompt } : s)
    });
  };

  const handleOverlayTextChange = (id: number, newText: string) => {
    if (!plan) return;
    setPlan({
      ...plan,
      strategies: plan.strategies.map(s => s.id === id ? { ...s, overlayText: newText } : s)
    });
  };

  const generateSingleImage = async (strategy: ImageStrategy) => {
    if (!productImage) return;

    if (!platform.checkBalance(imageCost)) {
      return;
    }
    
    setGeneratingImages(prev => ({ ...prev, [strategy.id]: true }));
    try {
      // Image 1 and 5 are lifestyle images
      const isLifestyle = strategy.id === 1 || strategy.id === 5;
      const url = await generateImageFromPrompt(
        strategy.aiPrompt, 
        ratio, 
        productImage, 
        strategy.overlayText,
        isLifestyle
      );

      setGeneratedImages(prev => ({ ...prev, [strategy.id]: url }));
      await platform.refreshCredits?.();
    } catch (err: any) {
      console.error(`Failed to generate image ${strategy.id}`, err);
      setError(err?.message || `生成图片 ${strategy.id} 失败`);
    } finally {
      setGeneratingImages(prev => ({ ...prev, [strategy.id]: false }));
    }
  };

  const handleGenerateAll = async () => {
    if (!plan) return;
    for (const strategy of plan.strategies) {
      if (!generatedImages[strategy.id] && !generatingImages[strategy.id]) {
        await generateSingleImage(strategy);
      }
    }
  };

  const handleDownloadAll = () => {
    (Object.entries(generatedImages) as [string, string][]).forEach(([id, url]) => {
      const link = document.createElement('a');
      link.href = url;
      link.download = `Amazon_3C_${market}_IMG_${id}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  };

  const isGeneratingAll = Object.values(generatingImages).some(v => v);
  const hasImages = Object.keys(generatedImages).length > 0;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans antialiased text-gray-900">
      {/* Top Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-xl sticky top-0 z-20 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={platform.onBack}
              className="w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center justify-center transition-colors border border-gray-200"
              title="返回"
            >
              <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-black text-gray-900 leading-tight tracking-tight uppercase">主图生成（跨境/数码3c）</h1>
              <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest">Global Marketplace Specialist</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {plan && (
              <>
                <button
                  onClick={handleGenerateAll}
                  disabled={isGeneratingAll}
                  className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 uppercase tracking-widest ${
                    isGeneratingAll ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-xl shadow-blue-500/20 active:scale-95'
                  }`}
                >
                  {isGeneratingAll ? (
                    <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a2 2 0 00-1.96 1.414l-.711 2.489a2 2 0 002.485 2.485l2.489-.711a2 2 0 001.414-1.96l-.477-2.387a2 2 0 00-.547-1.022zM9.25 4a1.25 1.25 0 110 2.5 1.25 1.25 0 010-2.5zM3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  )}
                  一键生成全部 (10积分/张)
                </button>
                <button
                  onClick={handleDownloadAll}
                  disabled={!hasImages}
                  className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 uppercase tracking-widest ${
                    !hasImages ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl shadow-emerald-500/20 active:scale-95'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  下载全部
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row max-w-[1600px] mx-auto w-full overflow-hidden">
        {/* Left Sidebar: Controls */}
        <aside className="w-full md:w-80 lg:w-96 border-r border-gray-200 p-6 flex flex-col gap-8 bg-white overflow-y-auto custom-scrollbar">
          <div>
            <h2 className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-4 flex items-center gap-2">
              <span className="w-4 h-[1px] bg-gray-300"></span>
              产品参考图
            </h2>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-2xl aspect-square flex flex-col items-center justify-center cursor-pointer transition-all group overflow-hidden ${
                previewUrl ? 'border-blue-500/50 shadow-inner ring-4 ring-blue-500/5' : 'border-gray-300 hover:border-gray-400 bg-gray-50'
              }`}
            >
              {previewUrl ? (
                <>
                  <img src={previewUrl} alt="Preview" className="w-full h-full object-contain p-4" />
                  <div className="absolute inset-0 bg-white/80 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-sm">
                    <span className="text-gray-900 text-[10px] font-black uppercase tracking-widest bg-blue-600 text-white px-3 py-1 rounded-full">更换产品图</span>
                  </div>
                </>
              ) : (
                <div className="text-center p-6">
                  <svg className="w-12 h-12 text-gray-400 mb-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-gray-600 text-xs font-black uppercase tracking-widest">点击上传</p>
                  <p className="text-gray-500 text-[9px] mt-2 italic tracking-wide">MAX CONSISTENCY SOURCE</p>
                </div>
              )}
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                accept="image/*" 
              />
            </div>
          </div>

          <div className="space-y-8">
            <div>
              <label className="block text-[10px] font-black text-gray-600 mb-3 uppercase tracking-widest">目标市场 (Target Market)</label>
              <div className="grid grid-cols-2 gap-2">
                {Object.values(TargetMarket).map(m => (
                  <button
                    key={m}
                    onClick={() => setMarket(m)}
                    className={`text-center px-3 py-2.5 rounded-xl border text-[10px] font-bold transition-all uppercase tracking-wider ${
                      market === m 
                        ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/10' 
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {m.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-gray-600 mb-3 uppercase tracking-widest">视觉风格 (Style)</label>
              <div className="grid grid-cols-1 gap-2">
                {Object.values(VisualStyle).map(v => (
                  <button
                    key={v}
                    onClick={() => setStyle(v)}
                    className={`text-left px-4 py-3 rounded-xl border text-[11px] transition-all font-bold tracking-wide ${
                      style === v 
                        ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/10' 
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {styleLabels[v]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-gray-600 mb-3 uppercase tracking-widest">图片比例 (Ratio)</label>
              <div className="flex gap-2">
                {Object.values(AspectRatio).map(r => (
                  <button
                    key={r}
                    onClick={() => setRatio(r)}
                    className={`flex-1 px-4 py-3 rounded-xl border text-[11px] font-bold transition-all text-center tracking-widest ${
                      ratio === r 
                        ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/10' 
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-auto pt-6 border-t border-gray-200">
            <button
              onClick={handleGeneratePlan}
              disabled={loading || !productImage}
              className={`w-full py-4 rounded-2xl font-black text-sm transition-all flex flex-col items-center justify-center leading-tight uppercase tracking-widest ${
                loading || !productImage ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-2xl shadow-blue-500/30 active:scale-95'
              }`}
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin mb-2"></div>
                  <span className="text-[10px]">视觉研判中...</span>
                </>
              ) : (
                <>
                  <span>策划视觉全案</span>
                  <span className="text-[9px] opacity-70 mt-1 font-bold">Generate 6-Image Strategy</span>
                </>
              )}
            </button>
            {error && <p className="mt-4 text-center text-red-600 text-[10px] font-black uppercase bg-red-50 py-2 rounded-lg border border-red-200">{error}</p>}
            {!loading && !error && productImage && (
              <p className="mt-4 text-center text-gray-600 text-[10px] font-medium">
                每生成 1 张图片扣费 {imageCost} 积分
              </p>
            )}
          </div>
        </aside>

        {/* Right Content: Results */}
        <section className="flex-1 bg-gray-50 p-6 md:p-10 overflow-y-auto custom-scrollbar">
          {plan ? (
            <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-700">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-gray-200 pb-10">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-1 rounded border border-blue-200">STRATEGY READY</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse"></div>
                  </div>
                  <h2 className="text-4xl font-black text-gray-900 tracking-tighter uppercase leading-none">
                    {plan.productName || '视觉策划蓝图'}
                  </h2>
                  <p className="text-gray-600 text-xs font-medium uppercase tracking-widest">Market Focus: <span className="text-gray-800 font-black">{market}</span></p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-8 pb-20">
                {plan.strategies.map((strat) => (
                  <StrategyCard 
                    key={strat.id} 
                    strategy={strat} 
                    aspectRatio={ratio} 
                    imageCost={imageCost}
                    imageUrl={generatedImages[strat.id] || null}
                    isLoading={generatingImages[strat.id] || false}
                    onGenerate={() => generateSingleImage(strat)}
                    onPromptChange={(newPrompt) => handlePromptChange(strat.id, newPrompt)}
                    onOverlayTextChange={(newText) => handleOverlayTextChange(strat.id, newText)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-12">
              {loading ? (
                <div className="space-y-8">
                  <div className="relative mx-auto w-32 h-32">
                    <div className="absolute inset-0 border-[6px] border-gray-200 rounded-full"></div>
                    <div className="absolute inset-0 border-[6px] border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-2xl font-black text-gray-900 tracking-tight uppercase">AI 视觉策划建模中...</h3>
                    <p className="text-gray-600 text-sm max-w-sm mx-auto leading-relaxed font-medium">
                      正在提取产品工业设计语言，结合亚马逊 <span className="text-blue-600 font-bold">{market}</span> 市场转化模型，构建全链路视觉表达逻辑。
                    </p>
                  </div>
                </div>
              ) : (
                <div className="max-w-xl mx-auto space-y-12">
                  <div className="w-28 h-28 bg-white rounded-[2.5rem] flex items-center justify-center mb-8 border border-gray-200 mx-auto shadow-lg relative group">
                    <div className="absolute inset-0 bg-blue-100/50 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <svg className="w-12 h-12 text-gray-400 relative" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-3xl font-black text-gray-900 tracking-tighter uppercase leading-none">主图生成（跨境/数码3c）</h3>
                    <p className="text-gray-600 text-sm leading-relaxed max-w-md mx-auto font-medium">
                      上传您的产品高清图，系统将对产品进行视觉扫描，自动策划符合亚马逊 A10 算法的高质量真实感视觉。
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-6 pt-4">
                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-lg group hover:border-blue-300 transition-colors text-center">
                      <div className="text-blue-600 font-black text-2xl tracking-tighter mb-1">REAL</div>
                      <div className="text-[10px] text-gray-600 font-black uppercase tracking-widest leading-tight">真实场景<br/>Lifestyle</div>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-lg group hover:border-blue-300 transition-colors text-center">
                      <div className="text-blue-600 font-black text-2xl tracking-tighter mb-1">LOCAL</div>
                      <div className="text-[10px] text-gray-600 font-black uppercase tracking-widest leading-tight">地道文案<br/>Native Copy</div>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-lg group hover:border-blue-300 transition-colors text-center">
                      <div className="text-blue-600 font-black text-2xl tracking-tighter mb-1">EDIT</div>
                      <div className="text-[10px] text-gray-600 font-black uppercase tracking-widest leading-tight">灵活修改<br/>Full Control</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}} />
    </div>
  );
};

export default CrossBorder3CVisualApp;
