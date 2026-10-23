import React, { useState, useEffect } from 'react';
import { AppProps } from '../../types';
import ImageUpload from './components/ImageUpload';
import { geminiService } from './services/geminiService';
import { AppState, ProcessingState, ImageData, AspectRatio, HistoryItem, StylePreset } from './types';

const ratios: { value: AspectRatio; label: string; icon: string }[] = [
  { value: "3:4", label: "3:4", icon: "fa-rectangle-portrait" },
  { value: "1:1", label: "1:1", icon: "fa-square" },
  { value: "9:16", label: "9:16", icon: "fa-mobile-screen" },
  { value: "4:3", label: "4:3", icon: "fa-rectangle-landscape" },
  { value: "16:9", label: "16:9", icon: "fa-tv" },
];

const getAspectRatioClass = (ratio: AspectRatio) => {
  switch (ratio) {
    case "1:1": return "aspect-square";
    case "16:9": return "aspect-video";
    case "9:16": return "aspect-[9/16]";
    case "4:3": return "aspect-[4/3]";
    case "3:4": return "aspect-[3/4]";
    default: return "aspect-square";
  }
};

const styleOptions: { value: StylePreset; label: string; icon: string; description: string }[] = [
  { value: 'japanese_wood', label: '日系原木', icon: 'fa-pagoda', description: '自然光影，简约温馨' },
  { value: 'minimalist', label: '现代极简', icon: 'fa-gem', description: '纯净线条，现代设计' },
  { value: 'scandinavian', label: '北欧风格', icon: 'fa-house-chimney', description: '温馨舒适，明亮通透' },
  { value: 'bohemian', label: '波西米亚', icon: 'fa-fan', description: '异域风情，自由奔放' },
  { value: 'modern', label: '时尚奢华', icon: 'fa-sparkles', description: '精致高端，高级质感' },
];

