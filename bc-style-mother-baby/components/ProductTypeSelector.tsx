import React from 'react';
import { ToyCategory } from '../types';
import { TOY_CATEGORIES } from '../constants';

interface ProductTypeSelectorProps {
  selectedCategory: ToyCategory;
  setSelectedCategory: (category: ToyCategory) => void;
  texts: Record<string, string>;
}

export const ProductTypeSelector: React.FC<ProductTypeSelectorProps> = ({ selectedCategory, setSelectedCategory, texts }) => {
  return (
    <div>
      <h4 className="flex items-center gap-2 text-sm font-bold text-slate-600 uppercase tracking-wider mb-4 pl-1">
        {texts.productTypeTitle}
      </h4>
      <div className="flex flex-wrap gap-3">
        {TOY_CATEGORIES.map(category => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`px-5 py-3 text-sm font-bold rounded-xl transition-all duration-300 transform border backdrop-blur-sm min-h-[44px] ${
              selectedCategory === category
                ? 'bg-slate-200 text-slate-800 border-slate-600 shadow-lg shadow-slate-700/20 scale-105'
                : 'bg-slate-100/50 text-slate-700 border-slate-300 hover:bg-slate-200 hover:scale-105 hover:shadow-md'
            }`}
          >
            {texts[category] || category}
          </button>
        ))}
      </div>
    </div>
  );
};

