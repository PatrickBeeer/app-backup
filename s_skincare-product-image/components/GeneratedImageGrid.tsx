
import React, { useState } from 'react';
import type { GeneratedImage } from '../types';

interface GeneratedImageGridProps {
  images: GeneratedImage[];
  onPromptChange: (id: number, newPrompt: string) => void;
  onSingleGenerate: (id: number) => void;
  disableRegenerate?: boolean;
}

const TextOverlay: React.FC<{ copy: { mainTitle: string, subTitle: string }, index: number }> = ({ copy, index }) => {
  if (!copy.mainTitle) return null;
  
  // 模拟中国电商常见的排版风格 (左上角主卖点，底部优势条)
  return (
    <div className="absolute inset-0 pointer-events-none p-6 flex flex-col">
      {/* Top Left Header */}
      <div className="self-start animate-in slide-in-from-left-4 duration-700 delay-200">
        <div className="bg-black/80 backdrop-blur-md px-4 py-2 rounded-sm border-l-4 border-indigo-400">
           <h5 className="text-white font-extrabold text-base tracking-tight leading-none mb-1">{copy.mainTitle}</h5>
           <p className="text-indigo-300 font-bold text-[10px] leading-none uppercase tracking-widest">{copy.subTitle}</p>
        </div>
      </div>
      
      {/* Corner Tag */}
      <div className="absolute top-4 right-4 bg-white/20 backdrop-blur-xl border border-white/40 px-3 py-1 rounded-full">
         <span className="text-white text-[9px] font-black uppercase tracking-widest">Main 0{index + 1}</span>
      </div>

      {/* Bottom Footer Visual */}
      <div className="mt-auto flex justify-between items-end opacity-60">
        <div className="bg-white/10 backdrop-blur-sm px-2 py-1 rounded text-[8px] font-bold text-white uppercase tracking-tighter">
          Original Series
        </div>
        <div className="h-px bg-white/20 flex-grow mx-4 mb-2"></div>
        <span className="text-[7px] font-black text-white/40 rotate-90 origin-bottom-right translate-x-1 tracking-widest">LUXURY STUDIO</span>
      </div>
    </div>
  );
};

