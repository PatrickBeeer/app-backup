
import React, { useState, useRef } from 'react';
import { AppProps } from '../../types';
import { PRESET_STYLES } from './constants';
import { StyleConfig } from './types';
import PreviewDashboard from './components/PreviewDashboard';
import { generateNewStyle, extractStyleFromImage } from './services/geminiService';
import { 
  Copy, 
  Palette, 
  Check, 
  Terminal,
  ImagePlus,
  Loader2,
  X,
  MousePointer2,
  UploadCloud
} from 'lucide-react';

const APP_ID = 'ui-style-studio-2';

const MAX_UPLOAD_EDGE = 1440;
const JPEG_QUALITY = 0.82;

const loadImageFromDataUrl = (dataUrl: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片读取失败'));
    img.src = dataUrl;
  });

const getBase64FromDataUrl = (dataUrl: string): string => {
  const parts = dataUrl.split(',');
  return parts[1] || '';
};

const compressImageForVision = async (dataUrl: string): Promise<{ base64: string; mimeType: string }> => {
  const image = await loadImageFromDataUrl(dataUrl);
  const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = longestSide > MAX_UPLOAD_EDGE ? MAX_UPLOAD_EDGE / longestSide : 1;

  const targetWidth = Math.max(1, Math.round(image.naturalWidth * scale));
  const targetHeight = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('无法初始化画布');
  }
  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const compressedDataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  return {
    base64: getBase64FromDataUrl(compressedDataUrl),
    mimeType: 'image/jpeg'
  };
};

