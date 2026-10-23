
import React from 'react';
import { Sparkles, Layout as LayoutIcon, HelpCircle, User } from 'lucide-react';

interface HeaderProps {
  onBack?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onBack }) => (
  <header className="sticky top-0 z-20 px-6 py-4">
    <div className="max-w-7xl mx-auto">
      <div className="glass-panel px-8 py-4 flex justify-between items-center bg-white/40 backdrop-blur-xl border-white/20">
        <div className="flex items-center space-x-3">
          {onBack && (
            <button
              onClick={onBack}
              className="px-3 py-1.5 rounded-xl border border-black/10 text-xs font-bold hover:bg-black hover:text-white transition"
            >
              返回控制台
            </button>
          )}
          <div className="w-10 h-10 bg-black rounded-2xl flex items-center justify-center shadow-lg shadow-black/10">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-black">
              假发AI工作室
            </h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-medium">
              Luxury AI Studio
            </p>
          </div>
        </div>
        
        <nav className="hidden md:flex items-center space-x-8">
          <a href="#" className="text-sm font-medium text-gray-600 hover:text-black transition-colors flex items-center gap-2">
            <LayoutIcon size={16} />
            我的作品
          </a>
          <a href="#" className="text-sm font-medium text-gray-600 hover:text-black transition-colors flex items-center gap-2">
            <HelpCircle size={16} />
            帮助中心
          </a>
          <button className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
            <User size={16} className="text-gray-600" />
          </button>
        </nav>
      </div>
    </div>
  </header>
);

export const Container: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <main className="max-w-7xl mx-auto px-6 py-4">
    {children}
  </main>
);
