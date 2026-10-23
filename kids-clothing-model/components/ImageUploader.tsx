import React, { useState, useCallback, useRef } from 'react';
import { UploadIcon } from './icons/UploadIcon';
import { XIcon } from './icons/XIcon';

interface ImageUploaderProps {
  onImageUpload: (files: { file: File; base64: string }[]) => void;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageUpload }) => {
  const [uploadedFiles, setUploadedFiles] = useState<{ file: File; base64: string }[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;

    const imageFiles = Array.from(files)
        .filter(file => file.type.startsWith('image/'))
        .slice(0, 2); // Limit to 2 files

    if (imageFiles.length === 0) return;

    const filePromises = imageFiles.map(file => {
        return new Promise<{ file: File; base64: string }>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                resolve({ file, base64: reader.result as string });
            };
            reader.readAsDataURL(file);
        });
    });

    Promise.all(filePromises).then(newFiles => {
        setUploadedFiles(newFiles);
        onImageUpload(newFiles);
    });
  }, [onImageUpload]);

  const handleRemove = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    const newFiles = uploadedFiles.filter((_, i) => i !== index);
    setUploadedFiles(newFiles);
    onImageUpload(newFiles);
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
      handleFiles(e.dataTransfer.files);
      e.dataTransfer.clearData();
    }
  }, [handleFiles]);
  
  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800 mb-2">1. 上传产品图 (最多2张)</h2>
      <p className="text-sm text-slate-500 mb-4">可上传第二张图作为搭配参考，以获得最佳效果。</p>
      <div className="mt-2">
        <label
          htmlFor="file-upload"
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`relative flex justify-center items-center w-full h-64 rounded-3xl border-2 border-dashed
            ${isDragging ? 'border-purple-400 bg-white/50' : 'border-white/80 bg-white/30'}
            transition-colors duration-200 ease-in-out cursor-pointer group backdrop-blur-sm`}
        >
          {uploadedFiles.length > 0 ? (
             <div className={`grid ${uploadedFiles.length === 2 ? 'grid-cols-2 gap-2' : 'grid-cols-1'} w-full h-full p-2 overflow-hidden`}>
                {uploadedFiles.map((file, index) => (
                    <div key={index} className="relative group/preview h-full overflow-hidden">
                        <img src={file.base64} alt={`Preview ${index + 1}`} className="object-contain h-full w-full rounded-2xl max-h-full max-w-full" />
                        <button 
                            onClick={(e) => handleRemove(e, index)} 
                            className="absolute top-2 right-2 z-10 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover/preview:opacity-100 transition-opacity"
                            aria-label="Remove image"
                        >
                            <XIcon className="h-4 w-4" />
                        </button>
                    </div>
                ))}
            </div>
          ) : (
            <div className="text-center">
              <UploadIcon className="mx-auto h-12 w-12 text-gray-400 group-hover:text-purple-500" />
              <p className="mt-2 text-sm text-slate-600">
                <span className="font-semibold text-purple-600">点击上传</span> 或拖拽文件到此处
              </p>
              <p className="text-xs text-slate-500 mt-1">PNG, JPG, WEBP, 最大 5MB</p>
            </div>
          )}
           <input
              id="file-upload"
              name="file-upload"
              type="file"
              multiple
              className="sr-only"
              ref={fileInputRef}
              onChange={onFileInputChange}
              accept="image/png, image/jpeg, image/webp"
            />
        </label>
      </div>
    </div>
  );
};

