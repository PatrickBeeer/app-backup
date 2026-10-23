
import React, { useEffect, useRef, useState } from 'react';
import { AppProps } from '../../types';
import { RoomStyle, AspectRatio, GenerationState, RugImage, RugMaterial, ImageSize, HistoryItem, InputType } from './types';
import { generateRugSceneFromPrompt, constructPromptPair, fileToBase64 } from './services/geminiService';

const APP_ID = 'ai-carpet-design';
const GENERATE_ACTION = 'GENERATE_IMAGE';
const COST_PER_IMAGE = 10;
const IMAGES_PER_RUN = 2;

const Label = ({ children }: { children?: React.ReactNode }) => (
  <label className="text-xs font-bold text-stone-500 uppercase tracking-[0.15em] mb-3 block">{children}</label>
);

const ROOM_DATA: Record<RoomStyle, { label: string; icon: React.ReactNode }> = {
  [RoomStyle.CREAMY_WIND]: { label: '治愈奶油风', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/></svg> },
  [RoomStyle.FRENCH_VINTAGE]: { label: '法式复古', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/></svg> },
  [RoomStyle.MODERN_AMERICAN]: { label: '美式老钱', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/></svg> },
  [RoomStyle.BEDROOM]: { label: '高定卧房', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/></svg> },
  [RoomStyle.NURSERY]: { label: '温馨童房', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/></svg> },
  [RoomStyle.CUSTOM]: { label: '自定义环境', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/></svg> }
};

const MATERIAL_DISPLAY: Record<RugMaterial, string> = {
  [RugMaterial.WOOL]: '高级羊毛',
  [RugMaterial.SILK]: '奢华真丝',
  [RugMaterial.JUTE]: '原生态黄麻',
  [RugMaterial.SHAGGY]: '蓬松长绒',
  [RugMaterial.COTTON]: '亲肤棉麻',
  [RugMaterial.SYNTHETIC]: '科技纤维',
  [RugMaterial.CUSTOM]: '自定义材质',
};

const RATIO_OPTIONS = [
  { id: AspectRatio.SQUARE, label: '1:1' },
  { id: AspectRatio.LANDSCAPE_43, label: '4:3' },
  { id: AspectRatio.PORTRAIT_34, label: '3:4' },
  { id: AspectRatio.LANDSCAPE_169, label: '16:9' },
  { id: AspectRatio.PORTRAIT_916, label: '9:16' },
];

