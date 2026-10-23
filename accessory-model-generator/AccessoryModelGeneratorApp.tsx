import React, { useState, useCallback } from 'react';
import { AppProps } from '../../types';
import { AccessoryType } from './types';
import { generateTryOnImage } from './services/geminiService';
import { fileToBase64 } from './utils/fileUtils';
import Header from './components/Header';
import ImageUploader from './components/ImageUploader';
import ResultDisplay from './components/ResultDisplay';
import { SparklesIcon } from './components/icons/SparklesIcon';

export const AccessoryModelGeneratorApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [productImage, setProductImage] = useState<File | null>(null);
  const [modelImage, setModelImage] = useState<File | null>(null);
  const [accessoryType, setAccessoryType] = useState<AccessoryType>(AccessoryType.Earring);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!productImage || !modelImage) {
      setError('请同时上传商品和模特图片。');
      return;
    }

    // 检查余额（不扣除）
    const actionType = 'GENERATE_IMAGE';
    const cost = costs[actionType] ?? 10;
    if (!platform.checkBalance(cost)) {
      return; // 余额不足会自动显示充值弹窗
    }

    setIsLoading(true);
    setError(null);
    setGeneratedImage(null);

    try {
      const [productImageB64Data, modelImageB64Data] = await Promise.all([
        fileToBase64(productImage),
        fileToBase64(modelImage)
      ]);

      const resultImage = await generateTryOnImage(
        productImageB64Data.base64,
        productImageB64Data.mimeType,
        modelImageB64Data.base64,
        modelImageB64Data.mimeType,
        accessoryType
      );
      
      setGeneratedImage(resultImage);
      await platform.refreshCredits?.();

    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : '发生未知错误。');
    } finally {
      setIsLoading(false);
    }
  }, [productImage, modelImage, accessoryType, platform, costs]);

  const canGenerate = productImage && modelImage && !isLoading;
  const actionType = 'GENERATE_IMAGE';
  const cost = costs[actionType] ?? 10;

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 font-sans text-slate-800">
      {/* Decorative Orbs */}
      <div className="absolute top-0 -left-10 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-2xl opacity-50 animate-blob"></div>
      <div className="absolute top-0 -right-10 w-72 h-72 bg-pink-200 rounded-full mix-blend-multiply filter blur-2xl opacity-50 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-16 left-20 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-2xl opacity-50 animate-blob animation-delay-4000"></div>
      
      <div className="relative z-10">
        <Header />
        <main className="container mx-auto p-4 md:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Input Section */}
            <div className="bg-white/40 backdrop-blur-xl border border-white/60 p-6 rounded-[2.5rem] shadow-2xl flex flex-col gap-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_25px_60px_-15px_rgba(96,73,130,0.2)]">
              <h2 className="text-2xl font-bold text-slate-900">1. 上传图片</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ImageUploader title="商品图片" onImageUpload={setProductImage} />
                <ImageUploader title="模特图片" onImageUpload={setModelImage} />
              </div>
              
              <div className="mt-4 space-y-4">
                <div>
                  <label htmlFor="accessoryType" className="block text-lg font-semibold text-slate-900 mb-2 px-2">
                    2. 选择饰品类型
                  </label>
                  <select
                    id="accessoryType"
                    value={accessoryType}
                    onChange={(e) => setAccessoryType(e.target.value as AccessoryType)}
                    className="w-full p-3 bg-white/50 border border-white/60 rounded-full shadow-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition"
                  >
                    {Object.values(AccessoryType).map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="mt-auto pt-6">
                <button
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-bold py-4 px-6 rounded-full shadow-lg hover:shadow-xl disabled:bg-slate-300 disabled:bg-none disabled:cursor-not-allowed disabled:shadow-none transition-all duration-300 ease-in-out transform hover:scale-105 disabled:transform-none"
                >
                  <SparklesIcon className="w-6 h-6" />
                  <span>{isLoading ? '生成中...' : `虚拟试戴 · ${cost} 积分/次`}</span>
                </button>
              </div>

            </div>

            {/* Output Section */}
            <div className="bg-white/40 backdrop-blur-xl border border-white/60 p-6 rounded-[2.5rem] shadow-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_25px_60px_-15px_rgba(96,73,130,0.2)]">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">3. 查看效果</h2>
              <ResultDisplay image={generatedImage} isLoading={isLoading} error={error} />
            </div>
          </div>
        </main>
        <footer className="text-center py-6 text-slate-500 text-sm">
        </footer>
      </div>
    </div>
  );
};

