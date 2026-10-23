import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-white/30 shadow-sm shadow-black/5">
      <div className="container mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-teal-400">
            童袜场景/模特生成
          </h1>
          <p className="text-sm text-slate-500 mt-1">上传白底图，为您生成场景和模特图</p>
        </div>
      </div>
    </header>
  );
};

export default Header;

