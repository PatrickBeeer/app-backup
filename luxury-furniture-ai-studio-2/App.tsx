
import React, { useState, useRef, useEffect } from 'react';
import { SceneStyle, GeneratedImage, AspectRatio, ModelEthnicity, ModelAge, ImageSize } from './types';
import { STYLE_OPTIONS, ASPECT_RATIOS, SUGGESTED_KEYWORDS } from './constants';
import { generateSceneImage } from './services/gemini';
import { AppProps } from '../../types';
import { 
  Upload, 
  Sparkles, 
  Image as ImageIcon, 
  History, 
  Download, 
  RefreshCcw, 
  ChevronRight,
  User,
  CheckCircle2,
  AlertCircle,
  Maximize,
  Wand2,
  Settings2,
  Code,
  Info,
  Type,
  Plus,
  Zap,
  Lock,
  ExternalLink,
  Palette,
  X,
  Home,
  Coffee,
  TreePine,
  Gem,
  Compass,
  Sun,
  Warehouse
} from './utils/lucide';

import './index.css';

const DEFAULT_COST = 20;

const STYLE_ICON_MAP = {
  Home,
  Coffee,
  TreePine,
  Gem,
  Compass,
  Sun,
  Warehouse,
} as const;

const StyleIcon = ({ name, className }: { name: string, className?: string }) => {
  const IconComponent = (STYLE_ICON_MAP as Record<string, React.ComponentType<{ className?: string }>>)[name] || Home;
  return <IconComponent className={className} />;
};

