import React from 'react';
import RefreshIcon from './icons/RefreshIcon';
import LightbulbIcon from './icons/LightbulbIcon';

interface SeedInputProps {
  seed: string;
  setSeed: (seed: string) => void;
  stepNumber: number;
}

const SeedInput: React.FC<SeedInputProps> = ({ seed, setSeed, stepNumber }) => {
  const generateNewSeed = () => {
    setSeed(String(Math.floor(Math.random() * 1000000)));
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-slate-700 text-center">{stepNumber}. 设置随机种子</h2>
      <div className="relative">
        <input
          type="text"
          value={seed}
          onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))}
          className="w-full pl-4 pr-10 py-2 rounded-full border bg-white/30 border-white/70 text-slate-700 focus:ring-purple-500 focus:border-purple-500 transition-colors placeholder:text-slate-500"
          placeholder="输入一个数字..."
        />
        <button
          onClick={generateNewSeed}
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-purple-600 transition-colors"
          aria-label="生成新种子"
        >
          <RefreshIcon className="w-5 h-5" />
        </button>
      </div>
      <div className="flex items-start gap-2 p-3 bg-white/20 border border-white/40 rounded-2xl text-xs text-slate-600">
        <LightbulbIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-yellow-500" />
        <span>
          <strong>小贴士：</strong> 种子决定了图片的初始随机性。使用相同的种子和提示词可以生成相似的图片，便于系列创作。点击刷新按钮可获得全新种子，探索不同创意。
        </span>
      </div>
    </div>
  );
};

export default SeedInput;

