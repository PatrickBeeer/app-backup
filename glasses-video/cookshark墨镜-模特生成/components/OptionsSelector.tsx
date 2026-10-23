import React, { useState } from 'react';
import { 
  User, 
  MapPin, 
  Crop, 
  Globe, 
  Calendar, 
  Dices, 
  Sparkles, 
  ChevronDown, 
  Lightbulb, 
  Code2, 
  RotateCcw,
  Compass,
  Car,
  Fish,
  Mountain,
  Footprints,
  SunMedium
} from 'lucide-react';

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

interface Option<T> { 
  key: T; 
  label: string; 
  subLabel?: string;
  icon?: React.FC<{ className?: string }>;
}

const genderOptions: Option<string>[] = [
  { key: 'Female', label: '女性模特' }, 
  { key: 'Male', label: '男性模特' }
];

const sceneOptions: Option<string>[] = [
  { key: 'Street', label: '都市街拍', subLabel: '现代建筑/街头时尚', icon: Compass },
  { key: 'Outdoor', label: '户外风尚', subLabel: '自然的微风光影', icon: Mountain },
  { key: 'Driving', label: '豪车驾驶', subLabel: '敞篷车/奢华座舱', icon: Car },
  { key: 'Fishing', label: '休闲度假', subLabel: '水岸/悠闲光影', icon: Fish },
  { key: 'Climbing', label: '极限硬核', subLabel: '岩壁/工业露质', icon: Mountain },
  { key: 'Hiking', label: '山野徒步', subLabel: '自然小径/景深', icon: Footprints }
];

const aspectRatioOptions: Option<string>[] = [
  { key: '3:4', label: '3:4 时尚海报' }, 
  { key: '1:1', label: '1:1 正方橱窗' }, 
  { key: '9:16', label: '9:16 手机全屏' }, 
  { key: '16:9', label: '16:9 横屏大片' }
];

const modelStyleOptions: Option<string>[] = [
  { key: '白种人', label: '欧美高级脸' }, 
  { key: '亚洲人', label: '亚洲清透感' }, 
  { key: '拉丁裔', label: '拉丁热烈风' }, 
  { key: '非洲裔', label: '酷炫深色调' }
];

const ageOptions: Option<string>[] = [
  { key: '20-25岁', label: '20-25岁 (青春潮酷)' }, 
  { key: '25-30岁', label: '25-30岁 (成熟干练)' }, 
  { key: '30-35岁', label: '30-35岁 (雅致高阶)' }
];

