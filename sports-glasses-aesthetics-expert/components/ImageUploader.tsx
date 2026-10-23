import React, { useRef, useState } from 'react';
import { AspectRatio, GenerationType } from '../types';
import { MODEL_STYLES_OPTIONS } from '../constants';

interface ImageUploaderProps {
  onImageUpload: (files: File[]) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  hasImages: boolean;
  aspectRatio: AspectRatio;
  onAspectRatioChange: (ratio: AspectRatio) => void;
  selectedTypes: GenerationType[];
  onSelectedTypesChange: (types: GenerationType[]) => void;
  prompts: Record<GenerationType, string>;
  onPromptChange: (type: GenerationType, value: string) => void;
  selectedModelStyle: string;
  onModelStyleChange: (styleId: string) => void;
  disabled: boolean;
}

const UploadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l-3.75 3.75M12 9.75l3.75 3.75M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
    <path d="M3 16.5V18a2.25 2.25 0 002.25 2.25h13.5A2.25 2.25 0 0021 18v-1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const aspectRatios: { value: AspectRatio; label: string }[] = [
  { value: '1:1', label: '方形 (1:1)' },
  { value: '3:4', label: '竖向 (3:4)' },
  { value: '16:9', label: '横向 (16:9)' },
];

const generationTypes: { value: GenerationType; label: string }[] = [
  { value: GenerationType.Poster, label: '静物场景' },
  { value: GenerationType.Model, label: '模特图' },
];

