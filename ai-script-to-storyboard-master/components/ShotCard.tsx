import React, { useState } from 'react';
import { AspectRatio, Shot } from '../types';
import { Camera, Zap, Palette, RefreshCw, Download, Copy, Check, Sparkles } from 'lucide-react';

interface ShotCardProps {
  shot: Shot;
  aspectRatio: AspectRatio;
  imageCost: number;
  isBatchGenerating: boolean;
  onGenerateSingle: (shot: Shot) => void;
}

const ShotCard: React.FC<ShotCardProps> = ({ shot, aspectRatio, imageCost, isBatchGenerating, onGenerateSingle }) => {
  const [copied, setCopied] = useState(false);

  // Map aspect ratio string to CSS style
  const getAspectRatioStyle = (ar: AspectRatio) => {
    const [w, h] = ar.split(':').map(Number);
    return { aspectRatio: `${w}/${h}` };
  };

  const handleRegenerate = (e: React.MouseEvent) => {
    e.stopPropagation();
    onGenerateSingle(shot);
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (shot.imageUrl) {
        const link = document.createElement('a');
        link.href = shot.imageUrl;
        link.download = `shot_${String(shot.id).padStart(2, '0')}.png`;
        link.click();
    }
  };

  const handleCopyPrompt = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Check if mjPrompt exists
    if (!shot.mjPrompt || shot.mjPrompt.trim() === '') {
      console.warn('mjPrompt is empty');
      return;
    }

    try {
      // Try modern Clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shot.mjPrompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        // Fallback: use traditional method
        const textArea = document.createElement('textarea');
        textArea.value = shot.mjPrompt;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
          const successful = document.execCommand('copy');
          if (successful) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } else {
            console.error('Fallback copy failed');
          }
        } catch (err) {
          console.error('Fallback copy error:', err);
        } finally {
          document.body.removeChild(textArea);
        }
      }
    } catch (err) {
      console.error('Copy to clipboard failed:', err);
      // Still show feedback even if copy fails
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="bg-white rounded-xl overflow-hidden border border-gray-200 flex flex-col h-full shadow-md transition-all hover:border-amber-400 hover:shadow-lg duration-300 group">
      
      {/* Header Info */}
      <div className="px-3 py-2 bg-white border-b border-gray-200 flex justify-between items-center">
        <span className="font-mono text-amber-600 font-bold text-lg">#{String(shot.id).padStart(2, '0')}</span>
        <span className={`text-[10px] uppercase px-2 py-0.5 rounded font-bold tracking-wider
          ${shot.type === '首帧' ? 'bg-blue-100 text-blue-700 border border-blue-300' : 
            shot.type === '尾帧' ? 'bg-purple-100 text-purple-700 border border-purple-300' : 
            shot.type === '正反打' ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' :
            'bg-gray-100 text-gray-700 border border-gray-300'}`}>
          {shot.type}
        </span>
      </div>

      {/* Image Area - Responsive AR */}
      <div 
        className="w-full bg-black relative overflow-hidden" 
        style={getAspectRatioStyle(aspectRatio)}
      >
        {shot.imageUrl ? (
          <>
            <img 
              src={shot.imageUrl} 
              alt={shot.description} 
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            
            {/* Action Overlay */}
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-start justify-end p-2 gap-2">
               <button 
                 onClick={handleDownload}
                 className="bg-white/95 hover:bg-white text-slate-700 p-2 rounded-lg backdrop-blur-sm border border-gray-300 transition-colors shadow-lg"
                 title="下载单张图片"
               >
                 <Download className="w-4 h-4" />
               </button>
               <button 
                 onClick={handleRegenerate}
                 disabled={shot.isGeneratingImage}
                 className="bg-amber-600 hover:bg-amber-700 text-white p-2 rounded-lg backdrop-blur-sm border border-amber-700 transition-colors shadow-lg"
                 title="重绘此镜头"
               >
                 <RefreshCw className={`w-4 h-4 ${shot.isGeneratingImage ? 'animate-spin' : ''}`} />
               </button>
            </div>
          </>
        ) : shot.isGeneratingImage ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50">
             {/* Skeleton Pulse */}
             <div className="w-full h-full bg-gray-200 animate-pulse absolute inset-0"></div>
             <div className="z-10 flex flex-col items-center gap-3">
               <div className="animate-spin w-8 h-8 border-2 border-amber-200 border-t-amber-600 rounded-full"></div>
               <span className="text-xs text-amber-600 font-medium tracking-wide">绘制中...</span>
             </div>
          </div>
        ) : (
           <div className="absolute inset-0 flex items-center justify-center bg-gray-50 text-gray-500 flex-col gap-2 border-b border-gray-200">
             <div className="w-12 h-12 rounded-full border border-gray-300 flex items-center justify-center">
                <Camera className="w-5 h-5 opacity-40" />
             </div>
             <span className="text-xs font-medium">等待生成</span>
             <button
               onClick={handleRegenerate}
               disabled={isBatchGenerating}
               className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 disabled:text-gray-500 text-white text-[11px] font-bold transition-colors"
             >
               <Sparkles className="w-3.5 h-3.5" />
               <span>绘制此镜头 · {imageCost}积分</span>
             </button>
           </div>
        )}
        
        {/* Overlay Gradients for text readability */}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 via-black/30 to-transparent pointer-events-none opacity-60"></div>
        
        {/* Shot Size Overlay */}
        <div className="absolute bottom-2 left-2 text-white text-[10px] font-bold tracking-wider uppercase border border-white/30 bg-black/50 backdrop-blur px-1.5 py-0.5 rounded pointer-events-none">
            {shot.composition.split(' ')[0]}
        </div>
      </div>

      {/* Metadata Body */}
      <div className="p-4 flex-1 flex flex-col gap-3 text-sm bg-white">
        
        <p className="text-slate-700 font-light leading-relaxed text-sm line-clamp-3 group-hover:line-clamp-none transition-all">
          {shot.description}
        </p>

        <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[11px] text-gray-600 mt-2 border-t border-gray-200 pt-3">
          <div className="flex items-center gap-1.5">
            <Camera className="w-3 h-3 text-amber-600" />
            <span className="truncate" title={shot.camera}>{shot.camera}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-amber-600" />
            <span className="truncate" title={shot.lighting}>{shot.lighting}</span>
          </div>
          <div className="flex items-center gap-1.5 col-span-2">
            <Palette className="w-3 h-3 text-amber-600" />
            <span className="truncate" title={shot.mood}>{shot.mood}</span>
          </div>
        </div>
        
        {/* Director's Note / Prompts */}
        <div className="mt-auto pt-3 no-export group/prompt">
            <div className="bg-gray-50 border border-gray-200 p-2 rounded text-[10px] text-gray-700 font-mono relative transition-all hover:bg-gray-100">
                <div className="flex justify-between items-center mb-1 pb-1 border-b border-gray-300">
                    <span className="text-amber-700 font-bold">MJ PROMPT</span>
                    <button 
                        onClick={handleCopyPrompt}
                        disabled={!shot.mjPrompt || shot.mjPrompt.trim() === ''}
                        className="text-gray-500 hover:text-amber-600 transition-colors p-1 hover:bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        title={shot.mjPrompt && shot.mjPrompt.trim() !== '' ? "复制提示词" : "提示词为空"}
                    >
                        {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    </button>
                </div>
                <div className="max-h-16 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 hover:max-h-60 transition-all duration-500 whitespace-pre-wrap">
                    {shot.mjPrompt || <span className="text-gray-400 italic">暂无提示词</span>}
                </div>
            </div>
        </div>

      </div>
    </div>
  );
};

export default ShotCard;

