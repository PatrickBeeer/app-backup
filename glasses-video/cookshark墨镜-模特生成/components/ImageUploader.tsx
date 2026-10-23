import React, { useCallback, useState, useRef } from 'react';
import type { FileWithPreview } from '../types';
import { Upload, Glasses, Sparkles, RefreshCw, X, Image as ImageIcon } from 'lucide-react';

interface ImageUploaderProps {
  onImageUpload: (file: FileWithPreview) => void;
  isLoading: boolean;
  uploadedFile: FileWithPreview | null;
  onReset: () => void;
}

// Preset Sunglass SVG Generators for instant 1-click testing
const createSampleSunglassFile = async (type: string, name: string): Promise<FileWithPreview> => {
  let svgContent = '';
  if (type === 'aviator') {
    svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="800" height="400">
      <defs>
        <linearGradient id="lens" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#1e293b"/>
          <stop offset="50%" stop-color="#0f172a"/>
          <stop offset="100%" stop-color="#334155"/>
        </linearGradient>
        <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fef08a"/>
          <stop offset="50%" stop-color="#eab308"/>
          <stop offset="100%" stop-color="#ca8a04"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="#0d0f17"/>
      <path d="M 60 70 Q 200 60 340 70" stroke="url(#gold)" stroke-width="6" fill="none"/>
      <path d="M 170 70 L 230 70" stroke="url(#gold)" stroke-width="8" stroke-linecap="round"/>
      <path d="M 180 82 L 220 82" stroke="url(#gold)" stroke-width="5" stroke-linecap="round"/>
      <path d="M 80 80 C 60 140, 150 170, 180 110 C 180 80, 110 70, 80 80 Z" fill="url(#lens)" stroke="url(#gold)" stroke-width="5"/>
      <path d="M 320 80 C 340 140, 250 170, 220 110 C 220 80, 290 70, 320 80 Z" fill="url(#lens)" stroke="url(#gold)" stroke-width="5"/>
      <ellipse cx="110" cy="95" rx="20" ry="8" fill="#ffffff" opacity="0.15" transform="rotate(-20 110 95)"/>
      <ellipse cx="290" cy="95" rx="20" ry="8" fill="#ffffff" opacity="0.15" transform="rotate(-20 290 95)"/>
      <text x="200" y="180" font-family="sans-serif" font-size="14" font-weight="bold" fill="#d4af37" text-anchor="middle" letter-spacing="2">COOKSHARK AVIATOR</text>
    </svg>`;
  } else if (type === 'cateye') {
    svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="800" height="400">
      <defs>
        <linearGradient id="darklens" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#09090b"/>
          <stop offset="100%" stop-color="#27272a"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="#0d0f17"/>
      <path d="M 40 70 Q 110 50 180 75 Q 150 140 70 130 Q 30 110 40 70 Z" fill="url(#darklens)" stroke="#18181b" stroke-width="12"/>
      <path d="M 360 70 Q 290 50 220 75 Q 250 140 330 130 Q 370 110 360 70 Z" fill="url(#darklens)" stroke="#18181b" stroke-width="12"/>
      <path d="M 175 72 L 225 72" stroke="#18181b" stroke-width="10"/>
      <circle cx="50" cy="65" r="4" fill="#d4af37"/>
      <circle cx="350" cy="65" r="4" fill="#d4af37"/>
      <text x="200" y="180" font-family="sans-serif" font-size="14" font-weight="bold" fill="#a1a1aa" text-anchor="middle" letter-spacing="2">COOKSHARK CAT-EYE</text>
    </svg>`;
  } else {
    svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="800" height="400">
      <defs>
        <linearGradient id="sportlens" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#f43f5e"/>
          <stop offset="50%" stop-color="#eab308"/>
          <stop offset="100%" stop-color="#3b82f6"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="#0d0f17"/>
      <path d="M 50 65 Q 200 45 350 65 Q 360 115 320 130 Q 200 110 80 130 Q 40 115 50 65 Z" fill="url(#sportlens)" opacity="0.95" stroke="#18181b" stroke-width="8"/>
      <path d="M 50 60 Q 200 40 350 60" stroke="#f43f5e" stroke-width="6" fill="none"/>
      <text x="200" y="180" font-family="sans-serif" font-size="14" font-weight="bold" fill="#f43f5e" text-anchor="middle" letter-spacing="2">COOKSHARK SPORT SHIELD</text>
    </svg>`;
  }

  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  const file = new File([blob], `${name}.svg`, { type: 'image/svg+xml' });
  return Object.assign(file, { preview: URL.createObjectURL(blob) });
};

const SAMPLE_SUNGLASSES = [
  { id: 'aviator', name: '经典飞行员金框', tag: '最畅销' },
  { id: 'cateye', name: '黑框猫眼高雅版', tag: '时尚尖端' },
  { id: 'sport', name: '运动偏光大屏镜', tag: '酷炫户外' },
];

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageUpload, isLoading, uploadedFile, onReset }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [loadingSample, setLoadingSample] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (files: FileList | null) => {
    if (files && files[0]) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        const fileWithPreview = Object.assign(file, {
          preview: URL.createObjectURL(file),
        });
        onImageUpload(fileWithPreview);
      } else {
        alert('请上传有效的图片文件。');
      }
    }
  };

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (event.dataTransfer.files) {
      handleFileChange(event.dataTransfer.files);
    }
  }, [onImageUpload]);

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };
  
  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleSelectSample = async (sample: typeof SAMPLE_SUNGLASSES[0]) => {
    setLoadingSample(sample.id);
    try {
      const file = await createSampleSunglassFile(sample.id, sample.name);
      onImageUpload(file);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSample(null);
    }
  };

  return (
    <div className="w-full flex flex-col space-y-3">
      {uploadedFile ? (
        <div className="relative bg-zinc-900/90 border border-amber-500/30 rounded-2xl p-4 text-center overflow-hidden shadow-xl">
          <div className="absolute top-3 right-3 z-10">
            <button
              onClick={onReset}
              disabled={isLoading}
              className="p-1.5 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-full transition-colors border border-zinc-700"
              title="清除重新选择"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="relative w-full h-44 mb-3 bg-zinc-950/80 rounded-xl flex items-center justify-center p-2 border border-zinc-800">
            <img 
              src={uploadedFile.preview} 
              alt="Sunglass preview" 
              className="rounded-lg object-contain h-full w-full max-h-[160px]" 
            />
          </div>

          <div className="flex items-center justify-between text-xs px-1">
            <div className="flex items-center space-x-2 truncate">
              <Glasses className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-zinc-200 font-semibold truncate">{uploadedFile.name}</span>
            </div>
            <button
              onClick={onReset}
              disabled={isLoading}
              className="text-amber-400 hover:text-amber-300 font-medium text-xs flex items-center space-x-1 shrink-0 ml-2"
            >
              <RefreshCw className="w-3 h-3" />
              <span>更换墨镜</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Main Dropzone */}
          <div 
            className={`w-full p-6 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all duration-300 relative group bg-zinc-900/40 ${
              isDragging 
                ? 'border-amber-400 bg-amber-500/10 scale-[1.01]' 
                : 'border-zinc-800 hover:border-amber-500/50 hover:bg-zinc-900/80'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onClick={handleClick}
          >
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-transparent flex items-center justify-center text-[#5145E5] border-2 border-[#5145E5] group-hover:bg-[#5145E5]/5 group-hover:scale-110 transition-all">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <span className="block text-sm font-bold text-zinc-100 group-hover:text-amber-300 transition-colors">
                点击上传墨镜产品图
              </span>
              <span className="mt-1 block text-xs text-zinc-400">
                支持拖拽上传 JPG / PNG / SVG，保持背景简洁效果更佳
              </span>
            </div>
            <input 
              ref={fileInputRef}
              id="file-upload" 
              name="file-upload" 
              type="file" 
              className="sr-only" 
              accept="image/*" 
              onChange={(e) => handleFileChange(e.target.files)} 
            />
          </div>

          {false && (
          <>
          <div>
            <div className="flex items-center space-x-1.5 mb-2 text-xs text-zinc-400 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>没有图片？点击使用精选墨镜示例试用：</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {SAMPLE_SUNGLASSES.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => handleSelectSample(sample)}
                  disabled={isLoading || loadingSample === sample.id}
                  className="flex flex-col items-center justify-center p-2.5 bg-zinc-900/80 border border-zinc-800 hover:border-amber-500/50 rounded-xl transition-all hover:bg-zinc-800/80 group text-left"
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <Glasses className="w-4 h-4 text-zinc-400 group-hover:text-amber-400 transition-colors" />
                    <span className="text-[10px] text-amber-400/90 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded">
                      {sample.tag}
                    </span>
                  </div>
                  <span className="text-xs font-medium text-zinc-300 group-hover:text-white truncate w-full">
                    {sample.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
          </>
          )}
        </div>
      )}
    </div>
  );
};