export const ImageUploader: React.FC<ImageUploaderProps> = ({ 
  onImageUpload, 
  onGenerate, 
  isGenerating, 
  hasImages,
  aspectRatio,
  onAspectRatioChange,
  selectedTypes,
  onSelectedTypesChange,
  prompts,
  onPromptChange,
  selectedModelStyle,
  onModelStyleChange,
  disabled,
}) => {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = (incomingFiles: FileList | null) => {
    if (!incomingFiles) return;
    
    const newFilesArray = Array.from(incomingFiles);
    const combinedFiles = [...files, ...newFilesArray].slice(0, 3);
    
    if (combinedFiles.length === 0) return;

    setFiles(combinedFiles);
    onImageUpload(combinedFiles);

    const previewPromises = combinedFiles.map(file => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
    });

    Promise.all(previewPromises).then(setPreviews);
  };
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(event.target.files);
    if (event.target) {
      event.target.value = "";
    }
  };
  
  const onDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
  };
  
  const onDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const droppedFiles = event.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      const imageFiles = Array.from(droppedFiles).filter((file): file is File => file instanceof File && file.type.startsWith('image/'));
      const dataTransfer = new DataTransfer();
      imageFiles.forEach(file => dataTransfer.items.add(file));
      processFiles(dataTransfer.files);
    }
  };

  const handleUploadClick = () => {
    if (disabled) return;
    fileInputRef.current?.click();
  };

  const handleRemoveImage = (indexToRemove: number) => {
    if (disabled) return;
    const updatedFiles = files.filter((_, index) => index !== indexToRemove);
    const updatedPreviews = previews.filter((_, index) => index !== indexToRemove);
    
    setFiles(updatedFiles);
    setPreviews(updatedPreviews);
    onImageUpload(updatedFiles);
  };

  const handleTypeToggle = (type: GenerationType) => {
    if (disabled) return;
    const currentIndex = selectedTypes.indexOf(type);
    const newSelectedTypes = [...selectedTypes];

    if (currentIndex === -1) {
      newSelectedTypes.push(type);
    } else {
      newSelectedTypes.splice(currentIndex, 1);
    }
    onSelectedTypesChange(newSelectedTypes);
  };

  return (
    <div className="w-full flex flex-col items-center gap-8">
      {/* Upload Area */}
      <div className="w-full max-w-2xl bg-slate-100/50 border border-slate-300 rounded-2xl p-6">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept="image/png, image/jpeg, image/webp"
          multiple
          disabled={disabled}
        />
        {previews.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {previews.map((src, index) => (
              <div key={index} className="relative group aspect-square rounded-xl overflow-hidden shadow-lg bg-white border border-slate-300">
                <img src={src} alt={`预览 ${index + 1}`} className="w-full h-full object-contain p-2" />
                {!disabled && (
                  <button 
                    onClick={() => handleRemoveImage(index)}
                    className="absolute top-2 right-2 bg-black/70 hover:bg-black/90 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 backdrop-blur-sm"
                    aria-label="移除图片"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            {previews.length < 3 && !disabled && (
              <button onClick={handleUploadClick} className="aspect-square bg-slate-100/50 border-2 border-dashed border-slate-300 rounded-xl flex flex-col justify-center items-center cursor-pointer hover:bg-slate-100 hover:border-indigo-500 transition-all group">
                <div className="bg-slate-200 p-3 rounded-full mb-2 group-hover:scale-110 transition-transform">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-slate-600 group-hover:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="text-sm text-slate-600 font-medium">添加图片</span>
              </button>
            )}
          </div>
        ) : (
          <label 
            onDragOver={onDragOver}
            onDrop={onDrop}
            onClick={handleUploadClick}
            className={`w-full h-56 rounded-xl flex flex-col justify-center items-center cursor-pointer transition-all border-2 border-dashed ${
              disabled 
                ? 'bg-white/50 border-slate-300 cursor-not-allowed opacity-50' 
                : 'bg-white/30 border-slate-300 hover:bg-slate-100/50 hover:border-indigo-500 group'
            }`}
          >
            <div className="p-4 bg-slate-100 rounded-full mb-4 group-hover:scale-110 transition-transform duration-300">
              <UploadIcon />
            </div>
            <p className="font-semibold text-slate-700 text-lg">点击上传或拖放文件</p>
            <p className="text-sm text-slate-600 mt-1">支持 PNG, JPG, WEBP (最多3张)</p>
          </label>
        )}
      </div>
      
      {/* Controls Section */}
      <div className="w-full max-w-2xl grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Aspect Ratio */}
        <div className="bg-slate-100/50 border border-slate-300 p-5 rounded-xl flex flex-col items-center justify-center gap-3">
          <span className="text-sm font-semibold text-slate-600 uppercase tracking-wider">图片比例</span>
          <div className="flex bg-white/50 p-1.5 rounded-lg w-full">
            {aspectRatios.map(ratio => (
              <button 
                key={ratio.value}
                onClick={() => !disabled && onAspectRatioChange(ratio.value)}
                disabled={disabled}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                  aspectRatio === ratio.value 
                    ? 'bg-indigo-600 text-white shadow-md' 
                    : 'text-slate-600 hover:text-slate-700'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {ratio.label}
              </button>
            ))}
          </div>
        </div>

        {/* Generation Types */}
        <div className="bg-slate-100/50 border border-slate-300 p-5 rounded-xl flex flex-col items-center justify-center gap-3">
          <span className="text-sm font-semibold text-slate-600 uppercase tracking-wider">生成类型</span>
          <div className="flex flex-wrap justify-center gap-2 w-full">
            {generationTypes.map(type => (
              <button
                key={type.value}
                onClick={() => handleTypeToggle(type.value)}
                disabled={disabled}
                className={`flex-1 py-2 px-4 text-sm font-medium rounded-lg border transition-all duration-200 ${
                  selectedTypes.includes(type.value)
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                    : 'bg-white/50 border-slate-300 text-slate-700 hover:border-slate-500'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>

        {/* Model Style Selector - Only visible when Model is selected */}
        {selectedTypes.includes(GenerationType.Model) && (
          <div className="bg-slate-100/50 border border-slate-300 p-5 rounded-xl flex flex-col items-center justify-center gap-3 md:col-span-2">
            <span className="text-sm font-semibold text-slate-600 uppercase tracking-wider">模特风格</span>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 w-full">
              {MODEL_STYLES_OPTIONS.map(style => (
                <button
                  key={style.id}
                  onClick={() => !disabled && onModelStyleChange(style.id)}
                  disabled={disabled}
                  className={`py-2 px-2 text-xs sm:text-sm font-medium rounded-lg border transition-all duration-200 truncate ${
                    selectedModelStyle === style.id
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                      : 'bg-white/50 border-slate-300 text-slate-700 hover:border-slate-500'
                  } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={style.label}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Prompt Editor */}
      {selectedTypes.length > 0 && (
        <div className="w-full max-w-2xl bg-slate-100/50 border border-slate-300 p-6 rounded-xl space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-5 bg-indigo-500 rounded-full"></div>
            <h3 className="text-lg font-bold text-white">AI 提示词编辑</h3>
          </div>
          
          {selectedTypes.includes(GenerationType.Poster) && (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600 block">静物场景指令</label>
              <textarea
                value={prompts[GenerationType.Poster]}
                onChange={(e) => !disabled && onPromptChange(GenerationType.Poster, e.target.value)}
                disabled={disabled}
                className="w-full h-32 p-4 bg-white/50 border border-slate-300 rounded-xl text-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none transition-all leading-relaxed disabled:opacity-50"
                placeholder="输入静物场景的生成指令..."
              />
            </div>
          )}

          {selectedTypes.includes(GenerationType.Model) && (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600 block">模特图指令</label>
              <textarea
                value={prompts[GenerationType.Model]}
                onChange={(e) => !disabled && onPromptChange(GenerationType.Model, e.target.value)}
                disabled={disabled}
                className="w-full h-40 p-4 bg-white/50 border border-slate-300 rounded-xl text-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none transition-all leading-relaxed disabled:opacity-50"
                placeholder="输入模特图的生成指令..."
              />
            </div>
          )}
        </div>
      )}

      {/* Generate Button */}
      <button
        onClick={onGenerate}
        disabled={isGenerating || !hasImages || selectedTypes.length === 0 || disabled}
        className="w-full max-w-xs bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold py-4 px-8 rounded-xl hover:from-indigo-700 hover:to-purple-700 active:scale-95 transition-all duration-200 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed disabled:shadow-none shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-2 text-lg min-h-[48px]"
      >
        {isGenerating ? (
          <>
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="font-medium">正在生成...</span>
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            开始生成
          </>
        )}
      </button>
    </div>
  );
};
