import React, { useCallback, useState } from 'react';
import UploadIcon from './icons/UploadIcon';

interface ImageUploaderProps {
  onImageUpload: (file: File) => void;
  uploadedImagePreview: string | null;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageUpload, uploadedImagePreview }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImageUpload(e.target.files[0]);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onImageUpload(e.dataTransfer.files[0]);
    }
  }, [onImageUpload]);

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  return (
    <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-700 text-center">1. 上传您的枕头图片</h2>
        {uploadedImagePreview ? (
            <div className="group relative w-full max-w-md mx-auto aspect-square rounded-3xl overflow-hidden shadow-md">
                <img src={uploadedImagePreview} alt="已上传的枕头" className="w-full h-full object-cover" />
                <label htmlFor="file-upload" className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center text-white font-semibold cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    更换图片
                </label>
                <input id="file-upload" name="file-upload" type="file" className="sr-only" accept="image/*" onChange={handleFileChange} />
            </div>
        ) : (
            <label
                htmlFor="file-upload"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                className={`flex justify-center w-full h-64 px-6 pt-5 pb-6 border-2 ${isDragging ? 'border-purple-400 bg-purple-50/50' : 'border-white/80 bg-white/30'} border-dashed rounded-3xl cursor-pointer transition-colors duration-300`}
            >
                <div className="space-y-1 text-center self-center">
                    <UploadIcon className="mx-auto h-12 w-12 text-slate-400" />
                    <div className="flex text-sm text-slate-600">
                        <span className="relative rounded-md font-medium text-purple-600 hover:text-purple-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-purple-500">
                            上传文件
                        </span>
                        <input id="file-upload" name="file-upload" type="file" className="sr-only" accept="image/*" onChange={handleFileChange} />
                        <p className="pl-1">或拖放文件</p>
                    </div>
                    <p className="text-xs text-slate-500">支持 PNG, JPG, GIF, 最大 10MB</p>
                </div>
            </label>
        )}
    </div>
  );
};

export default ImageUploader;

