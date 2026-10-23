import React, { useRef, useState, DragEvent } from 'react';

interface ImageUploaderProps {
  onImageUpload: (files: FileList) => void;
  onRemoveImage: (index: number) => void;
  imageUrls: string[];
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageUpload, onRemoveImage, imageUrls }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      onImageUpload(event.target.files);
      event.target.value = '';
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      onImageUpload(event.dataTransfer.files);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };
  
  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  return (
    <div>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="image/png, image/jpeg, image/webp"
        multiple
      />
      <div className="grid grid-cols-2 gap-4">
        {imageUrls.map((url, index) => (
          <div key={url} className="relative group aspect-square bg-white/50 rounded-xl border border-slate-200">
            <img src={url} alt={`Uploaded preview ${index + 1}`} className="w-full h-full object-contain rounded-xl p-1" />
            <button
              onClick={() => onRemoveImage(index)}
              className="absolute top-1.5 right-1.5 bg-black/40 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 hover:bg-black/60 transition-all duration-200"
              aria-label={`Remove image ${index + 1}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        {imageUrls.length < 2 && (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onClick={openFileDialog}
            className={`w-full aspect-square border-2 border-dashed rounded-xl flex flex-col justify-center items-center cursor-pointer transition-colors duration-300 ${isDragging ? 'border-blue-500 bg-blue-50/50' : 'bg-white/30 border-slate-300 hover:border-blue-400 hover:bg-white/50'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-slate-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <p className="text-slate-500 text-sm text-center font-semibold">
              添加图片
            </p>
            <p className="text-xs text-slate-400 mt-1">({imageUrls.length}/2)</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageUploader;
