import React from 'react';
import { GenerationType } from '../types';
import LoadingSpinner from './LoadingSpinner';

interface GenerationControlsProps {
  selectedTypes: GenerationType[];
  onToggleType: (type: GenerationType) => void;
  onGenerateSelected: () => void;
  isLoading: GenerationType[];
  isDisabled: boolean;
  sceneStyle: string;
  onSceneStyleChange: (style: string) => void;
  modelStyle: string;
  onModelStyleChange: (style: string) => void;
  customPrompt: string;
  onCustomPromptChange: (prompt: string) => void;
  seed: number;
  onSeedChange: (seed: number) => void;
}

const ControlButton: React.FC<{
  icon: React.ReactElement;
  label: string;
  description: string;
  onClick: () => void;
  isLoading: boolean;
  isDisabled: boolean;
  isSelected: boolean;
  children?: React.ReactNode;
}> = ({ icon, label, description, onClick, isLoading, isDisabled, isSelected, children }) => {
  const effectiveDisabled = isDisabled || isLoading;
  const selectedClasses = isSelected ? 'ring-2 ring-blue-500 bg-blue-50/50 border-blue-400' : 'border-slate-200/80 bg-white/50';

  const containerProps = {
    role: 'button',
    tabIndex: effectiveDisabled ? -1 : 0,
    onClick: effectiveDisabled ? undefined : onClick,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (!effectiveDisabled) {
          e.preventDefault();
          onClick();
        }
      }
    },
    className: `group rounded-xl border transition-all duration-200 focus:outline-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 ${selectedClasses} ${effectiveDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/80 cursor-pointer'}`
  };

  return (
    <div {...containerProps}>
      <div className="p-4 flex items-center gap-4">
        <div className="flex-shrink-0 w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
          {isLoading ? <LoadingSpinner /> : icon}
        </div>
        <div className="flex-grow">
          <p className="font-semibold text-slate-800">{label}</p>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </div>
      {children && (
        <div className="pl-16 pr-4 pb-4 -mt-4">
          {children}
        </div>
      )}
    </div>
  );
};

const StyleSelector: React.FC<{
  title: string;
  id: string;
  styles: string[];
  selectedStyle: string;
  onStyleChange: (style: string) => void;
  isDisabled: boolean;
}> = ({ title, id, styles, selectedStyle, onStyleChange, isDisabled }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-semibold text-slate-600 mb-1">
      {title}
    </label>
    <select
      id={id}
      value={selectedStyle}
      onChange={(e) => onStyleChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      disabled={isDisabled}
      className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200 disabled:bg-slate-100 disabled:cursor-not-allowed bg-white appearance-none bg-no-repeat bg-right-2.5"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2364748b' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
        backgroundPosition: 'right 0.5rem center',
        backgroundSize: '1.5em 1.5em',
      }}
    >
      {styles.map(style => (
        <option key={style} value={style}>{style}</option>
      ))}
    </select>
  </div>
);

