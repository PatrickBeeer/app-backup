import React, { useState } from 'react';

interface ResultGalleryProps {
  images: string[];
  isGenerating: boolean;
}

const ResultGallery: React.FC<ResultGalleryProps> = ({ images, isGenerating }) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  if (isGenerating) {
    return (
      <div className="w-full h-full flex flex-col">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-indigo-500/10 rounded-xl">
            <svg className="animate-spin text-indigo-400 w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-slate-800 tracking-tight">
            正在生成...
          </h3>
        </div>
        <div className="grid grid-cols-2 gap-6 flex-1">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="aspect-[3/4] bg-slate-100/50 border border-slate-200 rounded-2xl animate-pulse flex flex-col items-center justify-center shadow-sm">
              <div className="w-12 h-12 bg-slate-200/80 rounded-full shadow-sm animate-bounce mb-3 flex items-center justify-center" style={{ animationDelay: `${i * 0.1}s` }}>
                <span className="w-3 h-3 bg-indigo-400 rounded-full"></span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (images.length === 0) {
    return null;
  }

  return (
    <div className="w-full h-full animate-in fade-in slide-in-from-bottom-8 duration-700">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1.5 h-6 bg-indigo-500 rounded-full shadow-lg shadow-indigo-500/30"></div>
        <h3 className="text-xl font-bold text-slate-800 tracking-tight">
          生成结果
        </h3>
      </div>
      
      <div className="grid grid-cols-2 gap-6">
        {images.map((img, index) => (
          <div 
            key={index} 
            className="group relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-100/50 aspect-[3/4] shadow-xl shadow-slate-900/50 cursor-zoom-in hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-500"
            onClick={() => setSelectedImage(img)}
          >
            <img 
              src={img} 
              alt={`生成结果 ${index + 1}`} 
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
            />
            
            <div className="absolute inset-0 bg-white/0 group-hover:bg-white/40 transition-colors duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
              <div className="bg-white/90 backdrop-blur-md px-4 py-2 rounded-full flex items-center gap-2 text-slate-800 shadow-lg transform translate-y-4 group-hover:translate-y-0 transition-all duration-300">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <span className="text-xs font-bold">查看大图</span>
              </div>
            </div>

            <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform translate-y-2 group-hover:translate-y-0 delay-75">
              <a 
                href={img} 
                download={`ai-model-studio-${index + 1}.jpg`}
                onClick={(e) => e.stopPropagation()}
                className="p-2.5 bg-white hover:bg-slate-100 text-slate-800 rounded-full shadow-lg border border-slate-300 flex items-center justify-center"
                title="下载原图"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021.75 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox Modal */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-6xl max-h-screen w-full h-full flex items-center justify-center">
            <img 
              src={selectedImage} 
              alt="全屏预览" 
              className="max-w-full max-h-full object-contain shadow-2xl rounded-2xl ring-1 ring-slate-800" 
              onClick={(e) => e.stopPropagation()} 
            />
            <button 
              onClick={() => setSelectedImage(null)}
              className="absolute top-6 right-6 bg-white hover:bg-slate-100 text-white p-3 rounded-full shadow-lg transition-all border border-slate-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <a 
              href={selectedImage}
              download="ai-generated-model.jpg"
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3.5 rounded-full font-semibold shadow-2xl shadow-indigo-900/20 flex items-center gap-2 transition-all transform hover:scale-105 active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021.75 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              下载原图
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultGallery;

