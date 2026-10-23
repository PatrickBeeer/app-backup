import React, { useEffect, useState } from 'react';

interface LoadingOverlayProps {
  progress: number;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ progress }) => {
  const [message, setMessage] = useState("正在分析产品特征...");

  useEffect(() => {
    if (progress < 30) setMessage("正在分析产品特征...");
    else if (progress < 60) setMessage("正在构建场景光影...");
    else if (progress < 90) setMessage("AI 正在渲染最终细节...");
    else setMessage("即将完成...");
  }, [progress]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/95 backdrop-blur-sm">
      <div className="w-24 h-24 mb-6 relative">
        <div className="absolute inset-0 border-4 border-orange-100 rounded-full"></div>
        <div 
          className="absolute inset-0 border-4 border-orange-500 rounded-full border-t-transparent animate-spin"
        ></div>
      </div>
      <h3 className="text-xl font-bold text-gray-800 mb-2">九阳 AI 创想家</h3>
      <p className="text-gray-500 text-sm animate-pulse">{message}</p>
      
      {/* Visual flair: Joyoung brand colors */}
      <div className="mt-8 flex gap-2">
        <div className="w-2 h-2 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: '0s' }}></div>
        <div className="w-2 h-2 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: '0.1s' }}></div>
        <div className="w-2 h-2 rounded-full bg-orange-300 animate-bounce" style={{ animationDelay: '0.2s' }}></div>
      </div>
    </div>
  );
};

export default LoadingOverlay;