const GenerationControls: React.FC<GenerationControlsProps> = ({
  selectedTypes,
  onToggleType,
  onGenerateSelected,
  isLoading,
  isDisabled,
  sceneStyle,
  onSceneStyleChange,
  modelStyle,
  onModelStyleChange,
  customPrompt,
  onCustomPromptChange,
  seed,
  onSeedChange,
}) => {
  const sceneStyles = ["温馨婴儿房", "简约家居", "户外草地"];
  const modelStyles = ["中国宝宝", "亚裔混-宝宝", "白人宝宝"];

  const buttons = {
    [GenerationType.OnFoot]: { label: '上脚图', description: '袜子穿在宝宝脚上的样子', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 3.5a.75.75 0 01.75.75v2.502a.75.75 0 01-1.5 0V4.25A.75.75 0 0110 3.5zM8.5 6a.75.75 0 00-1.5 0v2.502a.75.75 0 001.5 0V6zM11.5 6a.75.75 0 00-1.5 0v2.502a.75.75 0 001.5 0V6zM6.5 8.5a.75.75 0 01.75-.75h5a.75.75 0 010 1.5h-5a.75.75 0 01-.75-.75zM4.646 12.854a.5.5 0 00.708 0L6.707 11.5h6.586l1.353 1.354a.5.5 0 00.708-.708l-1.5-1.5a.5.5 0 00-.708 0L12.5 10.293V8.5A2.5 2.5 0 0010 6a2.5 2.5 0 00-2.5 2.5v1.793L6.207 9.5a.5.5 0 00-.708 0l-1.5 1.5a.5.5 0 000 .708zM3 15a1 1 0 001 1h12a1 1 0 100-2H4a1 1 0 00-1 1z" /></svg> },
    [GenerationType.Scene]: { label: '场景图', description: '袜子在特定场景中的样子', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" /></svg> },
    [GenerationType.Model]: { label: '模特图', description: '可爱的宝宝穿着袜子', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg> },
  };

  const isGenerating = isLoading.length > 0;

  const handleRandomizeSeed = () => {
    // INT32 范围：-2,147,483,648 到 2,147,483,647
    // Gemini API 的 seed 必须是 INT32 类型
    const INT32_MAX = 2147483647;
    onSeedChange(Math.floor(Math.random() * INT32_MAX));
  };

  return (
    <div className="space-y-4">
      <ControlButton
        {...buttons[GenerationType.OnFoot]}
        onClick={() => onToggleType(GenerationType.OnFoot)}
        isSelected={selectedTypes.includes(GenerationType.OnFoot)}
        isLoading={isLoading.includes(GenerationType.OnFoot)}
        isDisabled={isDisabled || isGenerating}
      />

      <ControlButton
        {...buttons[GenerationType.Scene]}
        onClick={() => onToggleType(GenerationType.Scene)}
        isSelected={selectedTypes.includes(GenerationType.Scene)}
        isLoading={isLoading.includes(GenerationType.Scene)}
        isDisabled={isDisabled || isGenerating}
      >
        <StyleSelector
          title="选择场景风格"
          id="scene-style-selector"
          styles={sceneStyles}
          selectedStyle={sceneStyle}
          onStyleChange={onSceneStyleChange}
          isDisabled={isDisabled || isGenerating}
        />
      </ControlButton>

      <ControlButton
        {...buttons[GenerationType.Model]}
        onClick={() => onToggleType(GenerationType.Model)}
        isSelected={selectedTypes.includes(GenerationType.Model)}
        isLoading={isLoading.includes(GenerationType.Model)}
        isDisabled={isDisabled || isGenerating}
      >
        <div className="space-y-4">
          <StyleSelector
            title="选择模特人种"
            id="model-style-selector"
            styles={modelStyles}
            selectedStyle={modelStyle}
            onStyleChange={onModelStyleChange}
            isDisabled={isDisabled || isGenerating}
          />
          <div>
            <label htmlFor="custom-prompt" className="block text-sm font-semibold text-slate-600 mb-1">
              自定义提示词 (可选)
            </label>
            <textarea
              id="custom-prompt"
              rows={3}
              value={customPrompt}
              onChange={(e) => onCustomPromptChange(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              disabled={isDisabled || isGenerating}
              placeholder="留空则使用默认提示。填写则会覆盖上方的风格选项，并生成自定义模特图。"
              className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200 disabled:bg-slate-100 disabled:cursor-not-allowed"
            />
          </div>
        </div>
      </ControlButton>

      <div className="border-t border-slate-200/80 pt-4 space-y-4">
        <div>
          <label htmlFor="seed-input" className="block text-sm font-semibold text-slate-600 mb-1">
            随机种子
          </label>
          <div className="relative">
            <input
              type="number"
              id="seed-input"
              value={seed}
              onChange={(e) => onSeedChange(parseInt(e.target.value, 10) || 0)}
              disabled={isDisabled || isGenerating}
              className="w-full p-2 pr-10 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200 disabled:bg-slate-100 disabled:cursor-not-allowed"
            />
            <button
              onClick={handleRandomizeSeed}
              disabled={isDisabled || isGenerating}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-blue-500 disabled:text-slate-300"
              aria-label="生成新的随机种子"
              title="生成新的随机种子"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm10 8a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 111.885-.666A5.002 5.002 0 0014.001 13H11a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50/70 border border-blue-200/50">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1.333a2 2 0 013.333 1.333V9a2 2 0 01-2 2h-1.333a2 2 0 00-1.333 3.333V17a1 1 0 11-2 0v-1.333a2 2 0 00-1.333-3.333H6a2 2 0 01-2-2V5.667a2 2 0 013.333-1.334V3a1 1 0 011-1zm3 10H7v1.333a2 2 0 01-3.333 1.334V17a1 1 0 11-2 0v-1.333a2 2 0 01-1.333-3.333H.667a2 2 0 01-2-2V5.667a2 2 0 013.333-1.334V3a1 1 0 112 0v1.333a2 2 0 011.333 3.333H10a2 2 0 012 2v3.333z" clipRule="evenodd" />
            <path d="M10 18a1 1 0 100-2 1 1 0 000 2zM.667 4.333a1.333 1.333 0 012.666 0v1.334a1.333 1.333 0 01-2.666 0V4.333zM16.667 4.333a1.333 1.333 0 012.666 0v1.334a1.333 1.333 0 01-2.666 0V4.333z" />
          </svg>
          <p className="text-xs text-slate-600">
            <span className="font-bold">小贴士:</span> "随机种子"决定了图片的初始风格。使用相同的种子和提示词可以得到相似的结果，适合创作系列图。点击刷新 <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 inline -mt-0.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm10 8a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 111.885-.666A5.002 5.002 0 0014.001 13H11a1 1 0 01-1-1z" clipRule="evenodd" /></svg> 更换种子以探索新创意。
          </p>
        </div>
      </div>

      <button
        onClick={onGenerateSelected}
        disabled={isDisabled || isGenerating || selectedTypes.length === 0}
        className="w-full mt-4 text-center p-2.5 flex items-center justify-center gap-2 rounded-xl border border-blue-600 bg-blue-500 text-white font-semibold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-sm hover:shadow-md shadow-blue-500/20"
      >
        {isGenerating ? (
          <>
            <LoadingSpinner />
            <span>生成中...</span>
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 3.5a.75.75 0 01.75.75v2.502a.75.75 0 01-1.5 0V4.25A.75.75 0 0110 3.5zM8.5 6a.75.75 0 00-1.5 0v2.502a.75.75 0 001.5 0V6zM11.5 6a.75.75 0 00-1.5 0v2.502a.75.75 0 001.5 0V6zM6.5 8.5a.75.75 0 01.75-.75h5a.75.75 0 010 1.5h-5a.75.75 0 01-.75-.75zM4.646 12.854a.5.5 0 00.708 0L6.707 11.5h6.586l1.353 1.354a.5.5 0 00.708-.708l-1.5-1.5a.5.5 0 00-.708 0L12.5 10.293V8.5A2.5 2.5 0 0010 6a2.5 2.5 0 00-2.5 2.5v1.793L6.207 9.5a.5.5 0 00-.708 0l-1.5 1.5a.5.5 0 000 .708zM3 15a1 1 0 001 1h12a1 1 0 100-2H4a1 1 0 00-1 1z" />
            </svg>
            <span>生成所选 ({selectedTypes.length})</span>
          </>
        )}
      </button>
    </div>
  );
};

export default GenerationControls;
