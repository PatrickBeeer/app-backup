import React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="bg-white/80 backdrop-blur-lg p-4 sticky top-0 z-10 border-b border-slate-200/80">
      <div className="max-w-screen-2xl mx-auto flex items-center">
        <i className="fas fa-shoe-prints text-3xl text-purple-600 mr-4 transform -rotate-12"></i>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          鞋子 AI <span className="text-purple-600">穿搭师</span>
        </h1>
      </div>
    </header>
  );
};

