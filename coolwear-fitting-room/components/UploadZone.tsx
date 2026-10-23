import React, { useRef } from 'react';
import { ImageAsset } from '../types';
import { processFile } from '../services/utils';

interface UploadZoneProps {
  label: string;
  description: string;
  image: ImageAsset | null;
  onImageSelected: (image: ImageAsset) => void;
  onClear: () => void;
  disabled?: boolean;
  customPreview?: React.ReactNode;
}

export const UploadZone: React.FC<UploadZoneProps> = ({
  label,
  description,
  image,
  onImageSelected,
  onClear,
  disabled = false,
  customPreview,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        const processedImage = await processFile(file);
        onImageSelected(processedImage);
      } catch (e) {
        console.error("Error processing file", e);
        alert("无法处理该图片，请重试");
      }
    }
  };

  const triggerUpload = () => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="flex flex-col gap-2 w-full h-full">
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      
      {image ? (
        <div className="relative w-full aspect-[3/4] rounded-xl overflow-hidden border border-slate-300 shadow-sm group bg-slate-100 flex items-center justify-center">
          {customPreview ? (
            <div className="w-full h-full flex items-center justify-center p-4 animate-fade-in">
              {customPreview}
            </div>
          ) : (
            <img 
              src={image.previewUrl} 
              alt={label} 
              className="w-full h-full object-cover"
            />
          )}
          
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
             <button
              onClick={onClear}
              className="px-3 py-1 bg-white/20 backdrop-blur-md text-white rounded-full text-xs hover:bg-white/30 transition-colors border border-white/40"
            >
              移除
            </button>
          </div>
        </div>
      ) : (
        <div 
          onClick={triggerUpload}
          className={`
            w-full aspect-[3/4] rounded-xl border-2 border-dashed border-slate-300
            flex flex-col items-center justify-center p-6 text-center transition-all
            ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-100' : 'cursor-pointer hover:border-indigo-500 hover:bg-slate-100/50'}
          `}
        >
          <div className="w-12 h-12 rounded-full bg-indigo-900/50 flex items-center justify-center mb-3 text-indigo-400">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <span className="text-sm font-medium text-slate-700">点击上传</span>
          <span className="text-xs text-slate-600 mt-1">{description}</span>
        </div>
      )}
      
      <input 
        type="file" 
        accept="image/png, image/jpeg, image/webp" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden"
      />
    </div>
  );
};

