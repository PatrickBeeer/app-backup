import React, { useState, useCallback, useRef } from 'react';
import type { FileWithPreview } from '../types';

interface ImageUploaderProps {
  onImageUpload: (file: FileWithPreview) => void;
  isLoading: boolean;
  uploadedFile: FileWithPreview | null;
  onReset: () => void;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageUpload, isLoading, uploadedFile, onReset }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (files: FileList | null) => {
    if (files && files[0]) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        const fileWithPreview = Object.assign(file, {
          preview: URL.createObjectURL(file),
        }) as FileWithPreview;
        onImageUpload(fileWithPreview);
      } else {
        alert('请上传有效的图片文件。');
      }
    }
  };

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (event.dataTransfer.files) {
      handleFileChange(event.dataTransfer.files);
    }
  }, []);

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

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-black tracking-tight">
        1. 上传您的产品图
      </h2>
      {uploadedFile ? (
        <div className="text-center w-full">
          <div className="relative w-full aspect-w-4 aspect-h-3 mb-4">
            <img src={uploadedFile.preview} alt="Product preview" className="rounded-2xl object-contain h-full w-full max-h-[250px]" />
          </div>
          <p className="text-sm text-slate-600 truncate mb-4">{uploadedFile.name}</p>
          <button
            onClick={onReset}
            disabled={isLoading}
            className="w-full bg-white/60 hover:bg-white/80 border border-white/20 text-slate-700 font-bold py-3 px-4 rounded-full transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            开始新的创作
          </button>
        </div>
      ) : (
        <div 
          className={`relative block w-full h-64 bg-white/40 rounded-2xl cursor-pointer border-2 border-dashed transition-colors duration-300 ${
            isDragging ? 'border-black border-white' : 'border-white/60 hover:border-white'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onClick={handleClick}
        >
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-4-4V6a4 4 0 014-4h10a4 4 0 014 4v6a4 4 0 01-4 4H7z"></path>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 11c-1.657 0-3 1.343-3 3s1.343 3 3 3 3-1.343 3-3-1.343-3-3-3z"></path>
            </svg>
            <p className="mt-2 text-sm font-medium">点击上传或拖拽文件到此处</p>
            <p className="text-xs">支持 PNG, JPG, WEBP 格式</p>
          </div>
          <input 
            ref={fileInputRef}
            id="file-upload" 
            name="file-upload" 
            type="file" 
            className="sr-only" 
            accept="image/png, image/jpeg, image/webp" 
            onChange={(e) => handleFileChange(e.target.files)} 
          />
        </div>
      )}
      <p className="text-xs text-slate-500 uppercase tracking-wider text-center">为获得最佳效果，请使用背景干净或透明的高分辨率图片。</p>
    </div>
  );
};

export default ImageUploader;

