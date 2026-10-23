
import React, { useState, useRef } from 'react';
import { generateVideoScript, VideoStyle } from './services/geminiService';
import { AppStatus } from './types';
import { AppProps } from '../../types';
import { 
  Sparkles, 
  Copy, 
  Check, 
  Film, 
  RefreshCcw, 
  ArrowRight, 
  Upload, 
  X, 
  ChevronDown, 
  ChevronUp,
  Camera,
  Settings2,
  Zap,
  MonitorPlay,
  RotateCcw,
  BookOpen
} from 'lucide-react';

import './index.css';
const DEFAULT_COST = 10;

export const Seedance20ScriptMasterApp: React.FC<AppProps> = ({ platform, costs }) => {
  const generationFee = costs?.GENERATE_SCRIPT ?? DEFAULT_COST;
  const [productName, setProductName] = useState('');
  const [requirements, setRequirements] = useState('');
  const [productImage, setProductImage] = useState<string | null>(null);
  const [style, setStyle] = useState<VideoStyle>('PROFESSIONAL');
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [result, setResult] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setProductImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!productName.trim() && !productImage) || status === AppStatus.GENERATING) return;

    await platform.refreshCredits();

    if (!platform.checkBalance(generationFee)) {
      return;
    }

    setStatus(AppStatus.GENERATING);
    setResult('');
    
    try {
      const script = await generateVideoScript(productName, productImage || undefined, requirements, style);
      await platform.refreshCredits?.();
      setResult(script);
      setStatus(AppStatus.SUCCESS);
    } catch (error) {
      setStatus(AppStatus.ERROR);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8 selection:bg-zinc-700 pb-20">
      {/* Header */}
      <header className="w-full max-w-xl mb-10 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-panel text-zinc-400 text-xs mb-4">
          <Sparkles size={12} className="text-amber-400" />
          <span>Seedance 2.0 官方导演协作系统</span>
        </div>
        <h1 className="text-3xl md:text-5xl font-sans font-black text-black mb-3">
          电商视频·脚本大师
        </h1>
        <p className="text-zinc-500 text-sm md:text-base px-6">
          上传产品图，AI 即可根据您选择的风格自动导演 15s 高转化脚本。
        </p>
        <p className="text-zinc-500 text-xs mt-3">生成成功后扣费 {generationFee} 积分，失败不扣费</p>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-xl flex flex-col gap-6">
        <section className="glass-panel rounded-[2.5rem] p-4 md:p-6 shadow-2xl relative overflow-hidden">
          <form onSubmit={handleGenerate} className="flex flex-col gap-6">
            
            {/* Primary Action: Image Upload */}
            <div className="relative group">
              {!productImage ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full aspect-[4/3] rounded-[2rem] border-2 border-dashed border-zinc-800/70 bg-zinc-900/20 flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-zinc-900/30 hover:border-zinc-700 transition-all active:scale-[0.98]"
                >
                  <div className="p-5 rounded-full bg-zinc-800 text-zinc-400 group-hover:scale-110 group-hover:bg-zinc-700 transition-all shadow-lg">
                    <Camera size={32} />
                  </div>
                  <div className="text-center">
                    <p className="text-zinc-800 font-bold text-lg">点此上传产品图</p>
                    <p className="text-zinc-500 text-sm mt-1">支持图片识别，无需繁琐输入</p>
                  </div>
                </div>
              ) : (
                <div className="relative w-full aspect-[4/3] rounded-[2rem] overflow-hidden border border-zinc-700 group shadow-2xl">
                  <img src={productImage} alt="Product" className="w-full h-full object-cover" />
                  <div className="absolute top-4 right-4 z-20">
                    <button 
                      type="button"
                      onClick={() => setProductImage(null)}
                      className="p-2 bg-black/60 hover:bg-red-500/80 rounded-full text-white backdrop-blur-md transition-all"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <p className="absolute bottom-4 left-6 text-white font-medium flex items-center gap-2 drop-shadow-lg">
                    <Check size={16} className="text-green-400" /> 已锁定视觉参考
                  </p>
                </div>
              )}
              <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
            </div>

            {/* Style Selection Chips */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">选择脚本风格</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setStyle('PROFESSIONAL')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                    style === 'PROFESSIONAL' 
                      ? 'bg-indigo-500/10 border-indigo-400/30 text-indigo-400 shadow-lg' 
                      : 'bg-zinc-900/15 border-zinc-800/80 text-zinc-500 hover:border-zinc-700'
                  }`}
                >
                  <MonitorPlay size={20} />
                  <span className="text-xs font-bold">电影感广告片</span>
                  <span className="text-[10px] opacity-80 text-center px-1 leading-tight">极清画质·极致微距·平滑运镜</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStyle('KOC_HIGH_ENERGY')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                    style === 'KOC_HIGH_ENERGY' 
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-500 shadow-lg' 
                      : 'bg-zinc-900/15 border-zinc-800/80 text-zinc-500 hover:border-zinc-700'
                  }`}
                >
                  <Zap size={20} />
                  <span className="text-xs font-bold">真人场景带货</span>
                  <span className="text-[10px] opacity-60 text-center px-1 leading-tight">对口型·食欲感·感官刺激</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStyle('PLOT_TWIST')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                    style === 'PLOT_TWIST' 
                    ? 'bg-purple-500/10 border-purple-500/20 text-purple-500 shadow-lg' 
                      : 'bg-zinc-900/15 border-zinc-800/80 text-zinc-500 hover:border-zinc-700'
                  }`}
                >
                  <RotateCcw size={20} />
                  <span className="text-xs font-bold">剧情反转钩子</span>
                  <span className="text-[10px] opacity-60 text-center px-1 leading-tight">神级反转·痛点解决·强力吸睛</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStyle('KNOWLEDGE_SHARING')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                    style === 'KNOWLEDGE_SHARING' 
                    ? 'bg-blue-500/10 border-blue-500/20 text-blue-500 shadow-lg' 
                      : 'bg-zinc-900/15 border-zinc-800/80 text-zinc-500 hover:border-zinc-700'
                  }`}
                >
                  <BookOpen size={20} />
                  <span className="text-xs font-bold">专业知识科普</span>
                  <span className="text-[10px] opacity-60 text-center px-1 leading-tight">干货拆解·实测对比·建立信任</span>
                </button>
              </div>
            </div>

            {/* Advanced Options Toggle */}
            <div className="px-1">
              <button 
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-zinc-500 text-xs hover:text-zinc-300 transition-colors py-1"
              >
                <Settings2 size={12} />
                {showAdvanced ? '隐藏高级选项' : '我有特定共创需求 (如名称、台词等)'}
                {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>

              {showAdvanced && (
                <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 ml-1 uppercase">产品名称</label>
                    <input
                      type="text"
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      placeholder="指定产品全称..."
                      className="w-full bg-white border border-gray-300 rounded-xl py-3 px-4 text-sm text-black outline-none focus:border-gray-500 transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 ml-1 uppercase">深度共创要求</label>
                    <textarea
                      rows={2}
                      value={requirements}
                      onChange={(e) => setRequirements(e.target.value)}
                      placeholder="指定更多：如“主播需大口喝水”、“指定开场台词”、“背景在雪地”等。"
                      className="w-full bg-white border border-gray-300 rounded-xl py-3 px-4 text-sm text-black outline-none focus:border-gray-500 transition-all resize-none"
                    />
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={(!productName.trim() && !productImage) || status === AppStatus.GENERATING}
              className={`w-full py-5 rounded-[1.5rem] font-bold text-lg transition-all flex items-center justify-center gap-3 shadow-xl ${
                productImage || productName 
                ? 'bg-white text-black hover:bg-zinc-200' 
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              }`}
            >
              {status === AppStatus.GENERATING ? (
                <>
                  <RefreshCcw className="animate-spin" size={20} />
                  AI 导演排片中...
                </>
              ) : (
                <>
                  生成脚本方案
                  <ArrowRight size={20} />
                </>
              )}
            </button>
          </form>
        </section>

        {/* Result Area */}
        {(status === AppStatus.SUCCESS || status === AppStatus.GENERATING) && (
          <section className="animate-in fade-in slide-in-from-bottom-6 duration-700">
            <div className="glass-panel rounded-[2.5rem] p-1 overflow-hidden relative shadow-2xl">
              <div className="bg-zinc-900/95 rounded-[2.4rem] p-4 md:p-6 min-h-[450px]">
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-zinc-800/50">
                  <div className="flex items-center gap-2">
                    <Film size={18} className="text-zinc-500" />
                    <span className="text-xs font-bold text-zinc-400 tracking-widest uppercase">
                      {style === 'PROFESSIONAL' ? '导演场记单' : 'KOC 种草文案'}
                    </span>
                  </div>
                  {result && (
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(result);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-xs font-bold text-zinc-200 shadow-sm"
                    >
                      {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                      {copied ? '已复制' : '复制到即梦'}
                    </button>
                  )}
                </div>
                
                <div className="markdown-body text-zinc-300 text-xs md:text-sm leading-relaxed overflow-x-auto selection:bg-zinc-700/50">
                  {result ? (
                    <pre className="whitespace-pre-wrap font-sans text-zinc-300 text-xs md:text-sm leading-relaxed">{result}</pre>
                  ) : (
                    <p className="animate-pulse">AI 导演正在融合素材，构建视觉叙事...</p>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>


      <footer className="mt-auto pt-10 text-zinc-600 text-[10px] md:text-xs text-center px-8 flex flex-col gap-1">
        <span>脚本已适配 Seedance 2.0 模型结构 • 纵屏 9:16</span>
        <span className="opacity-50 uppercase tracking-tighter">Powered by Multi-modal AI Director</span>
      </footer>
    </div>
  );
};

export default Seedance20ScriptMasterApp;
