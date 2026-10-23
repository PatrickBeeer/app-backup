import React, { useState, useRef, useCallback } from 'react';
import { AppProps } from '../../types';
import { AppState, AnalysisResult } from './types';
import { analyzeCoverImage } from './services/geminiService';
import {
  Camera, Sparkles, Zap, Smartphone, Copy, Check, CheckCircle, AlertCircle, RefreshCcw,
  Target, Layers, Lightbulb, Info,
} from 'lucide-react';
const RED_GRADIENT = 'bg-gradient-to-br from-[#ff2442] to-[#ff4d6d]';

const Header: React.FC = () => (
  <header className="flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-md border-b sticky top-0 z-50">
    <div className="flex items-center gap-2">
      <div className={`w-9 h-9 ${RED_GRADIENT} rounded-xl flex items-center justify-center shadow-lg shadow-red-500/20`}>
        <Sparkles className="text-white w-5 h-5" />
      </div>
      <h1 className="text-xl font-bold tracking-tight text-gray-900">
        爆文封面<span className="text-[#ff2442]">逻辑拆解</span>
      </h1>
    </div>
  </header>
);

const SectionHeader: React.FC<{ icon: React.ReactNode; title: string; subtitle: string; colorClass?: string }> = ({
  icon, title, subtitle, colorClass = 'text-[#ff2442]',
}) => (
  <div className="mb-8">
    <div className="flex items-center gap-3 mb-2">
      <div className={`${colorClass} p-2 bg-current bg-opacity-10 rounded-xl`}>{icon}</div>
      <h2 className="text-2xl font-black text-gray-900 tracking-tight">{title}</h2>
    </div>
    <div className="h-1 w-12 bg-gray-100 rounded-full mb-2 ml-1" />
    <p className="text-sm font-medium text-gray-400 ml-1">{subtitle}</p>
  </div>
);

const CopyButton: React.FC<{ text: string; label?: string }> = ({ text, label = '复制咒语' }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!text) return;
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    try {
      textArea.focus();
      textArea.select();
      const success = navigator.clipboard && window.isSecureContext
        ? (await navigator.clipboard.writeText(text), true)
        : document.execCommand('copy');
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } finally {
      document.body.removeChild(textArea);
    }
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`flex items-center gap-2 text-xs font-bold px-5 py-2.5 rounded-full transition-all active:scale-95 shadow-sm ${copied ? 'bg-green-500 text-white' : 'bg-gray-900 text-white hover:bg-black'}`}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? '已复制' : label}
    </button>
  );
};

const LoadingState: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-32 px-6">
    <div className="relative mb-10">
      <div className="w-20 h-20 border-[6px] border-[#ff2442]/10 border-t-[#ff2442] rounded-full animate-spin" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[#ff2442] animate-pulse">
        <Target className="w-8 h-8" />
      </div>
    </div>
    <h3 className="text-2xl font-black text-gray-900 mb-3">深度扫描中...</h3>
    <div className="space-y-3 text-center">
      <p className="text-sm font-bold text-[#ff2442] animate-pulse">正在提取画面视觉钩子</p>
      <p className="text-sm font-medium text-gray-400">正在匹配小红书爆款内容模型</p>
    </div>
  </div>
);

