import React, { useState, useCallback } from 'react';
import { AppProps } from '../../types';
import { Spinner } from './components/Spinner';
import { generateModelImage } from './services/geminiService';
import type { FileWithPreview } from './types';
import { ImageUploader } from './components/ImageUploader';
import { GeneratedImageDisplay } from './components/GeneratedImageDisplay';
import { OptionsSelector } from './components/OptionsSelector';
import { cacheGeneratedAsset } from '../../shared_services/localGeneratedAssetCache';

// Header 组件
const Header = () => (
  <header className="bg-white border-b border-slate-200 shadow-sm">
    <div className="container mx-auto px-4 py-4 flex items-center justify-center text-center">
      <div className="text-4xl mb-2">🕶️</div>
      <div className="ml-4">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Cookshark墨镜-广告大师
        </h1>
        <p className="text-md text-slate-600 mt-1">
          即刻为您的产品生成惊艳的模特展示图
        </p>
      </div>
    </div>
  </header>
);

// Footer 组件
const Footer = () => (
  <footer className="bg-white border-t border-slate-200">
    <div className="container mx-auto px-4 py-4"></div>
  </footer>
);

export const CooksharkAdMasterApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [sunglassesFile, setSunglassesFile] = useState<FileWithPreview | null>(null);
  const [generatedImageUrls, setGeneratedImageUrls] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [gender, setGender] = useState('Female');
  const [scene, setScene] = useState('Street');
  const [aspectRatio, setAspectRatio] = useState('3:4');

  const handleImageUpload = useCallback((file: FileWithPreview) => {
    if (sunglassesFile) {
      URL.revokeObjectURL(sunglassesFile.preview);
    }
    setSunglassesFile(file);
    setGeneratedImageUrls(null);
    setError(null);
  }, [sunglassesFile]);

  const handleGenerate = async () => {
    if (!sunglassesFile) return;

    // 检查余额（不扣除）
    if (!platform.checkBalance(costs.GENERATE_MODEL_IMAGE)) {
      return; // 余额不足会自动显示充值弹窗
    }

    setIsLoading(true);
    setError(null);
    setGeneratedImageUrls(null);

    try {
      const imageUrls = await generateModelImage(sunglassesFile, gender, scene, aspectRatio);

      setGeneratedImageUrls(imageUrls);
      await platform.refreshCredits?.();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : '发生未知错误。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    if (sunglassesFile) {
      URL.revokeObjectURL(sunglassesFile.preview);
    }
    setSunglassesFile(null);
    setGeneratedImageUrls(null);
    setError(null);
    setIsLoading(false);
  };

  return (
    <div className="animate-fade-in space-y-8">
      {/* Header */}
      {/* <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <button 
          onClick={platform.onBack}
          className="flex items-center text-slate-700 hover:text-blue-600 transition-colors min-w-[44px] min-h-[44px] p-2 font-medium"
        >
          <span className="mr-2">←</span> 返回控制台
        </button>
      </div> */}

      <div className="flex flex-col min-h-screen bg-slate-50 text-slate-800 font-sans">
        <div className="flex items-center border-b border-slate-200 px-6 py-3 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
          <button
            onClick={platform.onBack}
            className="flex items-center text-slate-700 hover:text-blue-600 transition-colors font-medium py-1.5 px-2 rounded-lg hover:bg-slate-100"
          >
            <span className="mr-2 text-lg">←</span> 返回控制台
          </button>
        </div>
        <Header />
        <main className="flex-grow container mx-auto px-4 py-8 w-full max-w-7xl">
          <div className="space-y-12">
            {/* Section 1 & 2: Upload and Customize */}
            <div className="bg-white border border-slate-200 p-6 sm:p-8 rounded-2xl shadow-xl">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
                <div className="lg:col-span-2">
                  <h2 className="text-2xl font-bold mb-4 text-white">1. 上传您的产品</h2>
                  <ImageUploader
                    onImageUpload={handleImageUpload}
                    isLoading={isLoading}
                    uploadedFile={sunglassesFile}
                    onReset={handleReset}
                  />
                </div>
                <div className={`lg:col-span-3 transition-opacity duration-500 ${sunglassesFile ? 'opacity-100' : 'opacity-50 pointer-events-none lg:pointer-events-auto'}`}>
                  <h2 className="text-2xl font-bold mb-4 text-white">2. 定制您的模特</h2>
                  <OptionsSelector
                    gender={gender}
                    setGender={setGender}
                    scene={scene}
                    setScene={setScene}
                    aspectRatio={aspectRatio}
                    setAspectRatio={setAspectRatio}
                    disabled={isLoading || !sunglassesFile}
                  />
                </div>
              </div>
              <div className="mt-8 pt-8 border-t border-slate-200">
                <button
                  onClick={handleGenerate}
                  disabled={!sunglassesFile || isLoading}
                  className="w-full flex items-center justify-center bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold py-4 px-4 rounded-xl transition-all duration-300 disabled:from-gray-500 disabled:to-gray-500 disabled:cursor-not-allowed text-lg shadow-lg transform hover:scale-[1.02] disabled:scale-100"
                >
                  {isLoading ? (
                    <>
                      <Spinner size="sm" />
                      <span className="ml-3">生成中...</span>
                    </>
                  ) : (
                    `✨ 生成模特图 (消耗 ${costs.GENERATE_MODEL_IMAGE} 积分)`
                  )}
                </button>
              </div>
            </div>

            {/* Section 3: Results */}
            <div>
              <h2 className="text-3xl font-bold mb-6 text-center text-white">3. AI 生成的模特图</h2>
              <GeneratedImageDisplay
                imageUrls={generatedImageUrls}
                isLoading={isLoading}
                error={error}
                aspectRatio={aspectRatio}
              />
            </div>
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
};