export const UiStyleStudio2App: React.FC<AppProps> = ({ platform, costs }) => {
  const [selectedStyle, setSelectedStyle] = useState<StyleConfig>(PRESET_STYLES[0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(selectedStyle.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerateCustom = async () => {
    if (!customInput.trim()) return;
    const fee = (costs && (costs as any).GENERATE_STYLE) ?? 10;
    await platform.refreshCredits();
    if (!platform.checkBalance(fee)) {
      return;
    }
    setIsGenerating(true);
    setError(null);
    const result = await generateNewStyle(customInput);
    
    const newStyle: StyleConfig = {
      ...PRESET_STYLES[0],
      id: `custom-${Date.now()}`,
      name: `AI: ${customInput.slice(0, 15)}...`,
      prompt: result || "生成失败",
      category: 'AI 自动生成' as any,
      description: "根据你的创意由 AI 实时生成的自定义风格。"
    };
    try {
      setSelectedStyle(newStyle);
      await platform.refreshCredits?.();
    } catch (e: any) {
      setError(e.message || '扣费失败');
    }
    setIsGenerating(false);
    setCustomInput('');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const sourceDataUrl = reader.result as string;
        setPreviewImage(sourceDataUrl);

        const fee = (costs && (costs as any).GENERATE_STYLE) ?? 10;
        await platform.refreshCredits();
        if (!platform.checkBalance(fee)) {
          return;
        }
        
        setIsExtracting(true);
        setError(null);

        let dna = null;
        try {
          const compressed = await compressImageForVision(sourceDataUrl);
          dna = await extractStyleFromImage(compressed.base64, compressed.mimeType);
        } catch (e: any) {
          setError(e?.message || '图片预处理失败');
        }
        
        if (dna) {
          const newStyle: StyleConfig = {
            id: `img-${Date.now()}`,
            name: `提取自: ${file.name.slice(0, 8)}`,
            category: '视觉 DNA 提取' as any,
            description: "已精确捕获参考图的配色、圆角及材质属性。",
            prompt: dna.prompt,
            visualSpecs: {
              backgroundClass: dna.theme === 'dark' ? 'bg-[#0a0a0b]' : 'bg-[#f8fafc]',
              containerClass: `${dna.theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-white/70 border-white'} ${dna.glassEffect ? 'backdrop-blur-xl' : ''} ${dna.borderRadius === 'full' ? 'rounded-[3rem]' : dna.borderRadius === 'xl' ? 'rounded-3xl' : 'rounded-lg'} border ${dna.shadow === 'soft' ? 'shadow-xl' : dna.shadow === 'hard' ? 'shadow-2xl' : 'shadow-none'} transition-all`,
              buttonClass: `rounded-full px-8 py-3.5 font-bold transition-all hover:opacity-90 active:scale-95 text-white text-base`,
              textTitleClass: `${dna.theme === 'dark' ? 'text-white' : 'text-slate-900'} font-black`,
              textContentClass: `${dna.theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`,
              accentColor: dna.primaryColor,
              inputClass: `${dna.theme === 'dark' ? 'bg-white/5 text-white' : 'bg-slate-100 text-slate-900'} rounded-2xl px-5 py-3 border-none outline-none text-sm`,
              iconColor: dna.primaryColor
            }
          };
          try {
            setSelectedStyle(newStyle);
            await platform.refreshCredits?.();
          } catch (e: any) {
            setError(e.message || '扣费失败');
          }
        }
        setIsExtracting(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const clearPreview = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col md:flex-row text-slate-900 antialiased font-['Inter']">
      {/* Left Panel - Control Center */}
      <div className="w-full md:w-[460px] h-screen overflow-y-auto bg-white p-10 z-20 shadow-[20px_0_40px_-15px_rgba(0,0,0,0.03)] border-r border-slate-100 shrink-0">
        <header className="mb-12">
          <div className="flex items-center gap-4 mb-3">
            <div className="p-3 bg-indigo-600 rounded-[18px] text-white shadow-xl shadow-indigo-100">
              <Palette size={26} strokeWidth={2.5} />
            </div>
            <h1 className="text-2xl font-black tracking-tighter">UI 风格工作室</h1>
          </div>
          <p className="text-sm text-slate-400 font-bold uppercase tracking-[0.15em]">Aesthetic Reconstruction</p>
        </header>

        <div className="space-y-12">
          {/* Step 1: Input Sources */}
          <section>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-6 h-6 rounded-full bg-slate-900 flex items-center justify-center text-xs font-black text-white">1</div>
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">上传参考图 / Reference</h2>
            </div>
            
            <div 
              onClick={triggerFileUpload}
              className={`group relative w-full h-44 border-2 border-dashed rounded-[32px] flex flex-col items-center justify-center cursor-pointer transition-all duration-500 ${
                previewImage ? 'border-indigo-400 bg-indigo-50/10' : 'border-slate-200 bg-slate-50 hover:border-indigo-400 hover:bg-white hover:shadow-2xl hover:shadow-indigo-100'
              }`}
            >
              <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
              {isExtracting ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="relative">
                    <Loader2 size={32} className="text-indigo-600 animate-spin" />
                  </div>
                  <span className="text-xs font-black text-indigo-600 uppercase tracking-widest">正在智能解析...</span>
                </div>
              ) : previewImage ? (
                <div className="relative w-full h-full p-3">
                  <img src={previewImage} alt="Preview" className="w-full h-full object-cover rounded-[24px]" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all rounded-[24px] backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-2">
                      <UploadCloud size={24} className="text-white" />
                      <span className="text-white text-xs font-black uppercase tracking-widest">更换截图</span>
                    </div>
                  </div>
                  <button onClick={clearPreview} className="absolute -top-2 -right-2 p-2 bg-white rounded-full shadow-xl border border-slate-100 hover:scale-110 transition-transform">
                    <X size={14} className="text-slate-500" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100 mb-4 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
                    <ImagePlus size={28} className="text-indigo-600" />
                  </div>
                  <span className="text-xs font-black text-slate-500 uppercase tracking-[0.1em] text-center px-8 leading-relaxed">
                    拖拽或点击上传 UI 截图<br/>
                    <span className="text-[10px] text-slate-300">AI 将同步改变右侧画布审美</span>
                  </span>
                </>
              )}
            </div>
          </section>

          {/* Step 2: Preset Library */}
          <section>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-black text-slate-400 border border-slate-200">2</div>
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">方案预设 / Presets</h2>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {PRESET_STYLES.map((style) => (
                <button
                  key={style.id}
                  onClick={() => setSelectedStyle(style)}
                  className={`group flex items-center gap-5 p-5 rounded-[28px] transition-all border-2 ${
                    selectedStyle.id === style.id 
                      ? 'border-indigo-600 bg-indigo-50/50 shadow-lg shadow-indigo-100/50' 
                      : 'border-transparent bg-slate-50 hover:bg-slate-100'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-2xl shrink-0 flex items-center justify-center transition-all ${
                    selectedStyle.id === style.id ? 'bg-indigo-600 text-white scale-110 shadow-lg' : 'bg-white text-slate-400 shadow-sm'
                  }`}>
                    <MousePointer2 size={20} className={selectedStyle.id === style.id ? 'rotate-12' : ''} />
                  </div>
                  <div className="text-left overflow-hidden">
                    <h3 className="text-sm font-bold text-slate-900 truncate">{style.name}</h3>
                    <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-1 opacity-70">{style.category}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Global Actions */}
        <div className="mt-12 sticky bottom-0 bg-white pt-8 pb-4 border-t border-slate-100">
          <button 
            onClick={handleCopyPrompt}
            className="w-full flex items-center justify-center gap-3 py-5 bg-slate-900 text-white rounded-[24px] font-black text-xs uppercase tracking-[0.2em] hover:bg-black hover:shadow-2xl transition-all active:scale-95 shadow-xl shadow-slate-200"
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
            {copied ? '已复制到剪贴板' : '复制重构提示词'}
          </button>
          {error && (
            <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs font-medium">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Canvas & Output */}
      <div className="flex-1 h-screen overflow-y-auto bg-[#F8FAFC] flex flex-col p-8 lg:p-14">
        {/* Step Indicator Header */}
        <div className="flex items-center gap-8 mb-10 px-4 max-w-[1600px] mx-auto w-full">
           <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-black shadow-lg">3</div>
             <span className="text-xs font-black text-slate-900 uppercase tracking-[0.2em]">实时美学画布 / Canvas</span>
           </div>
           <div className="h-px bg-slate-200 flex-1"></div>
           <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-400 flex items-center justify-center text-xs font-black">4</div>
             <span className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">重构规范 / Specs</span>
           </div>
        </div>
        
        {/* Main Canvas View */}
        <div className="max-w-[1600px] mx-auto w-full rounded-[60px] overflow-hidden shadow-[0_60px_120px_-30px_rgba(0,0,0,0.1)] bg-white border-[12px] border-white mb-12 group relative min-h-[700px]">
          <PreviewDashboard style={selectedStyle} isLoading={isExtracting} />
        </div>

        {/* Intelligence Area */}
        <div className="max-w-[1200px] mx-auto w-full pb-20">
          {/* Prompt Result */}
          <div className="bg-white rounded-[48px] p-12 shadow-sm border border-slate-100 flex flex-col">
            <div className="flex items-center justify-between mb-10">
              <div className="flex items-center gap-4">
                <Terminal size={24} className="text-indigo-600" />
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-900">核心提示词 / System Prompt</h3>
              </div>
              <button onClick={handleCopyPrompt} className="text-[11px] font-black text-white bg-indigo-600 px-6 py-2.5 rounded-full transition-all hover:shadow-xl hover:scale-105 active:scale-95 shadow-indigo-100">
                {copied ? 'COPIED' : 'COPY'}
              </button>
            </div>
            <div className="bg-slate-50 rounded-[32px] p-10 border border-slate-50 flex-1 min-h-[300px] custom-scrollbar">
              <code className="text-sm text-slate-600 whitespace-pre-wrap block leading-8 font-medium">
                {selectedStyle.prompt}
              </code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UiStyleStudio2App;
