import React, { useState, useCallback } from 'react';
import { AppProps } from '../../types';
import { Header } from './components/Header';
import { ImageUploader } from './components/ImageUploader';
import { ResultDisplay } from './components/ResultDisplay';
import { generateSceneImage, analyzeImageForSellingPoints, GENERATED_IMAGE_COUNT } from './services/geminiService';
import type { StyleOption, AspectRatio } from './types';
import { ControlsPanel } from './components/ControlsPanel';

export const AgriculturalProductStudioApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [uploadedImage, setUploadedImage] = useState<{
    base64: string;
    mimeType: string;
    preview: string;
  } | null>(null);
  const [sellingPoints, setSellingPoints] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [selectedStyle, setSelectedStyle] = useState<StyleOption | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [generatedImages, setGeneratedImages] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const pointsPerImage = costs.GENERATE_SCENE_IMAGE ?? 10;
  const totalGenerationCost = pointsPerImage * GENERATED_IMAGE_COUNT;

  const handleAnalyzeImage = async (base64: string, mimeType: string) => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    setSellingPoints('');
    try {
      const points = await analyzeImageForSellingPoints(base64, mimeType);
      setSellingPoints(points);
    } catch (err) {
      setAnalysisError('分析卖点失败，请稍后重试。');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleImageUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      const mimeType = file.type;
      setUploadedImage({ base64, mimeType, preview: dataUrl });
      setGeneratedImages(null);
      setError(null);
      handleAnalyzeImage(base64, mimeType);
    };
    reader.onerror = () => {
      setError('图片文件读取失败。');
    };
    reader.readAsDataURL(file);
  }, []);

  const handleGenerate = async () => {
    if (!uploadedImage || !selectedStyle || !sellingPoints) {
      setError('请先上传图片，等待卖点分析完成，并选择一个风格。');
      return;
    }

    // 检查余额（不扣除）
    if (!platform.checkBalance(totalGenerationCost)) {
      return; // 余额不足会自动显示充值弹窗
    }

    setIsLoading(true);
    setGeneratedImages(null);
    setError(null);
    try {
      const newImages = await generateSceneImage(
        uploadedImage.base64,
        uploadedImage.mimeType,
        selectedStyle,
        aspectRatio,
        sellingPoints,
        customPrompt
      );
      setGeneratedImages(newImages);
      await platform.refreshCredits?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '生成图片时发生未知错误。'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setUploadedImage(null);
    setSellingPoints('');
    setIsAnalyzing(false);
    setAnalysisError(null);
    setCustomPrompt('');
    setSelectedStyle(null);
    setAspectRatio('1:1');
    setGeneratedImages(null);
    setIsLoading(false);
    setError(null);
  };

  const isGenerateDisabled = !uploadedImage || !selectedStyle || isLoading || isAnalyzing || !sellingPoints;

  return (
    <div className="min-h-screen text-slate-800 font-sans flex flex-col">
      <Header />
      <main className="container mx-auto p-4 md:p-8 flex-grow">
        <div className="grid grid-cols-1 lg:grid-cols-5 xl:grid-cols-3 gap-8 lg:gap-12 h-full">
          
          {/* Canvas Column */}
          <div className="lg:col-span-3 xl:col-span-2 bg-white/60 backdrop-blur-xl border border-white/40 shadow-2xl shadow-blue-500/10 rounded-[2rem] p-4 flex flex-col">
             { !uploadedImage ? (
                <ImageUploader
                  onImageUpload={handleImageUpload}
                  uploadedImage={null}
                />
             ) : (
                <ResultDisplay
                    isLoading={isLoading}
                    generatedImages={generatedImages}
                    error={error}
                    uploadedImage={uploadedImage.preview}
                />
             )}
          </div>

          {/* Controls Column */}
          <div className="lg:col-span-2 xl:col-span-1">
            <ControlsPanel
              isImageUploaded={!!uploadedImage}
              isAnalyzing={isAnalyzing}
              analysisError={analysisError}
              sellingPoints={sellingPoints}
              onSellingPointsChange={setSellingPoints}
              selectedStyle={selectedStyle}
              onStyleSelect={setSelectedStyle}
              aspectRatio={aspectRatio}
              onAspectRatioChange={setAspectRatio}
              customPrompt={customPrompt}
              onCustomPromptChange={setCustomPrompt}
              onGenerate={handleGenerate}
              onReset={handleReset}
              isGenerateDisabled={isGenerateDisabled}
              isLoading={isLoading}
              pointsPerImage={pointsPerImage}
              imageCount={GENERATED_IMAGE_COUNT}
              totalGenerationCost={totalGenerationCost}
            />
          </div>
        </div>
      </main>
    </div>
  );
};

