import React from 'react';
import { Glasses, Sparkles, Camera, ShieldCheck } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="border-b border-zinc-800/80 bg-zinc-950/70 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Brand Logo & Title */}
        <div className="flex items-center space-x-3 text-center md:text-left">
          <div className="w-10 h-10 rounded-xl bg-[#5145E5] p-0.5 shadow-lg shadow-[#5145E5]/10">
            <div className="w-full h-full bg-zinc-950 rounded-[10px] flex items-center justify-center">
              <Glasses className="w-5 h-5 text-[#5145E5]" />
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xl font-black tracking-widest uppercase text-[#5145E5]">
                COOKSHARK
              </span>
              <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider text-[#5145E5] bg-[#5145E5]/10 border border-[#5145E5]/20 rounded-full">
                AI EYEWEAR STUDIO
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-medium">
              酷鲨墨镜 · 高端时尚模特试戴大片生成系统
            </p>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="hidden lg:flex items-center space-x-6 text-xs text-zinc-400">
          <div className="flex items-center space-x-1.5 bg-zinc-900/80 px-3 py-1.5 rounded-full border border-zinc-800">
            <Camera className="w-3.5 h-3.5 text-amber-400" />
            <span>4K 光影质感</span>
          </div>
          <div className="flex items-center space-x-1.5 bg-zinc-900/80 px-3 py-1.5 rounded-full border border-zinc-800">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>镜头级焦段仿真</span>
          </div>
          <div className="flex items-center space-x-1.5 bg-zinc-900/80 px-3 py-1.5 rounded-full border border-zinc-800">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>墨镜纹理精准拟合</span>
          </div>
        </div>
      </div>
    </header>
  );
};
