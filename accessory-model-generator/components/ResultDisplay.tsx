import React from 'react';

interface ResultDisplayProps {
  image: string | null;
  isLoading: boolean;
  error: string | null;
}

const LoadingSpinner: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-full min-h-[300px]">
    <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-purple-500"></div>
    <p className="mt-4 text-slate-900 font-semibold">正在生成您的图片...</p>
    <p className="mt-2 text-sm text-slate-500">这可能需要一点时间。</p>
  </div>
);

const ResultDisplay: React.FC<ResultDisplayProps> = ({ image, isLoading, error }) => {
  
  const handleDownload = (imgUrl: string) => {
    const link = document.createElement('a');
    link.href = imgUrl;
    link.download = `虚拟试戴效果图.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) return <div className="w-full aspect-square p-2"><LoadingSpinner /></div>;

  if (error) return (
    <div className="w-full aspect-square flex items-center justify-center p-2">
      <div className="text-center text-red-600 bg-red-50/50 p-6 rounded-3xl w-full">
        <h3 className="font-bold text-lg">发生错误</h3>
        <p className="text-sm mt-1">{error}</p>
      </div>
    </div>
  );

  if (!image) return (
    <div className="w-full aspect-square flex items-center justify-center p-2 text-center text-slate-500">
      <div>
        <p className="text-lg font-semibold text-slate-900">您生成的图片将显示在这里</p>
        <p className="text-sm">上传图片后点击"虚拟试戴"</p>
      </div>
    </div>
  );

  return (
    <div className="w-full aspect-square p-2">
      <div className="relative w-full h-full group overflow-hidden">
        <img src={image} alt="Generated try-on" className="w-full h-full object-contain rounded-3xl max-h-full max-w-full" />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all duration-300 flex items-center justify-center rounded-3xl">
          <button
            onClick={() => handleDownload(image)}
            className="opacity-0 group-hover:opacity-100 bg-white/80 text-slate-900 font-bold py-2 px-6 rounded-full shadow-lg transform group-hover:scale-100 scale-90 transition-all duration-300 hover:bg-white"
          >
            下载
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResultDisplay;

