import React from 'react';

const Header: React.FC = () => {
  return (
    <header>
      <div className="container mx-auto px-4 py-5 md:px-8 text-center">
        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
          饰品模特生成
        </h1>
        <p className="text-slate-500 mt-2">让喜欢的模特给我卖货</p>
      </div>
    </header>
  );
};

export default Header;

