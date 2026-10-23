import React from 'react';
import type { StyleOption } from '../types';
import { BabyIcon } from './icons/BabyIcon';
import { LeafIcon } from './icons/LeafIcon';
import { UserIcon } from './icons/UserIcon';

interface StyleSelectorProps {
  selectedStyle: StyleOption | null;
  onStyleSelect: (style: StyleOption) => void;
}

interface StyleCardProps {
  style: StyleOption;
  title: string;
  description: string;
  icon: React.ReactNode;
  isSelected: boolean;
  onSelect: () => void;
}

const StyleCard: React.FC<StyleCardProps> = ({ title, description, icon, isSelected, onSelect }) => {
  return (
    <button
      onClick={onSelect}
      aria-pressed={isSelected}
      className={`p-4 rounded-2xl text-left w-full transition-all duration-300 flex items-center gap-4 border ${
        isSelected
          ? 'bg-white/70 backdrop-blur-md border-blue-500/50 ring-2 ring-blue-500'
          : 'bg-white/40 backdrop-blur-sm border-white/40 hover:bg-white/60 hover:border-white/60'
      }`}
    >
      <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-500 text-white' : 'bg-white/50 text-slate-600'}`}>
        {icon}
      </div>
      <div>
        <h3 className="font-bold text-black">{title}</h3>
        <p className="text-sm text-slate-600">{description}</p>
      </div>
    </button>
  );
};


export const StyleSelector: React.FC<StyleSelectorProps> = ({ selectedStyle, onStyleSelect }) => {
  return (
    <div className="grid grid-cols-1 gap-4">
      <StyleCard
        style="baby"
        title="母婴亲和"
        description="风格柔软、干净、安全。非常适合婴幼儿可用的产品。"
        icon={<BabyIcon className="w-6 h-6" />}
        isSelected={selectedStyle === 'baby'}
        onSelect={() => onStyleSelect('baby')}
      />
      <StyleCard
        style="natural"
        title="自然高端"
        description="风格质朴、真实、新鲜。突显产品的自然来源。"
        icon={<LeafIcon className="w-6 h-6" />}
        isSelected={selectedStyle === 'natural'}
        onSelect={() => onStyleSelect('natural')}
      />
      <StyleCard
        style="model"
        title="模特展示"
        description="将产品与模特结合，展示使用场景，增加生活气息。"
        icon={<UserIcon className="w-6 h-6" />}
        isSelected={selectedStyle === 'model'}
        onSelect={() => onStyleSelect('model')}
      />
    </div>
  );
};

