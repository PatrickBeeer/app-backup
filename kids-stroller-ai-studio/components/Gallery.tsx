import React, { useState } from 'react';
import { GeneratedImage, AspectRatio } from '../types';

interface GalleryProps {
  images: GeneratedImage[];
  isLoading: boolean;
  aspectRatio: AspectRatio;
  onEdit: (image: GeneratedImage) => void;
}

export const Gallery: React.FC<GalleryProps> = ({ images, isLoading, aspectRatio, onEdit }) => {
  const [viewingImage, setViewingImage] = useState<GeneratedImage | null>(null);

  const downloadImage = (url: string, id: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `kid-bike-scene-${id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getAspectClass = (ratio: AspectRatio) => {
    switch (ratio) {
      case '1:1': return 'aspect-square';
      case '3:4': return 'aspect-[3/4]';
      case '9:16': return 'aspect-[9/16]';
      default: return 'aspect-square';
    }
  };

  const aspectClass = getAspectClass(aspectRatio);

  return (
    <div className="h-full">
      <div className="flex items-center justify-between mb-8 px-2">
        <h3 className="text-2xl font-bold text-gray-900 tracking-tight">生成结果</h3>
        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{images.length > 0 ? `${images.length} 张已生成` : 'Waiting'}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {isLoading ? (
          [1, 2].map((i) => (
            <div key={i} className={`${aspectClass} bg-white/40 backdrop-blur-md rounded-[2rem] border border-white/40 overflow-hidden relative`}>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-[shimmer_1.5s_infinite]"></div>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                <i className="fa-solid fa-cube text-4xl mb-4 animate-bounce"></i>
                <span className="text-sm font-medium tracking-widest uppercase">正在渲染...</span>
              </div>
            </div>
          ))
        ) : images.length === 0 ? null : (
          images.map((img) => (
            <div key={img.id} className={`group relative ${aspectClass} bg-white rounded-[2rem] overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-500`}>
              <img src={img.url} alt="Generated Scene" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-6">
                <div className="bg-white/95 backdrop-blur-xl p-2 rounded-2xl flex gap-2 shadow-2xl transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                  <button onClick={() => setViewingImage(img)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 py-3 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2" title="查看大图"><i className="fa-solid fa-eye text-gray-700"></i><span>查看大图</span></button>
                  <button onClick={() => onEdit(img)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 py-3 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2" title="微调"><i className="fa-solid fa-sliders text-gray-700"></i><span>微调</span></button>
                  <button onClick={() => downloadImage(img.url, img.id)} className="flex-1 bg-gray-900 text-white hover:bg-gray-800 py-3 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2" title="下载"><i className="fa-solid fa-download"></i><span>下载</span></button>
                </div>
              </div>
              <div className="absolute top-4 left-4">
                <span className="bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-widest border border-white/10">AI 生成</span>
              </div>
            </div>
          ))
        )}
      </div>
      {viewingImage && (
        <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-4" onClick={() => setViewingImage(null)}>
          <button onClick={() => setViewingImage(null)} className="absolute top-6 right-6 text-white/70 hover:text-white p-2 transition-colors"><i className="fa-solid fa-xmark text-3xl"></i></button>
          <img src={viewingImage.url} alt="Full View" className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <div className="mt-6 flex gap-4" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { onEdit(viewingImage); setViewingImage(null); }} className="bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-full font-medium backdrop-blur-md transition-all flex items-center gap-2 border border-white/10"><i className="fa-solid fa-sliders"></i> 微调</button>
            <button onClick={() => downloadImage(viewingImage.url, viewingImage.id)} className="bg-white text-black hover:bg-gray-200 px-6 py-3 rounded-full font-bold transition-all flex items-center gap-2"><i className="fa-solid fa-download"></i> 下载原图</button>
          </div>
        </div>
      )}
    </div>
  );
};
