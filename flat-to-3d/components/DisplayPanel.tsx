import React from 'react';
import { LoadingSpinnerIcon, DownloadIcon } from '../constants';

interface DisplayPanelProps {
  generatedImage: string | null;
  isLoading: boolean;
  error: string | null;
}

const Placeholder: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-full text-center text-slate-700">
    <div className="w-40 h-40 bg-slate-100/50 rounded-lg flex items-center justify-center mb-4">
      <svg xmlns="http://www.w3.org/2000/svg" className="w-24 h-24 text-slate-700" fill="none" viewBox="0 0 24 24" strokeWidth="1" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9.75l-9-5.25m9 5.25l9-5.25" />
      </svg>
    </div>
    <h3 className="text-xl font-semibold text-slate-700">3D 模型展示区</h3>
    <p className="mt-1 max-w-sm">上传图片并点击"生成"后，您的3D服装模型将在此处显示。</p>
  </div>
);

const LoadingState: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-full text-center text-slate-700">
    <LoadingSpinnerIcon className="animate-spin h-12 w-12 text-indigo-500 mb-4" />
    <h3 className="text-xl font-semibold text-slate-700">正在生成您的3D模型...</h3>
    <p className="mt-1 max-w-sm">AI正在工作中，请稍候。</p>
  </div>
);

export const DisplayPanel: React.FC<DisplayPanelProps> = ({ generatedImage, isLoading, error }) => {
  const handleDownload = () => {
    if (!generatedImage) return;
    const link = document.createElement('a');
    link.href = generatedImage;
    link.download = 'generated-3d-model.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-sm w-full h-full">
      <div className="h-full p-6">
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-red-400 bg-red-900/20 border border-red-800/50 p-4 rounded-lg">
            <h3 className="font-bold text-lg">生成失败</h3>
            <p className="mt-2">{error}</p>
          </div>
        ) : generatedImage ? (
          <div className="relative w-full h-full">
            <img src={generatedImage} alt="Generated 3D model" className="w-full h-full object-contain" />
            <button
              onClick={handleDownload}
              className="absolute bottom-0 right-0 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-lg"
            >
              <DownloadIcon className="w-5 h-5" />
              <span>下载图片</span>
            </button>
          </div>
        ) : (
          <Placeholder />
        )}
      </div>
    </div>
  );
};

