import React, { useCallback, useState } from 'react';
import type { UploadedImage } from '../types';

interface ImageUploaderProps {
  onImageUpload: (image: UploadedImage) => void;
}

const UploadIcon = () => (
  <svg className="w-12 h-12 mb-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-4-4V6a4 4 0 014-4h10a4 4 0 014 4v6a4 4 0 01-4 4H7z"></path>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 16v1a2 2 0 01-2 2H6a2 2 0 01-2-2v-1"></path>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 11l-4-4m0 0l-4 4m4-4v12"></path>
  </svg>
);

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageUpload }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (files: FileList | null) => {
    if (files && files[0]) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          onImageUpload({
            base64: reader.result as string,
            mimeType: file.type,
          });
        };
        reader.readAsDataURL(file);
      } else {
        alert('请上传图片文件。');
      }
    }
  };

  const onDragEnter = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);
  
  const onDrop = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFileChange(e.dataTransfer.files);
  }, []);

  return (
    <div className="w-full">
      <h2 className="text-xl font-bold text-slate-700 mb-4">上传产品图</h2>
      <label
        htmlFor="dropzone-file"
        className={`flex flex-col items-center justify-center w-full h-64 border-2 border-slate-300/80 border-dashed rounded-2xl cursor-pointer bg-white/40 hover:bg-white/60 transition-colors ${isDragging ? 'border-indigo-500 bg-indigo-50' : ''}`}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <div className="flex flex-col items-center justify-center pt-5 pb-6">
          <UploadIcon />
          <p className="mb-2 text-sm text-slate-500"><span className="font-semibold">点击上传</span> 或拖拽文件至此</p>
          <p className="text-xs text-slate-400">支持 PNG, JPG, WEBP 格式</p>
        </div>
        <input id="dropzone-file" type="file" accept="image/*" className="hidden" onChange={(e) => handleFileChange(e.target.files)} />
      </label>
    </div>
  );
};

