import React, { useState } from 'react';
import type { GeneratedDesign } from '../types';
import { FactoryIcon } from './icons/FactoryIcon';
import { ZoomInIcon } from './icons/ZoomInIcon';
import { CloseIcon } from './icons/CloseIcon';

interface DesignGalleryProps {
  originalImage: string;
  designs: GeneratedDesign[];
  onSelectDesign: (design: GeneratedDesign) => void;
  techPackGenerationCost: number;
  isGenerating?: boolean;
}

type ViewType = 'stillLife' | 'model';

const DesignCard: React.FC<{
  design: GeneratedDesign;
  onSelect: () => void;
  index: number;
  techPackGenerationCost: number;
  isGenerating?: boolean;
}> = ({ design, onSelect, index, techPackGenerationCost, isGenerating = false }) => {
  const [view, setView] = useState<ViewType>('stillLife');
  const [isZoomed, setIsZoomed] = useState(false);
  const hasStillLife = Boolean(design.stillLifeUrl);
  const hasModel = Boolean(design.modelUrl);
  const isReady = hasStillLife && hasModel;

  const currentImageUrl = view === 'model' && hasModel ? design.modelUrl : design.stillLifeUrl;

  return (
    <>
      <div className="bg-white/60 backdrop-blur-md rounded-2xl overflow-hidden shadow-xl flex flex-col border border-white/40 animate-fade-in-up group" style={{ animationDelay: `${index * 150}ms` }}>
        <div className="relative aspect-square overflow-hidden bg-gray-100">
          {currentImageUrl ? (
            <img
              src={currentImageUrl}
              alt={`Generated design ${view}`}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 text-sm font-semibold text-gray-400">
              图片生成中...
            </div>
          )}
          {/* Zoom Button Overlay */}
          <button 
            onClick={() => setIsZoomed(true)}
            className="absolute top-4 right-4 p-2 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-cyan-500 backdrop-blur-sm disabled:cursor-not-allowed disabled:opacity-0"
            title="放大查看"
            disabled={!currentImageUrl}
          >
            <ZoomInIcon className="w-5 h-5" />
          </button>
          
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
            <p className="text-xs text-cyan-400 font-semibold uppercase tracking-wider">
              AI 建议方案 {index + 1}
            </p>
          </div>
        </div>
        
        <div className="p-4 flex-grow flex flex-col">
          <div className="flex justify-center mb-4">
            <div className="inline-flex rounded-lg bg-gray-100 p-1 border border-gray-200">
              <button
                onClick={() => setView('stillLife')}
                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${view === 'stillLife' ? 'bg-black text-white shadow-lg' : 'text-gray-600 hover:text-black hover:bg-gray-200'}`}
                disabled={!hasStillLife}
              >
                静物图
              </button>
              <button
                onClick={() => setView('model')}
                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${view === 'model' ? 'bg-black text-white shadow-lg' : 'text-gray-400'} disabled:cursor-not-allowed`}
                disabled={!hasModel}
              >
                模特图
              </button>
            </div>
          </div>

          {isGenerating && !isReady && (
            <p className="mb-4 text-center text-xs font-medium text-gray-500">
              {hasStillLife ? '模特图生成中...' : '首张效果图生成中...'}
            </p>
          )}
          
          <div className="mt-auto">
            <button
              onClick={onSelect}
              className="w-full px-6 py-3 bg-black text-white font-bold rounded-2xl shadow-lg hover:bg-gray-800 hover:scale-[1.02] transition-all duration-300 flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none disabled:hover:scale-100"
              disabled={!isReady}
            >
              <FactoryIcon className="w-5 h-5" />
              {isReady ? `创建生产资料 (${techPackGenerationCost} 积分)` : '等待全部图片完成'}
            </button>
          </div>
        </div>
      </div>

      {/* Zoom Modal */}
      {isZoomed && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 backdrop-blur-md p-4 animate-fade-in" onClick={() => setIsZoomed(false)}>
          <button 
            onClick={(e) => { e.stopPropagation(); setIsZoomed(false); }}
            className="absolute top-6 right-6 p-4 bg-gray-800 text-white rounded-full hover:bg-red-500 transition-colors z-50 shadow-2xl"
          >
            <CloseIcon className="w-8 h-8" />
          </button>
          <div className="relative max-w-5xl w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <img 
              src={currentImageUrl} 
              alt="Design Zoomed"
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            />
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-md px-6 py-2 rounded-full border border-white/10">
              <p className="text-white font-semibold">{view === 'stillLife' ? '方案静物特写' : '方案上身效果'}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};


export const DesignGallery: React.FC<DesignGalleryProps> = ({
  originalImage,
  designs,
  onSelectDesign,
  techPackGenerationCost,
  isGenerating = false,
}) => {
  return (
    <div className="w-full flex flex-col items-center animate-fade-in">
      <div className="text-center mb-12">
        <h2 className="text-4xl font-black mb-4 text-black">
          {isGenerating ? '已完成的图片会先显示在这里' : 'AI 创意迭代方案'}
        </h2>
        <p className="text-gray-600 max-w-2xl mx-auto">
          {isGenerating
            ? '当前批次仍在继续生成。已经完成的静物图或模特图会立即显示，无需等待全部四张图片结束。'
            : '基于您的设计原型，AI 已经生成了具有量产可行性的迭代方案。请选择一个您最满意的设计来生成详细的技术资料包。'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full max-w-7xl px-4">
        {/* Original Reference */}
        <div className="bg-white/60 backdrop-blur-md rounded-2xl overflow-hidden shadow-xl flex flex-col border border-cyan-500/30">
            <div className="relative aspect-square grayscale-[0.3]">
                <img src={originalImage} alt="Original design" className="w-full h-full object-cover"/>
                <div className="absolute inset-0 bg-cyan-500/10"></div>
            </div>
            <div className="p-4 bg-gray-100/50">
                <h3 className="text-sm font-bold text-center text-cyan-600 uppercase tracking-widest">设计原型 (参考图)</h3>
            </div>
        </div>

        {/* Generated Designs */}
        {designs.map((design, index) => (
          <DesignCard
            key={index}
            design={design}
            index={index}
            techPackGenerationCost={techPackGenerationCost}
            isGenerating={isGenerating}
            onSelect={() => onSelectDesign(design)}
          />
        ))}
      </div>
    </div>
  );
};