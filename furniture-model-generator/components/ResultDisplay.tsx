import React, { useState, useEffect } from 'react';
import { LoadingSpinner } from './LoadingSpinner';
import { ZoomInIcon } from './icons/ZoomInIcon';
import { DownloadIcon } from './icons/DownloadIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { ImageModal } from './ImageModal';

interface ResultDisplayProps {
  originalImageUrl: string | null;
  generatedImageUrls: string[] | null;
  isLoading: boolean;
}

const Thumbnail: React.FC<{
  imageUrl: string;
  label: string;
  isActive: boolean;
  onClick: () => void;
}> = ({ imageUrl, label, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all duration-300 group ${isActive ? 'border-blue-600 ring-2 ring-blue-600/30 scale-105 z-10' : 'border-transparent opacity-70 hover:opacity-100 hover:border-slate-500'}`}
  >
    <img src={imageUrl} alt={label} className="w-full h-full object-cover" />
    <div className={`absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex items-end justify-center pb-1 transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
      <span className="text-[10px] font-medium text-white uppercase tracking-wider">{label}</span>
    </div>
  </button>
);

const LoadingThumbnail: React.FC = () => (
  <div className="aspect-square rounded-xl bg-slate-200/50 border border-slate-300 flex items-center justify-center animate-pulse">
    <LoadingSpinner className="text-blue-400 w-6 h-6" />
  </div>
);

const PlaceholderThumbnail: React.FC<{ label: string }> = ({ label }) => (
  <div className="aspect-square rounded-xl bg-slate-100/50 border border-dashed border-slate-300 flex items-center justify-center p-2 text-center">
    <span className="text-xs text-slate-600 font-medium">{label}</span>
  </div>
);

export const ResultDisplay: React.FC<ResultDisplayProps> = ({ originalImageUrl, generatedImageUrls, isLoading }) => {
  const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (generatedImageUrls && generatedImageUrls.length > 0) {
      setActiveImageUrl(generatedImageUrls[0]);
    } else {
      setActiveImageUrl(originalImageUrl);
    }
  }, [originalImageUrl, generatedImageUrls]);

  if (!originalImageUrl) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-center p-8">
        <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-6">
          <SparklesIcon className="w-10 h-10 text-blue-400" />
        </div>
        <h3 className="text-2xl font-bold text-slate-800 mb-2">作品预览区</h3>
        <p className="text-slate-600 max-w-sm">
          在左侧上传图片并配置模特参数，点击生成后，您的AI创意大片将在这里即时呈现。
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Main Image Display */}
      <div className="flex-1 min-h-0 bg-slate-100/50 rounded-xl border border-slate-300 flex items-center justify-center overflow-hidden relative group transition-all">
        {activeImageUrl ? (
          <>
            <div className="absolute inset-0 pattern-grid opacity-[0.03] pointer-events-none"></div>
            <img 
              src={activeImageUrl} 
              alt="Main display" 
              className="max-w-full max-h-full object-contain shadow-lg rounded-lg transition-transform duration-500" 
            />
            {/* Overlay Controls */}
            <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
              <button 
                onClick={() => setZoomedImageUrl(activeImageUrl)} 
                className="p-3 rounded-xl bg-white/90 backdrop-blur text-slate-800 hover:text-blue-400 hover:bg-slate-200 shadow-lg border border-slate-300 transition-all" 
                title="全屏查看"
              >
                <ZoomInIcon className="w-5 h-5" />
              </button>
              <a 
                href={activeImageUrl} 
                download={`furniture-model-${Date.now()}.png`} 
                className="p-3 rounded-xl bg-white/90 backdrop-blur text-slate-800 hover:text-blue-400 hover:bg-slate-200 shadow-lg border border-slate-300 transition-all" 
                title="下载图片"
              >
                <DownloadIcon className="w-5 h-5" />
              </a>
            </div>
            
            {/* Loading Overlay for Main Area if generating but showing old result */}
            {isLoading && (
              <div className="absolute inset-0 bg-white/50 backdrop-blur-[2px] flex items-center justify-center z-10 cursor-wait">
                <div className="bg-white/90 px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
                  <LoadingSpinner className="text-blue-400 w-4 h-4" />
                  <span className="text-sm font-medium text-blue-300">正在优化细节...</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <LoadingSpinner className="w-8 h-8 text-blue-400" />
            <span className="text-slate-600 text-sm">加载预览中...</span>
          </div>
        )}
      </div>

      {/* Thumbnail Strip */}
      <div className="flex-shrink-0 h-24 bg-slate-100/60 backdrop-blur-md border border-slate-300 rounded-xl p-3 flex items-center gap-4 overflow-x-auto custom-scrollbar">
        <Thumbnail
          imageUrl={originalImageUrl}
          label="原图"
          isActive={activeImageUrl === originalImageUrl}
          onClick={() => setActiveImageUrl(originalImageUrl)}
        />
        
        <div className="w-px h-12 bg-slate-600 mx-2"></div>

        {isLoading ? (
          <>
            <LoadingThumbnail />
            <LoadingThumbnail />
          </>
        ) : generatedImageUrls ? (
          generatedImageUrls.map((url, index) => (
            <Thumbnail
              key={index}
              imageUrl={url}
              label={`效果 ${index + 1}`}
              isActive={activeImageUrl === url}
              onClick={() => setActiveImageUrl(url)}
            />
          ))
        ) : (
          <>
            <PlaceholderThumbnail label="效果图 1" />
            <PlaceholderThumbnail label="效果图 2" />
          </>
        )}
      </div>

      {zoomedImageUrl && (
        <ImageModal imageUrl={zoomedImageUrl} onClose={() => setZoomedImageUrl(null)} />
      )}
    </div>
  );
};

