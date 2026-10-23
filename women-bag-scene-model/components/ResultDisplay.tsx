import React, { useState } from 'react';

interface ResultDisplayProps {
  isLoading: boolean;
  generatedImages: (string | null)[] | null; // null 表示该位置的图片生成失败
  error: string | null; // 全局错误（所有图片都失败时显示）
}

const LoadingSpinner: React.FC = () => (
  <div className="flex flex-col items-center justify-center text-center">
    <svg className="animate-spin h-12 w-12 text-indigo-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    <h3 className="text-xl font-semibold text-slate-700">正在生成您的图片...</h3>
    <p className="text-slate-500">这可能需要一些时间，请稍候。</p>
  </div>
);

const Placeholder: React.FC = () => (
  <div className="flex flex-col items-center justify-center text-center p-8">
    <svg className="w-20 h-20 mb-6 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
    </svg>
    <h3 className="text-2xl font-bold text-slate-500 tracking-tight">您生成的图片将显示在此处</h3>
    <p className="text-slate-400 mt-2 max-w-sm">在左侧面板上传产品图并选择风格后，点击生成按钮即可开始您的创作。</p>
  </div>
);

const ZoomModal: React.FC<{ imageUrl: string; onClose: () => void }> = ({ imageUrl, onClose }) => (
  <div
    className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 transition-opacity duration-300 animate-fade-in-fast"
    onClick={onClose}
  >
    <div className="relative p-4" onClick={(e) => e.stopPropagation()}>
      <img
        src={imageUrl}
        alt="Zoomed Generated Model"
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
      />
      <button
        onClick={onClose}
        className="absolute -top-3 -right-3 bg-white text-slate-800 rounded-full h-10 w-10 flex items-center justify-center text-2xl font-bold leading-none hover:bg-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-white"
        aria-label="关闭"
      >
        &times;
      </button>
    </div>
    <style>{`
      @keyframes fade-in-fast {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .animate-fade-in-fast { animation: fade-in-fast 0.2s ease-out forwards; }
    `}</style>
  </div>
);

const GeneratedImage: React.FC<{ imageSrc: string; onZoom: () => void; }> = ({ imageSrc, onZoom }) => (
  <div className="flex flex-col items-center group">
    <div className="w-full max-w-full overflow-hidden">
      <img src={imageSrc} alt="Generated Model" className="rounded-xl shadow-lg w-full object-contain max-h-[600px]" />
    </div>
    <div className="mt-4 flex space-x-3">
      <button
        onClick={onZoom}
        className="inline-flex items-center px-5 py-2 border border-transparent text-sm font-semibold rounded-lg shadow-sm text-white bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 transition-all transform hover:scale-105"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
        </svg>
        放大
      </button>
      <a
        href={imageSrc}
        download={`ai-generated-model-${Date.now()}.png`}
        className="inline-flex items-center px-5 py-2 border border-transparent text-sm font-semibold rounded-lg shadow-sm text-white bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-all transform hover:scale-105"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        下载
      </a>
    </div>
  </div>
);

const ErrorImage: React.FC<{ index: number }> = ({ index }) => (
  <div className="w-full aspect-[3/4] bg-red-50 border-2 border-red-200 rounded-xl flex flex-col items-center justify-center p-6 text-center overflow-hidden">
    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
    <p className="text-sm font-semibold text-red-700 mb-1">图片 {index + 1} 生成失败</p>
    <p className="text-xs text-red-600">请重试生成</p>
  </div>
);

export const ResultDisplay: React.FC<ResultDisplayProps> = ({ isLoading, generatedImages, error }) => {
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  return (
    <>
      <div className="w-full h-full p-6 bg-white/75 backdrop-blur-2xl border border-white/50 shadow-xl rounded-3xl flex flex-col items-center justify-center overflow-auto">
        {isLoading && <LoadingSpinner />}
        
        {!isLoading && error && (
          <div
            className="text-center text-red-800 bg-red-100/80 p-4 rounded-lg border border-red-200"
            role="alert"
            aria-live="assertive"
          >
            <h3 className="text-lg font-bold">出错了</h3>
            <p className="mt-1 text-sm">{error}</p>
          </div>
        )}

        {!isLoading && generatedImages && generatedImages.length > 0 && (
          <div className="w-full flex flex-col items-center animate-fade-in">
            <h2 className="text-3xl font-extrabold text-slate-800 mb-6 tracking-tight">生成完毕！</h2>
            <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-6">
              {generatedImages.map((image, index) => (
                image ? (
                  <GeneratedImage 
                    key={index} 
                    imageSrc={image} 
                    onZoom={() => setZoomedImage(image)} 
                  />
                ) : (
                  <ErrorImage key={index} index={index} />
                )
              ))}
            </div>
          </div>
        )}
        
        {!isLoading && !generatedImages && !error && (
          <Placeholder />
        )}
      </div>

      {zoomedImage && (
        <ZoomModal imageUrl={zoomedImage} onClose={() => setZoomedImage(null)} />
      )}
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fade-in 0.5s ease-out forwards; }
      `}</style>
    </>
  );
};

