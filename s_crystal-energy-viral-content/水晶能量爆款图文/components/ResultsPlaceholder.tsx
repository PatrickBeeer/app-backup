
import React from 'react';
export const ResultsPlaceholder: React.FC = () => {
    return (
        <div className="preview-empty flex-grow flex flex-col items-center justify-center text-center text-gray-400 dark:text-gray-500 p-8">
            <div className="preview-empty-icon">
                <svg className="preview-play-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="m9 7 7 5-7 5V7Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-500 dark:text-gray-400">你的爆款图文将在这里生成</h3>
            <p className="mt-2 max-w-xs">上传产品图片并完成设置后开始生成</p>
        </div>
    );
};
