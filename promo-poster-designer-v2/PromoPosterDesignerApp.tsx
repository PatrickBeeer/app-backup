import React, { useState, useCallback } from 'react';
import { AppProps } from '../../types';
import { InputPanel } from './components/InputPanel';
import { OutputPanel } from './components/OutputPanel';
import { generatePromptAndImages } from './services/geminiService';
import type { UserInput, GeneratedImage } from './types';
import { SparklesIcon } from './components/icons/SparklesIcon';

export const PromoPosterDesignerApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);

  const handleGenerate = useCallback(async (userInput: UserInput) => {
    if (userInput.productImages.length === 0) {
      setError('请上传产品图片。');
      return;
    }
    if (userInput.aspectRatios.length === 0) {
      setError('请至少选择一个图片比例。');
      return;
    }

    // 检查余额（不扣除）
    const unitCost = (costs as any).GENERATE_IMAGE_FLASH ?? 10;
    const actionType = 'GENERATE_IMAGE_FLASH';
    const totalCost = userInput.aspectRatios.length * unitCost;
    if (!platform.checkBalance(totalCost)) {
      return; // 余额不足会自动显示充值弹窗
    }
    
    setIsLoading(true);
    setError(null);
    const initialImages = userInput.aspectRatios.map(ar => ({ aspectRatio: ar, url: null, loading: true }));
    setGeneratedImages(initialImages);

    try {
      // 生成图片并获取结果
      const results = await generatePromptAndImages(userInput, (image) => {
        setGeneratedImages(prev => 
          prev.map(img => img.aspectRatio === image.aspectRatio ? { ...image, loading: false } : img)
        );
      });
      
      // 根据请求结果判断：检查所有图片是否都成功（success === true）
      const allSuccess = results.every(result => result.success === true);
      const successCount = results.filter(result => result.success === true).length;
      const failedCount = userInput.aspectRatios.length - successCount;
      if (successCount > 0) {
        await platform.refreshCredits?.();
      }
      
      if (allSuccess) {
        setError(null);
      } else if (successCount > 0) {
        setError(`有 ${failedCount} 张图片生成失败，成功结果已保留，积分将按成功出图由服务端结算。`);
      } else {
        setError(`生成失败：${failedCount} 张图片生成失败，请重试。`);
        setGeneratedImages([]);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : '发生未知错误。');
      setGeneratedImages([]);
    } finally {
      setIsLoading(false);
    }
  }, [platform, costs]);

  const handleZoomImage = (url: string | null) => {
    if (url) {
      setZoomedImageUrl(url);
    }
  };

  const handleCloseZoom = () => {
    setZoomedImageUrl(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center border-b border-slate-200 px-6 py-3 bg-white/50 backdrop-blur-sm sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 mb-4">
          <button
            onClick={platform.onBack}
            className="flex items-center text-slate-700 hover:text-blue-600 transition-colors font-medium py-1.5 px-2 rounded-lg hover:bg-slate-100"
          >
            <span className="mr-2 text-lg">←</span> 返回控制台
          </button>
        </div>
        <header className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-2">
            <SparklesIcon className="w-8 h-8 text-purple-500"/>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-black">
              大促风格海报设计
            </h1>
          </div>
          <p className="text-lg text-slate-600">
            AI-Powered Promotional Poster Designer
          </p>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <InputPanel
            onGenerate={handleGenerate}
            isLoading={isLoading}
          />
          <OutputPanel 
            images={generatedImages}
            isLoading={isLoading}
            error={error}
            onZoom={handleZoomImage}
          />
        </main>
      </div>
      {zoomedImageUrl && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity duration-300"
          onClick={handleCloseZoom}
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <img src={zoomedImageUrl} alt="Enlarged view" className="w-auto h-auto max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" />
            <button 
              onClick={handleCloseZoom}
              className="absolute -top-3 -right-3 bg-slate-100/80 text-white rounded-full p-2 hover:bg-slate-200 transition-colors border border-slate-300"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