// --- Reusable Controls ---
const SegmentedControl: React.FC<{
  options: Option<string>[];
  selectedKey: string;
  onSelect: (key: string) => void;
  disabled: boolean;
  cols?: string;
}> = ({ options, selectedKey, onSelect, disabled, cols }) => (
  <div className={`grid ${cols || 'grid-cols-' + options.length} gap-1.5 p-1 bg-zinc-950/80 rounded-xl border border-zinc-800/80`}>
    {options.map((option) => {
      const isSelected = selectedKey === option.key;
      return (
        <button
          key={option.key}
          type="button"
          onClick={() => onSelect(option.key)}
          disabled={disabled}
          className={`text-center px-3 py-2 text-xs font-semibold rounded-lg transition-all duration-200 focus:outline-none ${
            isSelected
              ? 'bg-gradient-to-r from-amber-500/20 to-amber-600/20 text-amber-300 border border-amber-500/40 shadow-sm shadow-amber-500/10'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {option.key === '3:4' || option.key === '1:1' || option.key === '9:16' || option.key === '16:9' ? option.key : option.label}
        </button>
      );
    })}
  </div>
);

const SceneCard: React.FC<{
  option: Option<string>;
  isSelected: boolean;
  onClick: () => void;
  disabled: boolean;
}> = ({ option, isSelected, onClick, disabled }) => {
  const IconComponent = option.icon || SunMedium;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group flex flex-col items-start p-3 rounded-xl border text-left transition-all duration-200 ${
        isSelected
          ? 'bg-amber-500/10 border-amber-500/50 text-amber-200 shadow-md shadow-amber-500/5'
          : 'bg-zinc-950/60 border-zinc-800/80 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900/60 hover:text-zinc-200'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div className="flex items-center space-x-2 mb-1">
        <IconComponent className={`w-4 h-4 ${isSelected ? 'text-amber-400' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
        <span className="font-bold text-xs">{option.label}</span>
      </div>
      {option.subLabel && (
        <span className="text-[10px] text-zinc-500 truncate w-full">{option.subLabel}</span>
      )}
    </button>
  );
};

export const OptionsSelector: React.FC<OptionsSelectorProps> = ({
  gender,
  setGender,
  scene,
  setScene,
  aspectRatio,
  setAspectRatio,
  modelStyle,
  setModelStyle,
  age,
  setAge,
  seed,
  setSeed,
  prompt,
  setPrompt,
  onResetPrompt,
  disabled
}) => {
  const [isTuningOpen, setIsTuningOpen] = useState(false);
  const [isPromptOpen, setIsPromptOpen] = useState(false);

  const handleRandomizeSeed = () => {
    setSeed(String(Math.floor(Math.random() * 1000000)));
  };

  return (
    <div className="space-y-5">
      {/* Gender */}
      <div>
        <label className="flex items-center space-x-1.5 text-xs font-bold text-amber-400/90 uppercase tracking-wider mb-2">
          <User className="w-3.5 h-3.5" />
          <span>模特性别</span>
        </label>
        <SegmentedControl options={genderOptions} selectedKey={gender} onSelect={setGender} disabled={disabled} />
      </div>

      {/* Aspect Ratio */}
      <div>
        <label className="flex items-center space-x-1.5 text-xs font-bold text-amber-400/90 uppercase tracking-wider mb-2">
          <Crop className="w-3.5 h-3.5" />
          <span>画幅比例</span>
        </label>
        <SegmentedControl options={aspectRatioOptions} selectedKey={aspectRatio} onSelect={setAspectRatio} disabled={disabled} cols="grid-cols-2 sm:grid-cols-4" />
      </div>

      {/* Scene */}
      <div>
        <label className="flex items-center space-x-1.5 text-xs font-bold text-amber-400/90 uppercase tracking-wider mb-2">
          <MapPin className="w-3.5 h-3.5" />
          <span>拍摄场景与环境光影</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
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

      {/* Collapsible Fine-Tuning */}
      <div className="border-t border-zinc-800/80 pt-4">
        <button
          type="button"
          onClick={() => setIsTuningOpen(!isTuningOpen)}
          className="flex justify-between items-center w-full group py-1 text-left"
        >
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-zinc-200 group-hover:text-amber-300 transition-colors">
              高级定制 (模特脸型人种 / 年龄 / 随机种子)
            </span>
          </div>
          <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-300 ${isTuningOpen ? 'rotate-180 text-amber-400' : ''}`} />
        </button>

        {isTuningOpen && (
          <div className="space-y-4 pt-3.5 animate-fade-in">
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">模特人种/面貌风格</label>
              <SegmentedControl options={modelStyleOptions} selectedKey={modelStyle} onSelect={setModelStyle} disabled={disabled} cols="grid-cols-2 sm:grid-cols-4" />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">模特年龄段</label>
              <SegmentedControl options={ageOptions} selectedKey={age} onSelect={setAge} disabled={disabled} cols="grid-cols-3" />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">固定随机种子 (保持模特面孔连贯性)</label>
              <div className="flex items-center space-x-2">
                <input 
                  type="text"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))}
                  disabled={disabled}
                  className="block w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500/60 text-xs font-mono"
                  placeholder="输入数字种子..."
                />
                <button
                  type="button"
                  onClick={handleRandomizeSeed}
                  disabled={disabled}
                  className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-800 hover:border-amber-500/40 text-amber-400 transition-colors shrink-0"
                  title="生成新种子"
                >
                  <Dices className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Collapsible Prompt Editor */}
      <div className="border-t border-zinc-800/80 pt-4">
        <button
          type="button"
          onClick={() => setIsPromptOpen(!isPromptOpen)}
          className="flex justify-between items-center w-full group py-1 text-left"
        >
          <div className="flex items-center space-x-2">
            <Code2 className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-zinc-200 group-hover:text-amber-300 transition-colors">
              查看与修改 AI 渲染指令 (Prompt)
            </span>
          </div>
          <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-300 ${isPromptOpen ? 'rotate-180 text-amber-400' : ''}`} />
        </button>

        {isPromptOpen && (
          <div className="space-y-2.5 pt-3 animate-fade-in">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={disabled}
              rows={8}
              className="block w-full p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-300 focus:outline-none focus:border-amber-500/60 text-xs font-mono leading-relaxed"
              placeholder="AI 渲染指令..."
            />
            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={onResetPrompt}
                disabled={disabled}
                className="text-xs text-zinc-400 hover:text-amber-300 flex items-center space-x-1 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>重置为系统默认模版</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
