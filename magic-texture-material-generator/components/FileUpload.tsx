import React, { useRef, useState } from 'react';
import { Upload, AlertCircle, Type, X } from '@/utils/lucide';

interface FileUploadProps {
  onFileSelect: (base64: string | null) => void;
  onPromptChange: (text: string) => void;
  prompt: string;
  referenceImage: string | null;
  disabled: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, onPromptChange, prompt, referenceImage, disabled }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFile = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        onFileSelect(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-mono text-gray-600 uppercase tracking-widest flex items-center gap-2">
          输入控制台
        </h2>
        {referenceImage && (
           <button 
             onClick={() => {
                onFileSelect(null);
                if(inputRef.current) inputRef.current.value = '';
             }}
             className="text-xs text-red-600 hover:text-red-700 transition-colors flex items-center gap-1"
             disabled={disabled}
           >
             <X className="w-3 h-3" /> 清除图片
           </button>
        )}
      </div>

      {/* Image Upload Zone */}
      <div
        className={`relative h-48 rounded-xl border-2 border-dashed transition-all duration-300 group overflow-hidden
          ${dragActive ? 'border-accent-cyan bg-accent-cyan/10' : 'border-gray-300 hover:border-gray-400 bg-gray-50'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="image/*"
          onChange={handleChange}
          disabled={disabled}
        />

        {referenceImage ? (
          <div className="absolute inset-0 w-full h-full p-2">
            <img 
              src={referenceImage} 
              alt="Reference" 
              className="w-full h-full object-contain rounded-lg shadow-lg bg-black/20"
            />
            <div className="absolute bottom-3 right-3 bg-white/90 text-gray-800 text-[10px] px-2 py-1 rounded backdrop-blur-sm font-mono border border-gray-300 shadow-sm">
              风格参考图
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 group-hover:text-gray-800 transition-colors">
            <div className={`p-3 rounded-full bg-gray-200 mb-3 transition-transform duration-300 ${dragActive ? 'scale-110' : ''}`}>
              <Upload className="w-5 h-5" />
            </div>
            <p className="font-medium text-xs mb-1">上传参考图片（可选）</p>
            <p className="text-[10px] text-gray-500">作为风格/光影参考</p>
          </div>
        )}
      </div>

      {/* Text Prompt Input */}
      <div className="relative group">
        <div className="absolute top-3 left-3 text-gray-500">
            <Type className="w-4 h-4" />
        </div>
        <textarea
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            disabled={disabled}
            placeholder="描述您想要的纹理（例如：带有金色裂纹的黑曜石、苔藓覆盖的旧砖墙...）"
            className={`w-full bg-gray-50 border border-gray-300 rounded-xl py-3 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-accent-cyan/50 focus:bg-white transition-all resize-none h-24
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
        />
        <div className="absolute bottom-2 right-3 text-[10px] text-gray-500 font-mono pointer-events-none">
            {prompt.length > 0 ? '自定义内容模式' : '自动分析模式'}
        </div>
      </div>

      {/* Info Tip */}
      <div className="bg-gray-50 p-3 rounded-lg flex items-start gap-3 border border-gray-200">
        <AlertCircle className="w-4 h-4 text-accent-cyan mt-0.5 shrink-0" />
        <div className="text-xs text-gray-700 leading-relaxed space-y-1">
          {!referenceImage && !prompt && <p>请至少上传一张图片或输入一段描述。</p>}
          {referenceImage && !prompt && <p>模式：<span className="text-gray-900 font-bold">图片重绘</span>。AI 将分析图片并生成类似纹理。</p>}
          {!referenceImage && prompt && <p>模式：<span className="text-gray-900 font-bold">文本生成</span>。直接根据描述生成纹理。</p>}
          {referenceImage && prompt && <p>模式：<span className="text-gray-900 font-bold">风格融合</span>。使用图片的<span className="text-accent-gold">风格</span> + 文本的<span className="text-accent-cyan">内容</span>。</p>}
        </div>
      </div>
    </div>
  );
};

export default FileUpload;