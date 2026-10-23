
import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="bg-white border-b border-slate-200 z-50">
      <div className="max-w-[1920px] mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {/* Logo 容器 - 使用更接近参考图的紫色 */}
          <div className="bg-[#5851db] w-9 h-9 rounded-xl flex items-center justify-center shadow-sm">
            <i className="fas fa-pen text-white text-sm transform -rotate-45"></i>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-black text-slate-900 tracking-tight">
              AI智能去水印
            </h1>
            <span className="text-[10px] font-bold text-slate-400 px-2 py-0.5 bg-slate-50 border border-slate-100 rounded-md uppercase">
              PRO
            </span>
          </div>
        </div>
        
        <nav className="flex items-center gap-6">
          <div className="hidden sm:flex items-center gap-5 border-r border-slate-100 pr-6 mr-1">
            <a href="#" className="text-[11px] font-bold text-slate-400 hover:text-[#5851db] transition uppercase tracking-widest">帮助中心</a>
            <a href="#" className="text-[11px] font-bold text-slate-400 hover:text-[#5851db] transition uppercase tracking-widest">批量处理</a>
          </div>
          <div className="flex items-center gap-3">
            <button className="bg-slate-900 text-white w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-800 transition shadow-sm">
              <i className="fas fa-user text-xs"></i>
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
};

export default Header;
