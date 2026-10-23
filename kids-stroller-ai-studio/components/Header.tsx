import React from 'react';

export const Header: React.FC = () => (
  <header className="fixed top-0 left-0 right-0 z-50 bg-white/70 backdrop-blur-xl border-b border-white/20">
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center h-20">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-2xl shadow-md">
            🚲
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-none tracking-tight">童车AI影棚</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-semibold mt-1">AI 视觉工作室</p>
          </div>
        </div>
      </div>
    </div>
  </header>
);
