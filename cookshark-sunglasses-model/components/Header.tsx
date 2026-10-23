import React from 'react';

export const Header: React.FC = () => {
  return (
    <header>
      <div className="container mx-auto px-4 py-6 text-center">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-800 tracking-tight">
            cookshark墨镜-模特生成
        </h1>
        <p className="text-lg text-slate-600 mt-2 max-w-2xl mx-auto">
            上传太阳镜图片，AI 即可为您生成专属模特图。
        </p>
      </div>
    </header>
  );
};

