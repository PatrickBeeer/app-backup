import React, { useState, useCallback } from 'react';
import { UploadIcon } from './icons/UploadIcon';

interface ImageUploaderProps {
  onImageUpload: (file: File) => void;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageUpload }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (files: FileList | null) => {
    if (files && files[0]) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        onImageUpload(file);
      } else {
        alert('请上传有效的图片文件。');
      }
    }
  };

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFileChange(e.dataTransfer.files);
  }, []);

  return (
    <label
      htmlFor="image-upload"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`flex flex-col justify-center items-center w-full h-full min-h-[300px] border-3 border-dashed rounded-2xl cursor-pointer transition-all duration-300 group
      ${isDragging 
        ? 'border-blue-500 bg-blue-900/20 scale-[0.99]' 
        : 'border-slate-600 bg-slate-100/40 hover:bg-slate-100/60 hover:border-blue-400'}`}
    >
      <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
        <div className={`p-4 rounded-full mb-4 transition-colors duration-300 ${isDragging ? 'bg-blue-900/30 text-blue-400' : 'bg-slate-200 text-slate-600 group-hover:bg-blue-900/20 group-hover:text-blue-400'}`}>
          <UploadIcon className="w-8 h-8" />
        </div>
        <p className="mb-2 text-lg text-slate-800 font-medium">
          <span className="font-bold text-blue-400">点击上传</span> 或拖拽图片到这里
        </p>
        <p className="text-sm text-slate-600">支持 PNG, JPG, WEBP (最大 10MB)</p>
      </div>
      <input
        id="image-upload"
        type="file"
        className="hidden"
        accept="image/png, image/jpeg, image/webp"
        onChange={(e) => handleFileChange(e.target.files)}
      />
    </label>
  );
};

