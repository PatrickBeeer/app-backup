import React, { useState } from 'react';
import { AppProps } from '../../types';
import { ImageUploader } from './components/ImageUploader';
import { PromptEditor } from './components/PromptEditor';
import { ResultDisplay } from './components/ResultDisplay';
import { generateImages, DEFAULT_PROMPTS } from './services/geminiService';
import { GenerationStatus, SceneCategory } from './types';

export const CarSeatSceneMasterApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [originalImage, setOriginalImage] = useState<File | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<string[] | null>(null);
  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [prompts, setPrompts] = useState(DEFAULT_PROMPTS);
  const [selectedCategory, setSelectedCategory] = useState<SceneCategory>('standard');

  const handleImageUpload = (file: File) => {
    setOriginalImage(file);
    setOriginalImageUrl(URL.createObjectURL(file));
    setGeneratedImages(null);
    setError(null);
  };

  const handleGenerate = async () => {
    if (!originalImage) {
      return;
    }

    // 检查余额（不扣除）
    if (!platform.checkBalance(costs.GENERATE_SCENE_IMAGE)) {
      return; // 余额不足会自动显示充值弹窗
    }

    setStatus(GenerationStatus.GENERATING);
    setError(null);
    setGeneratedImages(null);

    try {
      const imageUrls = await generateImages(originalImage, prompts, selectedCategory);

      setGeneratedImages(imageUrls);
      await platform.refreshCredits?.();
      setStatus(GenerationStatus.SUCCESS);
    } catch (err: any) {
      // 请求失败，不扣费
      console.error('生成失败:', err);
      setStatus(GenerationStatus.ERROR);
      setError(err.message || '生成失败，请检查网络或重试');
    }
  };

  const isLoading = status === GenerationStatus.GENERATING;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      <div className="flex items-center border-b border-slate-200 px-6 py-3 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <button 
          onClick={platform.onBack}
          className="flex items-center text-slate-700 hover:text-blue-600 transition-colors font-medium py-1.5 px-2 rounded-lg hover:bg-slate-100"
        >
          <span className="mr-2 text-lg">←</span> 返回控制台
        </button>
      </div>
        <main className="container mx-auto px-4 py-8 w-full max-w-7xl">
          {/* Title */}
          <header className="text-center mb-8">
            <div className="inline-flex items-center gap-3 mb-2">
              <span className="text-4xl">🚗</span>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
                汽车坐垫场景大师
              </h1>
            </div>
            <p className="text-lg text-slate-600">
              为您的汽车坐垫产品图一键生成专业的电商背景图
            </p>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column */}
            <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-xl space-y-6">
              <ImageUploader 
                onImageUpload={handleImageUpload} 
                onGenerate={handleGenerate} 
                imageUrl={originalImageUrl}
                isLoading={isLoading}
                selectedCategory={selectedCategory}
                onCategoryChange={setSelectedCategory}
              />
              <PromptEditor 
                prompts={prompts}
                onPromptsChange={setPrompts}
                isLoading={isLoading}
              />
            </div>

            {/* Right Column */}
            <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-xl">
              <ResultDisplay
                generatedImages={generatedImages}
                isLoading={isLoading}
                error={error}
                selectedCategory={selectedCategory}
              />
            </div>
          </div>
        </main>
    </div>
  );
};

