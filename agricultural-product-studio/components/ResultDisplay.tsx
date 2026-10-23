import React from 'react';

interface ResultDisplayProps {
  isLoading: boolean;
  generatedImages: string[] | null;
  error: string | null;
  uploadedImage: string | null;
}

const loadingMessages = [
    "正在唤醒 AI 画家...",
    "正在混合数字颜料与像素...",
    "正在寻找完美的光线...",
    "正在构思场景...",
    "正在施展一点魔法...",
    "快好了，正在完善细节..."
];

const LoadingState: React.FC = () => {
    const [message, setMessage] = React.useState(loadingMessages[0]);
    
    React.useEffect(() => {
        let index = 0;
        const interval = setInterval(() => {
            index = (index + 1) % loadingMessages.length;
            setMessage(loadingMessages[index]);
        }, 2500);

        return () => clearInterval(interval);
    }, []);

    return (
        <div role="status" className="flex flex-col items-center justify-center h-full w-full bg-white/40 backdrop-blur-sm rounded-2xl p-4">
            <div className="w-12 h-12 border-2 border-black/80 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-slate-600 font-semibold text-center">{message}</p>
        </div>
    );
};

const ErrorState: React.FC<{ error: string | null }> = ({ error }) => (
    <div className="flex flex-col items-center justify-center h-full w-full bg-amber-500/20 text-amber-900 rounded-2xl p-4 border border-amber-500/30">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="font-bold">生成失败</p>
        <p className="text-sm text-center mt-1 font-medium">{error}</p>
    </div>
);

const PreviewState: React.FC<{ uploadedImage: string }> = ({ uploadedImage }) => (
    <div className="flex flex-col items-center justify-center h-full w-full bg-white/20 backdrop-blur-sm rounded-2xl p-4 text-center border border-white/20 overflow-hidden">
      <img src={uploadedImage} alt="已上传的产品" className="max-w-full max-h-full object-contain rounded-lg" />
       <p className="text-xs text-slate-500 mt-3 bg-black/5 px-2 py-1 rounded-full">请在右侧面板完成设置以生成图片</p>
    </div>
);

const ImageGrid: React.FC<{ generatedImages: string[] }> = ({ generatedImages }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full h-full">
      {generatedImages.map((imageSrc, index) => (
        <div key={index} className="relative group image-fade-in bg-black/5 rounded-2xl shadow-inner overflow-hidden">
          <img 
            src={imageSrc} 
            alt={`生成的场景图 ${index + 1}`} 
            className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105 max-h-full max-w-full" 
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent p-4 flex flex-col justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <a 
              href={imageSrc} 
              download={`generated-scene-${index + 1}.png`} 
              className="w-full text-center bg-white text-black font-bold py-3 px-4 rounded-xl shadow-lg hover:bg-white/90 hover:scale-[1.03] transition-all transform duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              下载图片 {index + 1}
            </a>
          </div>
        </div>
      ))}
    </div>
);

export const ResultDisplay: React.FC<ResultDisplayProps> = ({ isLoading, generatedImages, error, uploadedImage }) => {
  let content;

  if (isLoading) {
    content = <LoadingState />;
  } else if (error) {
    content = <ErrorState error={error} />;
  } else if (generatedImages && generatedImages.length > 0) {
    content = <ImageGrid generatedImages={generatedImages} />;
  } else if (uploadedImage) {
    content = <PreviewState uploadedImage={uploadedImage} />;
  } else {
    return null; // Should be handled by App state (showing ImageUploader)
  }

  return (
    <div className="w-full h-full flex-grow min-h-0">
      {content}
    </div>
  );
};

