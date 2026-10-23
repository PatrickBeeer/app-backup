import React, { useRef, useState } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { ImageFile } from '../types';

interface ImageUploaderProps {
  label: string;
  subLabel: string;
  image: ImageFile | null;
  onImageChange: (image: ImageFile | null) => void;
  accept?: string;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  label,
  subLabel,
  image,
  onImageChange,
  accept = "image/*"
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processFile = async (file: File) => {
    try {
      const base64 = await fileToBase64(file);
      const previewUrl = URL.createObjectURL(file);
      
      // Load image to get dimensions
      const img = new Image();
      img.onload = () => {
        onImageChange({ 
          file, 
          previewUrl, 
          base64,
          width: img.width,
          height: img.height
        });
      };
      img.src = previewUrl;

    } catch (error) {
      console.error("Error reading file", error);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the Data URL prefix (e.g., "data:image/jpeg;base64,")
        const base64Data = result.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onImageChange(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Prevent flickering when dragging over children
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }
    
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        await processFile(file);
      }
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-bold text-gray-700">{label}</label>
      <div 
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative group cursor-pointer 
          border-2 border-dashed rounded-xl 
          h-64 flex flex-col items-center justify-center text-center p-4
          transition-all duration-300 ease-in-out
          ${isDragging 
            ? 'border-indigo-600 bg-indigo-100 scale-[1.02] shadow-xl' 
            : image 
              ? 'border-indigo-500 bg-indigo-50' 
              : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'
          }
        `}
      >
        <input 
          type="file" 
          ref={fileInputRef}
          className="hidden" 
          accept={accept} 
          onChange={handleFileChange}
        />

        {image ? (
          <>
            <img 
              src={image.previewUrl} 
              alt="Preview" 
              className="absolute inset-0 w-full h-full object-cover rounded-xl opacity-90 group-hover:opacity-100 transition-opacity"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-xl" />
            <button 
              onClick={handleClear}
              className="absolute top-2 right-2 bg-white/90 text-red-500 p-1.5 rounded-full shadow-md hover:bg-white transition-transform hover:scale-110"
            >
              <X size={18} />
            </button>
            <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-md backdrop-blur-sm">
              点击更换
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center text-gray-400 group-hover:text-indigo-500 transition-colors pointer-events-none">
            <div className={`p-4 rounded-full mb-3 transition-colors ${isDragging ? 'bg-indigo-200 text-indigo-600' : 'bg-gray-100 group-hover:bg-indigo-100'}`}>
              {isDragging ? <Upload size={32} /> : <ImageIcon size={32} />}
            </div>
            <p className="text-sm font-medium text-gray-600 group-hover:text-indigo-600">
              {isDragging ? '松开以上传图片' : '点击或拖拽上传图片'}
            </p>
            <p className="text-xs text-gray-400 mt-1">{subLabel}</p>
          </div>
        )}
      </div>
    </div>
  );
};