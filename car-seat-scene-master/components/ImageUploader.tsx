import React, { useState } from 'react';
import { SceneCategory } from '../types';

interface ImageUploaderProps {
  onImageUpload: (file: File) => void;
  onGenerate: () => void;
  imageUrl: string | null;
  isLoading: boolean;
  selectedCategory: SceneCategory;
  onCategoryChange: (category: SceneCategory) => void;
}

const UploadIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);

const categoryOptions: { key: SceneCategory; name: string }[] = [
  { key: 'standard', name: '车内常规图' },
  { key: 'convertible', name: '敞篷特效图' },
];

export const ImageUploader: React.FC<ImageUploaderProps> = ({ 
  onImageUpload, 
  onGenerate, 
  imageUrl, 
  isLoading, 
  selectedCategory, 
  onCategoryChange 
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImageUpload(e.target.files[0]);
    }
  };

  const handleDragEvents = (e: React.DragEvent<HTMLDivElement>, dragging: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(dragging);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onImageUpload(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-indigo-400">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
        上传产品图
      </h2>
      
      <div 
        className={`relative h-64 flex items-center justify-center border-2 border-dashed rounded-xl transition-all duration-300 ${
          isDragging 
            ? 'border-indigo-500 bg-indigo-900/20' 
            : 'border-slate-300 bg-slate-100/50 hover:border-slate-600'
        }`}
        onDragEnter={(e) => handleDragEvents(e, true)}
        onDragLeave={(e) => handleDragEvents(e, false)}
        onDragOver={(e) => handleDragEvents(e, true)}
        onDrop={handleDrop}
      >
        <input
          type="file"
          id="file-upload"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          accept="image/png, image/jpeg, image/webp"
          onChange={handleFileChange}
          disabled={isLoading}
        />
        {imageUrl ? (
          <img 
            src={imageUrl} 
            alt="上传的产品图" 
            className="max-h-full h-auto w-auto object-contain rounded-lg p-2" 
          />
        ) : (
          <label htmlFor="file-upload" className="flex flex-col items-center justify-center text-center cursor-pointer p-4">
            <UploadIcon />
            <p className="mt-2 text-slate-700 font-medium">
              拖拽图片至此或 <span className="font-semibold text-indigo-400">点击上传</span>
            </p>
            <p className="text-xs text-slate-600 mt-1">支持 PNG, JPG, WEBP</p>
          </label>
        )}
      </div>

      <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-300">
        {categoryOptions.map(option => (
          <button
            key={option.key}
            onClick={() => onCategoryChange(option.key)}
            disabled={isLoading}
            className={`w-full py-2.5 rounded-lg text-sm font-bold transition-colors duration-300 ${
              selectedCategory === option.key
                ? 'bg-indigo-600 text-white shadow-lg'
                : 'bg-transparent text-slate-600 hover:text-slate-700'
            } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {option.name}
          </button>
        ))}
      </div>

      <button
        onClick={onGenerate}
        disabled={!imageUrl || isLoading}
        className={`
          w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all transform active:scale-95
          flex items-center justify-center gap-2
          ${!imageUrl || isLoading
            ? 'bg-slate-200 text-slate-600 cursor-not-allowed shadow-none'
            : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-500/50'
          }
        `}
      >
        {isLoading ? (
          <>
            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            生成中...
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
            </svg>
            开始生成
          </>
        )}
      </button>
      <p className="text-center text-xs text-slate-600 -mt-2">将为您生成2张同风格的效果图</p>
    </div>
  );
};

