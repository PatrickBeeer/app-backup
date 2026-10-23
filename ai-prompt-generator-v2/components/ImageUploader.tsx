import React, { useCallback, useState } from 'react';
import { Upload, X, FileWarning, Image as LucideImage } from 'lucide-react';

interface ImageUploaderProps {
  selectedImage: string | null;
  onImageSelect: (base64: string) => void;
  onClear: () => void;
  label?: string;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ selectedImage, onImageSelect, onClear, label }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowedMimeTypes = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);

  const normalizeImageToJpegDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const source = String(reader.result || '');
        const image = new Image();
        image.onload = () => {
          const maxEdge = 2048;
          const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
          const targetWidth = Math.max(1, Math.round(image.width * scale));
          const targetHeight = Math.max(1, Math.round(image.height * scale));

          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            reject(new Error('无法处理图片，请重试'));
            return;
          }

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, targetWidth, targetHeight);
          ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

          const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92);
          resolve(jpegDataUrl);
        };
        image.onerror = () => reject(new Error('图片解码失败，请更换图片重试'));
        image.src = source;
      };
      reader.onerror = () => reject(new Error('图片读取失败，请重试'));
      reader.readAsDataURL(file);
    });
  };

  const processFile = async (file: File) => {
    setError(null);
    if (!file.type.startsWith('image/')) { setError('请上传图片文件'); return; }
    if (!allowedMimeTypes.has(file.type.toLowerCase())) { setError('仅支持 PNG/JPEG/WEBP 图片'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('图片需 < 5MB'); return; }

    try {
      const normalized = await normalizeImageToJpegDataUrl(file);
      onImageSelect(normalized);
    } catch (err: any) {
      setError(String(err?.message || '图片处理失败'));
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files?.[0]) { void processFile(e.dataTransfer.files[0]); }
  }, [onImageSelect]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) { void processFile(e.target.files[0]); }
  };

  return (
    <div className="flex flex-col gap-2 h-full">
      {label && (
        <div className="flex items-center gap-1.5 px-1">
          <LucideImage size={14} className="text-slate-500" />
          <span className="text-sm font-semibold text-slate-600">{label}</span>
        </div>
      )}
      {selectedImage ? (
        <div className="relative w-full h-full min-h-[160px] rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 shadow-inner group flex-grow">
          <img src={selectedImage} alt="Uploaded preview" className="w-full h-full object-contain p-2" />
          <div className="absolute inset-0 bg-white/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <button onClick={onClear} className="bg-white/90 text-red-500 hover:text-red-600 px-4 py-2 rounded-full flex items-center gap-2 shadow-lg hover:shadow-xl transition-all font-semibold text-sm">
              <X size={16} /><span>移除</span>
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative w-full h-full min-h-[160px] rounded-2xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center cursor-pointer overflow-hidden flex-grow
            ${isDragging ? 'border-blue-400 bg-blue-50/50 scale-[1.01]' : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50/30'}
            ${error ? 'border-red-300 bg-red-50/50' : ''}`}
        >
          <input type="file" accept="image/png, image/jpeg, image/webp" onChange={handleFileInput} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
          <div className="flex flex-col items-center text-center p-4 pointer-events-none">
            {error ? <><FileWarning className="w-8 h-8 text-red-400 mb-2" /><p className="text-red-500 text-xs font-medium">{error}</p></> : <><div className={`p-3 rounded-full mb-3 transition-colors ${isDragging ? 'bg-blue-100 text-blue-500' : 'bg-slate-100 text-slate-400'}`}><Upload className="w-6 h-6" /></div><h3 className="text-sm font-semibold text-slate-700 mb-1">{isDragging ? '释放' : '上传图片'}</h3></>}
          </div>
        </div>
      )}
    </div>
  );
};
