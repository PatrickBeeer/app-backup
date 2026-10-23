import React, { useState, useCallback, useMemo, useRef } from 'react';
import { AppProps } from '../../types';
import { ImageUploader } from './components/ImageUploader';
import { OptionSelector } from './components/OptionSelector';
import { ResultDisplay } from './components/ResultDisplay';
import { LoadingSpinner } from './components/LoadingSpinner';
import { SparklesIcon } from './components/icons/SparklesIcon';
import { TrashIcon } from './components/icons/TrashIcon';
import { RefreshIcon } from './components/icons/RefreshIcon';
import { addModelToImage } from './services/geminiService';
import { furnitureTypes, modelOptionsConfig } from './constants';
import type { ModelOptions } from './types';

export const FurnitureModelGeneratorApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [originalImage, setOriginalImage] = useState<File | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [generatedImageUrls, setGeneratedImageUrls] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [furnitureType, setFurnitureType] = useState<string>(furnitureTypes[0].value);
  const [modelOptions, setModelOptions] = useState<ModelOptions>({
    ethnicity: modelOptionsConfig.find(c => c.key === 'ethnicity')?.options[0].value || '',
    style: modelOptionsConfig.find(c => c.key === 'style')?.options[0].value || '',
    gender: modelOptionsConfig.find(c => c.key === 'gender')?.options[0].value || '',
    age: modelOptionsConfig.find(c => c.key === 'age')?.options[0].value || '',
    pose: modelOptionsConfig.find(c => c.key === 'pose')?.options[0].value || '',
  });

  const handleImageUpload = (file: File) => {
    setOriginalImage(file);
    if (originalImageUrl) {
      URL.revokeObjectURL(originalImageUrl);
    }
    setOriginalImageUrl(URL.createObjectURL(file));
    setGeneratedImageUrls(null);
    setError(null);
  };

  const handleClearImage = () => {
    setOriginalImage(null);
    if (originalImageUrl) {
      URL.revokeObjectURL(originalImageUrl);
    }
    setOriginalImageUrl(null);
    setGeneratedImageUrls(null);
    setError(null);
  };

  const handleChangeImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleImageUpload(e.target.files[0]);
    }
  };

  const handleOptionChange = (category: keyof ModelOptions, value: string) => {
    setModelOptions(prev => {
      const newOptions = { ...prev, [category]: value };
      
      // Logic to prevent invalid combinations
      if (category === 'age' && (value.includes('child') || value.includes('family'))) {
        if (newOptions.gender.includes('couple')) {
          // Reset gender if 'couple' is selected for child/family
          newOptions.gender = modelOptionsConfig.find(c => c.key === 'gender')?.options.find(o => o.value === 'a woman')?.value || '';
        }
      }
      
      if (category === 'age' && value.includes('child')) {
        const isBoyOrGirlSelected = newOptions.gender === 'a boy' || newOptions.gender === 'a girl';
        if (!isBoyOrGirlSelected) {
          newOptions.gender = modelOptionsConfig.find(c => c.key === 'gender')?.options.find(o => o.value === 'a girl')?.value || '';
        }
      } else if (category === 'gender' && (value === 'a boy' || value === 'a girl')) {
        if (!newOptions.age.includes('child')) {
          newOptions.age = modelOptionsConfig.find(c => c.key === 'age')?.options.find(o => o.value.includes('child'))?.value || '';
        }
      }
      
      return newOptions;
    });
  };

  const handleGenerateClick = useCallback(async () => {
    if (!originalImage) {
      setError('请先上传一张图片。');
      return;
    }

    const imageCount = 2;
    const costPerImage = costs.GENERATE_IMAGE ?? costs.GENERATE_MODEL ?? 10;
    const totalCost = costPerImage * imageCount;

    // 检查积分余额（按每张图片计费）
    if (!platform.checkBalance(totalCost)) {
      setError(`积分不足，需要 ${totalCost} 积分（${costPerImage} 积分/张）。`);
      platform.showRecharge();
      return;
    }

    setIsLoading(true);
    setError(null);
    setGeneratedImageUrls(null);

    try {
      const generatedImages = await addModelToImage(originalImage, furnitureType, modelOptions);
      
      // 转换为 data URL 格式
      const imageUrls = generatedImages.map(base64 => `data:image/png;base64,${base64}`);

      setGeneratedImageUrls(imageUrls);
      await platform.refreshCredits();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : '生成图片失败。模型可能拒绝了该请求。请尝试使用不同的图片或选项重试。');
    } finally {
      setIsLoading(false);
    }
  }, [originalImage, furnitureType, modelOptions, platform, costs]);
  
  const isGenerateDisabled = isLoading || !originalImage;

  const filteredGenderOptions = useMemo(() => {
    const genderConfig = modelOptionsConfig.find(c => c.key === 'gender');
    if (!genderConfig) return [];
    
    const age = modelOptions.age;
    if (age.includes('child')) {
      return genderConfig.options.filter(opt => opt.value === 'a boy' || opt.value === 'a girl');
    }
    if (age.includes('family')) {
      return genderConfig.options.filter(opt => !opt.value.includes('couple') && !opt.value.includes('boy') && !opt.value.includes('girl'));
    }
    return genderConfig.options.filter(opt => opt.value !== 'a boy' && opt.value !== 'a girl');
  }, [modelOptions.age]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 sm:p-6 lg:p-8 font-sans">
      <div className="container mx-auto max-w-7xl">
        <div className="flex items-center border-b border-slate-200 px-6 py-3 bg-white/50 backdrop-blur-sm sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 mb-4">
          <button
            onClick={platform.onBack}
            className="flex items-center text-slate-700 hover:text-blue-600 transition-colors font-medium py-1.5 px-2 rounded-lg hover:bg-slate-100"
          >
            <span className="mr-2 text-lg">←</span> 返回控制台
          </button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full items-stretch">
          
          {/* Left Panel: Control Workbench */}
          <div className="lg:col-span-4 bg-white/80 backdrop-blur-2xl border border-slate-300/50 rounded-2xl shadow-xl flex flex-col overflow-hidden transition-all duration-500">
            
            {/* Case 1: Upload Mode (Empty State) */}
            {!originalImage ? (
              <div className="flex-1 flex flex-col p-6 animate-fade-in">
                <h2 className="text-xl font-bold text-slate-800 mb-2">开始创作</h2>
                <p className="text-slate-600 text-sm mb-6">上传您的家具产品图片，AI将为您自动添加专业模特。</p>
                <div className="flex-1">
                  <ImageUploader onImageUpload={handleImageUpload} />
                </div>
              </div>
            ) : (
              /* Case 2: Configuration Mode (In-situ Update) */
              <div className="flex flex-col h-full animate-fade-in">
                {/* Top: Image Preview Header */}
                <div className="flex-shrink-0 p-4 border-b border-slate-300 bg-slate-100/30">
                  <div className="flex items-start gap-4">
                    <div className="relative group w-20 h-20 flex-shrink-0">
                      <img 
                        src={originalImageUrl!} 
                        alt="Uploaded" 
                        className="w-full h-full object-cover rounded-lg shadow-sm border border-slate-300"
                      />
                    </div>
                    <div className="flex-1 min-w-0 pt-1">
                      <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">当前图片</p>
                      <p className="text-sm text-slate-700 truncate font-medium mb-3" title={originalImage.name}>
                        {originalImage.name}
                      </p>
                      <div className="flex gap-2">
                        <button 
                          onClick={handleChangeImageClick}
                          className="flex items-center gap-1.5 text-xs bg-slate-200 border border-slate-300 text-slate-700 px-2.5 py-1.5 rounded-md hover:bg-slate-300 transition-colors"
                        >
                          <RefreshIcon className="w-3.5 h-3.5" />
                          更换
                        </button>
                        <button 
                          onClick={handleClearImage}
                          className="flex items-center gap-1.5 text-xs bg-slate-200 border border-red-600/50 text-red-400 px-2.5 py-1.5 rounded-md hover:bg-red-900/20 transition-colors"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                          移除
                        </button>
                      </div>
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden" 
                        accept="image/png, image/jpeg, image/webp"
                      />
                    </div>
                  </div>
                </div>

                {/* Middle: Scrollable Config Area */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                  <div>
                    <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-4">场景设置</h3>
                    <div className="space-y-6">
                      <OptionSelector
                        label="家具类型"
                        options={furnitureTypes}
                        selectedValue={furnitureType}
                        onChange={setFurnitureType}
                        name="furnitureType"
                      />
                      {modelOptionsConfig.map(config => (
                        <div key={config.key}>
                          <OptionSelector
                            label={config.label}
                            options={config.key === 'gender' ? filteredGenderOptions : config.options}
                            selectedValue={modelOptions[config.key]}
                            onChange={(value) => handleOptionChange(config.key, value)}
                            name={config.key}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bottom: Action Area */}
                <div className="flex-shrink-0 p-4 border-t border-slate-300 bg-slate-100/50 backdrop-blur-sm">
                  <button
                    onClick={handleGenerateClick}
                    disabled={isGenerateDisabled}
                    className={`w-full flex items-center justify-center gap-2 text-white font-bold py-3.5 px-6 rounded-xl transition-all duration-300 transform active:scale-95 shadow-lg
                      ${isGenerateDisabled 
                        ? 'bg-slate-300 text-slate-600 cursor-not-allowed shadow-none' 
                        : 'bg-blue-600 hover:bg-blue-700 hover:shadow-blue-500/40 shadow-blue-500/20'
                      }`}
                  >
                    {isLoading ? (
                      <>
                        <LoadingSpinner className="w-5 h-5 text-white/90" />
                        <span>AI生成中...</span>
                      </>
                    ) : (
                      <>
                        <SparklesIcon className="w-5 h-5" />
                        <span>立即生成 (2张)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
          
          {/* Right Panel: Result Canvas */}
          <div className="lg:col-span-8 bg-white/80 backdrop-blur-2xl border border-slate-300/50 rounded-2xl shadow-xl flex flex-col overflow-hidden relative">
            {error && (
              <div className="absolute top-4 left-4 right-4 z-10 animate-slide-in-top">
                <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg shadow-sm flex items-start gap-3">
                  <span className="text-xl">⚠️</span>
                  <div>
                    <strong className="font-bold block text-sm">生成失败</strong>
                    <span className="text-sm opacity-90">{error}</span>
                  </div>
                  <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">&times;</button>
                </div>
              </div>
            )}
            <div className="flex-1 h-full overflow-hidden p-6">
              <ResultDisplay 
                originalImageUrl={originalImageUrl}
                generatedImageUrls={generatedImageUrls}
                isLoading={isLoading}
              />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

