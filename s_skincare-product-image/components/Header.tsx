
import React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="sticky top-0 z-50 px-6 py-4">
      <div className="max-w-[1400px] mx-auto glass-card luxury-shadow rounded-full px-8 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-black tracking-tight leading-none">护肤品主图 <span className="text-indigo-600 font-light italic">AI</span></h1>
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mt-1">Skincare Visual Studio</p>
          </div>
        </div>
        <div className="hidden md:flex items-center space-x-6">
          <span className="text-xs font-bold text-slate-500 hover:text-black cursor-pointer transition-colors">专业级输出</span>
          <span className="text-xs font-bold text-slate-500 hover:text-black cursor-pointer transition-colors">自动文案层</span>
          <div className="h-4 w-px bg-slate-200"></div>
          <p className="text-xs font-black text-black tracking-tighter bg-white/60 px-3 py-1.5 rounded-full border border-white/40 shadow-sm">AI 驱动视觉重构</p>
        </div>
      </div>
    </header>
  );
};

