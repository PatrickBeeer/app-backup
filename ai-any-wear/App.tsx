import React, { useState, useCallback } from 'react';
import { AppProps } from '../../types';
import ProductImageUpload from './components/ProductImageUpload';
import ImageGallery from './components/ImageGallery';
import { generateCombinedWearingImage } from './services/geminiService';
import { ASPECT_RATIO_OPTIONS, IMAGE_QUANTITY_OPTIONS, GENDER_OPTIONS, DEFAULT_WEARING_PROMPT, CAMERA_ANGLE_DESCRIPTIONS } from './constants';
import { AspectRatio, GeneratedImage, ImageQuantity, ProductImageInfo, Gender } from './types';

export const AiAnyWearApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [selectedProductImageInfos, setSelectedProductImageInfos] = useState<ProductImageInfo[]>([]);
  const [prompt, setPrompt] = useState<string>('');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatio>(AspectRatio.SQUARE);
  const [selectedQuantity, setSelectedQuantity] = useState<ImageQuantity>(ImageQuantity.ONE);
  const [selectedGender, setSelectedGender] = useState<Gender>(Gender.UNSPECIFIED);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const costPerImage = costs.GENERATE_ANY_WEAR ?? 10;
  const totalCost = costPerImage * selectedQuantity;

  const handleGenerateImages = useCallback(async () => {
    if (selectedProductImageInfos.length === 0) {
      setError('请至少上传一张商品图片。');
      return;
    }

    // 检查余额（不扣除）
    if (!platform.checkBalance(totalCost)) {
      return; // 余额不足会自动显示充值弹窗
    }

    setIsLoading(true);
    setError(null);
    setGeneratedImages([]);

    const allGenerated: GeneratedImage[] = [];

    try {
      for (let i = 0; i < selectedQuantity; i++) {
        let iterationPrompt = prompt;

        // Add camera angle variation if generating multiple images
        if (selectedQuantity > 1 && CAMERA_ANGLE_DESCRIPTIONS.length > 0) {
          const angleIndex = i % CAMERA_ANGLE_DESCRIPTIONS.length;
          const angleDescription = CAMERA_ANGLE_DESCRIPTIONS[angleIndex];
          if (iterationPrompt.trim()) {
            iterationPrompt = `${iterationPrompt}，${angleDescription}`;
          } else {
            iterationPrompt = `${DEFAULT_WEARING_PROMPT}，${angleDescription}`;
          }
        } else if (!iterationPrompt.trim()) {
          iterationPrompt = DEFAULT_WEARING_PROMPT;
        }

        try {
          const imagesForThisIteration = await generateCombinedWearingImage({
            prompt: iterationPrompt,
            productImageInfos: selectedProductImageInfos,
            aspectRatio: selectedAspectRatio,
            gender: selectedGender,
          });
          allGenerated.push(...imagesForThisIteration);
        } catch (err: any) {
          console.error(`生成第 ${i + 1} 张组合图片失败:`, err);
          setError(`生成第 ${i + 1} 张组合图片失败: ${err.message || '未知错误'}`);
          setIsLoading(false);
          return;
        }
      }
      setGeneratedImages(allGenerated);
      await platform.refreshCredits?.();
    } catch (err: any) {
      console.error('批量生成图片失败:', err);
      setError(err.message || '批量生成图片过程中发生未知错误。');
    } finally {
      setIsLoading(false);
    }
  }, [selectedProductImageInfos, prompt, selectedAspectRatio, selectedQuantity, selectedGender, platform, costs]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-20 font-sans">
      <div className="flex items-center border-b border-slate-200 px-6 py-3 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <button
          onClick={platform.onBack}
          className="flex items-center text-slate-700 hover:text-blue-600 transition-colors font-medium py-1.5 px-2 rounded-lg hover:bg-slate-100"
        >
          <span className="mr-2 text-lg">←</span> 返回控制台
        </button>
      </div>

      <main className="container mx-auto px-4 py-8 w-full max-w-7xl">
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-2">万物穿戴 - 电商AI图片助手</h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">上传多张商品图，即可获得模特同时穿戴所有商品的真人效果图</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Controls Section */}
          <section className="lg:col-span-1 bg-white/80 backdrop-blur-sm border border-slate-200 rounded-xl p-6 flex flex-col gap-6 sticky lg:top-20 h-fit shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 border-b border-slate-200 pb-3">生成设置</h2>

            {/* Product Image Upload */}
            <div className="flex flex-col">
              <label className="block text-sm font-semibold text-slate-700 mb-2">商品图片 (多张)</label>
              <ProductImageUpload
                onImagesChange={setSelectedProductImageInfos}
                selectedProductImageInfos={selectedProductImageInfos}
                isLoading={isLoading}
                maxImages={4}
              />
            </div>

            {/* Prompt Input */}
            <div className="flex flex-col">
              <label className="block text-sm font-semibold text-slate-700 mb-2">提示词 (可选)</label>
              <textarea
                className="block w-full px-3 py-2 bg-white border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-slate-800 placeholder-slate-500 text-sm resize-y min-h-[80px]"
                placeholder="例如：年轻女性穿着白色运动鞋、蓝色包包，在街道上行走，侧面视角"
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  setError(null);
                }}
                disabled={isLoading}
              />
            </div>

            {/* Gender Selection */}
            <div className="flex flex-col">
              <label className="block text-sm font-semibold text-slate-700 mb-2">模特性别</label>
              <div className="grid grid-cols-3 gap-2">
                {GENDER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                      selectedGender === option.value
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    } focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50`}
                    onClick={() => setSelectedGender(option.value)}
                    disabled={isLoading}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Aspect Ratio Selection */}
            <div className="flex flex-col">
              <label className="block text-sm font-semibold text-slate-700 mb-2">生成比例</label>
              <div className="grid grid-cols-2 gap-2">
                {ASPECT_RATIO_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                      selectedAspectRatio === option.value
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    } focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50`}
                    onClick={() => setSelectedAspectRatio(option.value)}
                    disabled={isLoading}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Image Quantity Selection */}
            <div className="flex flex-col">
              <label className="block text-sm font-semibold text-slate-700 mb-2">生成数量</label>
              <div className="grid grid-cols-3 gap-2">
                {IMAGE_QUANTITY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                      selectedQuantity === option.value
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    } focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50`}
                    onClick={() => setSelectedQuantity(option.value)}
                    disabled={isLoading}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerateImages}
              className={`w-full py-3 px-4 rounded-lg text-base font-bold transition-all ${
                isLoading || selectedProductImageInfos.length === 0
                  ? 'bg-slate-400 text-white cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white hover:shadow-md'
              } focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50`}
              disabled={isLoading || selectedProductImageInfos.length === 0}
              aria-busy={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  正在生成...
                </span>
              ) : (
                `生成穿戴图 (${costPerImage} 积分/张，共 ${totalCost} 积分)`
              )}
            </button>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                <span>{error}</span>
              </div>
            )}
          </section>

          {/* Results Section */}
          <section className="lg:col-span-2 bg-white/80 backdrop-blur-sm border border-slate-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 border-b border-slate-200 pb-3 mb-4">生成结果</h2>
            {isLoading && (
              <div className="flex items-center justify-center p-12 text-slate-600">
                <svg className="animate-spin -ml-1 mr-3 h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                AI 正在努力生成您的组合穿戴图片，请耐心等待...
              </div>
            )}
            <ImageGallery images={generatedImages} />
          </section>
        </div>
      </main>
    </div>
  );
};

export default AiAnyWearApp;
