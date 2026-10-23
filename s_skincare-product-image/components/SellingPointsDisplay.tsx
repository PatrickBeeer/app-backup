
import React from 'react';

interface SellingPointsDisplayProps {
  points: string | null;
  isLoading: boolean;
}

export const SellingPointsDisplay: React.FC<SellingPointsDisplayProps> = ({ points, isLoading }) => {
  if (isLoading) {
    return (
        <div className="glass-card luxury-shadow p-8 rounded-4xl mb-8 animate-pulse">
            <div className="h-5 bg-slate-200 rounded-full w-40 mb-6"></div>
            <div className="flex flex-wrap gap-3">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="h-10 bg-slate-100 rounded-2xl w-24"></div>
                ))}
            </div>
      </div>
    );
  }

  if (!points) {
    return null;
  }

  const pointList = points.split(/,|，/).map(p => p.trim()).filter(p => p);

  return (
    <div className="glass-card luxury-shadow p-8 rounded-4xl mb-8 animate-in fade-in duration-700">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-1.5 h-1.5 bg-black rounded-full"></div>
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">核心卖点提炼 • Highlights</h3>
      </div>
      <div className="flex flex-wrap gap-3">
        {pointList.map((point, index) => (
          <span 
            key={index} 
            className="bg-white/40 border border-white/60 text-slate-700 text-xs font-bold px-5 py-2.5 rounded-2xl shadow-sm hover:scale-105 transition-transform cursor-default"
          >
            {point}
          </span>
        ))}
      </div>
    </div>
  );
};

