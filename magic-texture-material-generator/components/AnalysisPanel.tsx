import React from 'react';
import { AnalysisResult } from '../types';
import { Terminal, Palette, FileText } from '@/utils/lucide';

interface AnalysisPanelProps {
  analysis: AnalysisResult | null;
  loading: boolean;
}

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ analysis, loading }) => {
  if (loading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-8 space-y-4 animate-pulse">
        <div className="w-full h-4 bg-gray-200 rounded"></div>
        <div className="w-3/4 h-4 bg-gray-200 rounded"></div>
        <div className="w-1/2 h-4 bg-gray-200 rounded"></div>
        <div className="text-accent-cyan font-mono text-sm mt-4 text-gray-700">正在分析纹理数据...</div>
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-2 mb-2">
        <Terminal className="w-4 h-4 text-accent-cyan" />
        <h2 className="text-sm font-mono text-gray-600 uppercase tracking-widest">分析日志</h2>
      </div>

      {/* Primary Tags */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-50 p-3 rounded border border-gray-200">
          <div className="text-xs text-gray-600 uppercase mb-1">视觉风格</div>
          <div className="text-sm text-gray-900 font-medium">{analysis.visualStyle}</div>
        </div>
        <div className="bg-gray-50 p-3 rounded border border-gray-200">
          <div className="text-xs text-gray-600 uppercase mb-1">材质属性</div>
          <div className="text-sm text-gray-900 font-medium">{analysis.material}</div>
        </div>
      </div>

      {/* Color Palette */}
      <div className="bg-gray-50 p-3 rounded border border-gray-200">
         <div className="flex items-center gap-2 mb-2">
            <Palette className="w-3 h-3 text-gray-600" />
            <span className="text-xs text-gray-600 uppercase">提取色板</span>
         </div>
         <div className="flex gap-2">
           {analysis.colorPalette.map((color, idx) => (
             <div key={idx} className="group relative">
                <div 
                  className="w-8 h-8 rounded-full border border-gray-300 shadow-sm" 
                  style={{ backgroundColor: color }}
                />
                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] bg-gray-900 text-white px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                  {color}
                </span>
             </div>
           ))}
         </div>
      </div>

      {/* Director Note Only - Removed Prompt Display */}
      <div className="bg-gray-50 p-4 rounded border border-gray-200">
        <div className="flex items-center gap-2 mb-2 text-gray-700">
            <FileText className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase">材质分析</h3>
        </div>
        <p className="text-sm text-gray-800 font-serif leading-relaxed italic">
          "{analysis.chinesePrompt}"
        </p>
        <div className="mt-3 pt-3 border-t border-gray-300 text-xs text-gray-600">
            建议：{analysis.directorNote}
        </div>
      </div>
    </div>
  );
};

export default AnalysisPanel;