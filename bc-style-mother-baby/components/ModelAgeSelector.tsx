import React from 'react';
import { ModelAge } from '../types';

interface ModelAgeSelectorProps {
  selectedAge: ModelAge;
  setSelectedAge: (age: ModelAge) => void;
  texts: Record<string, string>;
}

const AGES: ModelAge[] = ['0-1岁', '1-3岁', '3-5岁', '5-7岁', '7-12岁', '12岁+'];

export const ModelAgeSelector: React.FC<ModelAgeSelectorProps> = ({ selectedAge, setSelectedAge, texts }) => {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-600 uppercase tracking-wider mb-4 pl-1">
        {texts.modelAgeTitle}
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {AGES.map(age => (
          <button
            key={age}
            onClick={() => setSelectedAge(age)}
            className={`px-4 py-4 text-sm font-bold rounded-xl transition-all duration-300 transform border backdrop-blur-sm flex items-center justify-center min-h-[44px] ${
              selectedAge === age
                ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/30 scale-105'
                : 'bg-slate-200/50 text-slate-700 border-slate-600 hover:bg-slate-200 hover:scale-105 hover:shadow-md'
            }`}
          >
            {texts[age]}
          </button>
        ))}
      </div>
    </div>
  );
};

