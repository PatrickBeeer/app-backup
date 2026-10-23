import React, { useState, useCallback } from 'react';
import { AppProps } from '../../types';
import { GenerationType } from './types';
import { generateImage } from './services/geminiService';
import ImageUploader from './components/ImageUploader';
import GenerationOptions from './components/GenerationOptions';
import ImageGallery from './components/ImageGallery';
import Loader from './components/Loader';
import SparklesIcon from './components/icons/SparklesIcon';
import ModelOptions from './components/ModelOptions';
import AspectRatioOptions from './components/AspectRatioOptions';
import SeedInput from './components/SeedInput';

export const PillowMaternalModelSceneApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedImagePreview, setUploadedImagePreview] = useState<string | null>(null);
  const [generationType, setGenerationType] = useState<GenerationType>(GenerationType.Model);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<string>('1:1');
  const [modelAge, setModelAge] = useState<string>('3-5岁');
  const [modelEthnicity, setModelEthnicity] = useState<string>('亚洲人');
  const [seed, setSeed] = useState<string>(() => String(Math.floor(Math.random() * 1000000)));

  const handleImageUpload = useCallback((file: File) => {
    setUploadedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setUploadedImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    setGeneratedImages([]); // Clear previous results on new upload
    setError(null);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!uploadedFile) {
      setError('请先上传图片。');
      return;
    }

    // 检查余额（不扣除）
    if (!platform.checkBalance(costs.GENERATE_MODEL_SCENE)) {
      return; // 余额不足会自动显示充值弹窗
    }

    setIsLoading(true);
    setError(null);

    try {
      const newImages = await generateImage(
        uploadedFile,
        generationType,
        modelAge,
        modelEthnicity,
        aspectRatio,
        seed
      );
      setGeneratedImages(prev => [...newImages, ...prev]);
      await platform.refreshCredits?.();
    } catch (err: any) {
      setError(err.message || '发生了未知错误。');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [uploadedFile, generationType, modelAge, modelEthnicity, aspectRatio, seed, platform, costs]);

  const isModelMode = generationType === GenerationType.Model;
  
  return (
    <div className="relative min-h-screen font-sans text-slate-800 bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 overflow-x-hidden">
      <div className="absolute top-0 -left-4 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl opacity-50 animate-blob"></div>
      <div className="absolute top-0 -right-4 w-72 h-72 bg-pink-200 rounded-full mix-blend-multiply filter blur-xl opacity-50 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-20 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl opacity-50 animate-blob animation-delay-4000"></div>
      
      <main className="container mx-auto px-4 py-8 md:py-12 relative z-10">
        <header className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight">枕头/母婴模特场景</h1>
          <p className="mt-3 text-lg text-slate-600 max-w-2xl mx-auto">为您的儿童枕头在几秒钟内创建令人惊叹的模特图和场景图。</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12">
          {/* --- Left Control Panel --- */}
          <div className="lg:col-span-2">
            <div className="bg-white/40 backdrop-blur-2xl border border-white/60 rounded-[2.5rem] shadow-2xl shadow-purple-300/20 p-6 md:p-8 space-y-8 transition-all duration-300 hover:shadow-purple-300/40">
              <ImageUploader onImageUpload={handleImageUpload} uploadedImagePreview={uploadedImagePreview} />

              {uploadedFile && (
                <>
                  <GenerationOptions selectedType={generationType} onTypeChange={setGenerationType} />
                  
                  {isModelMode && (
                    <ModelOptions
                      modelAge={modelAge}
                      setModelAge={setModelAge}
                      modelEthnicity={modelEthnicity}
                      setModelEthnicity={setModelEthnicity}
                    />
                  )}

                  <AspectRatioOptions
                    aspectRatio={aspectRatio}
                    setAspectRatio={setAspectRatio}
                    stepNumber={isModelMode ? 4 : 3}
                  />

                  <SeedInput 
                    seed={seed}
                    setSeed={setSeed}
                    stepNumber={isModelMode ? 5 : 4}
                  />
                  
                  <div className="pt-4 border-t border-slate-200/60">
                    <button
                      onClick={handleGenerate}
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold py-3 px-6 rounded-full shadow-lg shadow-purple-300/40 hover:shadow-xl hover:shadow-purple-400/50 disabled:from-slate-400 disabled:to-slate-500 disabled:shadow-none disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                    >
                      {isLoading ? (
                        <>
                          <Loader />
                          生成中...
                        </>
                      ) : (
                        <>
                          <SparklesIcon className="w-5 h-5" />
                          生成图片
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* --- Right Result Area --- */}
          <div className="lg:col-span-3">
            <div className="sticky top-12">
              {error && (
                <div className="mb-6 bg-red-100/80 backdrop-blur-md border border-red-300/50 text-red-700 p-4 rounded-3xl" role="alert">
                  <p className="font-bold">错误</p>
                  <p>{error}</p>
                </div>
              )}
              <ImageGallery images={generatedImages} isLoading={isLoading} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

