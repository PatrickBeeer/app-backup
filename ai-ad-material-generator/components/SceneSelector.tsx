import React, { useState, useMemo } from 'react';
import { SCENES, Scene, SceneCategory } from '../constants';

interface SceneSelectorProps {
  onSelectScene: (scene: Scene) => void;
  isLoading: boolean;
}

const CATEGORIES: { id: SceneCategory | 'all'; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'outdoor', label: '户外/建筑' },
  { id: 'commercial', label: '商业/餐饮' },
  { id: 'office', label: '办公/室内' },
];

export const SceneSelector: React.FC<SceneSelectorProps> = ({ onSelectScene, isLoading }) => {
  const [activeCategory, setActiveCategory] = useState<SceneCategory | 'all'>('all');
  const filteredScenes = useMemo(() => {
    if (activeCategory === 'all') return SCENES;
    return SCENES.filter((s) => s.category === activeCategory);
  }, [activeCategory]);
  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-gray-100 pb-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${activeCategory === cat.id ? 'bg-black text-lime-300 shadow-hard-sm translate-x-[-1px] translate-y-[-1px]' : 'bg-white text-gray-500 hover:text-black hover:bg-gray-50'}`}
          >
            {cat.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {filteredScenes.map((scene) => {
          const isCustom = scene.id === 'custom';
          return (
            <button
              key={scene.id}
              onClick={() => onSelectScene(scene)}
              disabled={isLoading}
              className={`group relative h-20 bg-white border border-gray-200 p-3 flex flex-col items-start justify-between hover:border-black hover:bg-black hover:text-lime-300 transition-all duration-200 hover:-translate-y-1 hover:shadow-hard disabled:opacity-50 disabled:pointer-events-none ${isCustom ? 'border-dashed border-gray-400 bg-gray-50/50' : ''}`}
            >
              <span className="text-[10px] font-mono uppercase text-gray-400 group-hover:text-lime-300/70">{isCustom ? 'CUSTOM' : scene.category.toUpperCase()}</span>
              <span className="text-sm font-bold tracking-tight text-left leading-tight w-full truncate">{scene.name}</span>
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {isCustom ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18.8-2.685 4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg> : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
