import React, { useState } from 'react';

interface OptionsSelectorProps {
  gender: string;
  setGender: (gender: string) => void;
  scene: string;
  setScene: (scene: string) => void;
  aspectRatio: string;
  setAspectRatio: (ratio: string) => void;
  modelStyle: string;
  setModelStyle: (style: string) => void;
  age: string;
  setAge: (age: string) => void;
  seed: string;
  setSeed: (seed: string) => void;
  prompt: string;
  setPrompt: (prompt: string) => void;
  onResetPrompt: () => void;
  disabled: boolean;
}

// --- Icons ---
const StreetIcon: React.FC<{ className?: string }> = ({ className = "w-8 h-8 mx-auto mb-2 text-slate-400 group-hover:text-purple-600 transition-colors" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M9 18V5l12-2v13"/><path d="m9 11 8-2"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
    </svg>
);
const OutdoorIcon: React.FC<{ className?: string }> = ({ className = "w-8 h-8 mx-auto mb-2 text-slate-400 group-hover:text-purple-600 transition-colors" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.59"/><path d="m18 14 3-3h-3v-3"/>
    </svg>
);
const DrivingIcon: React.FC<{ className?: string }> = ({ className = "w-8 h-8 mx-auto mb-2 text-slate-400 group-hover:text-purple-600 transition-colors" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1 .4-1 1v7c0 .6.4 1 1 1h2"/><path d="M10 17v-5"/><path d="M12 17v-4"/><path d="M14 17v-4"/><path d="M16 17v-1"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/>
    </svg>
);
const FishingIcon: React.FC<{ className?: string }> = ({ className = "w-8 h-8 mx-auto mb-2 text-slate-400 group-hover:text-purple-600 transition-colors" }) => (
     <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M14.5 14.5 21 8"/><path d="M16 16s-1.3 1-3.5 1-3.5-1-3.5-1 1.3-1 3.5-1 3.5 1 3.5 1"/><path d="M18 18s-1.3 1-3.5 1-3.5-1-3.5-1 1.3-1 3.5-1 3.5 1 3.5 1"/><path d="M20 20s-1.3 1-3.5 1-3.5-1-3.5-1 1.3-1 3.5-1 3.5 1 3.5 1"/><path d="m16.5 12.5-9-9"/><path d="M21 11.5v-1a2 2 0 0 0-2-2h-1"/><path d="M3 3v2.5"/><path d="M12.5 5.5 11 4s-1.5 1-3 1-3-1-3-1l-1.5 1.5"/>
    </svg>
);
const ClimbingIcon: React.FC<{ className?: string }> = ({ className = "w-8 h-8 mx-auto mb-2 text-slate-400 group-hover:text-purple-600 transition-colors" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M2 16l2 2 4-4"/><path d="M10 10l-4 4 2 2"/><path d="m14 6-4 4 2 2"/><path d="m22 2-4 4 2 2"/><path d="m12 12-2-2"/><path d="m8 22 4-4"/><path d="M14 16h6v-6"/>
    </svg>
);
const HikingIcon: React.FC<{ className?: string }> = ({ className = "w-8 h-8 mx-auto mb-2 text-slate-400 group-hover:text-purple-600 transition-colors" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M8.5 14.5L7 13l-2.5 2.5"/><path d="M10.5 13.5 9 12l-2.5 2.5"/><path d="M12.5 12.5 11 11l-2.5 2.5"/><path d="m14 6-3.5 3.5"/><path d="M17 3l-3.5 3.5"/><path d="M14 11.5 12 13l-2.5-2.5"/><path d="M11 18.5 9.5 17l-2.5 2.5"/><path d="M14 16l-1.5-1.5-2.5 2.5"/><path d="M18 13l-1.5-1.5-2.5 2.5"/><path d="M21 10l-1.5-1.5-2.5 2.5"/>
    </svg>
);
const ChevronIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
);
const RefreshIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm10 8a1 1 0 011-1v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 011.885-.666A5.002 5.002 0 0014.001 13H11a1 1 0 010-2h5a1 1 0 011 1v5a1 1 0 01-2 0v-2.101a7.002 7.002 0 01-2.457-1.428z" clipRule="evenodd" />
    </svg>
);
const LightbulbIcon: React.FC<{className?: string}> = ({className}) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 mr-2 flex-shrink-0 ${className}`} viewBox="0 0 20 20" fill="currentColor">
        <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4.243 2.243a1 1 0 011.414 1.414l-1 1a1 1 0 01-1.414-1.414l1-1zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM4.243 14.243a1 1 0 010-1.414l1-1a1 1 0 111.414 1.414l-1 1a1 1 0 01-1.414 0zM2 10a1 1 0 011-1h1a1 1 0 110 2H3a1 1 0 01-1-1zM10 16a6 6 0 01-3.465-10.657 1 1 0 01-.93-1.631A8 8 0 1010 16z" />
    </svg>
);


interface Option<T> { key: T; label: string; icon?: React.FC<{ className?: string }> }
const genderOptions: Option<string>[] = [{ key: 'Female', label: '女' }, { key: 'Male', label: '男' }];
const sceneOptions: Option<string>[] = [
    { key: 'Street', label: '街拍', icon: StreetIcon },
    { key: 'Outdoor', label: '户外', icon: OutdoorIcon },
    { key: 'Driving', label: '驾驶', icon: DrivingIcon },
    { key: 'Fishing', label: '钓鱼', icon: FishingIcon },
    { key: 'Climbing', label: '攀登', icon: ClimbingIcon },
    { key: 'Hiking', label: '徒步', icon: HikingIcon }
];
const aspectRatioOptions: Option<string>[] = [{ key: '3:4', label: '3:4' }, { key: '1:1', label: '1:1' }, { key: '9:16', label: '9:16' }, { key: '16:9', label: '16:9' }];
const modelStyleOptions: Option<string>[] = [
    { key: '白种人', label: '欧美' }, 
    { key: '亚洲人', label: '亚洲' }, 
    { key: '拉丁裔', label: '拉丁' }, 
    { key: '非洲裔', label: '非洲' }
];
const ageOptions: Option<string>[] = [{ key: '20-25岁', label: '20-25' }, { key: '25-30岁', label: '25-30' }, { key: '30-35岁', label: '30-35' }];


// --- Reusable Components ---
const SegmentedControl: React.FC<{
    options: Option<string>[];
    selectedKey: string;
    onSelect: (key: string) => void;
    disabled: boolean;
}> = ({ options, selectedKey, onSelect, disabled }) => (
    <div className="flex w-full p-1 bg-slate-900/5 rounded-full">
        {options.map((option) => (
            <button
                key={option.key}
                type="button"
                onClick={() => onSelect(option.key)}
                disabled={disabled}
                className={`w-full text-center px-4 py-2 text-sm font-bold rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 focus:ring-purple-500
                    ${selectedKey === option.key
                        ? 'bg-white text-slate-800 shadow-md'
                        : 'text-slate-600 hover:bg-black/5'
                    }
                    ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                `}
            >{option.label}</button>
        ))}
    </div>
);

const SceneCard: React.FC<{
    option: Option<string>;
    isSelected: boolean;
    onClick: () => void;
    disabled: boolean;
}> = ({ option, isSelected, onClick, disabled }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`group flex flex-col items-center justify-center p-3 rounded-3xl border-2 transition-all duration-300
            ${isSelected
                ? 'bg-white/80 border-purple-500 shadow-lg'
                : 'bg-slate-900/5 border-transparent hover:border-purple-300/50 hover:bg-white/50'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
    >
        {option.icon && <option.icon />}
        <span className={`font-medium text-sm transition-colors ${isSelected ? 'text-slate-800' : 'text-slate-600'}`}>{option.label}</span>
    </button>
);


// --- Main Component ---
export const OptionsSelector: React.FC<OptionsSelectorProps> = ({ gender, setGender, scene, setScene, aspectRatio, setAspectRatio, modelStyle, setModelStyle, age, setAge, seed, setSeed, prompt, setPrompt, onResetPrompt, disabled }) => {
  const [isTuningOpen, setIsTuningOpen] = useState(false);
  const [isPromptOpen, setIsPromptOpen] = useState(false);

  const handleRandomizeSeed = () => {
    setSeed(String(Math.floor(Math.random() * 1000000)));
  };

  return (
    <div className="space-y-6">
      {/* Basic Options */}
      <div>
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">模特性别</h3>
        <SegmentedControl options={genderOptions} selectedKey={gender} onSelect={setGender} disabled={disabled} />
      </div>
      <div>
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">图片比例</h3>
        <SegmentedControl options={aspectRatioOptions} selectedKey={aspectRatio} onSelect={setAspectRatio} disabled={disabled} />
      </div>
       <div>
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">场景</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {sceneOptions.map((option) => (
            <SceneCard
              key={option.key}
              option={option}
              isSelected={scene === option.key}
              onClick={() => setScene(option.key)}
              disabled={disabled}
            />
          ))}
        </div>
      </div>

      {/* Collapsible Fine-Tuning Panel */}
      <div className="border-t border-slate-900/10 pt-6">
          <button
              type="button"
              onClick={() => setIsTuningOpen(!isTuningOpen)}
              className="flex justify-between items-center w-full group"
              aria-expanded={isTuningOpen}
          >
              <h3 className="text-base font-semibold text-slate-700 tracking-tight">精准微调</h3>
              <ChevronIcon className={`w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-transform duration-300 ${isTuningOpen ? 'rotate-180' : ''}`} />
          </button>
          <div className={`grid transition-all duration-500 ease-in-out ${isTuningOpen ? 'grid-rows-[1fr] opacity-100 pt-4' : 'grid-rows-[0fr] opacity-0'}`}>
              <div className="overflow-hidden space-y-4">
                  <div>
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">模特人种</h4>
                      <SegmentedControl options={modelStyleOptions} selectedKey={modelStyle} onSelect={setModelStyle} disabled={disabled} />
                  </div>
                   <div>
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">年龄段</h4>
                      <SegmentedControl options={ageOptions} selectedKey={age} onSelect={setAge} disabled={disabled} />
                  </div>
                  <div>
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">随机种子</h4>
                      <div className="flex items-center space-x-2">
                          <input 
                              type="text"
                              value={seed}
                              onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))}
                              disabled={disabled}
                              className="block w-full px-4 py-2 bg-white/60 text-slate-800 rounded-full border-transparent placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent sm:text-sm"
                              placeholder="输入一个数字..."
                          />
                          <button
                              type="button"
                              onClick={handleRandomizeSeed}
                              disabled={disabled}
                              className="p-2.5 bg-slate-900/5 rounded-full hover:bg-slate-900/10 transition-colors disabled:opacity-50"
                              aria-label="生成新的随机种子"
                           >
                              <RefreshIcon />
                          </button>
                      </div>
                      <div className="mt-3 flex items-start p-3 bg-purple-500/10 rounded-2xl text-purple-700">
                          <LightbulbIcon className="text-purple-500" />
                          <p className="text-xs">
                              <strong>小贴士:</strong> 随机种子是一个数字，它决定了AI生成图片的初始状态。使用相同的种子和设置，可以生成非常相似的图片。点击刷新按钮可获得一个新种子，探索不同结果。
                          </p>
                      </div>
                  </div>
              </div>
          </div>
      </div>

      {/* Collapsible Prompt Editor Panel */}
      <div className="border-t border-slate-900/10 pt-6">
          <button
              type="button"
              onClick={() => setIsPromptOpen(!isPromptOpen)}
              className="flex justify-between items-center w-full group"
              aria-expanded={isPromptOpen}
          >
              <h3 className="text-base font-semibold text-slate-700 tracking-tight">AI 核心提示词</h3>
              <ChevronIcon className={`w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-transform duration-300 ${isPromptOpen ? 'rotate-180' : ''}`} />
          </button>
          <div className={`grid transition-all duration-500 ease-in-out ${isPromptOpen ? 'grid-rows-[1fr] opacity-100 pt-4' : 'grid-rows-[0fr] opacity-0'}`}>
              <div className="overflow-hidden space-y-3">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={disabled}
                    rows={12}
                    className="block w-full px-3 py-2 bg-white/60 text-slate-800 rounded-2xl border-transparent placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent sm:text-sm text-xs font-mono"
                    placeholder="AI 指令将显示在这里..."
                  />
                  <button
                    type="button"
                    onClick={onResetPrompt}
                    disabled={disabled}
                    className="text-sm text-slate-500 hover:text-slate-900 transition-colors hover:underline disabled:opacity-50"
                  >
                    重置为默认值
                  </button>
                  <div className="mt-3 flex items-start p-3 bg-purple-500/10 rounded-2xl text-purple-700">
                      <LightbulbIcon className="text-purple-500" />
                      <p className="text-xs">
                          <strong>小贴士:</strong> 可以通过编辑提示词，获得更理想的图片。
                      </p>
                  </div>
              </div>
          </div>
      </div>

    </div>
  );
};
