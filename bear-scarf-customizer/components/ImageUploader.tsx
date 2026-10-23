import React, { useState } from 'react';

interface ImageUploaderProps {
  onImageSelected: (file: File | null) => void;
  currentImagePreview: string | null;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageSelected, currentImagePreview }) => {
  const [dragging, setDragging] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      onImageSelected(event.target.files[0]);
    } else {
      onImageSelected(null);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      onImageSelected(event.dataTransfer.files[0]);
    } else {
      onImageSelected(null);
    }
  };

  return (
    <div
      className={`relative border border-white/40 rounded-2xl p-6 text-center transition-all ${
        dragging ? 'bg-white/70 shadow-lg' : 'bg-white/40'
      } hover:bg-white/70 cursor-pointer`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => document.getElementById('file-upload-input')?.click()}
    >
      <input
        id="file-upload-input"
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      {currentImagePreview ? (
        <div className="relative w-full h-48 sm:h-64 md:h-80 overflow-hidden rounded-xl mx-auto mb-4">
          <img
            src={currentImagePreview}
            alt="已上传围巾预览图"
            className="w-full h-full object-contain"
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-48 sm:h-64 md:h-80">
          <svg
            className="mx-auto h-12 w-12 text-gray-500"
            stroke="currentColor"
            fill="none"
            viewBox="0 0 48 48"
            aria-hidden="true"
          >
            <path
              d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-4H48"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="mt-2 text-sm text-gray-600">
            <span className="font-medium text-indigo-600 hover:text-indigo-500">
              点击上传
            </span>{' '}
            或拖放图片
          </p>
          <p className="mt-1 text-xs text-gray-500">PNG, JPG, GIF，最大10MB</p>
        </div>
      )}
      {currentImagePreview && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onImageSelected(null);
          }}
          className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-md"
          title="清除图片"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  );
};

export default ImageUploader;

