import React from 'react';
import { SparklesIcon } from './icons/SparklesIcon';
import { ErrorIcon } from './icons/ErrorIcon';

interface GeneratedImageProps {
  imageUrls: (string | null | undefined)[] | null; // undefined 表示生成中，null 表示生成失败
  isLoading: boolean;
  error: string | null; // 全局错误（所有图片都失败时显示）
}

const LoadingCard: React.FC<{ label: string }> = ({ label }) => (
  <div className="w-full aspect-[3/4] max-w-full rounded-3xl bg-slate-400/20 animate-pulse flex flex-col items-center justify-center text-center p-6">
    <div className="w-14 h-14 rounded-full bg-slate-300/70 mb-4"></div>
    <p className="text-sm font-semibold text-slate-500">{label}</p>
  </div>
);

export const GeneratedImage: React.FC<GeneratedImageProps> = ({ imageUrls, isLoading, error }) => {
  const hasAnyRenderedSlot = Boolean(imageUrls && imageUrls.some((url) => url !== undefined));

  if (error && !hasAnyRenderedSlot) {
    return (
      <div className="text-center text-red-500 flex flex-col items-center justify-center">
        <ErrorIcon className="w-16 h-16 mb-4 text-red-400" />
        <p className="font-semibold">哦豁，出错了</p>
        <p>{error}</p>
      </div>
    );
  }

  if (imageUrls && imageUrls.length > 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center overflow-auto">
        {isLoading && (
          <p className="mb-5 text-sm font-medium text-slate-500">图片会在生成完成后立即显示，无需等待全部 4 张。</p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-full">
          {imageUrls.map((url, index) => (
            <div key={index} className="flex flex-col items-center max-w-full">
              {typeof url === 'string' ? (
                <>
                  <div className="w-full max-w-full overflow-hidden">
                    <img src={url} alt={`Generated model ${index + 1}`} className="object-contain w-full h-auto max-h-[600px] rounded-3xl shadow-xl shadow-slate-900/10" />
                  </div>
                  <a 
                    href={url} 
                    download={`ai_model_image_${index + 1}.png`}
                    className="mt-4 inline-flex items-center px-6 py-2 border border-transparent text-sm font-medium rounded-full shadow-md text-white bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-all duration-300 transform hover:scale-105"
                  >
                    下载图片 {index + 1}
                  </a>
                </>
              ) : url === undefined ? (
                <LoadingCard label={`图片 ${index + 1} 生成中...`} />
              ) : (
                <div className="w-full aspect-[3/4] max-w-full bg-red-50 border-2 border-red-200 rounded-3xl flex flex-col items-center justify-center p-6 text-center overflow-hidden">
                  <ErrorIcon className="w-12 h-12 mb-3 text-red-400" />
                  <p className="text-sm font-semibold text-red-700 mb-1">图片 {index + 1} 生成失败</p>
                  <p className="text-xs text-red-600">请重试生成</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-4">
        <div className="grid grid-cols-2 gap-4 w-full max-w-2xl">
          <LoadingCard label="图片 1 生成中..." />
          <LoadingCard label="图片 2 生成中..." />
          <LoadingCard label="图片 3 生成中..." />
          <LoadingCard label="图片 4 生成中..." />
        </div>
        <p className="mt-4 text-slate-500 font-medium">AI模特正在梳妆打扮中，请稍候...</p>
      </div>
    );
  }

  return (
    <div className="text-center text-slate-500 flex flex-col items-center justify-center">
      <SparklesIcon className="w-16 h-16 mb-4 text-slate-300" />
      <p className="font-semibold text-slate-600">生成的图片将在这里显示</p>
      <p className="text-sm">完成左侧设置后，点击生成按钮即可</p>
    </div>
  );
};

