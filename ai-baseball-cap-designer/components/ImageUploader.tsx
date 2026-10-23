import React, { useState, useRef, useCallback } from 'react';
import { UploadIcon } from './icons/UploadIcon';
import { SparklesIcon } from './icons/SparklesIcon';

interface ImageUploaderProps {
  onImageUpload: (file: File) => void;
  onGenerate: (intensity: number) => void;
  designGenerationCost: number;
  uploadedImage: string | null;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  onImageUpload,
  onGenerate,
  designGenerationCost,
  uploadedImage,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [intensity, setIntensity] = useState(30);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImageUpload(e.target.files[0]);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onImageUpload(e.dataTransfer.files[0]);
    }
  }, [onImageUpload]);

  const handleDragEvents = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  const getIntensityLabel = (val: number) => {
    if (val <= 20) return "保守迭代 (细节微调)";
    if (val <= 40) return "标准迭代 (材质与色彩重组)";
    return "激进迭代 (结构性创意更新)";
  };

  return (
    <div className="w-full max-w-2xl text-center flex flex-col items-center">
      <div
        className={`w-full p-8 border-2 border-dashed rounded-xl transition-colors duration-300 cursor-pointer ${isDragging ? 'border-cyan-500 bg-white/70' : 'border-gray-300 bg-white/40 hover:border-cyan-400 hover:bg-white/60'}`}
        onDrop={handleDrop}
        onDragOver={handleDragEvents}
        onDragEnter={handleDragEvents}
        onDragLeave={handleDragEvents}
        onClick={openFileDialog}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          className="hidden"
        />
        <div className="flex flex-col items-center justify-center space-y-4">
            <UploadIcon className="w-12 h-12 text-gray-500"/>
            <p className="text-lg font-semibold text-gray-700">
              拖放您的设计原型或参考图
            </p>
            <p className="text-gray-500">支持 JPG, PNG 格式</p>
        </div>
      </div>

      {uploadedImage && (
        <div className="mt-8 w-full flex flex-col items-center gap-8 animate-fade-in bg-white/60 backdrop-blur-md p-6 rounded-2xl border border-white/40 shadow-xl">
            <div className="flex flex-col md:flex-row items-center gap-8 w-full">
                <div className="w-48 h-48 rounded-lg overflow-hidden shadow-2xl ring-2 ring-cyan-500/50 flex-shrink-0">
                    <img src={uploadedImage} alt="Uploaded cap" className="w-full h-full object-cover"/>
                </div>
                
                <div className="flex-grow w-full text-left">
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2 flex justify-between">
                            <span>迭代强度 (变化幅度)</span>
                            <span className="text-cyan-600 font-bold">{intensity}%</span>
                        </label>
                        <input 
                            type="range" 
                            min="10" 
                            max="50" 
                            step="5"
                            value={intensity}
                            onChange={(e) => setIntensity(parseInt(e.target.value))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                        />
                        <div className="flex justify-between text-[10px] text-gray-500 mt-1 uppercase tracking-wider">
                            <span>10% 保守</span>
                            <span>30% 平衡</span>
                            <span>50% 创新</span>
                        </div>
                    </div>
                    <p className="text-xs text-gray-600 italic">
                        提示：{getIntensityLabel(intensity)}。我们将保持原有的经典轮廓，专注于局部元素的迭代。
                    </p>
                </div>
            </div>

            <button
              onClick={() => onGenerate(intensity)}
              className="w-full py-4 bg-black text-white font-bold text-xl rounded-2xl shadow-lg hover:bg-gray-800 hover:scale-[1.02] transition-all duration-300 flex items-center justify-center gap-3"
            >
              <SparklesIcon className="w-7 h-7"/>
              {`开始 AI 迭代设计 (${designGenerationCost} 积分)`}
            </button>
        </div>
      )}
    </div>
  );
};