import React, { useState, useCallback, useEffect, useRef, ChangeEvent, DragEvent } from 'react';
import type { UserInput } from '../types';
import { ASPECT_RATIOS } from '../constants';
import { UploadIcon } from './icons/UploadIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { SpinnerIcon } from './icons/SpinnerIcon';

interface InputPanelProps {
  onGenerate: (userInput: UserInput) => void;
  isLoading: boolean;
}

export const InputPanel: React.FC<InputPanelProps> = ({ onGenerate, isLoading }) => {
  const [mainTitle, setMainTitle] = useState<string>('金色粽子礼盒');
  const [subtitle, setSubtitle] = useState<string>('全场满299减50');
  const [otherInfo, setOtherInfo] = useState<string>('活动期间');
  const [productImages, setProductImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [selectedAspectRatios, setSelectedAspectRatios] = useState<string[]>(['3:4']);
  const previewUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    previewUrlsRef.current = imagePreviews;
  }, [imagePreviews]);

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const handleAspectRatioToggle = (aspectRatio: string) => {
    setSelectedAspectRatios(prev =>
      prev.includes(aspectRatio)
        ? prev.filter(ar => ar !== aspectRatio)
        : [...prev, aspectRatio]
    );
  };

  const handleFileChange = (files: FileList | null) => {
    if (files) {
      const newFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
      if (productImages.length + newFiles.length > 3) {
        alert('最多只能上传 3 张图片。');
        return;
      }
      setProductImages(prev => [...prev, ...newFiles]);
      const newPreviews = newFiles.map(file => URL.createObjectURL(file));
      setImagePreviews(prev => [...prev, ...newPreviews]);
    }
  };

  const handleRemoveImage = (indexToRemove: number) => {
    URL.revokeObjectURL(imagePreviews[indexToRemove]);
    setProductImages(prev => prev.filter((_, index) => index !== indexToRemove));
    setImagePreviews(prev => prev.filter((_, index) => index !== indexToRemove));
  };
  
  const handleDragEnter = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  
  const handleDragOver = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };
  
  const handleDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFileChange(e.dataTransfer.files);
  };

  const getUserInput = (): UserInput | null => {
    if (productImages.length === 0) {
      alert('请至少上传一张产品图片。');
      return null;
    }
    if (selectedAspectRatios.length === 0) {
      alert('请至少选择一个图片比例。');
      return null;
    }
    return { mainTitle, subtitle, otherInfo, productImages, aspectRatios: selectedAspectRatios };
  };

  const handleGenerate = () => {
    const userInput = getUserInput();
    if (!userInput) return;
    onGenerate(userInput);
  };
  
  const renderInput = (id: string, label: string, value: string, onChange: (e: ChangeEvent<HTMLInputElement>) => void, placeholder: string) => (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      <input
        type="text"
        id={id}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full bg-slate-100 border border-slate-300 rounded-lg shadow-sm py-2 px-3 text-slate-800 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
        required
      />
    </div>
  );

  return (
    <div className="bg-white/80 backdrop-blur-xl border border-slate-200 p-6 rounded-2xl shadow-lg">
      <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            上传产品图 (1-3张)
          </label>
          <div
            className={`mt-1 p-2 border-2 border-dashed rounded-lg transition-colors duration-200 ${isDragging ? 'border-purple-500 bg-purple-900/20' : 'border-slate-300'}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {imagePreviews.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-2">
                {imagePreviews.map((preview, index) => (
                  <div key={index} className="relative group">
                    <img src={preview} alt={`Preview ${index + 1}`} className="w-full h-24 object-cover rounded-md" />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(index)}
                      className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Remove image"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            {productImages.length < 3 && (
              <label
                htmlFor="file-upload"
                className="relative flex flex-col items-center justify-center w-full py-6 cursor-pointer hover:bg-slate-100/50 rounded-md"
              >
                <UploadIcon className="mx-auto h-10 w-10 text-slate-600" />
                <p className="text-sm text-slate-600 mt-1">上传文件或拖拽到此</p>
                <p className="text-xs text-slate-600">还可上传 {3 - productImages.length} 张图片</p>
                <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={(e) => handleFileChange(e.target.files)} accept="image/*" multiple />
              </label>
            )}
          </div>
        </div>
        
        {renderInput('main-title', '主标题', mainTitle, e => setMainTitle(e.target.value), 'e.g., 金色粽子礼盒')}
        {renderInput('subtitle', '副标题', subtitle, e => setSubtitle(e.target.value), 'e.g., 全场满299减50')}
        {renderInput('other-info', '其他信息', otherInfo, e => setOtherInfo(e.target.value), 'e.g., 活动期间')}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">选择图片比例</label>
          <div className="grid grid-cols-3 gap-3 mt-2">
            {ASPECT_RATIOS.map(ar => (
              <button
                key={ar}
                type="button"
                onClick={() => handleAspectRatioToggle(ar)}
                className={`py-2 px-3 rounded-lg text-sm font-semibold transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-slate-900
                  ${selectedAspectRatios.includes(ar)
                    ? 'bg-purple-600 text-white shadow'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
                  }`}
              >
                {ar}
              </button>
            ))}
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isLoading || productImages.length === 0 || selectedAspectRatios.length === 0}
            className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-slate-300 rounded-lg shadow-sm text-sm font-semibold text-slate-800 bg-white hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all duration-200"
          >
            {isLoading ? (
              <>
                <SpinnerIcon />
                生成中...
              </>
            ) : (
              <>
                <SparklesIcon className="w-5 h-5" />
                生成海报（10积分）
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

