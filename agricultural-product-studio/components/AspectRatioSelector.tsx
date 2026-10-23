import React from 'react';
import type { AspectRatio } from '../types';

interface AspectRatioSelectorProps {
  selectedRatio: AspectRatio;
  onRatioSelect: (ratio: AspectRatio) => void;
}

const ratios: { value: AspectRatio; label: string }[] = [
  { value: '1:1', label: '方形' },
  { value: '4:3', label: '横图' },
  { value: '3:4', label: '竖图' },
  { value: '9:16', label: '故事' },
];

export const AspectRatioSelector: React.FC<AspectRatioSelectorProps> = ({ selectedRatio, onRatioSelect }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 items-center gap-3">
      {ratios.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => onRatioSelect(value)}
          aria-pressed={selectedRatio === value}
          className={`w-full rounded-xl py-3 px-2 text-sm font-bold transition-all duration-300 ease-in-out transform hover:scale-105 ${
            selectedRatio === value
              ? 'bg-black text-white shadow-lg'
              : 'bg-white/40 backdrop-blur-sm text-black border border-white/40 hover:bg-white/60'
          }`}
        >
          {label} ({value})
        </button>
      ))}
    </div>
  );
};

