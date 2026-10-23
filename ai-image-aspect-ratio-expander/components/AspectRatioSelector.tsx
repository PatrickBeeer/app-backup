import React from 'react';
import type { AspectRatio } from '../types';

interface AspectRatioSelectorProps {
  ratios: AspectRatio[];
  selectedRatio: AspectRatio;
  onSelectRatio: (ratio: AspectRatio) => void;
}

export const AspectRatioSelector: React.FC<AspectRatioSelectorProps> = ({ ratios, selectedRatio, onSelectRatio }) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
      {ratios.map((ratio) => (
        <button
          key={ratio.value}
          onClick={() => onSelectRatio(ratio)}
          className={`p-3 rounded-lg font-semibold text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-blue-500
            ${selectedRatio.value === ratio.value 
              ? 'bg-blue-600 text-white shadow-md scale-105' 
              : 'bg-slate-100 text-slate-700 hover:bg-slate-300 border border-slate-300'
            }`}
        >
          {ratio.label}
        </button>
      ))}
    </div>
  );
};

