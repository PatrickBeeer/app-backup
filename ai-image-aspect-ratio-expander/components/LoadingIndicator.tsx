import React from 'react';

export const LoadingIndicator: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center space-y-4">
      <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-blue-500"></div>
      <p className="text-lg text-slate-700">AI 正在扩展您的图片...</p>
    </div>
  );
};

