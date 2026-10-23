import React from 'react';
import type { StyleOption, AspectRatio } from '../types';
import { StyleSelector } from './StyleSelector';
import { AspectRatioSelector } from './AspectRatioSelector';
import { SparklesIcon } from './icons/SparklesIcon';

interface ControlsPanelProps {
  isImageUploaded: boolean;
  isAnalyzing: boolean;
  analysisError: string | null;
  sellingPoints: string;
  onSellingPointsChange: (value: string) => void;
  selectedStyle: StyleOption | null;
  onStyleSelect: (style: StyleOption) => void;
  aspectRatio: AspectRatio;
  onAspectRatioChange: (ratio: AspectRatio) => void;
  customPrompt: string;
  onCustomPromptChange: (value: string) => void;
  onGenerate: () => void;
  onReset: () => void;
  isGenerateDisabled: boolean;
  isLoading: boolean;
  pointsPerImage: number;
  imageCount: number;
  totalGenerationCost: number;
}

const ControlSection: React.FC<{ title: string, description: string, children: React.ReactNode, isEnabled?: boolean }> = ({ title, description, children, isEnabled = true }) => (
  <div className={`transition-opacity duration-300 ${isEnabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
    <h3 className="text-lg font-bold text-black tracking-tight">{title}</h3>
    <p className="text-slate-600 mb-4 text-sm">{description}</p>
    {children}
  </div>
);


export const ControlsPanel: React.FC<ControlsPanelProps> = ({
  isImageUploaded,
  isAnalyzing,
  analysisError,
  sellingPoints,
  onSellingPointsChange,
  selectedStyle,
  onStyleSelect,
  aspectRatio,
  onAspectRatioChange,
  customPrompt,
  onCustomPromptChange,
  onGenerate,
  onReset,
  isGenerateDisabled,
  isLoading,
  pointsPerImage,
  imageCount,
  totalGenerationCost,
}) => {
  return (
    <div className="bg-white/60 backdrop-blur-xl border border-white/40 shadow-2xl shadow-blue-500/10 rounded-[2rem] p-8 flex flex-col gap-8 sticky top-8">
      
      <ControlSection title="1. AI 卖点分析" description="AI 自动分析产品特点，您也可以手动编辑。" isEnabled={isImageUploaded}>
        {isAnalyzing && (
          <div className="flex items-center gap-3 text-slate-600 text-sm">
            <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
            <span>正在分析产品卖点...</span>
          </div>
        )}
        {analysisError && <p className="text-amber-700 text-sm">{analysisError}</p>}
        {!isAnalyzing && isImageUploaded && (
          <textarea
            value={sellingPoints}
            onChange={(e) => onSellingPointsChange(e.target.value)}
            placeholder="等待 AI 分析结果..."
            className="w-full h-28 p-3 rounded-xl bg-white/40 backdrop-blur-sm border border-white/40 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all text-sm"
          />
        )}
      </ControlSection>

      <hr className="border-white/40" />

      <ControlSection title="2. 场景与风格" description="选择一个美学风格，并定义图片比例。" isEnabled={isImageUploaded && !isAnalyzing && !!sellingPoints}>
        <StyleSelector
          selectedStyle={selectedStyle}
          onStyleSelect={onStyleSelect}
        />
        <h4 className="font-bold text-black tracking-tight mt-6 mb-3 text-base">图片比例</h4>
        <AspectRatioSelector 
          selectedRatio={aspectRatio}
          onRatioSelect={onAspectRatioChange}
        />
      </ControlSection>
      
      <hr className="border-white/40" />
      
      <ControlSection title="3. 自定义 (可选)" description="输入自定义提示词以精确控制生成效果。" isEnabled={isImageUploaded && !!selectedStyle}>
        <textarea
            value={customPrompt}
            onChange={(e) => onCustomPromptChange(e.target.value)}
            placeholder="例如：特写镜头，晨光，有水滴"
            className="w-full h-24 p-3 rounded-xl bg-white/40 backdrop-blur-sm border border-white/40 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all text-sm"
          />
      </ControlSection>

      <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-white/40">
        <button
          onClick={onGenerate}
          disabled={isGenerateDisabled}
          className="w-full flex-grow flex items-center justify-center gap-2 bg-black text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.02] transform transition-all duration-300 ease-in-out disabled:bg-slate-400 disabled:scale-100 disabled:cursor-not-allowed"
        >
          <SparklesIcon className="w-5 h-5" />
          {isLoading
            ? '生成中...'
            : `生成场景图 (${pointsPerImage} 积分/张, ${imageCount} 张共 ${totalGenerationCost} 积分)`}
        </button>
        <button
          onClick={onReset}
          className="w-full sm:w-auto bg-white/60 backdrop-blur-sm border border-white/40 text-black font-semibold py-3 px-5 rounded-xl hover:bg-white/80 transition-colors"
        >
          重置
        </button>
      </div>

    </div>
  );
};