export const CribPhotographyExpertApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [state, setState] = useState<AppState>(() => {
    let savedHistory: HistoryItem[] = [];
    try {
      const stored = localStorage.getItem('crib_photography_expert_v1');
      if (stored) savedHistory = JSON.parse(stored);
    } catch (e) {}

    return {
      productImage: null,
      modelImage: null,
      styleReferenceImage: null,
      resultImages: null,
      aspectRatio: "3:4",
      stylePreset: 'japanese_wood',
      productType: 'crib',
      userPrompt: '',
      referenceImagePrompt: '',
      history: savedHistory,
    };
  });

  const [uiState, setUiState] = useState<ProcessingState>({
    isAnalyzing: false,
    isGenerating: false,
    isIdentifying: false,
    isAnalyzingReference: false,
    error: null,
  });

  useEffect(() => {
    try {
      localStorage.setItem('crib_photography_expert_v1', JSON.stringify(state.history));
    } catch (e) {}
  }, [state.history]);

  const handleProductImageSelect = (imageData: ImageData) => {
    setState(prev => ({ ...prev, productImage: imageData }));
    (async () => {
      setUiState(prev => ({ ...prev, isIdentifying: true }));
      try {
        const type = await geminiService.identifyProduct(imageData);
        setState(prev => ({ ...prev, productType: type }));
      } finally {
        setUiState(prev => ({ ...prev, isIdentifying: false }));
      }
    })();
  };

  const handleStyleReferenceImageSelect = (imageData: ImageData) => {
    setState(prev => ({ ...prev, styleReferenceImage: imageData }));
    (async () => {
      setUiState(prev => ({ ...prev, isAnalyzingReference: true }));
      try {
        const prompt = await geminiService.reverseEngineerPromptFromReferenceImage(imageData);
        setState(prev => ({ ...prev, referenceImagePrompt: prompt }));
      } catch (e: any) {
        setUiState(prev => ({ ...prev, error: "姿势参考图分析失败，将尝试默认风格生成。" }));
        setState(prev => ({ ...prev, referenceImagePrompt: '' }));
      } finally {
        setUiState(prev => ({ ...prev, isAnalyzingReference: false }));
      }
    })();
  };

  const processImage = async () => {
    if (!state.productImage) {
      setUiState(prev => ({ ...prev, error: "请上传产品主体图。" }));
      return;
    }

    // 检查余额（不扣除）
    if (!platform.checkBalance(costs.GENERATE_IMAGE)) {
      return; // 余额不足会自动显示充值弹窗
    }
    
    setUiState(prev => ({ ...prev, isGenerating: true, error: null }));
    
    try {
      const results = await geminiService.generateStyledProductImage(
        state.productImage,
        state.modelImage,
        state.styleReferenceImage,
        state.aspectRatio,
        state.stylePreset,
        state.productType,
        state.userPrompt,
        state.referenceImagePrompt,
      );
      await platform.refreshCredits?.();
      
      const newItem: HistoryItem = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        imageUrls: results,
        aspectRatio: state.aspectRatio,
        stylePreset: state.stylePreset,
        productType: state.productType,
        userPrompt: state.userPrompt,
        productInputImage: state.productImage,
        modelInputImage: state.modelImage,
        styleReferenceInputImage: state.styleReferenceImage,
        referenceImagePrompt: state.referenceImagePrompt,
      };

      setState(prev => ({ 
        ...prev, 
        resultImages: results,
        history: [newItem, ...prev.history].slice(0, 10) 
      }));
    } catch (err: any) {
      setUiState(prev => ({ ...prev, error: err.message || "生成失败。" }));
    } finally {
      setUiState(prev => ({ ...prev, isGenerating: false }));
    }
  };

  const handleReset = () => {
    setState(p => ({
      ...p,
      resultImages: null,
      productImage: null,
      modelImage: null,
      styleReferenceImage: null,
      userPrompt: '',
      referenceImagePrompt: '',
    }));
    setUiState({
      isAnalyzing: false,
      isGenerating: false,
      isIdentifying: false,
      isAnalyzingReference: false,
      error: null,
    });
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-screen-2xl mx-auto pb-20">
      <style>{`
        .glass {
          background: rgba(255, 255, 255, 0.4);
          backdrop-filter: blur(40px);
          -webkit-backdrop-filter: blur(40px);
          border: 1px solid rgba(255, 255, 255, 0.6);
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.1);
        }
        .animate-fade-in {
          animation: fade-in 0.5s ease-out forwards;
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(15px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      
      <header className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl">
             <span className="text-2xl">🛏️</span>
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-slate-900 uppercase">
              benetree <span className="text-indigo-600">Pro Studio</span>
            </h1>
            <p className="text-[10px] text-slate-400 font-black tracking-[0.4em] uppercase">Visual Excellence Engine</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button onClick={handleReset} className="text-[10px] font-black text-slate-400 hover:text-rose-500 uppercase tracking-widest transition-colors">
            <i className="fas fa-trash-can mr-2"></i>重置
          </button>
        </div>
      </header>
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <aside className="lg:col-span-4 space-y-6">
          <div className="glass p-6 rounded-[2.5rem] space-y-6">
            <div className="grid grid-cols-3 gap-3">
              <ImageUpload label="1. 产品原图" description="细节/材质" icon="fa-box" image={state.productImage} onImageSelect={handleProductImageSelect} />
              <ImageUpload label="2. 模特参考" description="成人/婴儿" icon="fa-baby" image={state.modelImage} onImageSelect={(d) => setState(p => ({...p, modelImage: d}))} />
              <ImageUpload label="3. 姿势参考" description="姿势克隆" icon="fa-person-rays" image={state.styleReferenceImage} onImageSelect={handleStyleReferenceImageSelect} />
            </div>

            <div className="space-y-5 pt-5 border-t border-white/40">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">环境风格</label>
                  <select value={state.stylePreset} onChange={(e) => setState(p => ({...p, stylePreset: e.target.value as any}))} className="w-full bg-white/50 border border-white/60 rounded-xl p-3 text-xs font-bold focus:ring-2 focus:ring-indigo-100 transition-all">
                    {styleOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">输出比例</label>
                  <div className="flex flex-wrap gap-1.5">
                    {ratios.map(r => (
                      <button key={r.value} onClick={() => setState(p => ({...p, aspectRatio: r.value}))} className={`px-2 py-1.5 rounded-lg text-[10px] font-black transition-all ${state.aspectRatio === r.value ? 'bg-slate-900 text-white shadow-lg' : 'bg-white/50 text-slate-400 hover:bg-white'}`}>
                        {r.value}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <textarea value={state.userPrompt} onChange={(e) => setState(p => ({...p, userPrompt: e.target.value}))} placeholder="输入额外拍摄指令（选填）..." className="w-full h-24 p-4 rounded-3xl bg-white/40 border-none text-xs font-medium focus:ring-2 focus:ring-indigo-100 resize-none shadow-inner" />
              </div>

              <button 
                onClick={processImage} 
                disabled={uiState.isGenerating || uiState.isAnalyzingReference || !state.productImage}
                className={`w-full py-5 rounded-full font-black text-sm tracking-[0.2em] uppercase flex items-center justify-center gap-3 transition-all
                  ${uiState.isGenerating ? 'bg-slate-200 text-slate-400' : 'bg-indigo-600 text-white shadow-2xl hover:bg-indigo-700 hover:-translate-y-1 active:scale-95'}`}
              >
                {uiState.isGenerating ? <><i className="fas fa-circle-notch fa-spin"></i> 正在渲染商业影像...</> : uiState.isAnalyzingReference ? <><i className="fas fa-spinner fa-spin"></i> 正在后台分析参考图...</> : <><i className="fas fa-bolt"></i> 生成商业影像</>}
              </button>
            </div>
          </div>
        </aside>

        <main className="lg:col-span-8 space-y-6">
          <div className="grid grid-cols-1 gap-4 items-start max-w-2xl mx-auto">
            {state.resultImages ? (
              state.resultImages.map((img, idx) => (
                <div key={idx} className={`glass rounded-[2rem] overflow-hidden relative group border-4 border-white/50 flex items-center justify-center bg-slate-50/50 ${getAspectRatioClass(state.aspectRatio)}`}>
                  <img src={img} alt={`Result ${idx}`} className="w-full h-full object-cover shadow-2xl animate-fade-in transition-transform duration-700" />
                  <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <button onClick={() => window.open(img)} className="bg-white/95 p-3 rounded-full shadow-xl hover:scale-110 transition-transform"><i className="fas fa-expand text-slate-900 text-xs"></i></button>
                    <button onClick={() => {
                      const l = document.createElement('a');
                      l.href = img;
                      l.download = `crib-photography-${idx}-${Date.now()}.png`;
                      l.click();
                    }} className="bg-indigo-600 p-3 rounded-full shadow-xl hover:scale-110 transition-transform"><i className="fas fa-download text-white text-xs"></i></button>
                  </div>
                </div>
              ))
            ) : (
              <div className="aspect-[3/4] glass rounded-[3rem] overflow-hidden relative border-4 border-white/50 flex flex-col items-center justify-center space-y-6">
                <div className={`w-32 h-32 rounded-full flex items-center justify-center bg-white/50 border border-white/30 shadow-inner transition-all ${uiState.isGenerating || uiState.isAnalyzingReference ? 'animate-pulse scale-110' : ''}`}>
                  <i className={`fas ${uiState.isGenerating ? 'fa-wand-magic-sparkles fa-beat' : uiState.isAnalyzingReference ? 'fa-spinner fa-spin' : 'fa-camera'} text-5xl text-slate-200`}></i>
                </div>
                <div className="text-center">
                  <p className="text-[11px] font-black text-slate-300 uppercase tracking-[0.4em]">
                    {uiState.isGenerating 
                      ? 'AI 正在执行几何克隆与反推渲染...' 
                      : uiState.isAnalyzingReference 
                        ? 'AI 正在后台分析参考图姿势，请稍候...' 
                        : '等待反推拍摄指令'}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 flex items-center gap-2">
              <i className="fas fa-film"></i> 拍摄历史
            </h3>
            <div className="flex gap-4 overflow-x-auto pb-6 px-4 scrollbar-hide">
              {state.history.map(item => (
                <button key={item.id} onClick={() => setState(p => ({
                  ...p, 
                  resultImages: item.imageUrls, 
                  aspectRatio: item.aspectRatio,
                  stylePreset: item.stylePreset,
                  productType: item.productType,
                  userPrompt: item.userPrompt,
                  referenceImagePrompt: item.referenceImagePrompt || '',
                  productImage: item.productInputImage || null,
                  modelImage: item.modelInputImage || null,
                  styleReferenceImage: item.styleReferenceInputImage || null,
                }))} className={`flex-shrink-0 w-24 rounded-2xl overflow-hidden border-4 border-white shadow-lg hover:scale-105 transition-all active:scale-95 ${getAspectRatioClass(item.aspectRatio)}`}>
                  <img src={item.imageUrls[0]} className="w-full h-full object-cover" alt="History" />
                </button>
              ))}
              {state.history.length === 0 && <div className="w-full py-12 rounded-[2rem] border-2 border-dashed border-slate-200 flex items-center justify-center text-[10px] font-black text-slate-300 uppercase tracking-widest">暂无历史记录</div>}
            </div>
          </div>
        </main>
      </div>

      {uiState.error && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-rose-500 text-white px-8 py-5 rounded-full text-xs font-black shadow-2xl animate-fade-in flex items-center gap-4 z-50">
          <i className="fas fa-triangle-exclamation text-lg"></i>
          {uiState.error}
          <button onClick={() => setUiState(p => ({...p, error: null}))} className="ml-4 opacity-50 hover:opacity-100 transition-opacity"><i className="fas fa-times text-lg"></i></button>
        </div>
      )}
    </div>
  );
};

