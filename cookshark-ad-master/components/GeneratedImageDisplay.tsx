import React from 'react';

interface GeneratedImageDisplayProps {
  imageUrls: string[] | null;
  isLoading: boolean;
  error: string | null;
  aspectRatio: string;
}

const Placeholder = () => (
  <div className="flex flex-col items-center justify-center h-full text-center text-slate-600 bg-slate-100/50 rounded-xl p-4 min-h-[400px]">
    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
    <h3 className="text-lg font-semibold text-slate-700">模特待生成</h3>
    <p className="mt-1 text-sm">上传产品图片并点击生成按钮。</p>
  </div>
);

const ErrorDisplay = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center h-full text-center text-red-400 bg-red-900/20 rounded-xl p-4 min-h-[400px]">
    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <h3 className="text-lg font-semibold">生成失败</h3>
    <p className="mt-1 text-sm max-w-sm">{message}</p>
  </div>
);

const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
  </svg>
);

const aspectRatioClasses: { [key: string]: string } = {
  '3:4': 'aspect-[3/4]',
  '1:1': 'aspect-square',
  '9:16': 'aspect-[9/16]',
  '16:9': 'aspect-[16/9]',
};

const SkeletonPlaceholder: React.FC<{ aspectRatio: string }> = ({ aspectRatio }) => {
  const aspectClass = aspectRatioClasses[aspectRatio] || 'aspect-[3/4]';
  return (
    <div className={`${aspectClass} w-full bg-slate-200 rounded-xl animate-pulse`}></div>
  );
};

interface ImageItemProps {
  imageUrl: string;
  index: number;
  aspectRatio: string;
}

const ImageItem: React.FC<ImageItemProps> = ({ imageUrl, index, aspectRatio }) => {
  const aspectClass = aspectRatioClasses[aspectRatio] || 'aspect-[3/4]';
  return (
    <div className={`${aspectClass} w-full bg-slate-100 rounded-xl overflow-hidden relative group shadow-lg`}>
      <img 
        src={imageUrl} 
        alt={`AI generated model ${index + 1}`}
        className="w-full h-full object-cover transition-transform duration-500 ease-in-out group-hover:scale-110" 
      />
      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      <a
        href={imageUrl}
        download={`ai-模特图-${index + 1}.png`}
        className="absolute bottom-4 right-4 bg-white/90 text-slate-800 p-3 rounded-full shadow-lg hover:bg-white transition-all duration-300 opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0"
        aria-label="下载图片"
      >
        <DownloadIcon />
      </a>
    </div>
  );
};

export const GeneratedImageDisplay: React.FC<GeneratedImageDisplayProps> = ({ imageUrls, isLoading, error, aspectRatio }) => {
  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-6">
          <SkeletonPlaceholder aspectRatio={aspectRatio} />
          <SkeletonPlaceholder aspectRatio={aspectRatio} />
        </div>
      );
    }
    if (error) {
      return <ErrorDisplay message={error} />;
    }
    if (imageUrls && imageUrls.length > 0) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 animate-fade-in">
          {imageUrls.map((url, index) => (
            <ImageItem key={index} imageUrl={url} index={index} aspectRatio={aspectRatio} />
          ))}
        </div>
      );
    }
    return <Placeholder />;
  };

  return (
    <div className="w-full flex items-center justify-center min-h-[400px] px-4">
      {renderContent()}
    </div>
  );
};

