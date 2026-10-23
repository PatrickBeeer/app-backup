
import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { ImageFile } from '../types';

interface ImageUploaderProps {
  onImagesChange: (files: ImageFile[]) => void;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onImagesChange }) => {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const imagesRef = useRef<ImageFile[]>([]);

  useEffect(() => {
    return () => {
      for (const image of imagesRef.current) {
        URL.revokeObjectURL(image.previewUrl);
      }
    };
  }, []);

  const commitImages = (nextImages: ImageFile[]) => {
    imagesRef.current = nextImages;
    setImages(nextImages);
    onImagesChange(nextImages);
  };

  const generateImageId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList) return;
    
    const newFiles = Array.from(fileList).filter(file => file.type.startsWith('image/'));
    if (images.length + newFiles.length > 3) {
      alert('最多只能上传3张产品参考图');
      return;
    }

    try {
      const processedFiles: ImageFile[] = await Promise.all(
        newFiles.map(async (file) => {
          const base64 = await fileToBase64(file);
          const previewUrl = URL.createObjectURL(file);
          return {
            id: generateImageId(),
            name: file.name,
            type: file.type,
            size: file.size,
            base64,
            previewUrl,
          };
        })
      );

      const updatedImages = [...images, ...processedFiles];
      commitImages(updatedImages);
    } catch (error) {
      console.error('[s_skincare-product-image] failed to process uploaded files', error);
      alert('图片读取失败，请重试。');
    }
  }, [images, onImagesChange]);

  const removeImage = (id: string) => {
    const imageToRemove = images.find((img) => img.id === id);
    if (imageToRemove) {
      URL.revokeObjectURL(imageToRemove.previewUrl);
    }

    const updatedImages = images.filter(img => img.id !== id);
    commitImages(updatedImages);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {images.map((img) => (
          <div key={img.id} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 group">
            <img src={img.previewUrl} alt="Preview" className="w-full h-full object-cover" />
            <button
              onClick={() => removeImage(img.id)}
              className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        {images.length < 3 && (
          <label
            className={`cursor-pointer aspect-square border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-gray-400 hover:text-indigo-600 hover:border-indigo-400 transition-all ${
              isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
          >
            <input
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-[10px] font-medium">添加参考图</span>
            <span className="text-[9px] mt-0.5">({images.length}/3)</span>
          </label>
        )}
      </div>
      {images.length === 0 && (
        <p className="text-center text-xs text-gray-400 py-4 border-2 border-dashed border-gray-200 rounded-lg">
          请上传1-3张产品图片，多角度参考有助于提升生成精度
        </p>
      )}
    </div>
  );
};

