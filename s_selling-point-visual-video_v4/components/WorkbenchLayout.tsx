
import React, { useState } from 'react';

interface WorkbenchLayoutProps {
  sidebar: React.ReactNode;
  content: React.ReactNode;
}

export const WorkbenchLayout: React.FC<WorkbenchLayoutProps> = ({ sidebar, content }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col lg:flex-row h-screen overflow-hidden bg-slate-50">
      {/* Mobile Header */}
      <header className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between z-50">
        <div className="flex flex-col">
          <h1 className="text-sm font-black text-slate-900 tracking-tight">卖点可视化视频</h1>
          <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">AI 视频创意工具</p>
        </div>
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${
            isSidebarOpen ? 'bg-slate-900 text-white' : 'bg-blue-50 text-blue-600 border border-blue-100'
          }`}
        >
          {isSidebarOpen ? '关闭设置' : '配置参数'}
        </button>
      </header>

      {/* Sidebar / Left Control Panel */}
      <aside className={`
        fixed inset-0 z-40 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 lg:z-auto
        w-full lg:w-96 bg-white border-r border-slate-200 overflow-y-auto flex-shrink-0
        ${isSidebarOpen ? 'translate-x-0 top-[53px]' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-6 h-full flex flex-col">
          {sidebar}
          {/* Mobile close helper */}
          <div className="lg:hidden h-20" /> 
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-slate-50 p-4 lg:p-10 relative">
        <div className="max-w-5xl mx-auto">
          {content}
        </div>
      </main>

      {/* Mobile Overlay for Sidebar */}
      {isSidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-30"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
};
