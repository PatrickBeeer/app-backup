
import React, { useState } from 'react';

interface WorkbenchLayoutProps {
  sidebar: React.ReactNode;
  content: React.ReactNode;
}

export const WorkbenchLayout: React.FC<WorkbenchLayoutProps> = ({ sidebar, content }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="flex min-h-screen flex-col">
        {/* Mobile Header */}
        <header className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between z-50">
          <div className="flex flex-col">
            <h1 className="text-sm font-black text-slate-900 tracking-tight">Seedance视频复刻</h1>
            <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">AI 视频创意工作台</p>
          </div>
          <button
            type="button"
            aria-expanded={isSidebarOpen}
            aria-controls="settings-panel"
            onClick={() => setIsSidebarOpen((isOpen) => !isOpen)}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${
              isSidebarOpen ? 'bg-slate-900 text-white' : 'bg-blue-50 text-blue-600 border border-blue-100'
            }`}
          >
            {isSidebarOpen ? '关闭设置' : '配置参数'}
          </button>
        </header>

        <div className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-4 lg:px-6 lg:py-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            {/* Sidebar / Left Control Panel */}
            <aside id="settings-panel" className={`
              fixed inset-x-4 top-[69px] bottom-4 z-40 transform transition-transform duration-300 ease-in-out lg:static lg:inset-auto lg:z-auto
              lg:w-[380px] lg:max-w-[380px] lg:flex-none
              ${isSidebarOpen ? 'translate-x-0' : '-translate-x-[120%] lg:translate-x-0'}
            `}>
              <div className="flex h-full flex-col overflow-y-auto rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] lg:h-auto lg:overflow-visible">
                {sidebar}
                {/* Mobile close helper */}
                <div className="lg:hidden h-20" />
              </div>
            </aside>

            {/* Main Content Area */}
            <main className="min-w-0 flex-1 lg:max-w-[calc(100%-404px)]">
              <div className="mx-auto w-full max-w-[880px]">
                {content}
              </div>
            </main>
          </div>
        </div>

        {/* Mobile Overlay for Sidebar */}
        {isSidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-30"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
      </div>
    </div>
  );
};
