import React, { useRef, useCallback } from 'react';
import { UploadIcon } from './Icon';

interface ImageUploaderProps {
  onImageUpload: (file: File) => void;
  isLoading: boolean;
  previewUrl?: string | null;
  compact?: boolean;
  label?: string;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  onImageUpload,
  isLoading,
  previewUrl,
  compact = false,
  label = '上传原图',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onImageUpload(file);
  };
  const handleButtonClick = () => fileInputRef.current?.click();
  const onDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (isLoading) return;
    const file = event.dataTransfer.files?.[0];
    if (file) onImageUpload(file);
  }, [isLoading, onImageUpload]);
  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const containerHeight = compact ? 'h-32' : 'h-48';
  const iconSize = compact ? 'w-4 h-4' : 'w-6 h-6';
  const textSize = compact ? 'text-sm' : 'text-lg';
  const padding = compact ? 'p-2' : 'p-3';
  return (
    <div onClick={handleButtonClick} onDrop={onDrop} onDragOver={onDragOver} className={`group w-full ${containerHeight} bg-white cursor-pointer relative overflow-hidden flex flex-col items-center justify-center transition-colors border border-dashed border-gray-300 hover:border-black`}>
      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/png, image/jpeg, image/webp" disabled={isLoading} />
      {!compact && <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '20px 20px' }} />}
      {previewUrl ? (
        <div className="w-full h-full relative z-10">
          <img src={previewUrl} alt="Preview" className="w-full h-full object-contain p-2" />
          <div className="absolute inset-0 bg-white/90 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center backdrop-blur-sm">
            <div className={`bg-black text-lime-300 ${padding} rounded-full mb-2 transform scale-90 group-hover:scale-100 transition-transform`}><UploadIcon className={iconSize} /></div>
            <p className="text-xs font-bold text-black uppercase tracking-wider">更换图片</p>
          </div>
        </div>
      ) : (
        <>
          <div className="relative z-10 flex flex-col items-center text-center p-4">
            <div className={`bg-gray-100 ${padding} rounded-full mb-2 group-hover:bg-black group-hover:text-lime-300 transition-colors`}><UploadIcon className={iconSize} /></div>
            <p className={`${textSize} font-bold text-black mb-1`}>{label}</p>
            {!compact && <p className="text-xs text-gray-500 font-mono uppercase">支持 PNG, JPG, WEBP</p>}
          </div>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-black transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300"></div>
        </>
      )}
    </div>
  );
};
