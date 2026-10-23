import React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="bg-white/60 backdrop-blur-lg sticky top-0 z-20 border-b border-white/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-4">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg flex items-center justify-center text-white font-bold text-lg">
            AI
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">童装AI模特</h1>
            <p className="text-sm text-slate-500">一键生成模特+场景图</p>
          </div>
        </div>
      </div>
    </header>
  );
};

