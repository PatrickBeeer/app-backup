import React, { useState } from 'react';
import { SceneCategory } from '../types';

interface ResultDisplayProps {
  generatedImages: string[] | null;
  isLoading: boolean;
  error: string | null;
  selectedCategory: SceneCategory;
}

const getTitles = (category: SceneCategory): [string, string] => {
  const baseTitle = category === 'standard' ? "车内常规图" : "敞篷特效图";
  return [`${baseTitle} 1`, `${baseTitle} 2`];
};

const SlotLoader: React.FC = () => (
  <svg className="animate-spin h-8 w-8 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

const PlaceholderIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const ResultSlot: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="flex flex-col gap-4 items-center w-full">
    <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
    <div className="aspect-[3/4] w-full bg-slate-100 rounded-xl flex items-center justify-center p-2 border border-slate-300">
      {children}
    </div>
  </div>
);

export const ResultDisplay: React.FC<ResultDisplayProps> = ({ 
  generatedImages, 
  isLoading, 
  error, 
  selectedCategory 
}) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const titles = getTitles(selectedCategory);

  const downloadImage = (imageUrl: string, filename: string) => {
    if (!imageUrl) return;
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full">
          {titles.map((title) => (
            <ResultSlot key={title} title={title}>
              <div className="flex flex-col items-center gap-2">
                <SlotLoader />
                <p className="text-sm text-slate-600 font-medium">生成中...</p>
              </div>
            </ResultSlot>
          ))}
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center text-red-400 bg-red-900/20 p-6 rounded-xl border border-red-800/50">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="font-bold">生成失败</p>
          <p className="text-sm mt-1 font-medium">{error}</p>
        </div>
      );
    }
    
    if (generatedImages && generatedImages.length > 0) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full">
          {generatedImages.map((image, index) => (
            <div key={index} className="flex flex-col gap-4 items-center">
              <h3 className="text-sm font-semibold text-slate-700">{titles[index]}</h3>
              <div 
                className="relative group w-full flex items-center justify-center bg-slate-100 rounded-xl p-2 cursor-pointer aspect-[3/4] border border-slate-300 hover:border-indigo-500 transition-colors"
                onClick={() => setSelectedImage(image)}
              >
                <img 
                  src={image} 
                  alt={`生成结果 ${index + 1}`} 
                  className="max-h-full h-auto w-auto object-contain rounded-lg" 
                />
                
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-60 transition-all duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100 rounded-xl">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                  </svg>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadImage(image, `car_seat_scene_${titles[index].replace(' ', '_')}.png`);
                  }}
                  className="absolute bottom-3 right-3 bg-white/80 text-slate-800 py-2 px-4 rounded-lg backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center gap-2 text-sm font-bold border border-slate-300 hover:bg-slate-100"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  下载
                </button>
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full">
        {titles.map((title) => (
          <ResultSlot key={title} title={title}>
            <PlaceholderIcon />
          </ResultSlot>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-indigo-400">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
        查看结果
      </h2>
      <div className="flex-grow flex items-center justify-center min-h-[300px]">
        {renderContent()}
      </div>

      {selectedImage && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedImage(null)}
          role="dialog"
          aria-modal="true"
          aria-label="放大查看"
        >
          <img 
            src={selectedImage} 
            alt="放大查看" 
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl" 
            onClick={(e) => e.stopPropagation()} 
          />
          <button 
            onClick={() => setSelectedImage(null)} 
            className="absolute top-4 right-4 text-white/80 text-4xl font-light hover:text-white transition-colors"
            aria-label="关闭"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
};

