import React, { useCallback } from 'react';
import { Upload, X } from '@/utils/lucide';

interface ImageUploaderProps {
  label: string;
  imageSrc: string | null;
  onImageChange: (base64: string | null) => void;
  heightClass?: string;
  helperText?: string;
  className?: string;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ 
  label, 
  imageSrc, 
  onImageChange, 
  heightClass = "h-64",
  helperText,
  className = ""
}) => {
  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onImageChange(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, [onImageChange]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onImageChange(null);
  }, [onImageChange]);

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className="block text-xs font-semibold text-gray-500 mb-3 tracking-wide uppercase ml-1">
          {label}
        </label>
      )}
      
      <div className={`relative w-full ${heightClass} rounded-2xl overflow-hidden transition-all duration-300 group`}>
        {imageSrc ? (
          <>
            <img 
              src={imageSrc} 
              alt="Uploaded content" 
              className="w-full h-full object-contain bg-white/40 backdrop-blur-md border border-white/60 rounded-2xl p-2"
            />
            <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl pointer-events-none" />
            <button
              onClick={handleClear}
              className="absolute top-3 right-3 p-2 bg-white/80 backdrop-blur-lg text-gray-500 rounded-full shadow-sm hover:text-red-500 hover:bg-white transition-all transform scale-90 opacity-0 group-hover:scale-100 group-hover:opacity-100"
            >
              <X size={16} />
            </button>
          </>
        ) : (
          <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer bg-white/30 hover:bg-white/50 border border-dashed border-gray-300/50 hover:border-gray-400/50 rounded-2xl transition-all duration-300">
            <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
              <div className="p-3 bg-white/60 rounded-full mb-3 shadow-sm text-gray-400 group-hover:text-black group-hover:scale-110 transition-all duration-300">
                <Upload size={20} />
              </div>
              <p className="mb-1 text-sm text-gray-600 font-medium">点击上传图片</p>
              {helperText && (
                  <p className="mt-1 text-xs text-gray-400 font-light leading-relaxed max-w-[80%]">{helperText}</p>
              )}
            </div>
            <input 
              type="file" 
              className="hidden" 
              accept="image/*"
              onChange={handleFileChange}
            />
          </label>
        )}
      </div>
    </div>
  );
};

