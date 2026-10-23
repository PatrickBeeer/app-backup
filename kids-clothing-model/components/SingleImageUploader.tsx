import React, { useState, useCallback, useRef } from 'react';
import { UploadIcon } from './icons/UploadIcon';
import { XIcon } from './icons/XIcon';

interface SingleImageUploaderProps {
  title: string;
  description: string;
  onImageUpload: (file: { file: File; base64: string } | null) => void;
}

export const SingleImageUploader: React.FC<SingleImageUploaderProps> = ({ title, description, onImageUpload }) => {
  const [uploadedFile, setUploadedFile] = useState<{ file: File; base64: string } | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File | null) => {
    if (!file || !file.type.startsWith('image/')) {
        setUploadedFile(null);
        onImageUpload(null);
        return;
    };

    const reader = new FileReader();
    reader.onloadend = () => {
        const result = { file, base64: reader.result as string };
        setUploadedFile(result);
        onImageUpload(result);
    };
    reader.readAsDataURL(file);
  }, [onImageUpload]);

  const handleRemove = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setUploadedFile(null);
    onImageUpload(null);
    if (fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  };

  const onDragOver = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  }, [handleFile]);
  
  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
  };

  return (
    <div>
      <h3 className="text-base font-semibold text-slate-800">{title}</h3>
      <p className="text-xs text-slate-500 mb-2">{description}</p>
      <label
        htmlFor={`file-upload-${title}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`relative flex justify-center items-center w-full h-40 rounded-2xl border-2 border-dashed
          ${isDragging ? 'border-purple-400 bg-white/50' : 'border-white/80 bg-white/30'}
          transition-colors duration-200 ease-in-out cursor-pointer group backdrop-blur-sm`}
      >
        {uploadedFile ? (
          <div className="relative group/preview w-full h-full p-1.5 overflow-hidden">
            <img src={uploadedFile.base64} alt="Preview" className="object-contain h-full w-full rounded-xl max-h-full max-w-full" />
            <button 
              onClick={handleRemove} 
              className="absolute top-2 right-2 z-10 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover/preview:opacity-100 transition-opacity"
              aria-label="Remove image"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="text-center">
            <UploadIcon className="mx-auto h-8 w-8 text-gray-400 group-hover:text-purple-500" />
            <p className="mt-1 text-xs text-slate-600">
              <span className="font-semibold text-purple-600">点击上传</span> 或拖拽
            </p>
          </div>
        )}
        <input
          id={`file-upload-${title}`}
          name={`file-upload-${title}`}
          type="file"
          className="sr-only"
          ref={fileInputRef}
          onChange={onFileInputChange}
          accept="image/png, image/jpeg, image/webp"
        />
      </label>
    </div>
  );
};

