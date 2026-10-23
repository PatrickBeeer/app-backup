import React from 'react';
import { Glasses } from 'lucide-react';

export const Footer: React.FC = () => {
    return (
        <footer className="border-t border-zinc-900 bg-zinc-950/80 text-zinc-500 py-6 text-xs text-center mt-12">
            <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center space-x-2">
                    <Glasses className="w-4 h-4 text-amber-500/80" />
                    <span className="font-bold text-zinc-300">COOKSHARK EYEWEAR</span>
                    <span>· AI 模特试戴大片生成平台</span>
                </div>
                <p className="text-zinc-500 text-[11px]">
                    Powered by Gemini AI Studio · 专属真机级模特光影渲染引擎
                </p>
            </div>
        </footer>
    );
};
