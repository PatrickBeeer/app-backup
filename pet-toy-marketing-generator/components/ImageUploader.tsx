import React, { useCallback, useState } from 'react';

interface ImageUploaderProps {
  onImageUpload: (file: File) => void;
  imageUrl: string | null;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageUpload, imageUrl }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (files: FileList | null) => {
    if (files && files[0]) {
      onImageUpload(files[0]);
    }
  };
  
  const onDragOver = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleFileChange(event.dataTransfer.files);
  }, []);

  return (
    <div className="w-full">
      <label
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`flex justify-center items-center w-full h-64 border-2 border-dashed rounded-3xl cursor-pointer transition-all duration-300
        ${isDragging ? 'border-violet-400 bg-white/60 scale-105' : 'border-white/60 bg-white/30 hover:bg-white/50'}`}
      >
        {imageUrl ? (
          <img src={imageUrl} alt="产品预览" className="max-h-full max-w-full object-contain p-2 rounded-2xl" />
        ) : (
          <div className="text-center">
            <svg className="mx-auto h-12 w-12 text-slate-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
              <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="mt-2 text-sm text-slate-500">
              <span className="font-semibold text-violet-500">点击上传</span> 或拖拽文件到这里
            </p>
            <p className="text-xs text-slate-400">建议使用背景干净的产品图</p>
          </div>
        )}
        <input
          type="file"
          className="hidden"
          accept="image/png, image/jpeg, image/gif"
          onChange={(e) => handleFileChange(e.target.files)}
        />
      </label>
    </div>
  );
};

