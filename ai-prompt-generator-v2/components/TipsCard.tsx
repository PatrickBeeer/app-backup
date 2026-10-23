import React from 'react';
import { Settings2, Info } from 'lucide-react';

interface TipsCardProps {
  tips: string;
}

export const TipsCard: React.FC<TipsCardProps> = ({ tips }) => (
  <div className="relative overflow-hidden rounded-[2rem] border border-amber-100/50 bg-white/60 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
    <div className="flex items-center gap-2.5 px-6 py-3 bg-amber-50/40 border-b border-amber-100/50">
      <div className="p-1.5 bg-amber-100 rounded-lg"><Settings2 size={16} className="text-amber-600" /></div>
      <h3 className="font-semibold text-sm text-amber-900">渲染参数建议</h3>
    </div>
    <div className="p-6">
      <div className="flex items-start gap-4">
        <Info size={20} className="text-amber-400/80 flex-shrink-0 mt-0.5" />
        <p className="text-slate-700 text-sm leading-7 whitespace-pre-wrap font-medium">{tips}</p>
      </div>
    </div>
  </div>
);