const ImageCard: React.FC<{ 
  image: GeneratedImage; 
  index: number;
  onEnlarge: (src: string) => void;
  onPromptChange: (id: number, newPrompt: string) => void;
  onSingleGenerate: (id: number) => void;
  disableRegenerate?: boolean;
}> = ({ image, index, onEnlarge, onPromptChange, onSingleGenerate, disableRegenerate = false }) => {
  const { id, title, description, src, isLoading, error, prompt, copy } = image;
  const [showPrompt, setShowPrompt] = useState(false);

  const Skeleton = () => (
    <div className="w-full aspect-square bg-slate-100 rounded-[1.5rem] flex flex-col items-center justify-center gap-4 overflow-hidden relative">
      <div className="w-12 h-12 border-4 border-slate-200 border-t-black rounded-full animate-spin"></div>
      <div className="text-center">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse-soft block">精细化渲染中</span>
        <span className="text-[8px] text-slate-300 mt-1 block">匹配产品材质细节...</span>
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-white/20 to-transparent"></div>
    </div>
  );

  return (
    <div className="group animate-slide-up bg-transparent flex flex-col transition-all duration-500 h-full">
      <div className="relative w-full aspect-square rounded-4xl overflow-hidden luxury-shadow glass-card mb-4">
        {isLoading ? (
          <Skeleton />
        ) : error ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center bg-red-50/10 backdrop-blur-md">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mb-4">
                  <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <span className="text-red-700 font-bold text-xs mb-3">{error}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => onSingleGenerate(id)} disabled={disableRegenerate} className="px-3 py-2 bg-black text-white rounded-xl text-[10px] font-bold hover:scale-105 transition-transform disabled:bg-slate-300 disabled:cursor-not-allowed inline-flex items-center gap-1.5" title="以此提示词重做 (10 积分)">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 3l2.4 4.86L20 8.8l-4 3.9.94 5.5L12 15.9 7.06 18.2 8 12.7 4 8.8l5.6-.94L12 3z" /></svg>
                    以此提示词重做
                  </button>
                </div>
            </div>
        ) : src ? (
          <>
            <img src={src} alt={title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
            <TextOverlay copy={copy} index={index} />
            
            {/* Quick Actions Hover Overlay */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-3 px-3">
                <button 
                  onClick={() => onEnlarge(src)} 
                  className="bg-white p-3 rounded-2xl shadow-xl text-black hover:scale-110 active:scale-95 transition-all"
                  title="放大预览"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
                </button>
                <button 
                  onClick={() => onSingleGenerate(id)} 
                  disabled={disableRegenerate || isLoading}
                  className="bg-white px-3 py-3 rounded-2xl shadow-xl text-indigo-700 hover:scale-105 active:scale-95 transition-all inline-flex items-center gap-1.5 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                  title="以此提示词重做 (10 积分)"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 3l2.4 4.86L20 8.8l-4 3.9.94 5.5L12 15.9 7.06 18.2 8 12.7 4 8.8l5.6-.94L12 3z" /></svg>
                  <span className="text-[10px] font-black tracking-wide">以此提示词重做</span>
                </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-200 gap-2">
            <svg className="h-12 w-12 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" /></svg>
            <span className="text-[10px] font-black uppercase tracking-widest opacity-30">等待资源</span>
          </div>
        )}
      </div>
      
      <div className="px-2 flex-grow">
        <div className="flex items-center justify-between mb-1">
          <h4 className="font-extrabold text-black text-sm tracking-tight">{title}</h4>
          {src && <span className="text-[8px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full uppercase">渲染完成</span>}
        </div>
        <p className="text-[11px] font-medium text-slate-400 line-clamp-1">{description}</p>
        
        {/* Prompt Tweak Area */}
        <div className="mt-4 pt-4 border-t border-slate-100">
           <button 
            onClick={() => setShowPrompt(!showPrompt)}
            className="text-[10px] font-extrabold text-indigo-500 hover:text-indigo-700 uppercase tracking-widest flex items-center gap-1.5 transition-colors"
           >
             <svg className={`h-3 w-3 transition-transform duration-300 ${showPrompt ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
             {showPrompt ? '关闭拍摄配置' : '微调 AI 拍摄指令'}
           </button>
           
           {showPrompt && (
             <div className="mt-3 animate-in fade-in slide-in-from-top-2 duration-300">
                <textarea 
                  value={prompt}
                  onChange={(e) => onPromptChange(id, e.target.value)}
                  className="w-full p-3 text-[11px] text-slate-600 bg-white/40 backdrop-blur-sm border border-slate-100 rounded-2xl h-24 focus:ring-1 focus:ring-indigo-400 outline-none resize-none leading-relaxed"
                  placeholder="正在生成专家指令..."
                />
             </div>
           )}
        </div>
      </div>

      <div className="mt-4 px-2 pb-2">
        {src && (
          <a 
            href={src} 
            download={`${title}.png`} 
            className="w-full flex items-center justify-center gap-2 py-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl text-[10px] font-extrabold text-slate-600 transition-all active:scale-95"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            下载高精度原稿
          </a>
        )}
      </div>
    </div>
  );
};

export const GeneratedImageGrid: React.FC<GeneratedImageGridProps> = ({ images, onPromptChange, onSingleGenerate, disableRegenerate = false }) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-extrabold text-black tracking-tight">定制化视觉全案</h3>
          <p className="text-sm text-slate-400 mt-1 font-medium">包含 5 个核心视觉点，均配备自动文案排版</p>
        </div>
        <div className="flex items-center gap-2 bg-white/40 backdrop-blur-md border border-white/40 px-4 py-2 rounded-2xl">
          <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
          <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">高清实时预览</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        {images.map((image, idx) => (
          <ImageCard 
            key={image.id} 
            image={image} 
            index={idx}
            onEnlarge={setSelectedImage} 
            onPromptChange={onPromptChange}
            onSingleGenerate={onSingleGenerate}
            disableRegenerate={disableRegenerate}
          />
        ))}
      </div>

      {selectedImage && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md p-8 animate-in fade-in duration-300"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl w-full max-h-[85vh] flex items-center justify-center group" onClick={(e) => e.stopPropagation()}>
            <button 
              className="absolute -top-16 right-0 text-white hover:text-slate-300 transition-colors p-2"
              onClick={() => setSelectedImage(null)}
            >
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <img src={selectedImage} alt="Fullscreen Preview" className="max-w-full max-h-full object-contain rounded-3xl luxury-shadow shadow-white/5" />
            <div className="absolute -bottom-12 left-0 right-0 text-center">
               <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.3em]">Commercial Grade Master Copy • Luxury Studio</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

