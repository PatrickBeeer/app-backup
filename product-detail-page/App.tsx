import React, { useState, useRef } from 'react';
import { GlassPanel } from './components/GlassPanel';
import { ShotCard } from './components/ShotCard';
import { generatePageStructure, analyzeProduct, generateDesignThemes } from './services/geminiService';
import { PageSection, ModelTier, ImageResolution, AspectRatio, ProductAnalysis, DesignTheme, TargetAudience } from './types';
import { AppProps } from '../../types';
import JSZip from 'jszip';
import { ImagePreviewModal } from './components/ImagePreviewModal';
import { AnalysisOverlay } from './components/AnalysisOverlay';

const APP_ID = 'product-detail-page';
const DEFAULT_ASPECT_RATIO = AspectRatio.PORTRAIT_3_4;

const createSectionId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result);
                return;
            }
            reject(new Error('读取图片失败'));
        };
        reader.onerror = () => reject(new Error('读取图片失败'));
        reader.readAsDataURL(file);
    });
};

const App: React.FC<AppProps> = ({ platform, costs }) => {
    const generateImageCost = costs?.GENERATE_IMAGE ?? 10;
  const [productImages, setProductImages] = useState<string[]>([]);
  const [productDescription, setProductDescription] = useState('');
  const [selectedAudience, setSelectedAudience] = useState<TargetAudience>(TargetAudience.WHITE_COLLAR);

  const [productAnalysis, setProductAnalysis] = useState<ProductAnalysis | null>(null);
  const [designThemes, setDesignThemes] = useState<DesignTheme[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<DesignTheme | null>(null);

  const [hasGeneratedInitialOutline, setHasGeneratedInitialOutline] = useState(false); 
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingStructure, setIsGeneratingStructure] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<{ sectionId: string, imageUrl: string } | null>(null);

  const [sections, setSections] = useState<PageSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  const productInputRef = useRef<HTMLInputElement>(null);

    const handleProductUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        try {
            const newImages = await Promise.all(files.map((file) => readFileAsDataUrl(file)));
            setProductImages(prev => [...prev, ...newImages]);
            setProductAnalysis(null);
            setDesignThemes([]);
            setHasGeneratedInitialOutline(false);
        } catch {
            alert('图片读取失败，请重试。');
        }

        // Allow selecting the same file again in the next upload action.
        e.target.value = '';
  };

  const handleGenerateInitialOutline = async () => {
    if (productImages.length === 0 || !productDescription.trim()) return;
    setIsAnalyzing(true);
    try {
                const analysis = await analyzeProduct(productImages);

        setProductAnalysis(analysis);
        const themes = await generateDesignThemes(analysis);
        setDesignThemes(themes);
        setHasGeneratedInitialOutline(true);
    } catch (e: any) {
        const msg = e?.message || "智能分析失败，请重试。";
        alert(msg);
    } finally {
        setIsAnalyzing(false);
    }
  };

  const handleStartDesign = async (theme: DesignTheme) => {
      if (!productAnalysis) return;
      
      setIsGeneratingStructure(true);
      try {
          const structure = await generatePageStructure(theme.structureOutline, selectedAudience, productDescription, productAnalysis);
                    setSelectedTheme(theme);
          const newSections: PageSection[] = structure.map(item => ({
                        id: createSectionId(),
            sectionNumber: item.sectionNumber,
            sectionType: item.sectionType,
            copywriting: item.copywriting,
            visualPrompt: item.visual,
            imageUrl: undefined,
            isGeneratingImage: false,
            isEditingImage: false,
            modelTier: ModelTier.PRO,
            resolution: ImageResolution.RES_1K,
                        aspectRatio: DEFAULT_ASPECT_RATIO,
            imageHistory: [],
            historyIndex: -1
          }));
          setSections(newSections);
      } catch (e: any) {
          const msg = e?.message ? `风格「${theme.title}」分镜生成失败：${e.message}` : `风格「${theme.title}」分镜生成失败。`;
          alert(msg);
      } finally {
          setIsGeneratingStructure(false);
      }
  };

  return (
    <div className="h-full w-full flex flex-col p-4 md:p-8 gap-6 overflow-hidden">
      {isPreviewModalOpen && previewTarget && (
        <ImagePreviewModal 
          previewTarget={previewTarget} 
          onClose={() => setIsPreviewModalOpen(false)} 
                    appId={APP_ID}
                    platform={platform}
                                        generateImageCost={generateImageCost}
          onEditSuccess={(sid, url) => {
            setSections(prev => prev.map(s => s.id === sid ? {...s, imageUrl: url, imageHistory: [...s.imageHistory, url], historyIndex: s.imageHistory.length} : s));
            setPreviewTarget({ sectionId: sid, imageUrl: url });
          }}
        />
      )}
      
            <header className="flex items-center justify-between px-4">
         <div className="flex items-center gap-4">
                         <button
                             onClick={platform.onBack}
                             className="px-4 py-2 rounded-xl border border-black/10 text-xs font-bold hover:bg-black hover:text-white transition"
                         >
                             返回控制台
                         </button>
             <div className="w-12 h-12 bg-black text-white rounded-2xl flex items-center justify-center shadow-lg">
                 <i className="ph-bold ph-sketch-logo text-2xl"></i>
             </div>
             <div>
                 <h1 className="text-2xl font-bold text-black tracking-tight leading-none mb-1">AI 详情页专家</h1>
                 <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-bold">Market-Driven Design Studio</p>
             </div>
             <div className="ml-4 px-4 py-2 bg-amber-100 border border-amber-200 rounded-xl flex items-center gap-3 animate-pulse">
                <i className="ph-fill ph-info text-amber-600"></i>
                <span className="text-xs font-bold text-amber-800">
                    此版本为体验版，更多针对品类的定制功能，可联系微信: <span className="underline select-all">qianying0396</span>
                </span>
             </div>
         </div>

         <div className="flex items-center gap-4">
             {sections.length > 0 && (
                 <button 
                    onClick={async () => {
                        setIsDownloading(true);
                                                try {
                                                    const zip = new JSZip();
                                                    for (const s of sections) {
                                                        if (s.imageUrl) {
                                                            zip.file(`shot_${s.sectionNumber}.png`, s.imageUrl.split(',')[1], {base64: true});
                                                        }
                                                    }
                                                    const content = await zip.generateAsync({type: 'blob'});
                                                    const blobUrl = URL.createObjectURL(content);
                                                    const link = document.createElement('a');
                                                    link.href = blobUrl;
                                                    link.download = 'assets.zip';
                                                    link.rel = 'noopener';
                                                    document.body.appendChild(link);
                                                    link.click();
                                                    link.remove();
                                                    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                                                } finally {
                                                    setIsDownloading(false);
                                                }
                    }} 
                    className="px-6 py-3 rounded-2xl bg-black text-white text-xs font-bold transition hover:scale-105"
                 >
                     {isDownloading ? "打包中..." : "打包导出素材"}
                 </button>
             )}
         </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row gap-8 min-h-0 relative">
          <GlassPanel className="w-full md:w-[420px] flex flex-col p-0 overflow-hidden relative">
             <AnalysisOverlay isVisible={isAnalyzing} />
             
             <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
                 <div className="space-y-6">
                     <div className="flex items-center gap-3">
                         <span className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-bold">Step 01</span>
                         <h2 className="text-xl font-bold text-black tracking-tight">产品与受众</h2>
                     </div>
                     
                     <div className="space-y-4">
                        <label className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">上传产品图</label>
                        <div className="grid grid-cols-3 gap-3">
                            {productImages.map((img, idx) => (
                                <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden border border-white/50 bg-white group">
                                    <img src={img} alt="Product" className="w-full h-full object-cover" />
                                    {isAnalyzing && (
                                        <div className="absolute inset-0 bg-black/10 flex flex-col">
                                            <div className="w-full h-0.5 bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.8)] animate-[scan_2s_ease-in-out_infinite]"></div>
                                        </div>
                                    )}
                                    <button onClick={() => setProductImages(prev => prev.filter((_,i)=>i!==idx))} className="absolute top-1 right-1 w-6 h-6 bg-black/50 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><i className="ph ph-x text-xs"></i></button>
                                </div>
                            ))}
                            <button onClick={() => productInputRef.current?.click()} className="aspect-square rounded-2xl bg-white/40 border border-white/60 hover:bg-white transition-all flex flex-col items-center justify-center text-gray-400">
                                <i className="ph ph-plus text-xl"></i>
                            </button>
                        </div>
                        <input ref={productInputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleProductUpload} />
                     </div>

                     <div className="space-y-4">
                         <label className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">目标人群 (决定文案调性)</label>
                         <div className="flex flex-wrap gap-2">
                            {Object.values(TargetAudience).map(audience => (
                                <button
                                    key={audience}
                                    onClick={() => setSelectedAudience(audience)}
                                    className={`px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all ${selectedAudience === audience ? 'bg-black text-white border-black' : 'bg-white/40 border-white text-gray-500 hover:bg-white'}`}
                                >
                                    {audience}
                                </button>
                            ))}
                         </div>
                     </div>

                     <div className="space-y-4">
                         <label className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">核心卖点与功效</label>
                         <textarea 
                            className="w-full bg-white/40 border-none rounded-2xl p-4 text-sm focus:bg-white/80 transition-all h-24"
                            placeholder="请描述产品的功能、材质及能给用户带来的实际好处..."
                            value={productDescription}
                            onChange={(e) => setProductDescription(e.target.value)}
                         />
                     </div>
                     
                     <button
                        onClick={handleGenerateInitialOutline}
                        disabled={productImages.length === 0 || !productDescription.trim() || isAnalyzing}
                        className="w-full py-4 bg-black text-white font-bold rounded-2xl hover:scale-[1.02] transition shadow-xl flex items-center justify-center gap-2 disabled:opacity-50"
                     >
                         {isAnalyzing ? "AI 深度洞察策划中..." : "开始策划"}
                     </button>
                 </div>

                 {hasGeneratedInitialOutline && (
                     <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                         <div className="flex items-center gap-3">
                             <span className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-bold">Step 02</span>
                             <h2 className="text-xl font-bold text-black tracking-tight">风格对标选择</h2>
                         </div>

                         <div className="space-y-4">
                            {designThemes.map((theme, idx) => (
                                <button
                                    key={theme.id}
                                    onClick={() => handleStartDesign(theme)}
                                    className={`w-full text-left p-5 rounded-[1.5rem] border transition-all group ${selectedTheme?.id === theme.id ? 'bg-black text-white' : 'bg-white/40 border-white hover:bg-white'}`}
                                >
                                    <div className="flex justify-between items-center mb-2">
                                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${idx === 0 ? 'bg-amber-400 text-black' : 'bg-blue-400 text-white'}`}>
                                            {idx === 0 ? "头部品牌参考" : idx === 1 ? "主流趋势" : "先锋实验"}
                                        </span>
                                    </div>
                                    <div className="font-bold text-sm mb-1">{theme.title}</div>
                                    <p className={`text-[10px] leading-relaxed ${selectedTheme?.id === theme.id ? 'text-gray-400' : 'text-gray-500'}`}>{theme.rationale}</p>
                                </button>
                            ))}
                         </div>
                     </div>
                 )}
             </div>
          </GlassPanel>

          <GlassPanel className="flex-1 flex flex-col p-8 min-w-0">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-baseline gap-4">
                    <h2 className="text-3xl font-bold text-black tracking-tight">预览画板 (标准 9 屏策划)</h2>
                    {productAnalysis && <span className="text-xs font-medium text-gray-400">类目：{productAnalysis.category} | 标杆：{productAnalysis.topBrands?.join(', ')}</span>}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto pb-10 custom-scrollbar">
                   {isGeneratingStructure ? (
                       <div className="h-full flex flex-col items-center justify-center">
                           <div className="w-12 h-12 border-4 border-gray-100 border-t-black rounded-full animate-spin mb-4"></div>
                           <p className="text-sm font-bold text-gray-500">正在按行业蓝图生成标准 9 屏策划方案...</p>
                       </div>
                   ) : sections.length === 0 ? (
                       <div className="h-full flex flex-col items-center justify-center opacity-30">
                           <i className="ph ph-layout text-6xl mb-4"></i>
                           <p className="text-lg font-bold">请在左侧选择风格开启设计</p>
                       </div>
                   ) : (
                       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 animate-in fade-in duration-500">
                           {sections.map((section, index) => (
                               <ShotCard
                                    key={section.id}
                                    frame={{...section, sectionNumber: index + 1}}
                                    onUpdate={(updated) => setSections(prev => prev.map(s => s.id === updated.id ? updated : s))}
                                    onDelete={() => setSections(prev => prev.filter(s => s.id !== section.id))}
                                 appId={APP_ID}
                                 platform={platform}
                                         imageGenerateCost={generateImageCost}
                                    globalStyle={selectedTheme?.visualStyle || ""}
                                    productImages={productImages}
                                    onImageClick={(url) => { setPreviewTarget({ sectionId: section.id, imageUrl: url }); setIsPreviewModalOpen(true); }}
                                    isSelected={selectedSectionId === section.id}
                                    onSelect={setSelectedSectionId}
                                    targetAudience={selectedAudience}
                               />
                           ))}
                       </div>
                   )}
              </div>
          </GlassPanel>
      </div>
    </div>
  );
};

export default App;