export const AiCarpetDesignApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [rug, setRug] = useState<RugImage | null>(null);
  const [refImage, setRefImage] = useState<RugImage | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<RugMaterial>(RugMaterial.WOOL);
  const [inputType, setInputType] = useState<InputType>(InputType.REAL_PHOTO);
  const [selectedStyle, setSelectedStyle] = useState<RoomStyle>(RoomStyle.CREAMY_WIND);
  const [selectedRatio, setSelectedRatio] = useState<AspectRatio>(AspectRatio.SQUARE);
  const [selectedSize, setSelectedSize] = useState<ImageSize>('1K');
  const [advancedPrompt, setAdvancedPrompt] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [genState, setGenState] = useState<GenerationState>({ isGenerating: false, resultUrls: [], lastPrompts: [], error: null, progressMessage: '' });
  const rugUploadRef = useRef<HTMLInputElement>(null);
  const refUploadRef = useRef<HTMLInputElement>(null);

  const perImageCost = (costs && costs[GENERATE_ACTION]) ?? COST_PER_IMAGE;
  const totalCost = perImageCost * IMAGES_PER_RUN;

  const replaceRugImage = (file: File) => {
    setRug((prev) => {
      if (prev?.preview) {
        URL.revokeObjectURL(prev.preview);
      }
      return { file, preview: URL.createObjectURL(file) };
    });
    setGenState((prev) => ({
      ...prev,
      resultUrls: [],
      error: null,
    }));
  };

  const replaceReferenceImage = (file: File) => {
    setRefImage((prev) => {
      if (prev?.preview) {
        URL.revokeObjectURL(prev.preview);
      }
      return { file, preview: URL.createObjectURL(file) };
    });
  };

  const clearReferenceImage = () => {
    setRefImage((prev) => {
      if (prev?.preview) {
        URL.revokeObjectURL(prev.preview);
      }
      return null;
    });
  };

  useEffect(() => {
    return () => {
      if (rug?.preview) {
        URL.revokeObjectURL(rug.preview);
      }
      if (refImage?.preview) {
        URL.revokeObjectURL(refImage.preview);
      }
    };
  }, [rug, refImage]);

  const handleGenerate = async () => {
    if (!rug) return;

    await platform.refreshCredits?.();

    if (!platform.checkBalance(totalCost)) {
      return;
    }

    setGenState(prev => ({ ...prev, isGenerating: true, error: null, progressMessage: '空间场景构建中...' }));

    try {
      const rugBase64 = await fileToBase64(rug.file);
      const refBase64 = refImage ? await fileToBase64(refImage.file) : null;
      const prompts = constructPromptPair(selectedStyle, selectedMaterial, advancedPrompt, inputType, !!refImage);
      const sharedSeed = Math.floor(Math.random() * 2147483647);
      const results = await Promise.all(prompts.map(p => 
        generateRugSceneFromPrompt(rugBase64, p, selectedRatio, selectedSize, refBase64, sharedSeed)
      ));

      await platform.refreshCredits?.();

      const now = Date.now();
      const newHistory = results.map((url, idx) => ({
        id: `${now}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
        url,
        timestamp: now,
      }));
      setGenState({ isGenerating: false, resultUrls: results, lastPrompts: prompts, error: null, progressMessage: '' });
      setHistory(prev => [...newHistory, ...prev]);
    } catch (err: any) {
      setGenState(prev => ({ ...prev, isGenerating: false, error: err.message || '生成异常' }));
    }
  };

  return (
    <div className="min-h-screen pb-24 pt-10 px-6 lg:px-16 flex flex-col items-center bg-[#fcfcfc]">
      <nav className="glass-panel rounded-[2.5rem] px-12 py-6 w-full max-w-[1600px] flex items-center justify-between sticky top-16 md:top-20 z-40 mb-12 border border-white/60">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center text-white text-xl font-black shadow-lg">织</div>
          <h1 className="text-2xl font-black tracking-tight text-stone-900">地毯视觉 AI 工作室</h1>
        </div>
      </nav>

      <div className="w-full max-w-[1600px] grid grid-cols-1 lg:grid-cols-12 gap-10">
        <aside className="lg:col-span-4 space-y-8">
          <div className="glass-panel rounded-[3rem] p-10 space-y-10 border border-white/40">
            <section className="space-y-6">
              <Label>1. 核心资产上传</Label>
              
              <div className="space-y-3 pb-2">
                <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">请选择您要上传的图片类型</p>
                <div className="grid grid-cols-2 gap-3 bg-stone-50 p-1.5 rounded-2xl border border-stone-100">
                  <button onClick={() => setInputType(InputType.REAL_PHOTO)} className={`py-3 rounded-[1.25rem] text-xs font-bold transition-all ${inputType === InputType.REAL_PHOTO ? 'bg-black text-white shadow-lg translate-y-[-1px]' : 'text-stone-400 hover:text-stone-600'}`}>产品实拍</button>
                  <button onClick={() => setInputType(InputType.FLAT_DESIGN)} className={`py-3 rounded-[1.25rem] text-xs font-bold transition-all ${inputType === InputType.FLAT_DESIGN ? 'bg-black text-white shadow-lg translate-y-[-1px]' : 'text-stone-400 hover:text-stone-600'}`}>设计平面图</button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                  <div onClick={() => rugUploadRef.current?.click()} className={`relative aspect-square rounded-[2rem] border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all duration-300 ${rug ? 'border-transparent bg-stone-50' : 'border-stone-200 hover:border-stone-900 hover:bg-stone-50'}`}>
                  {rug ? <img src={rug.preview} className="w-full h-full object-contain p-4" alt="Product" /> : <div className="text-center px-4"><p className="text-sm font-bold text-stone-400">{inputType === InputType.REAL_PHOTO ? '地毯实拍图' : '地毯设计稿'}</p><p className="text-[10px] text-stone-300 mt-2 font-medium">点击或拖拽上传</p></div>}
                    <input ref={rugUploadRef} id="rug-upload" type="file" className="hidden" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if(f) replaceRugImage(f); }} />
                </div>
                  <div onClick={() => refUploadRef.current?.click()} className={`relative aspect-square rounded-[2rem] border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all duration-300 ${refImage ? 'border-transparent bg-stone-50' : 'border-stone-200 hover:border-stone-900 hover:bg-stone-50'}`}>
                  {refImage ? <img src={refImage.preview} className="w-full h-full object-cover rounded-[2rem]" alt="Ref" /> : <div className="text-center px-4"><p className="text-sm font-bold text-stone-400">风格参考图</p><p className="text-[10px] text-stone-300 mt-2 font-medium">非必须</p></div>}
                    <input ref={refUploadRef} id="ref-upload" type="file" className="hidden" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if(f) replaceReferenceImage(f); }} />
                    {refImage && <button onClick={(e) => {e.stopPropagation(); clearReferenceImage();}} className="absolute -top-3 -right-3 w-8 h-8 bg-black text-white rounded-full flex items-center justify-center text-lg shadow-xl hover:scale-110 transition-transform">×</button>}
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <Label>2. 场景风格定义</Label>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(ROOM_DATA).map(([id, opt]) => (
                  <button key={id} onClick={() => setSelectedStyle(id as RoomStyle)} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300 ${selectedStyle === id ? 'bg-black border-black text-white shadow-xl translate-y-[-2px]' : 'bg-white/50 border-stone-100 text-stone-600 hover:bg-white hover:border-stone-300'}`}>
                    {opt.icon}
                    <span className="text-xs font-bold">{opt.label}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="pt-2">
              <button onClick={() => setShowAdvanced(!showAdvanced)} className="w-full flex items-center justify-between px-2 py-4 text-stone-500 hover:text-stone-900 transition-colors">
                <span className="text-xs font-bold uppercase tracking-widest">高级配置参数</span>
                <svg className={`w-5 h-5 transition-transform duration-300 ${showAdvanced ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/></svg>
              </button>
              
              {showAdvanced && (
                <div className="mt-6 space-y-8 animate-in slide-in-from-top-6 duration-500">
                  <div className="space-y-3">
                    <Label>核心材质</Label>
                    <select value={selectedMaterial} onChange={(e) => setSelectedMaterial(e.target.value as RugMaterial)} className="w-full px-5 py-4 bg-white border border-stone-200 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-black/5 outline-none appearance-none">
                      {Object.entries(RugMaterial).map(([k, v]) => <option key={v} value={v}>{MATERIAL_DISPLAY[v as RugMaterial]}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <Label>画幅比例</Label>
                      <div className="flex bg-stone-100 p-1.5 rounded-2xl gap-1">
                        {RATIO_OPTIONS.slice(0, 3).map(opt => (
                          <button key={opt.id} onClick={() => setSelectedRatio(opt.id as AspectRatio)} className={`flex-1 py-2 rounded-xl text-xs font-bold ${selectedRatio === opt.id ? 'bg-white shadow-sm text-black' : 'text-stone-400 hover:text-stone-600'}`}>{opt.label}</button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <Label>分辨率</Label>
                      <div className="flex bg-stone-100 p-1.5 rounded-2xl gap-1">
                        <button onClick={() => setSelectedSize('1K')} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${selectedSize === '1K' ? 'bg-white shadow-sm text-black' : 'text-stone-400'}`}>1K</button>
                        <button onClick={() => setSelectedSize('2K')} className={`flex-1 py-2 rounded-xl text-xs font-bold leading-tight flex flex-col items-center transition-all ${selectedSize === '2K' ? 'bg-white shadow-sm text-black' : 'text-stone-400'}`}>
                          <span>2K</span>
                            <span className="text-[8px] opacity-70 font-black scale-90 mt-0.5">更高细节</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="pt-8 border-t border-stone-100 space-y-4">
               <Label>3. 细节微调指令</Label>
               <textarea placeholder="例如：“在毯子上放一本艺术画册”或“增强阳光直射感”..." value={advancedPrompt} onChange={(e) => setAdvancedPrompt(e.target.value)} className="w-full h-28 p-5 bg-stone-50 border border-stone-100 rounded-[1.5rem] text-sm font-medium focus:outline-none focus:bg-white focus:border-stone-300 transition-all resize-none shadow-inner" />
            </section>

            <button onClick={handleGenerate} disabled={!rug || genState.isGenerating} className={`w-full py-6 rounded-[2rem] font-black text-sm uppercase tracking-[0.25em] shadow-2xl transition-all active:scale-[0.98] ${!rug || genState.isGenerating ? 'bg-stone-200 text-stone-400' : 'bg-black text-white hover:bg-stone-900 hover:shadow-black/20'}`}>
              {genState.isGenerating ? '正在渲染双重视角...' : `生成多视角方案（${perImageCost} 积分/张，共 ${totalCost} 积分）`}
            </button>
          </div>
        </aside>

        <main className="lg:col-span-8 space-y-10">
          <div className="glass-panel rounded-[3.5rem] p-12 flex flex-col min-h-[850px] border border-white/50">
            {genState.resultUrls.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12 flex-1">
                {genState.resultUrls.map((url, i) => (
                  <div key={i} className="space-y-6 animate-in fade-in slide-in-from-bottom-10 duration-700">
                    <div className="flex items-center justify-between px-2">
                       <p className="text-xs font-black text-stone-400 uppercase tracking-widest">{i === 0 ? '视角 A：空间渲染' : '视角 B：材质特写'}</p>
                       <div className="h-px flex-1 mx-4 bg-stone-100"></div>
                    </div>
                    <div className="relative group aspect-square rounded-[2.5rem] overflow-hidden shadow-2xl bg-white border border-stone-50">
                      <img src={url} alt="Result" className="w-full h-full object-contain" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-500 flex items-center justify-center gap-6 backdrop-blur-sm">
                        <button onClick={() => setZoomedImage(url)} className="bg-white px-8 py-3 rounded-full text-xs font-bold shadow-xl hover:scale-105 transition-transform">查看大图</button>
                        <a href={url} download={`render-${i}.png`} className="bg-white/20 text-white border border-white/30 px-8 py-3 rounded-full text-xs font-bold backdrop-blur-md hover:bg-white/30 transition-all">保存方案</a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : genState.isGenerating ? (
              <div className="flex-1 flex flex-col items-center justify-center space-y-8">
                <div className="relative">
                  <div className="w-24 h-24 border-4 border-black/5 rounded-full"></div>
                  <div className="absolute top-0 w-24 h-24 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
                </div>
                <div className="text-center">
                  <p className="text-sm font-black uppercase tracking-[0.5em] text-stone-900 animate-pulse">{genState.progressMessage}</p>
                  <p className="text-xs text-stone-400 mt-4 font-medium">AI 正在根据您的产品特征构建高精场景...</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-20 space-y-10">
                <div className="w-32 h-32 bg-stone-50 rounded-[3rem] flex items-center justify-center border border-stone-100 shadow-inner group">
                  <svg className="w-14 h-14 text-stone-200 group-hover:text-stone-300 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1"/></svg>
                </div>
                <div className="max-w-md">
                  <h2 className="text-3xl font-black text-stone-900 tracking-tight leading-tight">上传产品 开启视觉实验室</h2>
                  <p className="text-sm text-stone-400 mt-6 leading-relaxed font-medium">我们采用了最新的场景一致性算法，一次生成即可获得两组视角。建议上传效果图以获得更精准的品牌风格偏向。</p>
                </div>
              </div>
            )}
          </div>

          {history.length > 0 && (
            <section className="space-y-6 pt-4">
              <div className="flex items-center justify-between px-4">
                 <h2 className="text-xs font-black uppercase tracking-[0.4em] text-stone-400">渲染资产库</h2>
                 <span className="text-[10px] text-stone-300 font-bold">{history.length} ITEMS</span>
              </div>
              <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-6">
                {history.map(item => (
                  <div key={item.id} className="aspect-square rounded-[1.5rem] overflow-hidden glass-panel p-1.5 group cursor-pointer shadow-sm hover:shadow-xl transition-all duration-500" onClick={() => setZoomedImage(item.url)}>
                    <img src={item.url} alt="History" className="w-full h-full object-cover rounded-xl transition-transform duration-700 group-hover:scale-110" />
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>

      {zoomedImage && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-8 animate-in fade-in duration-500" onClick={() => setZoomedImage(null)}>
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <img src={zoomedImage} alt="Zoom" className="w-full h-full object-contain rounded-2xl shadow-[0_0_100px_rgba(0,0,0,0.5)]" />
            <button className="absolute -top-12 right-0 text-white font-bold flex items-center gap-2 hover:opacity-70 transition-opacity">
              <span className="text-xs tracking-widest uppercase">点击任意位置关闭</span>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AiCarpetDesignApp;
