import React from 'react';
import { AspectRatio } from '../types';
import { ASPECT_RATIOS } from '../constants';

interface AspectRatioSelectorProps {
  selectedRatio: AspectRatio;
  setSelectedRatio: (ratio: AspectRatio) => void;
  texts: Record<string, string>;
}

export const AspectRatioSelector: React.FC<AspectRatioSelectorProps> = ({ selectedRatio, setSelectedRatio, texts }) => {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-600 uppercase tracking-wider mb-4 pl-1">
        {texts.aspectRatioTitle}
      </h3>
      <div className="flex gap-3">
        {ASPECT_RATIOS.map(ratio => (
          <button
            key={ratio}
            onClick={() => setSelectedRatio(ratio)}
            className={`flex-1 py-4 text-sm font-bold rounded-xl transition-all duration-300 transform border backdrop-blur-sm flex items-center justify-center min-h-[44px] ${
              selectedRatio === ratio
                ? 'bg-orange-600 text-white border-orange-500 shadow-lg shadow-orange-500/30 scale-105'
                : 'bg-slate-200/50 text-slate-700 border-slate-600 hover:bg-slate-200 hover:scale-105 hover:shadow-md'
            }`}
          >
            {ratio}
          </button>
        ))}
      </div>
    </div>
  );
};

