import React from 'react';
import { GenerationType } from '../types';
import ModelIcon from './icons/ModelIcon';
import PhotoIcon from './icons/PhotoIcon';

interface GenerationOptionsProps {
  selectedType: GenerationType;
  onTypeChange: (type: GenerationType) => void;
}

const GenerationOptions: React.FC<GenerationOptionsProps> = ({ selectedType, onTypeChange }) => {
  const options = [
    { type: GenerationType.Model, label: '模特图', icon: <ModelIcon className="w-6 h-6" /> },
    { type: GenerationType.Scene, label: '场景图', icon: <PhotoIcon className="w-6 h-6" /> },
  ];

  return (
    <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-700 text-center">2. 选择图片类型</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {options.map((option) => (
                <button
                    key={option.type}
                    onClick={() => onTypeChange(option.type)}
                    className={`flex flex-col items-center justify-center p-6 rounded-3xl border transition-all duration-300 transform hover:scale-105 hover:shadow-lg hover:shadow-purple-200/50 ${
                        selectedType === option.type
                        ? 'bg-white/80 border-purple-400 text-slate-800 scale-105 shadow-lg shadow-purple-200/80'
                        : 'bg-white/40 border-white/80 text-slate-600'
                    }`}
                >
                    {option.icon}
                    <span className="mt-2 font-semibold">{option.label}</span>
                </button>
            ))}
        </div>
    </div>
  );
};

export default GenerationOptions;

