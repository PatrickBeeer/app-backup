
import React, { useState, useCallback, useRef } from 'react';
import { CloseIcon } from './icons/CloseIcon';

interface ImageUploaderProps {
    onImageUpload: (file: File | null) => void;
    preview: string | null;
    onReset: () => void;
    fileName?: string;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageUpload, preview, onReset, fileName }) => {
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (file: File | undefined) => {
        if (file && file.type.startsWith('image/')) {
            onImageUpload(file);
        }
    };

    const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }, []);
    const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }, []);
    const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        handleFileChange(e.dataTransfer.files[0]);
    }, [onImageUpload]);

    const onButtonClick = () => fileInputRef.current?.click();

    if (preview) {
        return (
            <div className="image-preview-card">
                <img src={preview} alt="Uploaded crystal" />
                <div className="image-preview-meta">
                    <div>
                        <strong>{fileName || '水晶产品图片'}</strong>
                        <p>已准备好，可以开始创作</p>
                    </div>
                    <button 
                        onClick={onButtonClick}
                        className="change-image-button"
                    >
                        更换
                    </button>
                </div>
                 <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        onReset();
                    }}
                    className="remove-image-button absolute top-2 right-2 p-1.5 bg-black/40 text-white rounded-full hover:bg-black/60 transition-colors"
                    aria-label="Remove image"
                >
                    <CloseIcon className="w-4 h-4" />
                </button>
                <input type="file" accept="image/*" onChange={(e) => handleFileChange(e.target.files?.[0])} className="hidden" ref={fileInputRef} />
            </div>
        );
    }

    return (
        <div 
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={onButtonClick}
            className={`w-full p-10 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-300 ${isDragging ? 'border-red-500 bg-red-50 dark:bg-red-900/30' : 'border-gray-300 dark:border-gray-600 hover:border-red-400'}`}
        >
            <input type="file" accept="image/*" onChange={(e) => handleFileChange(e.target.files?.[0])} className="hidden" ref={fileInputRef} />
            <div className="upload-reference-layout flex flex-col items-center text-center text-gray-500 dark:text-gray-400">
                <svg className="upload-reference-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h7A2.5 2.5 0 0 1 16 6.5v11A2.5 2.5 0 0 1 13.5 20h-7A2.5 2.5 0 0 1 4 17.5v-11Z" stroke="currentColor" strokeWidth="1.8"/>
                    <path d="m6.5 16 3.1-3.2a1.2 1.2 0 0 1 1.7 0l1.1 1.1 1.2-1.3a1.2 1.2 0 0 1 1.7-.1l.7.7M8 9a1.25 1.25 0 1 0 0-2.5A1.25 1.25 0 0 0 8 9ZM19 3v6M16 6h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <p className="upload-reference-title">上传产品图片</p>
                <p className="upload-reference-help">支持 JPG / PNG / WEBP 参考图</p>
            </div>
        </div>
    );
};
