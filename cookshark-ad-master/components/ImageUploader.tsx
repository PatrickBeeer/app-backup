import React, { useCallback, useState } from 'react';
import type { FileWithPreview } from '../types';

interface ImageUploaderProps {
  onImageUpload: (file: FileWithPreview) => void;
  isLoading: boolean;
  uploadedFile: FileWithPreview | null;
  onReset: () => void;
}

const UploadIcon = () => (
  <svg className="w-12 h-12 mx-auto text-slate-600" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageUpload, isLoading, uploadedFile, onReset }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (files: FileList | null) => {
    if (files && files[0]) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        const fileWithPreview = Object.assign(file, {
          preview: URL.createObjectURL(file),
        });
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
    <div className="bg-slate-100/50 rounded-xl p-4 w-full h-full flex flex-col justify-center items-center">
      {uploadedFile ? (
        <div className="text-center w-full">
          <div className="relative w-full aspect-w-4 aspect-h-3 mb-4">
            <img src={uploadedFile.preview} alt="Sunglass preview" className="rounded-lg object-contain h-full w-full max-h-[250px]" />
          </div>
          <p className="text-sm text-slate-600 truncate mb-4">{uploadedFile.name}</p>
          <button
            onClick={onReset}
            disabled={isLoading}
            className="w-full bg-slate-200 hover:bg-slate-300 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            更换图片
          </button>
        </div>
      ) : (
        <div 
          className={`w-full p-8 border-2 border-dashed rounded-lg text-center transition-colors duration-300 ${
            isDragging 
              ? 'border-indigo-500 bg-indigo-900/20' 
              : 'border-slate-600 hover:border-indigo-400'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
        >
          <UploadIcon />
          <label htmlFor="file-upload" className="relative cursor-pointer">
            <span className="mt-2 block text-sm font-semibold text-indigo-400">
              上传文件
            </span>
            <span className="mt-1 block text-xs text-slate-600">或拖拽文件到此处</span>
            <input id="file-upload" name="file-upload" type="file" className="sr-only" accept="image/*" onChange={(e) => handleFileChange(e.target.files)} />
          </label>
          <p className="mt-4 text-xs text-slate-500">支持 PNG, JPG, GIF, 最大 10MB</p>
        </div>
      )}
    </div>
  );
};

