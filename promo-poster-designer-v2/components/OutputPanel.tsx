import React from 'react';
import type { GeneratedImage } from '../types';
import { ImageCard } from './ImageCard';
import { SparklesIcon } from './icons/SparklesIcon';

interface OutputPanelProps {
  images: GeneratedImage[];
  isLoading: boolean;
  error: string | null;
  onZoom: (url: string | null) => void;
}

export const OutputPanel: React.FC<OutputPanelProps> = ({ images, isLoading, error, onZoom }) => {
  const renderContent = () => {
    if (error) {
      return <div className="text-center text-red-400 bg-red-900/20 border border-red-800/50 p-4 rounded-lg m-auto">{error}</div>;
    }

    if (images.length === 0 && !isLoading) {
      return (
        <div className="text-center text-slate-600 flex flex-col items-center justify-center h-full">
          <SparklesIcon className="w-16 h-16 text-slate-600 mb-4" />
          <h3 className="text-lg font-semibold text-slate-700">准备好开始创作了吗？</h3>
          <p className="text-slate-600">在左侧填写信息，AI 将为您生成海报灵感。</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {images.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">生成的海报</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {images.map(image => (
                <ImageCard key={image.aspectRatio} image={image} onZoom={onZoom} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white/80 backdrop-blur-xl border border-slate-200 p-6 rounded-2xl shadow-lg min-h-[500px] lg:min-h-full flex flex-col">
      {renderContent()}
    </div>
  );
};

