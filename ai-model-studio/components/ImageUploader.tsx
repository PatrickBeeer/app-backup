import React, { useRef, useState } from 'react';

interface ImageUploaderProps {
  onImageSelected: (base64: string) => void;
  isLoading: boolean;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageSelected, isLoading }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64Clean = result.split(',')[1]; 
      setPreview(result);
      onImageSelected(base64Clean);
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      <input
        type="file"
        accept="image/*"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
      />
      
      {!preview ? (
        <div
          onClick={() => !isLoading && fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={`flex-1 border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 min-h-[320px] bg-slate-100/50
            ${isLoading ? 'border-slate-300 opacity-50 cursor-not-allowed' : 'border-slate-300 hover:border-indigo-500 hover:bg-slate-100 hover:shadow-lg hover:shadow-indigo-500/10'}`}
        >
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6 text-indigo-400 shadow-xl shadow-indigo-500/10 border border-slate-300">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021.75 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5m-9 0h18" />
            </svg>
          </div>
          <p className="text-slate-800 font-semibold text-xl tracking-tight">上传参考图</p>
          <p className="text-slate-600 text-sm mt-2 font-medium">支持 JPG, PNG</p>
        </div>
      ) : (
        <div className="relative group w-full h-full flex flex-col">
          <div 
            className="w-full h-full relative overflow-hidden rounded-2xl border border-slate-300 shadow-xl bg-slate-100/50 group-hover:shadow-2xl transition-all duration-500"
          >
            <div className="absolute inset-0 flex items-center justify-center p-4 bg-white/50">
              <img 
                src={preview} 
                alt="上传的模特图" 
                className="w-full h-full object-contain cursor-zoom-in" 
                onClick={() => setIsZoomed(true)}
              />
            </div>
            
            <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none flex items-center justify-center">
              <div className="bg-white/90 backdrop-blur-md text-slate-800 px-5 py-2.5 rounded-full flex items-center gap-2 shadow-lg font-medium transform scale-95 group-hover:scale-100 transition-transform">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <span>点击放大</span>
              </div>
            </div>

            <button 
              onClick={(e) => {
                e.stopPropagation();
                setPreview(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="absolute top-4 right-4 z-10 bg-white/80 hover:bg-slate-100 text-slate-600 hover:text-red-400 backdrop-blur-md border border-slate-300 p-2.5 rounded-full shadow-lg transition-all transform hover:scale-105"
              title="移除图片"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Fullscreen Zoom Modal */}
      {isZoomed && preview && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setIsZoomed(false)}
        >
          <div className="relative max-w-5xl max-h-screen w-full h-full flex items-center justify-center">
            <img 
              src={preview} 
              alt="放大查看" 
              className="max-w-full max-h-full object-contain drop-shadow-2xl rounded-lg" 
              onClick={(e) => e.stopPropagation()} 
            />
            <button 
              onClick={() => setIsZoomed(false)}
              className="absolute top-6 right-6 bg-white shadow-xl hover:bg-slate-100 text-white p-3 rounded-full transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageUploader;

