import React, { useState } from 'react';

interface GeneratedImageDisplayProps {
  isLoading: boolean;
  error: string | null;
  generatedImages: string[] | null;
}

const LoadingState: React.FC = () => (
  <div className="text-center text-slate-500 animate-fade-in w-full">
    <div className="mb-4">
        <svg className="mx-auto h-12 w-12 text-slate-400 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
    </div>
    <h3 className="text-lg font-semibold mb-1 text-slate-700">正在生成您的图片...</h3>
    <p className="text-sm">AI 正在施展魔法，请稍候片刻。</p>
  </div>
);

const ErrorState: React.FC<{ message: string }> = ({ message }) => (
  <div className="text-center text-red-700 bg-red-50 p-6 rounded-xl animate-fade-in border border-red-200 w-full max-w-md">
    <i className="fas fa-exclamation-triangle text-3xl mb-3"></i>
    <h3 className="text-lg font-semibold mb-1 text-red-800">哎呀！出错了</h3>
    <p className="text-sm">{message}</p>
  </div>
);

const InitialState: React.FC = () => (
    <div className="text-center text-slate-500 w-full">
        <i className="fas fa-image text-5xl mb-4 text-slate-400"></i>
        <h3 className="text-lg font-semibold text-slate-600">您生成的 2 张图片将显示在这里</h3>
        <p className="mt-1 text-sm">请上传 1-3 张鞋子图片开始创作。</p>
    </div>
);

const ZoomModal: React.FC<{ src: string; onClose: () => void }> = ({ src, onClose }) => (
  <div
    className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in"
    onClick={onClose}
  >
    <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
      <img src={src} alt="AI generated shoe model - zoomed" className="w-full h-full object-contain rounded-lg shadow-2xl" />
      <button
        onClick={onClose}
        className="absolute -top-4 -right-4 bg-white/20 text-white rounded-full h-10 w-10 flex items-center justify-center text-lg hover:bg-white/40 transition-all"
        aria-label="关闭"
      >
        <i className="fas fa-times"></i>
      </button>
    </div>
  </div>
);

export const GeneratedImageDisplay: React.FC<GeneratedImageDisplayProps> = ({ isLoading, error, generatedImages }) => {
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  if (isLoading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  if (generatedImages && generatedImages.length > 0) {
    return (
      <>
        <div className="w-full h-full grid grid-cols-1 sm:grid-cols-2 gap-4">
          {generatedImages.map((imageSrc, index) => (
            <div key={index} className="w-full aspect-square animate-fade-in relative group rounded-xl overflow-hidden shadow-sm border border-slate-200/80">
                <img src={imageSrc} alt={`AI generated shoe model ${index + 1}`} className="w-full h-full object-cover" />
                 <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <button
                        onClick={() => setZoomedImage(imageSrc)}
                        className="bg-white/20 hover:bg-white/40 backdrop-blur-lg text-white rounded-full h-12 w-12 flex items-center justify-center text-lg transition-all transform hover:scale-110"
                        aria-label="放大图片"
                    >
                        <i className="fas fa-search-plus"></i>
                    </button>
                    <a
                        href={imageSrc}
                        download={`ai-generated-shoe-${index + 1}.png`}
                        className="bg-white/20 hover:bg-white/40 backdrop-blur-lg text-white rounded-full h-12 w-12 flex items-center justify-center text-lg transition-all transform hover:scale-110"
                        aria-label="下载图片"
                    >
                        <i className="fas fa-download"></i>
                    </a>
                </div>
            </div>
          ))}
        </div>
        {zoomedImage && <ZoomModal src={zoomedImage} onClose={() => setZoomedImage(null)} />}
      </>
    );
  }

  return <InitialState />;
};
