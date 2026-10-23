import React from 'react';

interface LoaderProps {
  isInitializing: boolean;
}

export const Loader: React.FC<LoaderProps> = ({ isInitializing }) => (
  <div className="fixed inset-0 bg-white/90 backdrop-blur-md flex flex-col items-center justify-center z-50">
    <div className="w-16 h-16 border-4 border-black border-t-lime-300 rounded-full animate-spin mb-6"></div>
    <div className="space-y-1 text-center">
      <p className="text-2xl font-black tracking-tight uppercase">处理中</p>
      <p className="text-sm font-mono text-gray-500">{isInitializing ? '系统初始化...' : '正在生成效果图...'}</p>
    </div>
  </div>
);
