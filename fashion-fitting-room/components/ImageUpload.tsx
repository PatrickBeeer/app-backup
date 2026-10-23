import React, { useRef } from 'react';
import { Upload, X } from '../utils/lucide';

interface Props {
  label: string;
  image: string | null;
  onImageChange: (base64: string | null) => void;
  helperText?: string;
}

export const ImageUpload: React.FC<Props> = ({ label, image, onImageChange, helperText }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onImageChange(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-slate-700 mb-2">{label}</label>
      
      {!image ? (
        <div 
          onClick={() => inputRef.current?.click()}
          className="group relative bg-slate-100 border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-xl p-6 cursor-pointer transition-all duration-300 flex flex-col items-center justify-center text-slate-600 h-48"
        >
          <div className="p-3 bg-indigo-900/30 rounded-full mb-3 transition-all group-hover:scale-110">
            <Upload className="text-indigo-400" size={24} />
          </div>
          <span className="text-sm font-semibold text-slate-700">点击上传</span>
          <input 
            type="file" 
            ref={inputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handleFileChange} 
          />
        </div>
      ) : (
        <div className="relative group rounded-xl overflow-hidden h-48 bg-slate-100 border border-slate-300">
          <img src={image} alt="Uploaded" className="w-full h-full object-contain p-2" />
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-start justify-end p-2">
            <button 
              onClick={(e) => { e.stopPropagation(); onImageChange(null); }}
              className="p-2 bg-slate-200/80 backdrop-blur-md hover:bg-red-500 hover:text-white text-slate-800 rounded-full shadow-lg transition-all transform hover:scale-110"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
      {helperText && <p className="mt-2 text-xs text-slate-500 px-1">{helperText}</p>}
    </div>
  );
};

