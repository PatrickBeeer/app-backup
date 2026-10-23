import React, { useCallback, useRef, useState } from 'react';
import { Upload, Glasses, X, Image as ImageIcon } from 'lucide-react';

interface ImageAsset {
  name: string;
  dataUrl: string;
}

interface ImageUploaderProps {
  assets: ImageAsset[];
  onAdd: (files: FileList) => void;
  onRemove: (index: number) => void;
  isLoading: boolean;
  maxAssets?: number;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  assets,
  onAdd,
  onRemove,
  isLoading,
  maxAssets = 9,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (files: FileList | null) => {
    if (files && files.length) onAdd(files);
  };

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);
      if (event.dataTransfer.files) handleFileChange(event.dataTransfer.files);
    },
    [onAdd],
  );

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

  const remaining = Math.max(0, maxAssets - assets.length);

  return (
    <div className="w-full flex flex-col space-y-3">
      {assets.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {assets.map((asset, index) => (
            <div
              key={`${asset.name}-${index}`}
              className="relative bg-zinc-900/90 border border-amber-500/30 rounded-2xl p-2 text-center overflow-hidden shadow-xl"
            >
              <div className="absolute top-1.5 right-1.5 z-10">
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  disabled={isLoading}
                  className="p-1 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-full transition-colors border border-zinc-700"
                  title="移除素材"
                  aria-label={`移除第 ${index + 1} 张素材`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="relative w-full h-24 mb-1.5 bg-zinc-950/80 rounded-lg flex items-center justify-center p-1.5 border border-zinc-800">
                <img
                  src={asset.dataUrl}
                  alt={asset.name}
                  className="rounded-md object-contain h-full w-full max-h-[88px]"
                />
              </div>
              <div className="flex items-center justify-center space-x-1.5 text-xs px-1">
                <Glasses className="w-3 h-3 text-amber-400 shrink-0" />
                <span className="text-zinc-200 font-semibold truncate">{asset.name}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {remaining > 0 && (
        <div
          className={`w-full p-5 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all duration-300 relative group bg-zinc-900/40 ${
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
          <div className="w-11 h-11 mx-auto mb-2.5 rounded-full flex items-center justify-center text-[#5145E5] border-2 border-[#5145E5] group-hover:bg-[#5145E5]/5 group-hover:scale-110 transition-all">
            <Upload className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-sm font-bold text-zinc-100 group-hover:text-amber-300 transition-colors">
              {assets.length === 0 ? '点击上传墨镜产品图' : '继续添加产品图'}
            </span>
            <span className="mt-1 block text-xs text-zinc-400">
              支持拖拽上传 JPG / PNG / WEBP，可上传多张参考图 · {assets.length}/{maxAssets}
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            accept="image/*"
            multiple
            onChange={(e) => {
              handleFileChange(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {assets.length === 0 && (
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
          <ImageIcon className="w-3.5 h-3.5" />
          <span>建议上传正面、侧面与细节参考图，效果更佳</span>
        </div>
      )}
    </div>
  );
};
