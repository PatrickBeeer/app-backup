
import React, { useRef, useState } from 'react';
import { Upload, X, Image as ImageIcon, Sparkles, RefreshCw } from 'lucide-react';
import { FileData } from '../types';

interface UploadZoneProps {
  label: string;
  description: string;
  fileData: FileData | null;
  onFileSelect: (data: FileData | null) => void;
  disabled?: boolean;
  isOptional?: boolean;
}

export const UploadZone: React.FC<UploadZoneProps> = ({
  label,
  description,
  fileData,
  onFileSelect,
  disabled = false,
  isOptional = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const rawBase64 = base64String.split(',')[1];
      
      onFileSelect({
        file,
        previewUrl: URL.createObjectURL(file),
        base64: rawBase64,
        mimeType: file.type
      });
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFileSelect(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center px-1">
        <span className="text-[11px] font-black text-gray-500 uppercase tracking-widest">{label}</span>
        {isOptional && (
          <span className="text-[10px] px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-black uppercase tracking-wider">
            AI 托管
          </span>
        )}
      </div>
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative group cursor-pointer border-2 border-dashed rounded-[2rem] transition-all duration-500
          flex flex-col items-center justify-center overflow-hidden
          ${fileData 
            ? 'h-48 border-emerald-500/30 bg-emerald-50 shadow-md' 
            : isDragging
              ? 'h-64 border-emerald-400 bg-emerald-100 scale-[1.02] shadow-lg'
              : 'h-64 border-slate-300 hover:border-emerald-400 hover:bg-slate-200 bg-slate-100/80'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input
          type="file"
          ref={inputRef}
          onChange={handleFileChange}
          accept="image/*"
          className="hidden"
          disabled={disabled}
        />

        {fileData ? (
          <>
            <img
              src={fileData.previewUrl}
              alt="Preview"
              className="absolute inset-0 w-full h-full object-cover transition-all duration-700 group-hover:scale-110 group-hover:blur-sm opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-center gap-4">
               <div className="flex gap-3">
                 <div className="p-3 bg-slate-300/40 backdrop-blur-md rounded-2xl text-slate-700 hover:bg-slate-400/40 transition-all shadow-md border border-slate-300/30">
                   <RefreshCw size={24} className="group-hover:rotate-180 transition-transform duration-700" />
                 </div>
                 <div
                  onClick={clearFile}
                  className="p-3 bg-red-500 backdrop-blur-md rounded-2xl text-white hover:bg-red-600 transition-all shadow-md border border-red-400/50"
                 >
                   <X size={24} />
                 </div>
               </div>
               <span className="text-[11px] font-black text-slate-700 uppercase tracking-widest bg-white/60 px-3 py-1 rounded-full backdrop-blur-sm border border-slate-200">更换文件</span>
            </div>
            <div className="absolute bottom-4 left-6 right-6 truncate">
              <span className="text-[10px] font-bold text-slate-700 tracking-tight">{fileData.file.name}</span>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center text-center p-8 space-y-4 pointer-events-none">
            <div className={`
              p-4 rounded-[1.5rem] transition-all duration-500 shadow-md
              ${isDragging ? 'bg-emerald-500 scale-125 shadow-emerald-500/40' : 'bg-slate-300/50 group-hover:bg-emerald-200 group-hover:scale-110 group-hover:shadow-emerald-300/30'}
            `}>
              {isDragging ? (
                <Upload className="w-10 h-10 text-white animate-bounce" />
              ) : isOptional ? (
                <Sparkles className="w-10 h-10 text-emerald-600/80 group-hover:text-emerald-600" />
              ) : (
                <ImageIcon className="w-10 h-10 text-slate-500 group-hover:text-emerald-600 transition-colors" />
              )}
            </div>
            <div className="space-y-1.5">
              <p className={`text-base font-black transition-colors ${isDragging ? 'text-emerald-400' : 'text-slate-700 group-hover:text-slate-900'}`}>
                {isDragging ? '投递至此处' : isOptional ? '交给 AI 构思背景' : '开始您的创作'}
              </p>
              <p className="text-[11px] text-slate-600 font-medium max-w-[220px] leading-relaxed group-hover:text-slate-700 transition-colors">
                {isOptional ? '点击或拖拽参考图，亦可留空由 AI 自动生成' : description}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
