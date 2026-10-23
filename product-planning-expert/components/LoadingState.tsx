import React, { useState, useEffect } from 'react';

const LOADING_HINTS = [
    "正在分析品类竞争格局...",
    "正在挖掘用户核心痛点...",
    "AI 正在构思差异化卖点...",
    "正在生成 Midjourney 视觉提示词...",
    "正在优化 SEO 关键词策略..."
];

export const LoadingState: React.FC = () => {
  const [hintIndex, setHintIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setHintIndex((prev) => (prev + 1) % LOADING_HINTS.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] text-center p-8 animate-fade-in">
      <div className="relative w-24 h-24 mb-10">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-200 to-purple-200 rounded-full animate-ping opacity-50"></div>
          <div className="relative w-24 h-24 bg-white/50 backdrop-blur-sm rounded-full flex items-center justify-center border border-white shadow-lg">
             <div className="w-12 h-12 border-4 border-transparent border-t-blue-500 border-r-purple-500 rounded-full animate-spin"></div>
          </div>
      </div>
      
      <h3 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 mb-3 transition-all duration-500 min-h-[2rem]">
        {LOADING_HINTS[hintIndex]}
      </h3>
      <p className="text-sm text-gray-500 font-medium max-w-sm mx-auto">
        AI 正在为您生成全案策划，请稍候...
      </p>
    </div>
  );
};
