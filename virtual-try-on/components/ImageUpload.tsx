import React, { useCallback } from 'react';
import { UploadedImage } from '../types';
import { Upload, X } from 'lucide-react';

interface ImageUploadProps {
  label: string;
  subLabel?: string;
  image: UploadedImage | null;
  onUpload: (img: UploadedImage) => void;
  onRemove: () => void;
  icon?: React.ReactNode;
}

export const ImageUpload: React.FC<ImageUploadProps> = ({
  label,
  subLabel,
  image,
  onUpload,
  onRemove,
  icon
}) => {
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Convert to Base64
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Extract raw base64 (remove data:image/xxx;base64,)
      const base64Data = result.split(',')[1];
      
      const newImage: UploadedImage = {
        file,
        previewUrl: result,
        base64Data,
        mimeType: file.type,
      };
      onUpload(newImage);
    };
    reader.readAsDataURL(file);
  }, [onUpload]);

  return (
    <div className="w-full">
      <label className="block text-sm font-semibold text-slate-700 mb-2">{label}</label>
      
      {image ? (
        <div className="relative group w-full bg-slate-100 rounded-xl overflow-hidden border border-slate-300 shadow-sm transition-all hover:shadow-md">
          <img 
            src={image.previewUrl} 
            alt="Uploaded preview" 
            className="w-full h-auto max-h-[500px] object-contain mx-auto"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
             <button 
               onClick={onRemove}
               className="bg-slate-100/90 text-red-400 p-2 rounded-full hover:bg-slate-200 transition-colors"
             >
               <X size={24} />
             </button>
          </div>
        </div>
      ) : (
        <div className="relative w-full h-64 border-2 border-dashed border-slate-300 rounded-xl hover:border-indigo-500 hover:bg-indigo-900/20 transition-all flex flex-col items-center justify-center text-center cursor-pointer group bg-slate-100">
          <input 
            type="file" 
            accept="image/*" 
            onChange={handleFileChange} 
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="p-4 flex flex-col items-center space-y-3">
            <div className="p-3 bg-slate-200 rounded-full group-hover:bg-indigo-900/50 text-slate-600 group-hover:text-indigo-400 transition-colors">
              {icon || <Upload size={24} />}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">点击上传图片</p>
              {subLabel && <p className="text-xs text-slate-600 mt-1">{subLabel}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

