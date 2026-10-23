
import React, { useState, useCallback } from 'react';
import { MAX_FILE_SIZE_MB, ALLOWED_IMAGE_TYPES } from '../constants';
import { ProductImageInfo } from '../types';

interface ProductImageUploadProps {
  onImagesChange: (images: ProductImageInfo[]) => void;
  selectedProductImageInfos: ProductImageInfo[];
  isLoading: boolean;
  maxImages: number; // New prop for maximum images
}

const ProductImageUpload: React.FC<ProductImageUploadProps> = ({ onImagesChange, selectedProductImageInfos, isLoading, maxImages }) => {
  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = Array.from(event.target.files || []);
    const newImageInfos: ProductImageInfo[] = [];
    const errors: string[] = [];
    let filesProcessedCount = 0;

    if (files.length === 0) {
      event.target.value = '';
      return;
    }

    // Check if adding new files will exceed the maxImages limit
    if (selectedProductImageInfos.length + files.length > maxImages) {
      alert(`最多只能上传 ${maxImages} 张商品图片。`);
      event.target.value = '';
      return;
    }

    files.forEach(file => {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        errors.push(`文件 "${file.name}" 类型不支持。请上传 JPG, PNG 或 WEBP 格式的图片。`);
        filesProcessedCount++;
        return;
      }
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        errors.push(`文件 "${file.name}" 大小超过 ${MAX_FILE_SIZE_MB}MB。`);
        filesProcessedCount++;
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        newImageInfos.push({
          id: `${file.name}-${Date.now()}`,
          file: file,
          base64: reader.result as string,
        });
        filesProcessedCount++;

        if (filesProcessedCount === files.length) {
          onImagesChange([...selectedProductImageInfos, ...newImageInfos]);
          if (errors.length > 0) {
            alert(errors.join('\n'));
          }
        }
      };
      reader.onerror = () => {
        errors.push(`文件 "${file.name}" 读取失败。`);
        filesProcessedCount++;
        if (filesProcessedCount === files.length) {
          onImagesChange([...selectedProductImageInfos, ...newImageInfos]);
          if (errors.length > 0) {
            alert(errors.join('\n'));
          }
        }
      };
      reader.readAsDataURL(file);
    });

    event.target.value = '';
  }, [onImagesChange, selectedProductImageInfos, maxImages]);

  const handleRemoveImage = useCallback((idToRemove: string) => {
    onImagesChange(selectedProductImageInfos.filter(img => img.id !== idToRemove));
  }, [onImagesChange, selectedProductImageInfos]);

  const isUploadDisabled = isLoading || selectedProductImageInfos.length >= maxImages;

  return (
    <div className="flex flex-col items-center p-4 border border-dashed border-white/40 rounded-xl bg-white/20 w-full transition-all duration-300">
      <label htmlFor="file-upload" className={`cursor-pointer text-gray-800 hover:text-black font-semibold ${isUploadDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
        {selectedProductImageInfos.length > 0 ? '添加更多商品图片' : '点击上传商品图片'}
        <input
          id="file-upload"
          type="file"
          accept={ALLOWED_IMAGE_TYPES.join(',')}
          onChange={handleFileChange}
          className="sr-only"
          multiple
          disabled={isUploadDisabled}
        />
      </label>
      <p className="mt-1 text-sm text-gray-600">支持 JPG, PNG, WEBP 格式，最大 {MAX_FILE_SIZE_MB}MB，最多上传 {maxImages} 张</p>

      {selectedProductImageInfos.length > 0 && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 w-full">
          {selectedProductImageInfos.map((imgInfo) => (
            <div key={imgInfo.id} className="relative w-full h-32 flex items-center justify-center bg-white/40 border border-white/40 rounded-lg overflow-hidden shadow-sm group transition-all duration-300">
              <img src={imgInfo.base64} alt={`已上传商品图: ${imgInfo.file.name}`} className="max-w-full max-h-full object-contain" />
              <button
                type="button"
                onClick={() => handleRemoveImage(imgInfo.id)}
                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                aria-label={`移除图片 ${imgInfo.file.name}`}
                disabled={isLoading}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <span className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs text-center p-1 truncate" title={imgInfo.file.name}>
                {imgInfo.file.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductImageUpload;