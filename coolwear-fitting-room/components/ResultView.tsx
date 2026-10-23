import React, { useState, useEffect } from 'react';
import { GenerationStatus, GeneratedResult } from '../types';

interface ResultViewProps {
  status: GenerationStatus;
  resultUrl: string | null;
  history: GeneratedResult[];
  error: string | null;
  onImageClick?: (url: string) => void;
}

export const ResultView: React.FC<ResultViewProps> = ({ status, resultUrl, history, error, onImageClick }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isComparing, setIsComparing] = useState(false);

  useEffect(() => {
    if (history.length > 0) {
      setSelectedIndex(0);
    }
  }, [history.length]);

  const pairBaseIndex = selectedIndex % 2 === 0 ? selectedIndex : selectedIndex - 1;
  const currentPair = [history[pairBaseIndex], history[pairBaseIndex + 1]].filter(Boolean);
  const currentRefUrl = history[selectedIndex]?.refImageUrl;

  const handlePrevPair = () => {
    if (pairBaseIndex + 2 < history.length) {
      setSelectedIndex(pairBaseIndex + 2);
    }
  };

  const handleNextPair = () => {
    if (pairBaseIndex - 2 >= 0) {
      setSelectedIndex(pairBaseIndex - 2);
    }
  };

  if (status === GenerationStatus.GENERATING) {
    return (
      <div className="w-full h-full min-h-[500px] flex flex-col items-center justify-center bg-white rounded-xl border border-slate-300 shadow-inner">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-indigo-800 border-t-indigo-500 rounded-full animate-spin"></div>
        </div>
        <p className="mt-6 text-indigo-400 font-semibold animate-pulse">正在施展魔法...</p>
        <p className="text-xs text-slate-600 mt-2">AI 正在融合服装细节与参考风格 (生成2张)</p>
      </div>
    );
  }

  if (status === GenerationStatus.ERROR) {
    return (
      <div className="w-full h-full min-h-[500px] flex flex-col items-center justify-center bg-red-900/20 rounded-xl border border-red-800/50 text-red-400 p-6 text-center">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mb-3">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
        <p className="font-bold">生成失败</p>
        <p className="text-sm mt-1">{error || "发生未知错误，请检查网络或重试"}</p>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="w-full h-full min-h-[500px] flex flex-col items-center justify-center text-slate-600 bg-white rounded-xl border border-slate-300">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-16 h-16 mb-4 opacity-50">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
        </svg>
        <p className="text-lg font-medium">准备生成</p>
        <p className="text-sm">上传图片并选择风格后点击生成</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col min-h-[600px]">
      <div className="relative flex-1 rounded-xl overflow-hidden shadow-lg border border-slate-300 bg-white group select-none">
        {isComparing && (
          <div className="absolute top-4 left-4 z-20 bg-black/60 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-semibold animate-fade-in">
            原参考图
          </div>
        )}

        <div className="absolute inset-0 flex">
          {isComparing && currentRefUrl ? (
            <img 
              src={currentRefUrl} 
              alt="Reference" 
              className="w-full h-full object-contain bg-slate-100"
            />
          ) : (
            <>
              {currentPair.map((item, index) => (
                <div 
                  key={item.timestamp} 
                  className={`
                    flex-1 relative border-r border-slate-300 last:border-0 overflow-hidden cursor-zoom-in group/img
                    ${item === history[selectedIndex] ? 'ring-inset ring-4 ring-indigo-500/30' : ''}
                  `}
                  onClick={() => onImageClick?.(item.imageUrl)}
                  onMouseEnter={() => setSelectedIndex(history.indexOf(item))}
                >
                  <img 
                    src={item.imageUrl} 
                    alt={`Generated ${index}`} 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-4 right-4 opacity-0 group-hover/img:opacity-100 transition-opacity flex gap-2">
                    <a 
                      href={item.imageUrl} 
                      download={`cloth-gen-${item.timestamp}.png`}
                      className="bg-slate-100/90 p-2 rounded-full text-slate-800 hover:text-indigo-400 shadow-sm border border-slate-300"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                    </a>
                  </div>
                </div>
              ))}
              {currentPair.length === 1 && (
                <div className="flex-1 bg-slate-100 flex items-center justify-center text-slate-600">
                  <span className="text-sm">无更多图片</span>
                </div>
              )}
            </>
          )}
        </div>
        
        {history.length > 2 && (
          <>
            <button 
              onClick={(e) => { e.stopPropagation(); handlePrevPair(); }}
              disabled={pairBaseIndex >= history.length - 2}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-100/80 hover:bg-slate-300 text-slate-800 shadow-md disabled:opacity-30 disabled:cursor-not-allowed transition-all z-20 border border-slate-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); handleNextPair(); }}
              disabled={pairBaseIndex === 0}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-100/80 hover:bg-slate-300 text-slate-800 shadow-md disabled:opacity-30 disabled:cursor-not-allowed transition-all z-20 border border-slate-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <div className="flex justify-between items-center gap-3">
          <div className="flex items-center gap-3">
            {currentRefUrl && (
              <button
                onMouseDown={() => setIsComparing(true)}
                onMouseUp={() => setIsComparing(false)}
                onMouseLeave={() => setIsComparing(false)}
                onTouchStart={() => setIsComparing(true)}
                onTouchEnd={() => setIsComparing(false)}
                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-300 text-slate-700 px-4 h-10 rounded-lg transition-colors font-medium text-sm select-none border border-slate-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15 12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
                </svg>
                按住对比参考图
              </button>
            )}
            <div className="text-sm text-slate-600 hidden sm:block">
              {history.length > 0 && `当前显示: 第 ${Math.ceil((history.length - pairBaseIndex) / 2)} 组`}
            </div>
          </div>

          <a 
            href={history[selectedIndex]?.imageUrl || '#'} 
            download={`cloth-gen-${history[selectedIndex]?.timestamp || Date.now()}.png`}
            className="flex items-center gap-2 bg-indigo-600 text-white px-5 h-10 rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-md text-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            下载选中
          </a>
        </div>

        {history.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-2 pt-1 px-1 custom-scrollbar">
            {history.map((item, index) => (
              <button
                key={item.timestamp}
                onClick={() => setSelectedIndex(index)}
                className={`
                  relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all
                  ${index === selectedIndex ? 'border-indigo-500 ring-2 ring-indigo-500/30' : 'border-slate-300 hover:border-indigo-600 opacity-70 hover:opacity-100'}
                  ${index === pairBaseIndex || index === pairBaseIndex + 1 ? 'ring-1 ring-slate-600' : ''}
                `}
              >
                <img 
                  src={item.imageUrl} 
                  alt="history" 
                  className="w-full h-full object-cover"
                />
                {(index % 2 === 0) && (
                  <div className="absolute bottom-0 right-0 bg-black/50 text-[8px] text-white px-1">
                    组 {Math.ceil((history.length - index) / 2)}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

