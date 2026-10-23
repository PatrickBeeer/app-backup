import React, { useEffect } from 'react';
import { CloseIcon, DownloadIcon } from './Icon';

interface ImageModalProps {
  imageUrl: string;
  onClose: () => void;
}

export const ImageModal: React.FC<ImageModalProps> = ({ imageUrl, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = 'effect-image-enlarged.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  return (
    <div className="fixed inset-0 bg-white/95 z-50 flex items-center justify-center p-4 sm:p-8 animate-fade-in" onClick={onClose} aria-modal="true" role="dialog">
      <div className="relative w-full max-w-6xl h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6 border-b border-black pb-4">
          <h3 className="text-xl font-black tracking-tighter">预览模式</h3>
          <div className="flex gap-4">
            <button onClick={handleDownload} className="flex items-center gap-2 px-4 py-2 bg-white border border-black hover:bg-black hover:text-white transition-colors font-bold text-sm">
              <DownloadIcon className="w-4 h-4" />下载原图
            </button>
            <button onClick={onClose} className="p-2 bg-black text-white hover:bg-lime-300 hover:text-black transition-colors"><CloseIcon className="w-6 h-6" /></button>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center overflow-hidden bg-gray-50 border border-black">
          <img src={imageUrl} alt="Enlarged Mockup" className="object-contain max-w-full max-h-full" />
        </div>
      </div>
    </div>
  );
};
