import React from 'react';
import { Wand2, Coins } from '@/utils/lucide';

interface HeaderProps {
  cost?: number;
}

const Header: React.FC<HeaderProps> = ({ cost = 0 }) => {
  return (
    <header className="w-full py-5 px-6 md:px-8 flex items-center justify-between border-b border-gray-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gradient-to-tr from-accent-purple to-pink-500 rounded-lg shadow-lg shadow-accent-purple/20">
          <Wand2 className="text-white w-6 h-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-wider text-gray-900">魔法<span className="text-accent-cyan">纹理</span></h1>
          <p className="text-[10px] text-gray-500 tracking-[0.2em] uppercase">Magic Texture Lab</p>
        </div>
      </div>
      
      <div className="flex items-center gap-6">
        {/* Cost Display */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full border border-gray-300">
            <Coins className="w-4 h-4 text-accent-gold" />
            <div className="flex flex-col items-end leading-none">
                <span className="text-xs text-gray-600 uppercase font-mono scale-90 origin-right">消耗积分</span>
                <span className="text-sm font-mono text-accent-gold font-bold">PTS {cost.toFixed(1)}</span>
            </div>
        </div>
      </div>
    </header>
  );
};

export default Header;