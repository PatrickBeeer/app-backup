import React, { useState, useCallback, useEffect } from 'react';
import { AppProps } from '../../types';
import { ImageUploader } from './components/ImageUploader';
import { StyleSelector } from './components/StyleSelector';
import { ResultDisplay } from './components/ResultDisplay';
import { generateModelImages } from './services/geminiService';
import { SCENES, MODEL_STYLES, ASPECT_RATIOS, ETHNICITIES, PHOTOGRAPHY_STYLES } from './constants';
import type { UploadedImage } from './types';

export const WomenBagSceneModelApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [photographyStyle, setPhotographyStyle] = useState<string>(PHOTOGRAPHY_STYLES[0].id);
  const [selectedScene, setSelectedScene] = useState<string>(SCENES[0].id);
  const [selectedModelStyle, setSelectedModelStyle] = useState<string>(MODEL_STYLES[0].id);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string>(ASPECT_RATIOS[0].id);
  const [selectedEthnicity, setSelectedEthnicity] = useState<string>(ETHNICITIES[0].id);
  const [seed, setSeed] = useState<number>(() => Math.floor(Math.random() * 1000000));
  const [generatedImages, setGeneratedImages] = useState<(string | null)[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Fine-tuning state
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [styleReferenceImage, setStyleReferenceImage] = useState<UploadedImage | null>(null);
  const generateCost = Number.isFinite(Number(costs?.GENERATE_MODEL_IMAGE)) ? Number(costs.GENERATE_MODEL_IMAGE) : 20;

  const handleNewSeed = useCallback(() => {
    setSeed(Math.floor(Math.random() * 1000000));
  }, []);

  useEffect(() => {
    handleNewSeed();
  }, [uploadedImage, handleNewSeed]);

  const handleImageUpload = (image: UploadedImage) => {
    setUploadedImage(image);
    setGeneratedImages(null);
    setError(null);
  };

  const handleGenerate = useCallback(async () => {
    if (!uploadedImage) {
      setError('请先上传一张图片。');
      return;
    }

    await platform.refreshCredits();

    // 检查余额（不扣除）
    if (!platform.checkBalance(generateCost)) {
      return; // 余额不足会自动显示充值弹窗
    }

    setIsLoading(true);
    setGeneratedImages(null);
    setError(null);

    const scene = SCENES.find(s => s.id === selectedScene)?.prompt || '';
    const modelStyle = MODEL_STYLES.find(m => m.id === selectedModelStyle)?.prompt || '';
    const ethnicity = ETHNICITIES.find(e => e.id === selectedEthnicity)?.prompt || '';
    const aspectRatio = selectedAspectRatio;

    try {
      const results = await generateModelImages(
        uploadedImage, 
        scene, 
        modelStyle, 
        ethnicity, 
        aspectRatio, 
        seed, 
        photographyStyle,
        customPrompt,
        styleReferenceImage
      );

      // 检查是否有至少一张成功的图片
      const successCount = results.filter(r => r.success).length;
      if (successCount === 0) {
        // 所有图片都失败了，显示错误
        const errorMessages = results.map((r, i) => r.error || `图片 ${i + 1} 生成失败`).join('；');
        setError(`所有图片生成失败：${errorMessages}`);
        return;
      }

      // 将结果转换为数组格式，成功的显示图片URL，失败的显示 null
      const imageResults = results.map(result => result.success ? result.imageUrl! : null);
      setGeneratedImages(imageResults);
      await platform.refreshCredits?.();

      // 如果有部分失败，显示警告信息（但不阻止显示成功的图片）
      const failedCount = results.length - successCount;
      if (failedCount > 0) {
        const failedMessages = results
          .map((r, i) => !r.success ? `图片 ${i + 1}` : null)
          .filter(Boolean)
          .join('、');
        console.warn(`部分图片生成失败：${failedMessages}`);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : '图片生成过程中发生未知错误。');
    } finally {
      setIsLoading(false);
    }
  }, [
    uploadedImage, selectedScene, selectedModelStyle, 
    selectedEthnicity, selectedAspectRatio, seed, photographyStyle,
    customPrompt, styleReferenceImage, platform, generateCost
  ]);

  const clearUpload = () => {
    setUploadedImage(null);
    setGeneratedImages(null);
    setError(null);
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col min-h-screen font-sans text-slate-600">
      <div className="flex items-center border-b border-slate-200 px-6 py-3 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <button
          onClick={platform.onBack}
          className="flex items-center text-slate-700 hover:text-blue-600 transition-colors font-medium py-1.5 px-2 rounded-lg hover:bg-slate-100"
        >
          <span className="mr-2 text-lg">←</span> 返回控制台
        </button>
      </div>
      <div className="flex flex-col md:flex-row min-h-screen w-full p-4 md:p-8 gap-8 font-sans text-slate-800">
        {/* Control Panel */}
        <aside className="w-full md:w-[400px] lg:w-[450px] bg-white/75 backdrop-blur-2xl border border-white/50 shadow-xl rounded-3xl p-6 flex flex-col space-y-6 shrink-0">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center shadow-lg">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>
              </svg>
            </div>
            <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">女包AI场景模特</h1>
          </div>
          
          {!uploadedImage ? (
            <ImageUploader onImageUpload={handleImageUpload} />
          ) : (
            <>
              <div className="p-4 bg-black/5 rounded-2xl">
                <h2 className="text-lg font-bold text-slate-700 mb-3">您的产品</h2>
                <div className="relative group">
                  <div className="w-full h-auto max-h-48 overflow-hidden">
                    <img src={uploadedImage.base64} alt="Uploaded Handbag" className="w-full h-auto max-h-48 object-contain rounded-lg"/>
                  </div>
                  <button
                    onClick={clearUpload}
                    className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5 text-sm opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white"
                    aria-label="更换图片"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <StyleSelector
                photographyStyle={photographyStyle}
                setPhotographyStyle={setPhotographyStyle}
                selectedScene={selectedScene}
                setSelectedScene={setSelectedScene}
                selectedModelStyle={selectedModelStyle}
                setSelectedModelStyle={setSelectedModelStyle}
                selectedAspectRatio={selectedAspectRatio}
                setSelectedAspectRatio={setSelectedAspectRatio}
                selectedEthnicity={selectedEthnicity}
                setSelectedEthnicity={setSelectedEthnicity}
                customPrompt={customPrompt}
                setCustomPrompt={setCustomPrompt}
                styleReferenceImage={styleReferenceImage}
                setStyleReferenceImage={setStyleReferenceImage}
                seed={seed}
                setSeed={setSeed}
                onNewSeed={handleNewSeed}
              />

              <div className="mt-auto pt-4">
                <button
                  onClick={handleGenerate}
                  disabled={isLoading}
                  className="w-full text-white bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 disabled:from-indigo-300 disabled:to-purple-300 disabled:cursor-not-allowed font-bold rounded-xl text-lg px-5 py-3.5 text-center transition-all duration-300 ease-in-out shadow-lg hover:shadow-indigo-500/50 flex items-center justify-center focus:outline-none focus:ring-4 focus:ring-indigo-300/50 transform hover:scale-105"
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      生成中...
                    </>
                  ) : (
                    `生成两张图片 (消耗 ${generateCost} 积分)`
                  )}
                </button>
              </div>
            </>
          )}
        </aside>

        {/* Result Display */}
        <main className="flex-1 flex">
          <ResultDisplay 
            isLoading={isLoading}
            generatedImages={generatedImages}
            error={error}
          />
        </main>
      </div>
    </div>
  );
};