export const LuxuryFurnitureAiStudio2App: React.FC<AppProps> = ({ platform, costs }) => {
  const generationFee = costs?.GENERATE_IMAGE ?? DEFAULT_COST;
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [referenceStyleImage, setReferenceStyleImage] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<SceneStyle>(SceneStyle.CREAMY);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.SQUARE);
  const [imageSize, setImageSize] = useState<ImageSize>('2K');
  const [withModel, setWithModel] = useState(false);
  const [modelEthnicity, setModelEthnicity] = useState<ModelEthnicity>('ASIAN');
  const [modelAge, setModelAge] = useState<ModelAge>('YOUNG');
  
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [promptOverride, setPromptOverride] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refStyleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const style = STYLE_OPTIONS.find(s => s.id === selectedStyle);
    let modelDesc = "";
    if (withModel) {
      const eth = modelEthnicity === 'ASIAN' ? '亚洲' : modelEthnicity === 'WESTERN' ? '欧美' : '国际化';
      const age = modelAge === 'YOUNG' ? '青年' : '中年';
      modelDesc = `，画面中包含一名${eth}${age}模特正在自然地使用该家具`;
    } else {
      modelDesc = "，画面中仅展示家具，不需要出现人物";
    }

    const stylePrefix = referenceStyleImage 
      ? "参考上传图片的色调、材质与构构图" 
      : `${style?.chinesePrompt}`;

    const basePrompt = `电商家具场景图：${stylePrefix}${modelDesc}。画质要求：4K高清，专业商业摄影光效，真实阴影，符合天猫/京东主图审美。`;
    setPromptOverride(basePrompt);
  }, [selectedStyle, withModel, modelEthnicity, modelAge, referenceStyleImage]);

  const addKeyword = (keyword: string) => {
    setPromptOverride(prev => prev + `【${keyword}】`);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, isReference = false) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (isReference) {
          setReferenceStyleImage(event.target?.result as string);
        } else {
          setSourceImage(event.target?.result as string);
        }
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!sourceImage) {
      setError("请先上传一张产品图");
      return;
    }

    if (!platform.checkBalance(generationFee)) {
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const resultUrls = await generateSceneImage(
        sourceImage, 
        selectedStyle, 
        aspectRatio,
        imageSize,
        withModel, 
        modelEthnicity, 
        modelAge,
        "", 
        promptOverride,
        referenceStyleImage || undefined
      );
      
      const newImages: GeneratedImage[] = resultUrls.map((url, index) => ({
        id: (Date.now() + index).toString(),
        url: url,
        timestamp: Date.now(),
        style: selectedStyle,
        aspectRatio,
        imageSize: imageSize
      }));
      
      setGeneratedImages(prev => [...newImages.reverse(), ...prev]);
      await platform.refreshCredits?.();
    } catch (err: any) {
      console.error("HandleGenerate Error Details:", err);
      
      const errorMessage = err.message || "";
      
      if (errorMessage.includes("503") || err.status === 'UNAVAILABLE') {
        setError("AI 服务器目前非常繁忙（503），请稍候 30 秒再次尝试。");
      } else if (errorMessage.includes("SAFETY")) {
        setError("内容不符合安全规范，请尝试修改描述词。");
      } else {
        setError("生成失败，请检查网络连接或稍后再试。");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadImage = (url: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `furniture-scene-${Date.now()}.png`;
    link.click();
  };

  const latestBatch = generatedImages.slice(0, 2);

  return (
    <div className="min-h-screen text-slate-900 selection:bg-indigo-100 selection:text-indigo-900">
      <header className="px-6 py-4">
        <div className="max-w-7xl mx-auto glass-panel px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-black p-2 rounded-xl shadow-lg shadow-black/10">
              <Sparkles className="text-white w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-black tracking-tight leading-none">家具AI影棚</span>
              <span className="label-caps mt-0.5">Furniture AI Studio</span>
            </div>
          </div>
          <div className="hidden md:flex items-center space-x-6">
            <div className="text-xs font-bold text-slate-700 bg-white/70 px-3 py-1.5 rounded-xl">积分 {platform.credits}</div>
            <button onClick={platform.onBack} className="btn-secondary !py-2 !px-4 !text-[11px]">返回平台</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 pt-6 pb-12 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Step-by-Step Editor */}
        <div className="lg:col-span-4 space-y-6 overflow-y-auto max-h-[calc(100vh-140px)] pr-2 custom-scrollbar pb-10">
          
          {/* Section 1: Uploads */}
          <section className="glass-panel p-6 space-y-5">
            <h2 className="label-caps flex items-center gap-2">
              <Upload className="w-3.5 h-3.5" /> 01. 图片素材上传
            </h2>
            
            <div className="grid grid-cols-2 gap-4">
              {/* Product Upload */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">核心家具</label>
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative aspect-square glass-panel flex flex-col items-center justify-center cursor-pointer transition-all duration-500 group ${
                    sourceImage ? 'bg-white/80' : 'hover:bg-white/80'
                  }`}
                >
                  <input type="file" ref={fileInputRef} onChange={(e) => handleImageUpload(e)} className="hidden" accept="image/*" />
                  {sourceImage ? (
                    <img src={sourceImage} alt="Source" className="w-full h-full object-contain p-3 rounded-3xl" />
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                        <ImageIcon className="w-5 h-5 text-slate-400" />
                      </div>
                      <p className="text-[10px] text-slate-500 font-bold text-center px-2">上传产品</p>
                    </>
                  )}
                </div>
              </div>

              {/* Reference Style Upload */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">风格参考</label>
                <div 
                  onClick={() => refStyleInputRef.current?.click()}
                  className={`relative aspect-square glass-panel flex flex-col items-center justify-center cursor-pointer transition-all duration-500 group ${
                    referenceStyleImage ? 'bg-amber-50/40' : 'hover:bg-white/80'
                  }`}
                >
                  <input type="file" ref={refStyleInputRef} onChange={(e) => handleImageUpload(e, true)} className="hidden" accept="image/*" />
                  {referenceStyleImage ? (
                    <div className="relative w-full h-full p-1">
                      <img src={referenceStyleImage} alt="Ref" className="w-full h-full object-cover rounded-[1.5rem]" />
                      <button 
                        onClick={(e) => { e.stopPropagation(); setReferenceStyleImage(null); }}
                        className="absolute -top-2 -right-2 bg-black text-white p-1.5 rounded-full shadow-xl hover:scale-110 transition-transform"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                        <Palette className="w-5 h-5 text-slate-400" />
                      </div>
                      <p className="text-[10px] text-slate-500 font-bold text-center px-2">风格参考</p>
                    </>
                  )}
                </div>
              </div>
            </div>
            {referenceStyleImage && (
              <div className="flex items-center gap-3 p-3 bg-amber-50/40 backdrop-blur-sm rounded-2xl border border-amber-200/50 animate-in fade-in zoom-in-95">
                <Info className="w-4 h-4 text-amber-600" />
                <span className="text-[10px] font-bold text-amber-800 leading-tight">已开启“按图生图”，预设模板将作为辅助描述。</span>
              </div>
            )}
          </section>

          {/* Section 2: Quick Styles */}
          <section className="glass-panel p-6">
            <h2 className="label-caps mb-5 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" /> 02. 预设氛围模板
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {STYLE_OPTIONS.map((style) => (
                <button
                  key={style.id}
                  onClick={() => setSelectedStyle(style.id)}
                  className={`flex flex-col items-center p-3 rounded-2xl border transition-all duration-300 ${
                    selectedStyle === style.id 
                      ? 'bg-black text-white border-black shadow-lg shadow-black/10 scale-105' 
                      : 'bg-white/40 border-white/40 hover:bg-white/60 hover:scale-102'
                  }`}
                >
                  <StyleIcon name={style.icon} className={`w-5 h-5 mb-2 ${selectedStyle === style.id ? 'text-white' : 'text-slate-400'}`} />
                  <span className={`text-[10px] font-bold truncate w-full text-center ${selectedStyle === style.id ? 'text-white' : 'text-slate-600'}`}>
                    {style.name}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* Section 3: Professional Prompt Editor */}
          <section className="glass-panel p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="label-caps flex items-center gap-2">
                <Wand2 className="w-3.5 h-3.5" /> 03. 自定义提示词
              </h2>
              <button 
                onClick={() => setShowPromptEditor(!showPromptEditor)}
                className="text-[10px] font-bold text-black hover:underline"
              >
                {showPromptEditor ? "收起" : "展开"}
              </button>
            </div>
            
            {showPromptEditor && (
              <div className="space-y-5 animate-in slide-in-from-top-2 duration-500">
                <textarea 
                  value={promptOverride}
                  onChange={(e) => setPromptOverride(e.target.value)}
                  placeholder="在这里自由编辑您的创意..."
                  className="w-full h-32 glass-input text-xs font-medium leading-relaxed resize-none"
                />
                
                <div className="space-y-3">
                  <span className="label-caps block opacity-60">常用增强关键词</span>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTED_KEYWORDS.map(k => (
                      <button 
                        key={k}
                        onClick={() => addKeyword(k)}
                        className="px-3 py-1.5 glass-panel !rounded-xl text-slate-600 hover:bg-black hover:text-white hover:border-black transition-all text-[10px] font-bold flex items-center gap-1.5"
                      >
                        <Plus className="w-2.5 h-2.5" /> {k}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Section 4: Output Settings */}
          <section className="glass-panel p-6 space-y-6">
             <div className="flex items-center justify-between">
               <h2 className="label-caps flex items-center gap-2">
                  <Settings2 className="w-3.5 h-3.5" /> 04. 输出配置
               </h2>
               {(imageSize === '2K' || imageSize === '4K') && (
                 <a 
                   href="https://ai.google.dev/gemini-api/docs/billing" 
                   target="_blank" 
                   rel="noopener noreferrer"
                   className="text-[9px] font-bold text-blue-600 flex items-center gap-1 hover:underline"
                 >
                   <ExternalLink className="w-2.5 h-2.5" /> 计费文档
                 </a>
               )}
             </div>

             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="label-caps opacity-60">输出比例</label>
                  <select 
                    value={aspectRatio} 
                    onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                    className="w-full glass-input text-xs font-bold cursor-pointer"
                  >
                    {ASPECT_RATIOS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="label-caps opacity-60">分辨率</label>
                  <select 
                    value={imageSize} 
                    onChange={(e) => setImageSize(e.target.value as ImageSize)}
                    className="w-full glass-input text-xs font-bold cursor-pointer"
                  >
                    <option value="2K">2K (高清)</option>
                    <option value="4K">4K (超清)</option>
                  </select>
                </div>
                <div className="space-y-2 col-span-2">
                  <label className="label-caps opacity-60">添加模特</label>
                  <button 
                    onClick={() => setWithModel(!withModel)}
                    className={`w-full py-3 rounded-2xl text-xs font-bold border transition-all duration-300 ${
                      withModel ? 'bg-black border-black text-white shadow-lg shadow-black/10' : 'bg-white/40 border-white/40 text-slate-400'
                    }`}
                  >
                    {withModel ? '已开启模特' : '不含人物'}
                  </button>
                </div>

                {withModel && (
                  <div className="col-span-2 grid grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-300">
                    <div className="space-y-2">
                      <label className="label-caps opacity-60">模特种族</label>
                      <select 
                        value={modelEthnicity} 
                        onChange={(e) => setModelEthnicity(e.target.value as ModelEthnicity)}
                        className="w-full glass-input text-xs font-bold cursor-pointer"
                      >
                        <option value="ASIAN">亚洲面孔</option>
                        <option value="WESTERN">欧美面孔</option>
                        <option value="INTERNATIONAL">国际化面孔</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="label-caps opacity-60">模特年龄</label>
                      <select 
                        value={modelAge} 
                        onChange={(e) => setModelAge(e.target.value as ModelAge)}
                        className="w-full glass-input text-xs font-bold cursor-pointer"
                      >
                        <option value="YOUNG">青年模特</option>
                        <option value="MIDDLE_AGED">中年模特</option>
                      </select>
                    </div>
                  </div>
                )}
             </div>
          </section>

          <button
            onClick={handleGenerate}
            disabled={isGenerating || !sourceImage}
            className={`w-full py-5 btn-primary !rounded-3xl text-lg flex items-center justify-center gap-3 disabled:bg-slate-200 disabled:text-slate-400 disabled:scale-100 disabled:shadow-none`}
          >
            {isGenerating ? (
              <div className="flex items-center gap-3">
                <RefreshCcw className="w-5 h-5 animate-spin" />
                <span className="text-sm font-bold">AI 正全力计算中...</span>
              </div>
            ) : (
              <>
                <Zap className="w-5 h-5 fill-current" />
                <span className="font-black">立即生成双重场景</span>
              </>
            )}
          </button>
          <p className="text-center text-[10px] font-bold text-slate-500 tracking-wider">生成成功后扣费 {generationFee} 积分，失败不扣费</p>

          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-600 text-sm font-bold shadow-sm animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Studio Canvas */}
        <div className="lg:col-span-8 space-y-8 flex flex-col">
          <div className="glass-panel p-8 flex-grow min-h-[600px] flex flex-col">
            <div className="flex items-center justify-between mb-8 pb-6 border-b border-white/40">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl glass-panel flex items-center justify-center bg-white/80">
                   <ImageIcon className="w-6 h-6 text-black" />
                </div>
                <div>
                  <h2 className="text-2xl font-black tracking-tight leading-none">创作实验室</h2>
                  <p className="label-caps mt-1 opacity-60">Digital Rendering Studio</p>
                </div>
              </div>
              {latestBatch.length > 0 && (
                <div className="flex gap-3">
                   <button 
                    onClick={() => downloadImage(latestBatch[0].url)}
                    className="btn-secondary !py-2 !px-4 !text-[10px] flex items-center gap-2"
                  >
                    <Download className="w-3.5 h-3.5" />
                    下载图1
                  </button>
                  <button 
                    onClick={() => downloadImage(latestBatch[1]?.url || latestBatch[0].url)}
                    className="btn-primary !py-2 !px-4 !text-[10px] flex items-center gap-2"
                  >
                    <Download className="w-3.5 h-3.5" />
                    下载图2
                  </button>
                </div>
              )}
            </div>

            <div className="flex-grow flex items-center justify-center bg-white/20 rounded-[2.5rem] border border-white/40 relative overflow-hidden group">
              {isGenerating ? (
                <div className="flex flex-col items-center text-center max-w-sm px-8 animate-float">
                  <div className="relative w-32 h-32 mb-10">
                    <div className="absolute inset-0 border-[4px] border-white/40 rounded-full" />
                    <div className="absolute inset-0 border-[4px] border-black border-t-transparent rounded-full animate-spin" />
                    <Wand2 className="absolute inset-0 m-auto w-12 h-12 text-black animate-pulse" />
                  </div>
                  <h3 className="text-2xl font-black">正在生成双重精美场景...</h3>
                  <p className="text-sm text-slate-500 mt-4 leading-relaxed font-medium">
                    AI 正在为您解析提示词，同时为您匹配两种不同的光影构图方案。
                  </p>
                </div>
              ) : latestBatch.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full h-full p-8 items-center">
                  {latestBatch.map((img, idx) => (
                    <div key={img.id} className="relative group/img h-full flex items-center justify-center glass-panel !rounded-3xl overflow-hidden bg-white/40 hover:bg-white/60 transition-all duration-500">
                       <img 
                        src={img.url} 
                        alt={`Result ${idx + 1}`} 
                        className="max-w-full max-h-full object-contain" 
                      />
                      <div className="absolute top-5 left-5 glass-panel !rounded-xl px-3 py-1.5 text-[10px] font-black text-black">
                        方案 {idx + 1}
                      </div>
                      <div className="absolute top-5 right-5 flex gap-2 opacity-0 group-hover/img:opacity-100 transition-all duration-300">
                        <button 
                          onClick={() => setPreviewImage(img.url)}
                          className="bg-white/80 backdrop-blur-md text-black p-2.5 rounded-xl shadow-xl hover:scale-110 transition-transform"
                        >
                          <Maximize className="w-4 h-4" />
                        </button>
                      </div>
                      <button 
                        onClick={() => downloadImage(img.url)}
                        className="absolute bottom-5 right-5 bg-black text-white p-3 rounded-2xl shadow-2xl opacity-0 group-hover/img:opacity-100 transition-all duration-300 hover:scale-110"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center group p-12">
                  <div className="w-32 h-32 glass-panel flex items-center justify-center mx-auto mb-10 group-hover:rotate-12 group-hover:scale-110 transition-all duration-700 bg-white/80">
                    <Sparkles className="w-14 h-14 text-slate-200" />
                  </div>
                  <h3 className="text-2xl font-black text-slate-400">灵感由此开始</h3>
                  <p className="text-sm text-slate-400 mt-4 font-bold tracking-wide">点击生成，AI 将一次性为您提供两款高水准场景图</p>
                </div>
              )}
            </div>
          </div>

          {/* History Gallery */}
          {generatedImages.length > 0 && (
            <div className="animate-in slide-in-from-bottom duration-1000">
              <div className="flex items-center justify-between mb-5 px-4">
                 <h2 className="label-caps flex items-center gap-2">
                    <History className="w-3.5 h-3.5" /> 历史创作记录
                 </h2>
                 <span className="text-[10px] font-bold text-slate-400">共生成 {generatedImages.length} 个版本</span>
              </div>
              <div className="flex gap-6 overflow-x-auto pb-6 custom-scrollbar snap-x px-4">
                {generatedImages.map((img) => (
                  <div 
                    key={img.id} 
                    onClick={() => {
                      setGeneratedImages(prev => {
                        const filtered = prev.filter(i => i.id !== img.id);
                        return [img, ...filtered];
                      });
                    }}
                    className="flex-shrink-0 w-40 h-40 relative glass-panel !rounded-3xl overflow-hidden p-1 cursor-pointer hover:-translate-y-3 transition-all duration-500 group snap-start"
                  >
                    <img src={img.url} alt="History" className="w-full h-full object-cover rounded-[1.5rem]" />
                    <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                       <Maximize className="text-white w-8 h-8" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Image Preview Modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10 animate-in fade-in duration-300"
          onClick={() => setPreviewImage(null)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" />
          <div 
            className="relative max-w-5xl w-full glass-panel !bg-white/10 !border-white/20 p-2 overflow-hidden animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => setPreviewImage(null)}
              className="absolute top-6 right-6 z-10 bg-white/20 hover:bg-white/40 text-white p-3 rounded-2xl backdrop-blur-md transition-all"
            >
              <X className="w-6 h-6" />
            </button>
            <img 
              src={previewImage} 
              alt="Preview" 
              className="w-full h-auto max-h-[85vh] object-contain rounded-3xl shadow-2xl" 
            />
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4">
              <button 
                onClick={() => downloadImage(previewImage)}
                className="btn-primary flex items-center gap-3 px-8"
              >
                <Download className="w-5 h-5" />
                <span className="font-bold">下载此方案</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
  );
};

export default LuxuryFurnitureAiStudio2App;
