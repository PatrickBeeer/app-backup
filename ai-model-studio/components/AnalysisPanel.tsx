import React from 'react';
import { ModelAnalysis } from '../types';

interface AnalysisPanelProps {
  analysis: ModelAnalysis | null;
  isLoading: boolean;
}

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ analysis, isLoading }) => {
  if (isLoading) {
    return (
      <div className="w-full h-full min-h-[300px] flex flex-col items-center justify-center space-y-4 p-8 border border-slate-200 rounded-xl bg-white/50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
        <p className="text-slate-700 animate-pulse font-medium">正在深度分析模特面部、服装材质与场景...</p>
        <div className="text-xs text-slate-700 max-w-xs text-center">
          Gemini 2.5 正在提取中文特征标签
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="w-full h-full min-h-[200px] flex flex-col items-center justify-center text-slate-700 border border-dashed border-slate-200 rounded-xl p-8 bg-white/20">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mb-4 opacity-20">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
        <p>等待上传图片以开始分析...</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6 shadow-xl">
      <div className="flex items-center justify-between mb-2 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="text-indigo-400 w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          <h3 className="text-lg font-semibold text-slate-800">AI 特征分析报告</h3>
        </div>
        <span className="text-xs font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-1 rounded">
          已识别特征
        </span>
      </div>

      <div className="space-y-4">
        <AnalysisItem 
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
          }
          title="光影风格"
          content={analysis.lightingAndStyle}
        />
        <AnalysisItem 
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          }
          title="模特特征 (保持面部一致)"
          content={analysis.genderFeatures}
        />
        <AnalysisItem 
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
            </svg>
          }
          title="服装细节 (保持穿搭一致)"
          content={analysis.clothingDetails}
        />
        <AnalysisItem 
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
          }
          title="拍摄场景"
          content={analysis.environment}
        />
      </div>
    </div>
  );
};

const AnalysisItem: React.FC<{ icon: React.ReactNode, title: string, content: string, isHighlight?: boolean }> = ({ icon, title, content, isHighlight }) => (
  <div className="group">
    <div className="flex items-center gap-2 text-slate-700 mb-2 text-sm font-medium">
      {icon}
      <span>{title}</span>
    </div>
    <div className={`text-slate-800 text-sm leading-relaxed p-4 rounded-lg border transition-all duration-300
      ${isHighlight 
        ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-100 shadow-sm shadow-indigo-900/20' 
        : 'bg-slate-100/50 border-slate-200/50 group-hover:border-slate-300'}`}>
      {content}
    </div>
  </div>
);

export default AnalysisPanel;

