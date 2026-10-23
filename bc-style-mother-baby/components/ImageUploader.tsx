import React, { useState, useCallback } from 'react';

interface ImageUploaderProps {
  onImageUpload: (file: File) => void;
  texts: Record<string, string>;
  className?: string;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageUpload, texts, className = '' }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      onImageUpload(event.target.files[0]);
    }
  };

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      onImageUpload(event.dataTransfer.files[0]);
    }
  }, [onImageUpload]);

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };
  
  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  return (
    <div
      className={`group relative border border-dashed rounded-2xl text-center transition-all duration-500 ease-out cursor-pointer overflow-hidden backdrop-blur-xl flex flex-col items-center justify-center h-full min-h-[400px]
        ${isDragging 
          ? 'border-blue-400 bg-blue-500/10 scale-[1.01] shadow-2xl' 
          : 'border-slate-300 bg-slate-100/50 hover:bg-slate-100 hover:border-blue-500 hover:shadow-xl shadow-sm'} ${className}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
    >
      <input
        type="file"
        id="file-upload"
        className="hidden"
        onChange={handleFileChange}
        accept="image/png, image/jpeg, image/webp"
      />
      <label htmlFor="file-upload" className="w-full h-full flex flex-col items-center justify-center relative z-10 cursor-pointer p-8 md:p-12">
        {/* Decorative Blurred Orbs */}
        <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-blue-500/20 transition-colors"></div>
        <div className="absolute bottom-1/4 right-1/4 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-purple-500/20 transition-colors"></div>

        <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-6 transition-all duration-500 shadow-lg ${isDragging ? 'bg-blue-500 text-white rotate-12 scale-110' : 'bg-slate-200 text-blue-400 group-hover:scale-110 group-hover:rotate-6'}`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
        </div>
        <h3 className="text-2xl font-bold text-white mb-2 tracking-tight group-hover:text-blue-400 transition-colors">{texts.uploadTitle}</h3>
        <p className="text-slate-600 font-medium text-base max-w-sm mx-auto mb-6">{texts.uploadSubtitle}</p>
        
        <div className="flex items-center gap-2">
            {['PNG', 'JPG', 'WEBP'].map(ext => (
                <span key={ext} className="px-3 py-1 bg-slate-200/50 border border-slate-600 rounded-lg text-[10px] font-bold text-slate-600 tracking-wider">
                    {ext}
                </span>
            ))}
        </div>
      </label>
    </div>
  );
};

