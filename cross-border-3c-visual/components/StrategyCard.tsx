import React from 'react';
import { ImageStrategy, AspectRatio } from '../types';

interface StrategyCardProps {
  strategy: ImageStrategy;
  aspectRatio: AspectRatio;
  imageCost: number;
  imageUrl: string | null;
  isLoading: boolean;
  onGenerate: () => void;
  onPromptChange: (newPrompt: string) => void;
  onOverlayTextChange: (newText: string) => void;
}

const StrategyCard: React.FC<StrategyCardProps> = ({ 
  strategy, 
  aspectRatio, 
  imageCost,
  imageUrl, 
  isLoading, 
  onGenerate,
  onPromptChange,
  onOverlayTextChange
}) => {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col h-full hover:border-blue-300 transition-all shadow-lg">
      <div className={`relative bg-gray-100 flex items-center justify-center ${aspectRatio === AspectRatio.SQUARE ? 'aspect-square' : 'aspect-[4/5]'}`}>
        {imageUrl ? (
          <img src={imageUrl} alt={strategy.title} className="w-full h-full object-cover animate-in fade-in duration-700" />
        ) : (
          <div className="p-8 text-center w-full">
            {isLoading ? (
              <div className="flex flex-col items-center">
                <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                <p className="text-sm text-gray-500 font-medium">视觉生成中...</p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-gray-600 text-sm font-bold uppercase tracking-wider">PREVIEW PENDING</p>
                <button 
                  onClick={onGenerate}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-lg transition-all shadow-lg shadow-blue-500/20"
                >
                  生成此图 ({imageCost}积分)
                </button>
              </div>
            )}
          </div>
        )}
        {imageUrl && !isLoading && (
          <div className="absolute top-2 right-2">
            <button 
              onClick={onGenerate}
              className="bg-white/90 backdrop-blur-md p-2 rounded-full text-gray-700 hover:text-gray-900 shadow-lg border border-gray-200 transition-colors"
              title="重新生成"
            >
               <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
               </svg>
            </button>
          </div>
        )}
      </div>

      <div className="p-5 flex-1 flex flex-col gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-blue-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded">IMG {strategy.id}</span>
            <h3 className="text-sm font-bold text-gray-900">{strategy.title}</h3>
          </div>
          
          <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
            文案/卖点 (COPYWRITING)
          </label>
          <input
            type="text"
            value={strategy.overlayText || ''}
            onChange={(e) => onOverlayTextChange(e.target.value)}
            placeholder="输入要在图片中展示的文案..."
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          />
        </div>
        
        <div className="flex-1 flex flex-col">
          <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
            AI 生图提示词 (PROMPT)
          </label>
          <textarea
            value={strategy.aiPrompt}
            onChange={(e) => onPromptChange(e.target.value)}
            className="w-full flex-1 bg-gray-50 border border-gray-200 rounded-lg p-3 text-[11px] text-gray-700 font-mono leading-relaxed focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none min-h-[100px]"
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
};

export default StrategyCard;
