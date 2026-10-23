import React from 'react';
import { GenerationType } from '../types';

interface GeneratedImagesViewProps {
  sceneImage: string | null;
  animalImage: string | null;
  isLoading: GenerationType | null;
  onZoom: (imageUrl: string) => void;
}

const Placeholder: React.FC<{ title: string; isLoading: boolean }> = ({ title, isLoading }) => (
  <div className="w-full aspect-square bg-white/20 rounded-3xl flex flex-col justify-center items-center text-center p-4">
    {isLoading ? (
      <>
        <div className="w-12 h-12 border-4 border-t-violet-500 border-white/40 rounded-full animate-spin"></div>
        <p className="text-slate-500 text-sm mt-3">正在努力生成中...</p>
      </>
    ) : (
      <>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-slate-500 text-sm mt-2">{title}</p>
      </>
    )}
  </div>
);

const ImageCard: React.FC<{
  title: string;
  imageUrl: string | null;
  isLoading: boolean;
  onZoom: (imageUrl: string) => void;
  downloadFilename: string;
}> = ({ title, imageUrl, isLoading, onZoom, downloadFilename }) => {
  if (!imageUrl) {
    return <Placeholder title={title} isLoading={isLoading} />;
  }

  return (
    <div className="relative group w-full aspect-square">
      <img src={imageUrl} alt={title} className="w-full h-full object-contain bg-white rounded-3xl shadow-lg" />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all duration-300 rounded-3xl flex items-center justify-center space-x-4">
        <a 
          href={imageUrl} 
          download={downloadFilename} 
          className="opacity-0 group-hover:opacity-100 transition-all duration-300 p-3 bg-white/60 backdrop-blur-sm rounded-full hover:bg-white hover:scale-110 text-slate-700"
          aria-label="下载图片"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </a>
        <button 
          onClick={() => onZoom(imageUrl)} 
          className="opacity-0 group-hover:opacity-100 transition-all duration-300 p-3 bg-white/60 backdrop-blur-sm rounded-full hover:bg-white hover:scale-110 text-slate-700"
          aria-label="放大图片"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M5 8a1 1 0 011-1h1V6a1 1 0 012 0v1h1a1 1 0 110 2H9v1a1 1 0 11-2 0V9H6a1 1 0 01-1-1z" />
            <path fillRule="evenodd" d="M2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8zm6-4a4 4 0 100 8 4 4 0 000-8z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export const GeneratedImagesView: React.FC<GeneratedImagesViewProps> = ({ sceneImage, animalImage, isLoading, onZoom }) => {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h3 className="text-lg font-medium text-slate-800">产品场景图</h3>
        <ImageCard 
          title="生成的场景图将显示在此处"
          imageUrl={sceneImage}
          isLoading={isLoading === GenerationType.Scene}
          onZoom={onZoom}
          downloadFilename="产品场景图.png"
        />
      </div>
      <div className="space-y-3">
        <h3 className="text-lg font-medium text-slate-800">动物玩耍图</h3>
        <ImageCard 
          title="生成的动物玩耍图将显示在此处"
          imageUrl={animalImage}
          isLoading={isLoading === GenerationType.Animal}
          onZoom={onZoom}
          downloadFilename="动物玩耍图.png"
        />
      </div>
    </div>
  );
};

