import React from 'react';
import { SceneType, UploadedImageData } from '../types';
import { SCENE_TYPES } from '../constants';
import { Check } from 'lucide-react';

interface SceneSelectorProps {
  selectedScene: SceneType;
  onSelectScene: (scene: SceneType) => void;
  customPrompt: string;
  onCustomPromptChange: (prompt: string) => void;
}

export const SceneSelector: React.FC<SceneSelectorProps> = ({ 
  selectedScene, 
  onSelectScene,
  customPrompt,
  onCustomPromptChange
}) => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        {SCENE_TYPES.map((scene) => (
          <button
            key={scene.id}
            onClick={() => onSelectScene(scene)}
            className={`
              relative flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all duration-300
              ${selectedScene.id === scene.id
                ? 'bg-black text-white border-black shadow-lg scale-[1.02]'
                : 'bg-white/40 text-gray-500 border-white/40 hover:border-black/20 hover:text-black'
              }
            `}
          >
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-center">
              {scene.name}
            </p>
            {selectedScene.id === scene.id && (
              <div className="absolute -top-2 -right-2 bg-black text-white p-1 rounded-lg shadow-xl border border-white/20">
                <Check className="w-2.5 h-2.5" strokeWidth={4} />
              </div>
            )}
          </button>
        ))}
      </div>

      {selectedScene.id === 'custom-scene' && (
        <div className="animate-in fade-in slide-in-from-top-4 duration-500">
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 ml-1">
            自定义场景描述 / Custom Prompt
          </label>
          <textarea
            value={customPrompt}
            onChange={(e) => onCustomPromptChange(e.target.value)}
            placeholder="例如：一个充满赛博朋克风格的霓虹街道，地面有积水倒影..."
            className="input-glass w-full h-56 text-sm font-medium placeholder:text-gray-400 resize-none"
          />
        </div>
      )}
    </div>
  );
};
