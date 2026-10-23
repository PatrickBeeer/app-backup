import React, { useState, useCallback } from 'react';
import { AppProps } from '../../types';
import { ImageUploader } from './components/ImageUploader';
import { AspectRatioSelector } from './components/AspectRatioSelector';
import { ImageViewer } from './components/ImageViewer';
import { LoadingIndicator } from './components/LoadingIndicator';
import { DownloadButton } from './components/DownloadButton';
import { extendImage } from './services/geminiService';
import { ASPECT_RATIOS } from './constants';
import type { AspectRatio, OriginalImage } from './types';

export const AiImageAspectRatioExpanderApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [originalImage, setOriginalImage] = useState<OriginalImage | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatio>(ASPECT_RATIOS[0]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const generationCost = costs?.GENERATE_EXTENDED ?? 10;

  const handleImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      setOriginalImage({
        dataUrl: reader.result as string,
        mimeType: file.type,
      });
      setGeneratedImage(null);
      setError(null);
    };
    reader.onerror = () => {
      setError('读取图片文件失败。');
    };
    reader.readAsDataURL(file);
  };

  const handleClearImage = () => {
    setOriginalImage(null);
    setGeneratedImage(null);
    setError(null);
  };

  const handleGenerate = useCallback(async () => {
    if (!originalImage) {
      setError('请先上传一张图片。');
      return;
    }

    const cost = generationCost;

    await platform.refreshCredits?.();

    if (!platform.checkBalance(cost)) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setGeneratedImage(null);

    try {
      const base64Data = originalImage.dataUrl.split(',')[1];
      
      const imageUrl = await extendImage(base64Data, originalImage.mimeType, selectedAspectRatio.value);

      const generatedBase64 = imageUrl.split(',')[1];
      const originalBase64 = originalImage.dataUrl.split(',')[1];
      const isSame = generatedBase64 === originalBase64;
      
      if (isSame) {
        setError('生成的图片与原图相同，请重试。');
        setIsLoading(false);
        return;
      }
      
      // 检查图片尺寸（同步方式，确保在设置状态前完成检查）
      await new Promise<void>((resolve) => {
        const originalImg = new Image();
        const generatedImg = new Image();
        let originalLoaded = false;
        let generatedLoaded = false;
        
        const checkDimensions = () => {
          if (!originalLoaded || !generatedLoaded) return;
          
          const generatedAspectRatio = (generatedImg.width / generatedImg.height).toFixed(2);
          const expectedAspectRatio = selectedAspectRatio.value === '1:1' ? '1.00' : 
                                      selectedAspectRatio.value === '16:9' ? '1.78' :
                                      selectedAspectRatio.value === '9:16' ? '0.56' :
                                      selectedAspectRatio.value === '4:3' ? '1.33' :
                                      selectedAspectRatio.value === '3:4' ? '0.75' : 'unknown';
          
          if (originalImg.width === generatedImg.width && originalImg.height === generatedImg.height) {
            setError('生成的图片尺寸与原图相同，模型可能未正确扩展图片。请重试或尝试其他比例。');
            setIsLoading(false);
            resolve();
            return;
          }

            void generatedAspectRatio;
            void expectedAspectRatio;
          
          resolve();
        };
        
        originalImg.onload = () => {
          originalLoaded = true;
          checkDimensions();
        };
        originalImg.onerror = () => {
          resolve();
        };
        
        generatedImg.onload = () => {
          generatedLoaded = true;
          checkDimensions();
        };
        generatedImg.onerror = () => {
          resolve();
        };
        
        originalImg.src = originalImage.dataUrl;
        generatedImg.src = imageUrl;
      });

      setGeneratedImage(imageUrl);
      await platform.refreshCredits?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成图片时发生未知错误。');
    } finally {
      setIsLoading(false);
    }
  }, [originalImage, selectedAspectRatio, platform, generationCost]);

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
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-400">
            AI 图像尺寸扩展器
          </h1>
          <p className="mt-2 text-lg text-slate-600 max-w-2xl mx-auto">
            上传一张图片并选择新的宽高比。我们的 AI 将智能地扩展图片以适应新的尺寸。
          </p>
        </header>

        <main className="flex flex-col lg:flex-row gap-8 lg:gap-12">
          {/* Control Panel */}
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-6 flex flex-col space-y-6 shadow-lg border border-slate-300/50 lg:w-2/5 lg:max-w-lg">
            {!originalImage ? (
              <div>
                <h2 className="text-2xl font-bold mb-3 text-blue-600">1. 上传您的图片</h2>
                <ImageUploader onImageUpload={handleImageUpload} />
              </div>
            ) : (
              <>
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h2 className="text-2xl font-bold text-blue-600">1. 您的图片</h2>
                    <button 
                      onClick={handleClearImage} 
                      className="text-sm font-medium text-blue-600 hover:text-blue-500 transition-colors"
                    >
                      更换图片
                    </button>
                  </div>
                  <ImageViewer src={originalImage.dataUrl} alt="Original Upload" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-3 text-blue-600">2. 选择宽高比</h2>
                  <AspectRatioSelector
                    ratios={ASPECT_RATIOS}
                    selectedRatio={selectedAspectRatio}
                    onSelectRatio={setSelectedAspectRatio}
                  />
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-3 text-blue-600">3. 开始生成</h2>
                  <button
                    onClick={handleGenerate}
                    disabled={isLoading}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed disabled:text-slate-600 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-blue-500 flex items-center justify-center shadow-md"
                  >
                    {isLoading ? '生成中...' : `扩展图片（${generationCost} 积分）`}
                    {isLoading && (
                      <svg className="animate-spin -mr-1 ml-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Result Panel */}
          <div className="bg-slate-100/60 backdrop-blur-xl rounded-2xl p-6 flex flex-col justify-center items-center shadow-lg border border-slate-300/50 lg:w-3/5 flex-grow min-h-[400px] lg:min-h-0">
            <h2 className="text-2xl font-bold mb-4 text-blue-600 self-start">生成结果</h2>
            <div className="w-full h-full flex-grow flex flex-col items-center justify-center">
              {isLoading && <LoadingIndicator />}
              {!isLoading && error && (
                <div className="text-red-600 bg-red-50 border border-red-200 p-4 rounded-lg text-center">{error}</div>
              )}
              {!isLoading && !error && generatedImage && (
                <div className="space-y-4 w-full">
                  <div>
                    <p className="text-xs text-slate-600 mb-2">生成的图片（长度: {generatedImage.length}）</p>
                    <ImageViewer src={generatedImage} alt="Generated Image" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <DownloadButton imageUrl={generatedImage} />
                    <button
                      onClick={handleGenerate}
                      disabled={isLoading}
                      className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-blue-500 shadow-md flex items-center justify-center"
                    >
                      生成新方案（${generationCost} 积分）
                    </button>
                  </div>
                </div>
              )}
              {!isLoading && !error && !generatedImage && (
                <div className="text-center text-slate-600">
                  <p>您生成的图片将显示在这里。</p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

