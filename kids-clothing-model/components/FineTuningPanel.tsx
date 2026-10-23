import React from 'react';
import { ModelAge } from '../types';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { SingleImageUploader } from './SingleImageUploader';

interface FineTuningPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  modelAge: ModelAge;
  onModelAgeChange: (value: ModelAge) => void;
  clothingDetails: string;
  onClothingDetailsChange: (value: string) => void;
  modelBodyType: string;
  onModelBodyTypeChange: (value: string) => void;
  seed: string;
  onSeedChange: (value: string) => void;
  onModelRefUpload: (file: { file: File; base64: string } | null) => void;
  onStyleRefUpload: (file: { file: File; base64: string } | null) => void;
}

export const FineTuningPanel: React.FC<FineTuningPanelProps> = ({
  isOpen,
  onToggle,
  modelAge,
  onModelAgeChange,
  clothingDetails,
  onClothingDetailsChange,
  modelBodyType,
  onModelBodyTypeChange,
  seed,
  onSeedChange,
  onModelRefUpload,
  onStyleRefUpload,
}) => {
  return (
    <div className="border-t border-slate-200/80 pt-6">
      <button
        onClick={onToggle}
        className="w-full flex justify-between items-center text-left text-lg font-semibold text-slate-800"
        aria-expanded={isOpen}
      >
        <span>精准微调 (可选)</span>
        <ChevronDownIcon className={`h-5 w-5 text-slate-500 transition-transform duration-300 ${isOpen ? 'transform rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <div className="mt-6 space-y-6 animate-fade-in">
          {/* Model Age, Body Type, Clothing Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label htmlFor="modelAge" className="block text-sm font-semibold text-slate-600 mb-1">
                模特年龄
              </label>
              <select
                id="modelAge"
                value={modelAge}
                onChange={(e) => onModelAgeChange(e.target.value as ModelAge)}
                className="block w-full pl-3 pr-10 py-2 text-base bg-white/50 border border-white/80 focus:outline-none focus:ring-purple-400 focus:border-purple-400 sm:text-sm rounded-xl backdrop-blur-sm"
              >
                {Object.values(ModelAge).map((age) => (
                  <option key={age} value={age}>{age}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="modelBodyType" className="block text-sm font-semibold text-slate-600 mb-1">
                模特体型描述
              </label>
              <input
                type="text"
                id="modelBodyType"
                value={modelBodyType}
                onChange={(e) => onModelBodyTypeChange(e.target.value)}
                className="block w-full shadow-sm sm:text-sm bg-white/50 border border-white/80 rounded-xl focus:ring-purple-400 focus:border-purple-400 backdrop-blur-sm"
                placeholder="例如: 微胖，身材匀称"
              />
            </div>
          </div>
          <div>
            <label htmlFor="clothingDetails" className="block text-sm font-semibold text-slate-600 mb-1">
              服装细节描述
            </label>
            <textarea
              id="clothingDetails"
              rows={2}
              value={clothingDetails}
              onChange={(e) => onClothingDetailsChange(e.target.value)}
              className="block w-full shadow-sm sm:text-sm bg-white/50 border border-white/80 rounded-xl focus:ring-purple-400 focus:border-purple-400 backdrop-blur-sm"
              placeholder="例如: T恤塞在裤子里，袖口卷起"
            />
          </div>
        
          {/* Reference Images */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SingleImageUploader 
              title="面部参考图"
              description="上传一张模特照片"
              onImageUpload={onModelRefUpload}
            />
            <SingleImageUploader
              title="风格参考图"
              description="上传一张场景/风格照片"
              onImageUpload={onStyleRefUpload}
            />
          </div>

          {/* Seed */}
          <div>
            <label htmlFor="seed" className="block text-sm font-semibold text-slate-600 mb-1">
              随机种子 (可选)
            </label>
            <input
              type="number"
              id="seed"
              min="0"
              value={seed}
              onChange={(e) => onSeedChange(e.target.value)}
              className="block w-full shadow-sm sm:text-sm bg-white/50 border border-white/80 rounded-xl focus:ring-purple-400 focus:border-purple-400 backdrop-blur-sm"
              placeholder="输入一个数字以复现相似结果"
            />
          </div>
        </div>
      )}
    </div>
  );
};

