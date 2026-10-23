import React, { useState } from 'react';
import ChevronDownIcon from './icons/ChevronDownIcon';

interface AspectRatioOptionsProps {
  aspectRatio: string;
  setAspectRatio: (ratio: string) => void;
  stepNumber: number;
}

const AspectRatioOptions: React.FC<AspectRatioOptionsProps> = ({ aspectRatio, setAspectRatio, stepNumber }) => {
  const [isOpen, setIsOpen] = useState(true);

  const ratioOptions = [
    { value: '1:1', label: '方形 (1:1)' },
    { value: '4:3', label: '横向 (4:3)' },
    { value: '3:4', label: '纵向 (3:4)' },
    { value: '16:9', label: '宽屏 (16:9)' },
    { value: '9:16', label: '竖屏 (9:16)' },
  ];

  const OptionButton: React.FC<{ label: string; isSelected: boolean; onClick: () => void; }> = ({ label, isSelected, onClick }) => (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-full border text-sm font-medium transition-all duration-200 flex-grow text-center transform hover:scale-105 ${
        isSelected
          ? 'bg-gradient-to-r from-blue-500 to-purple-600 border-transparent text-white shadow-md shadow-purple-300/50'
          : 'bg-white/30 border-white/70 text-slate-600 hover:bg-white/50'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="border rounded-2xl bg-white/20 border-white/40 overflow-hidden transition-all duration-300">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex justify-between items-center p-4 text-left focus:outline-none"
          aria-expanded={isOpen}
        >
          <h2 className="text-xl font-semibold text-slate-700">{stepNumber}. 选择图片比例</h2>
          <ChevronDownIcon className={`w-5 h-5 text-slate-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-96' : 'max-h-0'}`}>
          <div className="px-4 pb-4">
            <div className="flex flex-wrap gap-3">
              {ratioOptions.map((option) => (
                <OptionButton key={option.value} label={option.label} isSelected={aspectRatio === option.value} onClick={() => setAspectRatio(option.value)} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AspectRatioOptions;

