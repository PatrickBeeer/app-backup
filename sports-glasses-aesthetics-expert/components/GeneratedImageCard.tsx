import React from 'react';
import { GeneratedImage } from '../types';
import { LoadingSpinner } from './LoadingSpinner';

interface GeneratedImageCardProps {
  image: GeneratedImage;
  onZoom: (src: string) => void;
  onDownload: (src: string, title: string) => void;
}

const ErrorIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
  </svg>
);

const ImageIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25z" />
  </svg>
);

const ZoomIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
  </svg>
);

const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

export const GeneratedImageCard: React.FC<GeneratedImageCardProps> = ({ image, onZoom, onDownload }) => {
  const renderContent = () => {
    switch (image.status) {
      case 'loading':
        return (
          <div className="flex flex-col items-center justify-center h-full">
            <LoadingSpinner />
            <p className="text-slate-600 mt-3 text-sm font-medium">AI 正在绘制...</p>
          </div>
        );
      case 'success':
        return (
          <div className="relative w-full h-full group/card">
            <img src={image.src!} alt={image.title} className="w-full h-full object-cover transition-transform duration-700 group-hover/card:scale-105" />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-4 backdrop-blur-[2px]">
              <button 
                onClick={() => onZoom(image.src!)} 
                title="放大"
                className="p-3 rounded-full bg-white/20 hover:bg-white/30 transition-all transform hover:scale-110 shadow-lg backdrop-blur-md touch-manipulation min-w-[48px] min-h-[48px] flex items-center justify-center"
              >
                <ZoomIcon />
              </button>
              <button 
                onClick={() => onDownload(image.src!, image.title)} 
                title="下载"
                className="p-3 rounded-full bg-white/20 hover:bg-white/30 transition-all transform hover:scale-110 shadow-lg backdrop-blur-md touch-manipulation min-w-[48px] min-h-[48px] flex items-center justify-center"
              >
                <DownloadIcon />
              </button>
            </div>
          </div>
        );
      case 'error':
        return (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <ErrorIcon />
            <p className="mt-2 text-red-400 text-sm font-semibold">生成失败</p>
            {image.error && (
              <div className="relative group/tooltip mt-1">
                <p className="text-xs text-slate-600 underline decoration-dotted cursor-help hover:text-slate-600 transition-colors">查看原因</p>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-100 text-slate-800 text-xs rounded-xl shadow-xl border border-slate-300 opacity-0 group-hover/tooltip:opacity-100 transition-all duration-300 pointer-events-none z-10 transform translate-y-2 group-hover/tooltip:translate-y-0">
                  {image.error}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-100 border-b border-r border-slate-300 rotate-45 transform -translate-y-1.5"></div>
                </div>
              </div>
            )}
          </div>
        );
      case 'idle':
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full">
            <ImageIcon />
            <p className="mt-2 text-slate-600 text-sm">等待指令</p>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col gap-3 group">
      <div className="aspect-square bg-white rounded-xl overflow-hidden shadow-lg border border-slate-300 transition-all duration-500 hover:shadow-xl hover:translate-y-[-4px]">
        {renderContent()}
      </div>
      <h3 className="text-center font-semibold text-slate-700 text-sm tracking-wide">{image.title}</h3>
    </div>
  );
};
