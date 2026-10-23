import React, { useState, useCallback, useRef } from 'react';
import { UploadIcon } from './icons/UploadIcon';

interface ImageUploaderProps {
  title: string;
  onImageUpload: (file: File) => void;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ title, onImageUpload }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
      setPreview(URL.createObjectURL(file));
      setFileName(file.name);
      onImageUpload(file);
    }
  }, [onImageUpload, preview]);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="flex flex-col items-center justify-center w-full h-full">
      <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
      <div
        className="relative w-full aspect-square bg-white/30 backdrop-blur-sm rounded-3xl border-2 border-dashed border-white/60 flex flex-col items-center justify-center text-center p-4 cursor-pointer hover:border-purple-400 transition-colors overflow-hidden"
        onClick={handleClick}
      >
        <input
          type="file"
          accept="image/png, image/jpeg, image/webp"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
        />
        {preview ? (
          <img src={preview} alt="Preview" className="w-full h-full object-contain rounded-2xl max-h-full max-w-full" />
        ) : (
          <div className="text-slate-500">
            <UploadIcon className="w-12 h-12 mx-auto mb-2" />
            <p className="font-semibold text-slate-900">点击上传</p>
            <p className="text-xs">支持 PNG, JPG, WEBP</p>
          </div>
        )}
      </div>
      {fileName && <p className="text-xs text-slate-500 mt-2 truncate w-full text-center">{fileName}</p>}
    </div>
  );
};

export default ImageUploader;

