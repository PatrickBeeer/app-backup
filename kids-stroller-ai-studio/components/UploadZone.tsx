import React, { useRef, useState } from 'react';

interface UploadZoneProps {
  onImageSelected: (base64: string) => void;
  selectedImage: string | null;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ onImageSelected, selectedImage }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => onImageSelected(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div className="w-full group">
      <div className="flex items-center justify-between mb-4 px-1">
        <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">01. 上传产品图</label>
        {selectedImage && <span className="text-xs text-green-600 font-medium bg-green-100/50 px-2 py-0.5 rounded-full">已就绪</span>}
      </div>
      {!selectedImage ? (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative h-80 rounded-[2rem] border transition-all duration-500 ease-out cursor-pointer flex flex-col items-center justify-center overflow-hidden ${isDragging ? 'bg-blue-50/80 border-blue-200 shadow-[0_0_40px_-10px_rgba(59,130,246,0.2)] scale-[1.02]' : 'bg-white/60 border-white/40 shadow-xl hover:shadow-2xl hover:bg-white/70 backdrop-blur-xl'}`}
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent opacity-50"></div>
          <div className="text-center p-8 relative z-10">
            <div className={`w-20 h-20 rounded-[1.5rem] flex items-center justify-center mx-auto mb-6 transition-colors duration-300 ${isDragging ? 'bg-blue-500 text-white' : 'bg-white shadow-lg text-gray-800'}`}>
              <i className="fa-solid fa-plus text-2xl"></i>
            </div>
            <p className="text-lg font-bold text-gray-900 mb-2">点击上传产品</p>
            <p className="text-sm text-gray-500">拖拽图片至此或点击浏览</p>
          </div>
          <input type="file" ref={inputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
        </div>
      ) : (
        <div className="relative h-80 rounded-[2rem] overflow-hidden bg-white/60 backdrop-blur-xl border border-white/40 shadow-xl group-hover:shadow-2xl transition-all duration-500">
          <div className="absolute inset-0 p-8 flex items-center justify-center">
            <img src={selectedImage} alt="Product Preview" className="w-full h-full object-contain filter drop-shadow-xl" />
          </div>
          <div className="absolute inset-0 bg-gray-900/0 hover:bg-gray-900/10 transition-colors flex items-end justify-center pb-6">
            <button
              onClick={(e) => { e.stopPropagation(); onImageSelected(''); if (inputRef.current) inputRef.current.value = ''; }}
              className="translate-y-20 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 bg-white/90 backdrop-blur text-red-500 px-6 py-3 rounded-xl font-bold shadow-lg text-sm hover:scale-105 active:scale-95 flex items-center gap-2"
            >
              <i className="fa-regular fa-trash-can"></i> 移除
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
