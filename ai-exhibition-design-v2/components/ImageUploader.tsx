
import React, { useState } from 'react';
import { UploadedImageData } from '../types';

import { Upload, CheckCircle2 } from 'lucide-react';

interface ImageUploaderProps {
  onImageUpload: (data: UploadedImageData | null) => void;
  id?: string;
  placeholder?: string;
  successMessage?: string;
  previewAlt?: string;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ 
  onImageUpload, 
  id = "image-upload",
  placeholder = "点击上传美陈装置",
  successMessage = "装置图片已就绪",
  previewAlt = "预览图"
}) => {
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        alert('文件大小不能超过5MB。');
        event.target.value = ''; // Clear the input
        setPreviewImage(null);
        onImageUpload(null);
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setPreviewImage(base64String); // This sets the full Data URL for preview
        
        // Extract mimeType from the Data URL
        const mimeTypeMatch = base64String.match(/^data:(.*?);base64,/);
        const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'application/octet-stream'; // Default if not found

        // Pass only the base64 part and mimeType to the parent component for API call
        onImageUpload({ base64: base64String.split(',')[1], mimeType });
      };
      reader.readAsDataURL(file);
    } else {
      setPreviewImage(null);
      onImageUpload(null);
    }
  };

  return (
    <div className="flex flex-col items-center w-full">
      <label
        htmlFor={id}
        className="relative flex justify-center items-center w-full h-64 bg-white/40 border-2 border-dashed border-white/60 rounded-[2rem] cursor-pointer hover:bg-white/60 hover:border-white transition-all duration-300 overflow-hidden group"
      >
        {previewImage ? (
          <div className="w-full h-full absolute inset-0 flex items-center justify-center bg-white/20">
            <img 
              src={previewImage} 
              alt={previewAlt} 
              className="max-h-full max-w-full object-contain" 
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all duration-300 flex items-center justify-center">
              <Upload className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-all duration-300" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center text-gray-500 p-8 text-center">
            <div className="w-16 h-16 bg-white/60 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
              <Upload className="w-8 h-8 text-black" />
            </div>
            <span className="text-lg font-bold text-black tracking-tight mb-1">{placeholder}</span>
            <span className="text-xs text-gray-400 font-medium uppercase tracking-widest">PNG / JPG (Max 5MB)</span>
          </div>
        )}
        <input
          id={id}
          type="file"
          accept="image/png, image/jpeg"
          onChange={handleFileChange}
          className="hidden"
        />
      </label>
      {previewImage && (
        <div className="mt-4 flex items-center text-emerald-500 font-bold text-xs uppercase tracking-widest">
          <CheckCircle2 className="w-4 h-4 mr-2" />
          {successMessage}
        </div>
      )}
    </div>
  );
};
