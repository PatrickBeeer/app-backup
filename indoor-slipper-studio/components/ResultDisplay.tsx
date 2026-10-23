import React, { useState } from 'react';

interface ResultDisplayProps {
  isLoading: boolean;
  generatedImageUrls: string[] | null;
  error: string | null;
}

const LoadingSkeleton: React.FC = () => (
  <div className="relative w-full aspect-[4/3] bg-white/40 rounded-2xl animate-pulse flex flex-col items-center justify-center p-4 overflow-hidden">
  </div>
);

const InitialState: React.FC = () => (
  <div className="w-full aspect-[4/3] bg-white/20 rounded-2xl flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-white/60">
    <svg className="w-16 h-16 text-slate-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
    </svg>
    <h3 className="text-xl font-semibold text-black tracking-tight">生成的图片将显示在此处</h3>
    <p className="mt-2 text-slate-600">请先上传图片并选择相应选项。</p>
  </div>
);

const ErrorState: React.FC<{ message: string }> = ({ message }) => (
  <div className="w-full aspect-[4/3] bg-red-500/20 border-2 border-dashed border-red-400/50 rounded-2xl flex flex-col items-center justify-center p-8 text-center">
    <svg className="w-12 h-12 text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
    </svg>
    <h3 className="text-lg font-semibold text-red-900">出错了</h3>
    <p className="mt-1 text-sm text-red-800 max-w-sm">{message}</p>
  </div>
);

const ResultDisplay: React.FC<ResultDisplayProps> = ({ isLoading, generatedImageUrls, error }) => {
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);

  const ZoomModal = () => (
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
      onClick={() => setZoomedImageUrl(null)}
      style={{ animationDuration: '0.2s' }}
    >
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in {
          animation: fade-in ease;
        }
      `}</style>
      <img 
        src={zoomedImageUrl!} 
        alt="放大的模特图" 
        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      <button 
        className="absolute top-4 right-4 text-white text-4xl font-light hover:text-slate-300 transition"
        onClick={() => setZoomedImageUrl(null)}
      >
        &times;
      </button>
    </div>
  );

  const gridColsClass = generatedImageUrls && generatedImageUrls.length > 1 ? 'sm:grid-cols-2' : 'sm:grid-cols-1';

  return (
    <div className="w-full h-full flex flex-col items-center justify-center">
      {zoomedImageUrl && <ZoomModal />}
      {isLoading ? (
        <div className="w-full">
          <div className="text-center mb-4">
            <p className="text-slate-600 font-medium">AI 正在创作您的专属图片...</p>
            <p className="text-sm text-slate-500 mt-1">请稍候片刻，这可能需要一些时间。</p>
          </div>
          <div className={`grid grid-cols-1 ${gridColsClass} gap-4`}>
            {Array.from({ length: 2 }).map((_, i) => <LoadingSkeleton key={i}/>)}
          </div>
        </div>
      ) : error ? (
        <ErrorState message={error} />
      ) : generatedImageUrls ? (
        <div className={`w-full grid grid-cols-1 ${gridColsClass} gap-4`}>
          {generatedImageUrls.map((url, index) => (
            <div key={index} className="flex flex-col space-y-3">
              <div className="relative">
                <img src={url} alt={`生成的模特图 ${index + 1}`} className="w-full h-auto object-contain rounded-2xl shadow-xl" />
              </div>
              <div className="flex items-center justify-end space-x-3">
                <button
                  onClick={() => setZoomedImageUrl(url)}
                  className="bg-white/40 text-slate-700 hover:bg-white/60 py-2 px-4 rounded-xl text-sm font-medium transition-all duration-200 flex items-center space-x-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    <line x1="11" y1="8" x2="11" y2="14"></line>
                    <line x1="8" y1="11" x2="14" y2="11"></line>
                  </svg>
                  <span>放大</span>
                </button>
                <a
                  href={url}
                  download={`生成的模特图-${index + 1}.png`}
                  className="bg-black text-white py-2 px-4 rounded-xl text-sm font-medium transition-all duration-200 flex items-center space-x-2 hover:scale-105"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                  <span>下载</span>
                </a>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <InitialState />
      )}
    </div>
  );
};

export default ResultDisplay;

