import React, { useState } from 'react';
import { Upload, X } from 'lucide-react';

interface ImageUploadProps {
  image: { mimeType: string; data: string } | null;
  onUpload: (image: { mimeType: string; data: string } | null) => void;
  title: string;
  placeholder: string;
}

export function ImageUpload({ image, onUpload, title, placeholder }: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('请上传图片文件');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9]+);base64,(.+)$/);
      if (match) {
        onUpload({
          mimeType: match[1],
          data: match[2]
        });
        setError('');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  return (
    <div className="w-full space-y-2">
      <label className="text-xs text-stone-500 font-medium uppercase tracking-wider block">{title}</label>
      {image ? (
        <div className="relative inline-block w-full">
          <div className="aspect-[4/3] w-full bg-stone-100 rounded-2xl border border-stone-200 overflow-hidden relative">
            <img 
               src={`data:${image.mimeType};base64,${image.data}`} 
               className="w-full h-full object-contain"
              alt={title}
            />
            <button 
               onClick={() => onUpload(null)}
              className="absolute top-3 right-3 p-1.5 bg-white/80 hover:bg-white backdrop-blur-sm border border-stone-200 rounded-full text-stone-600 shadow-sm transition-colors"
              title="移除图片"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <label 
          className={`flex flex-col items-center justify-center w-full aspect-[4/3] border-2 ${isDragging ? 'border-indigo-400 bg-indigo-50/50' : 'border-stone-200 bg-white'} border-dashed rounded-2xl cursor-pointer hover:bg-stone-50 transition-colors relative overflow-hidden`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className="absolute inset-0 bg-indigo-50/80 backdrop-blur-[2px] flex items-center justify-center z-10 pointer-events-none">
              <p className="text-indigo-600 font-medium">松开鼠标上传</p>
            </div>
          )}
          <div className="flex flex-col items-center justify-center pt-5 pb-6 pointer-events-none text-center">
            <Upload className={`w-6 h-6 mb-2 mx-auto ${isDragging ? 'text-indigo-500' : 'text-stone-400'}`} />
            <p className="text-sm text-stone-500">{placeholder}</p>
            <p className="text-xs text-stone-400 mt-1">支持 PNG, JPG 等格式</p>
          </div>
          <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
        </label>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
