import React, { useRef, useCallback } from 'react';
import { UploadIcon } from './icons/UploadIcon';

interface ImageUploaderProps {
  onImageUpload: (file: File) => void;
  uploadedImage: string | null;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageUpload, uploadedImage }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImageUpload(file);
    }
  };
  
  const handleDrop = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove('bg-white/80');
    const file = event.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onImageUpload(file);
    }
  }, [onImageUpload]);

  const handleDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };
  
  const handleDragEnter = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.add('bg-white/80');
  };

  const handleDragLeave = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove('bg-white/80');
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  return (
    <div className="w-full h-full flex-grow">
      <input
        type="file"
        ref={inputRef}
        onChange={handleFileChange}
        accept="image/png, image/jpeg, image/webp"
        className="hidden"
      />
      {uploadedImage ? (
        <div className="relative group rounded-2xl overflow-hidden h-full">
          <img src={uploadedImage} alt="已上传的产品" className="w-full h-full object-contain rounded-2xl bg-white/40 p-2 max-h-full max-w-full" />
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <button onClick={handleClick} className="bg-black text-white font-semibold py-2 px-4 rounded-xl">
              更换图片
            </button>
          </div>
        </div>
      ) : (
        <label
          onClick={handleClick}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          className="flex flex-col items-center justify-center w-full h-full flex-grow bg-white/40 backdrop-blur-sm border-2 border-dashed border-white/60 rounded-2xl cursor-pointer hover:bg-white/60 transition-colors duration-300"
        >
          <div className="flex flex-col items-center justify-center text-center p-4">
            <UploadIcon className="w-10 h-10 mb-4 text-slate-500" />
            <p className="mb-2 text-lg text-slate-600">
              <span className="font-semibold text-black">上传产品图片</span>
            </p>
            <p className="text-sm text-slate-500 mb-2">或将文件拖拽到此处</p>
            <p className="text-xs text-slate-500">建议使用背景透明或简洁的图片</p>
          </div>
        </label>
      )}
    </div>
  );
};

