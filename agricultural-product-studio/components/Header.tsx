import React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="bg-transparent">
      <div className="container mx-auto px-4 md:px-8 py-8">
        <h1 className="text-3xl font-bold text-black tracking-tighter">
          AI 农产品影棚
        </h1>
        <p className="text-slate-600 mt-1">
          在几秒钟内为您的产品创建令人惊叹的营销图片。
        </p>
      </div>
    </header>
  );
};

