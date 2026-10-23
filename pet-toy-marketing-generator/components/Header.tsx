import React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="py-8">
      <div className="container mx-auto px-4 text-center">
        <div className="flex items-center justify-center space-x-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-200 to-pink-200 flex items-center justify-center shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-violet-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">宠物玩具营销素材生成器</h1>
        </div>
        <p className="text-slate-500 mt-2 max-w-2xl mx-auto">上传产品图，一键生成符合现代审美的营销场景图和宠物互动图。</p>
      </div>
    </header>
  );
};

