import React, { useState, useCallback, useRef } from 'react';
import type { ImageData } from '../types';

interface ImageUploaderProps {
  onImageUpload: (data: ImageData[] | null) => void;
}

const UploadPlaceholder: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <div onClick={onClick} className="flex flex-col items-center justify-center py-6 cursor-pointer group w-full">
        <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center mb-2 group-hover:bg-purple-50 group-hover:border-purple-200 transition-all duration-300">
            <i className="fas fa-cloud-upload-alt text-xl text-slate-400 group-hover:text-purple-500 transition-colors"></i>
        </div>
        <p className="font-semibold text-sm text-slate-600 group-hover:text-purple-700 transition-colors">点击或拖拽上传</p>
        <p className="text-xs text-slate-400 mt-1">支持 JPG/PNG (最多3张)</p>
    </div>
);

const PreviewDisplay: React.FC<{ previews: string[], onClear: () => void }> = ({ previews, onClear }) => (
    <div className="w-full">
        <div className="grid grid-cols-3 gap-2">
            {previews.map((preview, index) => (
                <div key={index} className="aspect-square w-full rounded-lg overflow-hidden ring-1 ring-slate-200 bg-white relative">
                    <img src={preview} alt={`Shoe preview ${index + 1}`} className="w-full h-full object-cover" />
                </div>
            ))}
            {Array.from({ length: 3 - previews.length }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square w-full rounded-lg bg-slate-50 ring-1 ring-slate-100 border border-dashed border-slate-200 flex items-center justify-center">
                   <i className="fas fa-plus text-slate-300 text-xs"></i>
                </div>
            ))}
        </div>
        <button 
            onClick={onClear} 
            className="mt-2 w-full text-xs text-slate-500 hover:text-red-500 font-medium transition-colors py-1 flex items-center justify-center gap-1">
            <i className="fas fa-times-circle"></i> 重新上传
        </button>
    </div>
);

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageUpload }) => {
  const [previews, setPreviews] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((files: FileList) => {
    setError(null);
    if (files.length > 3) {
      setError('最多只能上传 3 张图片。');
      return;
    }
    
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length === 0) return;

    const filePromises = imageFiles.map(file => {
      return new Promise<ImageData>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve({ base64: reader.result as string, mimeType: file.type });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    });

    Promise.all(filePromises).then(imageDataArray => {
      setPreviews(imageDataArray.map(data => data.base64));
      onImageUpload(imageDataArray);
    }).catch(err => {
        console.error("Error reading files:", err);
        setError("读取文件时出错。");
    });

  }, [onImageUpload]);

  const handleClear = () => {
      setPreviews([]);
      onImageUpload(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
  }

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
      e.dataTransfer.clearData();
    }
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleClick = () => {
    if (previews.length > 0) return;
    fileInputRef.current?.click();
  };

  return (
    <div>
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`bg-slate-50 rounded-xl transition-all duration-300 border-2 border-dashed ${
            isDragging ? 'border-purple-500 bg-purple-50' : 'border-slate-200/80 hover:border-slate-400'
        } ${previews.length === 0 ? '' : 'p-3'}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleChange}
          className="hidden"
        />
        {previews.length === 0 ? (
          <UploadPlaceholder onClick={handleClick} />
        ) : (
          <PreviewDisplay previews={previews} onClear={handleClear} />
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  );
};