export const XiaohongshuCoverBreakdownApp: React.FC<AppProps> = ({ platform, costs }) => {
  const cost = costs?.ANALYZE_COVER ?? 10;
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('请上传图片文件');
      return;
    }
    setState(AppState.UPLOADING);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setPreviewUrl(base64);
      setState(AppState.ANALYZING);
      setError(null);
      try {
        await platform.refreshCredits();
        if (!platform.checkBalance(cost)) {
          setState(AppState.IDLE);
          return;
        }

        const data = await analyzeCoverImage(base64);
        await platform.refreshCredits?.();
        setResult(data);
        setState(AppState.RESULT);
      } catch (err: any) {
        console.error(err);
        setError(err?.message || '分析过程中出现错误，请检查网络后重试。');
        setState(AppState.ERROR);
      }
    };
    reader.readAsDataURL(file);
  }, [platform, cost]);

  const reset = () => {
    setPreviewUrl(null);
    setResult(null);
    setState(AppState.IDLE);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] pb-32">
      <Header />
      <main className="max-w-5xl mx-auto px-4 pt-10">
        {state === AppState.IDLE && (
          <div className="flex flex-col items-center justify-center text-center mt-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 text-[#ff2442] rounded-full text-sm font-bold mb-8">
              <Zap className="w-4 h-4" /> 爆文黑客模式已开启
            </div>
            <h2 className="text-5xl font-black text-gray-900 mb-6 tracking-tight leading-tight">
              把任何爆款封面<br />变成你的<span className="text-[#ff2442]">私人模板</span>
            </h2>
            <p className="text-gray-400 max-w-xl mb-12 text-lg font-medium leading-relaxed">
              上传图片，AI 将为你拆解它的“流量密码”，并生成手机拍摄教程与 AI 绘图指令。
            </p>
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
              onClick={() => fileInputRef.current?.click()}
              className={`w-full max-w-2xl aspect-[16/9] border-[3px] border-dashed rounded-[3rem] transition-all cursor-pointer flex flex-col items-center justify-center gap-6 group
                ${isDragging ? 'border-[#ff2442] bg-red-50/50 scale-[1.02] shadow-2xl shadow-red-500/10' : 'border-gray-200 bg-white hover:border-[#ff2442]/40 hover:shadow-xl hover:shadow-gray-200/50'}`}
            >
              <div className={`w-24 h-24 rounded-[2rem] flex items-center justify-center shadow-2xl transition-all duration-500
                ${isDragging ? `${RED_GRADIENT} text-white scale-110 rotate-6` : 'bg-gray-50 text-gray-300 group-hover:bg-red-50 group-hover:text-[#ff2442] group-hover:-rotate-3'}`}
              >
                <Camera className="w-10 h-10" />
              </div>
              <div className="space-y-2">
                <p className="text-2xl font-black text-gray-900">{isDragging ? '识别中...' : '拖拽图片到这里'}</p>
                <p className="text-sm text-gray-400 font-bold tracking-widest uppercase">OR CLICK TO UPLOAD</p>
              </div>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
          </div>
        )}

        {(state === AppState.ANALYZING || state === AppState.UPLOADING) && <LoadingState />}

        {state === AppState.ERROR && (
          <div className="flex flex-col items-center justify-center text-center py-24 bg-white rounded-[3rem] shadow-xl border border-red-50">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6 text-red-500">
              <AlertCircle className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-2">出错了</h3>
            <p className="text-gray-400 font-medium mb-10 px-10">{error}</p>
            <button type="button" onClick={reset} className="flex items-center gap-2 px-10 py-5 bg-gray-900 text-white rounded-full font-bold hover:bg-black transition-all active:scale-95 shadow-lg">
              <RefreshCcw className="w-5 h-5" /> 重新上传
            </button>
          </div>
        )}

        {state === AppState.RESULT && result && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-4">
              <div className="sticky top-28 space-y-6">
                <div className="group relative bg-white p-3 rounded-[2.5rem] shadow-2xl shadow-gray-200/60 ring-1 ring-gray-100">
                  <div className="relative aspect-[3/4] rounded-[2rem] overflow-hidden">
                    <img src={previewUrl!} alt="Original Reference" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute bottom-6 left-6 text-white font-bold text-sm tracking-wide opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all">参考原图</div>
                  </div>
                  <div className={`absolute -top-3 -right-3 w-12 h-12 ${RED_GRADIENT} rounded-2xl flex items-center justify-center text-white shadow-xl rotate-12`}>
                    <Target className="w-6 h-6" />
                  </div>
                </div>
                <div className="bg-gray-900 rounded-[2rem] p-6 text-white shadow-xl overflow-hidden relative">
                  <div className="relative z-10">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Total Score</p>
                    <p className="text-3xl font-black mb-1 text-white flex items-baseline gap-2">98 <span className="text-sm font-medium text-gray-500">爆款指数</span></p>
                    <p className="text-sm text-gray-400 leading-relaxed italic">"这张封面的视觉平衡感极佳，非常适合作为模版复刻。"</p>
                  </div>
                  <Zap className="absolute -bottom-6 -right-6 w-32 h-32 text-white/5" />
                </div>
                <button type="button" onClick={reset} className="w-full flex items-center justify-center gap-3 py-5 bg-white border border-gray-100 text-gray-900 rounded-[2rem] font-bold hover:bg-gray-50 transition-all shadow-sm">
                  <RefreshCcw className="w-5 h-5" /> 换一张试试
                </button>
              </div>
            </div>
            <div className="lg:col-span-8 space-y-12">
              <section className="bg-white rounded-[3rem] p-10 shadow-xl shadow-gray-200/40 border border-gray-50">
                <SectionHeader icon={<Zap className="w-7 h-7" />} title="毒舌诊断" subtitle="直击痛点，拆解这张图为什么能带起流量" />
                <div className="space-y-8">
                  <div className="p-7 bg-red-50/50 rounded-3xl border border-red-100/30 relative">
                    <p className="text-sm font-black text-[#ff2442] mb-3 tracking-widest flex items-center gap-2 uppercase"><Target className="w-4 h-4" /> 核心视觉钩子</p>
                    <p className="text-gray-800 text-lg font-bold leading-relaxed">{result.toxicDiagnosis.whyViral}</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-[#f8fcf9] p-7 rounded-3xl border border-green-100/50">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-green-200"><Check className="w-5 h-5" /></div>
                        <p className="font-black text-gray-900">1:1 复刻核心</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {result.toxicDiagnosis.mustCopy.map((item, i) => (
                          <span key={i} className="px-3.5 py-1.5 bg-white border border-green-200 text-green-700 text-xs font-bold rounded-lg shadow-sm"># {item}</span>
                        ))}
                      </div>
                    </div>
                    <div className="bg-[#fff9f2] p-7 rounded-3xl border border-orange-100/50">
                      <div className="flex items-center gap-2 mb-4 text-orange-600">
                        <AlertCircle className="w-8 h-8" />
                        <p className="font-black text-gray-900">细节优化建议</p>
                      </div>
                      <p className="text-sm text-gray-600 font-medium leading-relaxed italic">{result.toxicDiagnosis.optimization}</p>
                    </div>
                  </div>
                </div>
              </section>
              <section className="bg-white rounded-[3rem] p-10 shadow-xl shadow-gray-200/40 border border-gray-50 overflow-hidden relative">
                <div className="absolute top-0 right-0 w-48 h-48 bg-blue-50/50 blur-3xl -z-0" />
                <div className="relative z-10">
                  <SectionHeader icon={<Smartphone className="w-7 h-7" />} title="手机实拍 SOP" subtitle="低门槛复刻方案，小白也能拍出高级感" colorClass="text-blue-500" />
                  <div className="space-y-8">
                    <div className="flex flex-wrap gap-3">
                      {result.mobileSop.props.map((prop, i) => (
                        <div key={i} className="px-4 py-2 bg-blue-50 text-blue-700 rounded-2xl text-xs font-black flex items-center gap-2"><Layers className="w-3.5 h-3.5" /> {prop}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      {result.mobileSop.steps.map((step, i) => (
                        <div key={i} className="group flex items-start gap-6 bg-gray-50 p-6 rounded-3xl hover:bg-white hover:shadow-xl transition-all duration-300 border border-transparent hover:border-blue-50">
                          <div className="w-10 h-10 bg-white shadow-md text-blue-500 flex items-center justify-center rounded-xl font-black shrink-0 transition-transform group-hover:scale-110">{i + 1}</div>
                          <p className="text-gray-800 font-bold leading-relaxed pt-2">{step}</p>
                        </div>
                      ))}
                    </div>
                    <div className="bg-blue-600 p-6 rounded-[2rem] text-white flex items-center justify-between shadow-xl shadow-blue-500/20">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-white/20 rounded-2xl"><Lightbulb className="w-6 h-6" /></div>
                        <div>
                          <p className="text-xs font-bold text-blue-200 uppercase tracking-widest mb-0.5">Lighting Setup</p>
                          <p className="text-sm font-bold">{result.mobileSop.lighting}</p>
                        </div>
                      </div>
                      <div className="px-4 py-1.5 bg-white text-blue-600 text-xs font-black rounded-full whitespace-nowrap">{result.mobileSop.vibe}</div>
                    </div>
                  </div>
                </div>
              </section>
              <section className="bg-white rounded-[3rem] p-10 shadow-xl shadow-gray-200/40 border border-gray-50">
                <SectionHeader icon={<Sparkles className="w-7 h-7" />} title="AI 像素级复刻" subtitle="为不同平台深度优化的提示词指令" colorClass="text-purple-500" />
                <div className="space-y-8">
                  <div className="group relative bg-[#F8F8F8] rounded-[2.5rem] p-8 border border-gray-100 transition-all hover:shadow-2xl hover:bg-white">
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#ff2442] rounded-xl flex items-center justify-center text-white font-black text-sm">梦</div>
                        <div>
                          <p className="font-black text-gray-900">即梦 Jimeng</p>
                          <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">Best for Chinese Style</p>
                        </div>
                      </div>
                      <CopyButton text={result.aiPrompts.jimeng} label="复制中文咒语" />
                    </div>
                    <p className="text-sm text-gray-800 leading-[1.8] font-bold">{result.aiPrompts.jimeng}</p>
                  </div>
                  <div className="group relative bg-gray-950 rounded-[2.5rem] p-8 transition-all hover:shadow-2xl hover:bg-black overflow-hidden">
                    <div className="absolute -top-10 -right-10 w-40 h-40 bg-purple-500/10 blur-[60px] pointer-events-none" />
                    <div className="flex justify-between items-start mb-6 relative z-10">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center text-white"><Sparkles className="w-6 h-6" /></div>
                        <div>
                          <p className="font-black text-white">Midjourney V6.0</p>
                          <p className="text-[10px] font-bold text-gray-500 tracking-widest uppercase">Cinematic / High Fidelity</p>
                        </div>
                      </div>
                      <CopyButton text={result.aiPrompts.midjourney} label="Copy Prompt" />
                    </div>
                    <p className="text-sm text-purple-200/80 font-mono italic leading-[1.8] relative z-10">{result.aiPrompts.midjourney}</p>
                  </div>
                </div>
                <div className="mt-8 flex items-center gap-4 p-5 bg-purple-50 rounded-2xl">
                  <Info className="w-5 h-5 text-purple-600 shrink-0" />
                  <p className="text-xs font-bold text-purple-900 leading-relaxed">提示：在出图时建议上传原图作为“风格参考图”，并将强度控制在 0.6-0.8 之间效果最佳。</p>
                </div>
              </section>
            </div>
          </div>
        )}
      </main>
      {state === AppState.RESULT && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 flex gap-4">
          <button
            type="button"
            onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(reset, 400); }}
            className="flex items-center gap-3 px-12 py-5 bg-gray-900 text-white rounded-[2rem] font-black shadow-2xl shadow-black/20 active:scale-95 transition-all ring-8 ring-white/80"
          >
            <RefreshCcw className="w-6 h-6" /> 分析下一张爆款
          </button>
        </div>
      )}
    </div>
  );
};
