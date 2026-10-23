import React from 'react';
import { Layers, Lightbulb, Monitor, Scan } from 'lucide-react';

interface AnalysisCardProps {
  analysis: string;
  recommendedPlatform?: string;
  detectedAspectRatio?: string;
}

export const AnalysisCard: React.FC<AnalysisCardProps> = ({ analysis, recommendedPlatform, detectedAspectRatio }) => (
  <div className="relative overflow-hidden rounded-[2rem] border border-blue-100/50 bg-white/60 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] mt-4">
    <div className="flex items-center justify-between px-6 py-4 bg-blue-50/40 border-b border-blue-100/50">
      <div className="flex items-center gap-2.5">
        <div className="p-1.5 bg-blue-100 rounded-lg"><Layers size={16} className="text-blue-600" /></div>
        <h3 className="font-semibold text-sm text-blue-900">结构拆解与分析</h3>
      </div>
      {(recommendedPlatform || detectedAspectRatio) && (
        <div className="flex gap-2">
          {recommendedPlatform && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-indigo-100 shadow-sm text-xs font-semibold text-indigo-600">
              <Monitor size={12} /><span>推荐: {recommendedPlatform}</span>
            </div>
          )}
          {detectedAspectRatio && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-slate-200 shadow-sm text-xs font-semibold text-slate-600">
              <Scan size={12} /><span>{detectedAspectRatio}</span>
            </div>
          )}
        </div>
      )}
    </div>
    <div className="p-6">
      <div className="flex items-start gap-4">
        <Lightbulb size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-slate-700 text-sm leading-7 whitespace-pre-wrap font-medium">{analysis}</div>
      </div>
    </div>
  </div>
);
