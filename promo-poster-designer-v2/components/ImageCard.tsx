import React from 'react';
import type { GeneratedImage } from '../types';
import { DownloadIcon } from './icons/DownloadIcon';
import { ZoomIcon } from './icons/ZoomIcon';

interface ImageCardProps {
  image: GeneratedImage;
  onZoom: (url: string | null) => void;
}

export const ImageCard: React.FC<ImageCardProps> = ({ image, onZoom }) => {
  const handleDownload = () => {
    if (!image.url) return;
    const link = document.createElement('a');
    link.href = image.url;
    const fileName = `poster-${image.aspectRatio.replace(/:/g, 'x')}.png`;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-slate-100/50 rounded-lg overflow-hidden shadow-md flex flex-col border border-slate-300 group relative">
      <div className={`w-full ${image.aspectRatio === '3:4' ? 'aspect-[3/4]' : image.aspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-[16/9]'}`}>
        {image.loading ? (
          <div className="absolute inset-0 bg-slate-200 animate-pulse flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-slate-300 border-t-purple-500 rounded-full animate-spin"></div>
          </div>
        ) : image.url ? (
          <>
            <img src={image.url} alt={`Generated poster with aspect ratio ${image.aspectRatio}`} className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-4">
              <button
                onClick={() => onZoom(image.url)}
                className="p-3 bg-white/80 rounded-full text-slate-800 hover:bg-slate-200 transform hover:scale-110 transition-all duration-200 border border-slate-300"
                aria-label="Zoom image"
                title="Zoom"
              >
                <ZoomIcon className="w-6 h-6" />
              </button>
              <button
                onClick={handleDownload}
                className="p-3 bg-white/80 rounded-full text-slate-800 hover:bg-slate-200 transform hover:scale-110 transition-all duration-200 border border-slate-300"
                aria-label="Download image"
                title="Download"
              >
                <DownloadIcon className="w-6 h-6" />
              </button>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 bg-slate-200 flex items-center justify-center text-center p-2">
            <p className="text-red-400 text-sm">图片生成失败</p>
          </div>
        )}
      </div>
      <div className="p-2 bg-white/50 text-center border-t border-slate-300">
        <span className="text-xs font-mono text-slate-600">{image.aspectRatio}</span>
      </div>
    </div>
  );
};

