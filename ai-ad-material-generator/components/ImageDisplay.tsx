import React from 'react';
import { ImageCard } from './ImageCard';
import { ExpandIcon, DownloadIcon } from './Icon';

interface ImageDisplayProps {
  generatedImages: string[];
  onImageSelect: (imageUrl: string) => void;
  waitingText?: string;
}

const handleDownload = (image: string, index: number) => {
  const link = document.createElement('a');
  link.href = image;
  link.download = `effect-image-${index}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const ImageDisplay: React.FC<ImageDisplayProps> = ({ generatedImages, onImageSelect, waitingText = '等待生成结果' }) => {
  if (generatedImages.length === 0) {
    return (
      <div className="w-full h-64 flex flex-col items-center justify-center text-center text-gray-400 bg-gray-50 border border-gray-200">
        <div className="w-12 h-12 mb-4 bg-gray-200 rounded-full flex items-center justify-center">
          <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        </div>
        <p className="text-sm font-medium">{waitingText}</p>
      </div>
    );
  }
  return (
    <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6">
      {generatedImages.map((image, index) => (
        <ImageCard key={index} title={`生成结果_0${generatedImages.length - index}`} className="animate-fade-in">
          <div className="relative group w-full h-full bg-white">
            <img src={image} alt={`Generated Mockup ${index + 1}`} className="object-contain max-h-[400px] w-full h-full" />
            <div className="absolute inset-0 bg-white/90 opacity-0 group-hover:opacity-100 transition-all duration-200 flex flex-col items-center justify-center gap-4">
              <div className="flex gap-4 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300 delay-75">
                <button onClick={() => onImageSelect(image)} className="flex items-center gap-2 px-6 py-3 bg-black text-white hover:bg-lime-300 hover:text-black font-bold border border-black transition-colors shadow-hard-sm">
                  <ExpandIcon className="w-5 h-5" /><span>查看大图</span>
                </button>
                <button onClick={() => handleDownload(image, generatedImages.length - index)} className="flex items-center gap-2 px-6 py-3 bg-white text-black hover:bg-black hover:text-white font-bold border border-black transition-colors shadow-hard-sm">
                  <DownloadIcon className="w-5 h-5" /><span>保存图片</span>
                </button>
              </div>
            </div>
          </div>
        </ImageCard>
      ))}
    </div>
  );
};
