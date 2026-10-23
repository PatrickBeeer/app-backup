
import React from 'react';

export const Header: React.FC = () => {
    return (
        <header className="p-6 text-center">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-100">
                水晶能量爆款图文
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">
                小红书水晶手串博主专属 AI 创作助手
            </p>
        </header>
    );
};
