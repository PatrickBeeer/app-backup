import React, { useRef, memo } from 'react';
import { ImageData } from '../types';

interface ImageUploadProps {
  label: string;
  icon: string;
  description: string;
  image: ImageData | null;
  onImageSelect: (data: ImageData) => void;
  className?: string;
}

const ImageUpload: React.FC<ImageUploadProps> = ({ 
  label, 
  icon, 
  description, 
  image, 
  onImageSelect,
  className = "" 
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onImageSelect({
          base64: reader.result as string,
          mimeType: file.type
        });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <label className="text-xs font-bold text-slate-500 uppercase tracking-widest px-1">{label}</label>
      <div 
        onClick={() => inputRef.current?.click()}
        className={`relative aspect-square rounded-3xl border-2 border-dashed transition-all duration-300 cursor-pointer overflow-hidden flex flex-col items-center justify-center group
          ${image ? 'border-white/50 hover:border-white/80' : 'border-slate-400/30 hover:border-slate-400/50 bg-white/20 hover:bg-white/40'}`}
      >
        <input 
          type="file" 
          ref={inputRef}
          className="hidden" 
          accept="image/*"
          onChange={handleFileChange}
        />
        
        {image ? (
          <>
            <img src={image.base64} alt={label} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-300">
              <span className="text-white text-sm font-medium bg-black/60 backdrop-blur-sm px-3 py-1 rounded-full">更换图片</span>
            </div>
          </>
        ) : (
          <div className="text-center p-4">
            <div className="w-12 h-12 bg-white/50 rounded-2xl flex items-center justify-center mb-3 mx-auto shadow-sm border border-white/20 transition-all duration-300 group-hover:scale-105">
                <i className={`fas ${icon} text-slate-500 text-xl`}></i>
            </div>
            <p className="text-xs font-bold text-slate-700">{description}</p>
            <p className="text-[10px] text-slate-500 mt-1">点击进行浏览</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(ImageUpload);

