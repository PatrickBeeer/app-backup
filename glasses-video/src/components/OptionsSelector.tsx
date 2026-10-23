import React, { useState } from 'react';
import {
  User,
  MapPin,
  Crop,
  Dices,
  Sparkles,
  ChevronDown,
  Code2,
  RotateCcw,
  Compass,
  Car,
  Fish,
  Mountain,
  Footprints,
  SunMedium,
  Frame,
} from 'lucide-react';

interface OptionsSelectorProps {
  gender: string;
  setGender: (gender: string) => void;
  scene: string;
  setScene: (scene: string) => void;
  ratio: string;
  setRatio: (ratio: string) => void;
  framing: string;
  setFraming: (framing: string) => void;
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
  { key: 'female', label: '女性模特' },
  { key: 'male', label: '男性模特' },
];

const sceneOptions: Option<string>[] = [
  { key: 'outdoor', label: '户外生活', subLabel: '自然的微风光影', icon: Mountain },
  { key: 'street', label: '城市街拍', subLabel: '现代建筑/街头时尚', icon: Compass },
  { key: 'driving', label: '驾驶场景', subLabel: '真实驾驶舱/座舱光影', icon: Car },
  { key: 'fishing', label: '钓鱼休闲', subLabel: '水岸/悠闲光影', icon: Fish },
  { key: 'climbing', label: '山地攀登', subLabel: '岩壁/工业质感', icon: Mountain },
  { key: 'hiking', label: '轻户外徒步', subLabel: '自然小径/景深', icon: Footprints },
];

const ratioOptions: Option<string>[] = [
  { key: '3:4', label: '3:4 时尚海报' },
  { key: '1:1', label: '1:1 正方橱窗' },
  { key: '9:16', label: '9:16 手机全屏' },
  { key: '16:9', label: '16:9 横屏大片' },
];

const modelStyleOptions: Option<string>[] = [
  { key: 'white', label: '欧美高级脸' },
  { key: 'asian', label: '亚洲清透感' },
  { key: 'latino', label: '拉丁热烈风' },
  { key: 'african', label: '酷炫深色调' },
];

const ageOptions: Option<string>[] = [
  { key: '20–25 岁', label: '20–25 岁 (青春潮酷)' },
  { key: '25–30 岁', label: '25–30 岁 (成熟干练)' },
  { key: '30–35 岁', label: '30–35 岁 (雅致高阶)' },
];

const RATIO_KEYS = new Set(['3:4', '1:1', '9:16', '16:9']);

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
      const display = RATIO_KEYS.has(option.key) ? option.key : option.label;
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
          {display}
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

const FieldLabel: React.FC<{ icon: React.FC<{ className?: string }>; children: React.ReactNode; hint?: string }> = ({ icon: Icon, children, hint }) => (
  <label className="flex items-center justify-between space-x-1.5 text-xs font-bold text-amber-400/90 uppercase tracking-wider mb-2">
    <span className="flex items-center space-x-1.5">
      <Icon className="w-3.5 h-3.5" />
      <span>{children}</span>
    </span>
    {hint && <span className="text-zinc-500 normal-case font-medium tracking-normal">{hint}</span>}
  </label>
);

export const OptionsSelector: React.FC<OptionsSelectorProps> = ({
  gender,
  setGender,
  scene,
  setScene,
  ratio,
  setRatio,
  framing,
  setFraming,
  modelStyle,
  setModelStyle,
  age,
  setAge,
  seed,
  setSeed,
  prompt,
  setPrompt,
  onResetPrompt,
  disabled,
}) => {
  const [isTuningOpen, setIsTuningOpen] = useState(false);
  const [isPromptOpen, setIsPromptOpen] = useState(false);

  const handleRandomizeSeed = () => {
    setSeed(String(Math.floor(Math.random() * 1000000)));
  };

  const framingOptions: Option<string>[] = scene === 'driving'
    ? [{ key: '特写', label: '特写' }, { key: '半身', label: '半身' }]
    : [{ key: '特写', label: '特写' }, { key: '半身', label: '半身' }, { key: '全身', label: '全身' }];

  return (
    <div className="space-y-5">
      {/* Gender */}
      <div>
        <FieldLabel icon={User}>模特性别</FieldLabel>
        <SegmentedControl options={genderOptions} selectedKey={gender} onSelect={setGender} disabled={disabled} />
      </div>

      {/* Aspect Ratio */}
      <div>
        <FieldLabel icon={Crop}>画幅比例</FieldLabel>
        <SegmentedControl options={ratioOptions} selectedKey={ratio} onSelect={setRatio} disabled={disabled} cols="grid-cols-2 sm:grid-cols-4" />
      </div>

      {/* Framing (existing-only control; not in cookshark reference) */}
      <div>
        <FieldLabel icon={Frame} hint={scene === 'driving' ? '车内适配' : undefined}>构图范围</FieldLabel>
        <SegmentedControl options={framingOptions} selectedKey={framing} onSelect={setFraming} disabled={disabled} />
      </div>

      {/* Scene */}
      <div>
        <FieldLabel icon={MapPin}>拍摄场景与环境光影</FieldLabel>
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
          <div className="space-y-4 pt-3.5">
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">模特人种/面貌风格</label>
              <SegmentedControl options={modelStyleOptions} selectedKey={modelStyle} onSelect={setModelStyle} disabled={disabled} cols="grid-cols-2 sm:grid-cols-4" />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">模特年龄段</label>
              <SegmentedControl options={ageOptions} selectedKey={age} onSelect={setAge} disabled={disabled} cols="grid-cols-1 sm:grid-cols-3" />
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
          <div className="space-y-2.5 pt-3">
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
