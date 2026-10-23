import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AppProps } from '../../types';
import ImageUploader from './components/ImageUploader';
import GeneratedImageCard from './components/GeneratedImageCard';
import LoadingSpinner from './components/LoadingSpinner';
import { generateImages } from './services/geminiService';
import { GeneratedImage, GenerationScenario } from './types';
import { DEFAULT_ASPECT_RATIO, NUM_IMAGES_TO_GENERATE } from './constants';

const IMAGE_COST_POINTS = 10;

export const BearScarfCustomizerApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showZoomModal, setShowZoomModal] = useState<boolean>(false);
  const [currentZoomImageUrl, setCurrentZoomImageUrl] = useState<string | null>(null);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string>(DEFAULT_ASPECT_RATIO);
  const [customPrompt, setCustomPrompt] = useState<string>('');

  const lastImageId = useRef(0);

  useEffect(() => {
    if (selectedImage) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(selectedImage);
    } else {
      setImagePreviewUrl(null);
    }
  }, [selectedImage]);

  const handleImageSelected = (file: File | null) => {
    setSelectedImage(file);
    setError(null);
    setGeneratedImages([]);
  };

  const handleGenerateImage = useCallback(async (scenario: GenerationScenario) => {
    if (!selectedImage) {
      setError('请先上传围巾图片。');
      return;
    }

    if (scenario === GenerationScenario.CUSTOM && !customPrompt.trim()) {
      setError('请输入自定义提示词。');
      return;
    }

    // 检查余额（不扣除）
    if (!platform.checkBalance(IMAGE_COST_POINTS)) {
      return; // 余额不足会自动显示充值弹窗
    }

    setLoading(true);
    setError(null);
    setGeneratedImages([]);

    try {
      const imageUrls = await generateImages(
        selectedImage,
        scenario,
        selectedAspectRatio,
        scenario === GenerationScenario.CUSTOM ? customPrompt : undefined
      );

      const altText = {
        [GenerationScenario.PRODUCT]: '电商产品图',
        [GenerationScenario.COUPLE]: '情侣合拍图',
        [GenerationScenario.CUSTOM]: '自定义图片',
      }[scenario];

      const results: GeneratedImage[] = imageUrls.map((url, index) => ({
        id: `gen-image-${lastImageId.current + index}`,
        url: url,
        alt: `${altText} ${index + 1}`,
      }));

      lastImageId.current += NUM_IMAGES_TO_GENERATE;
      setGeneratedImages(results);
      await platform.refreshCredits?.();
    } catch (err: any) {
      console.error('生成失败:', err);
      setError(err.message || '生成图片失败。请重试。');
    } finally {
      setLoading(false);
    }
  }, [selectedImage, selectedAspectRatio, customPrompt, platform, costs]);

  const openZoomModal = useCallback((imageUrl: string) => {
    setCurrentZoomImageUrl(imageUrl);
    setShowZoomModal(true);
  }, []);

  const closeZoomModal = useCallback(() => {
    setShowZoomModal(false);
    setCurrentZoomImageUrl(null);
  }, []);

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <header className="bg-white/60 backdrop-blur-md border border-white/40 shadow-xl rounded-[2rem] p-6 text-center">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black tracking-tight">
            小熊围巾AI定制
          </h1>
          <p className="mt-2 text-lg text-gray-600">
            上传您的围巾图片，生成精美的产品图、情侣合拍图或自定义场景图，让您的商品更具吸引力。
          </p>
        </header>

        {/* Main Content Area */}
        <main className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Upload Section */}
          <section className="bg-white/60 backdrop-blur-md border border-white/40 shadow-xl rounded-[2rem] p-6 min-w-0">
            <h2 className="text-2xl font-bold text-black tracking-tight mb-4">1. 上传您的围巾图片</h2>
            <ImageUploader
              onImageSelected={handleImageSelected}
              currentImagePreview={imagePreviewUrl}
            />
          </section>

          {/* Generation Controls */}
          <section className="bg-white/60 backdrop-blur-md border border-white/40 shadow-xl rounded-[2rem] p-6 min-w-0">
            <h2 className="text-2xl font-bold text-black tracking-tight mb-4">2. 选择生成场景或自定义</h2>
            {/* 图片比例选择 */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">图片比例</h3>
              <div className="flex space-x-4">
                <label className="inline-flex items-center text-gray-600">
                  <input
                    type="radio"
                    className="form-radio text-indigo-600"
                    name="aspectRatio"
                    value="1:1"
                    checked={selectedAspectRatio === '1:1'}
                    onChange={(e) => setSelectedAspectRatio(e.target.value)}
                  />
                  <span className="ml-2">1:1 (正方形)</span>
                </label>
                <label className="inline-flex items-center text-gray-600">
                  <input
                    type="radio"
                    className="form-radio text-indigo-600"
                    name="aspectRatio"
                    value="3:4"
                    checked={selectedAspectRatio === '3:4'}
                    onChange={(e) => setSelectedAspectRatio(e.target.value)}
                  />
                  <span className="ml-2">3:4 (竖版)</span>
                </label>
              </div>
            </div>

            {/* 预设场景按钮 */}
            <div className="space-y-4 mb-6">
              <button
                onClick={() => handleGenerateImage(GenerationScenario.PRODUCT)}
                disabled={!selectedImage || loading}
                className="w-full flex justify-center py-3 px-6 rounded-2xl shadow-lg text-lg font-medium text-white bg-black hover:bg-gray-800 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black disabled:opacity-50 disabled:cursor-not-allowed transition-all ease-in-out duration-200"
              >
                生成产品图 (生成{NUM_IMAGES_TO_GENERATE}张)
              </button>
              <button
                onClick={() => handleGenerateImage(GenerationScenario.COUPLE)}
                disabled={!selectedImage || loading}
                className="w-full flex justify-center py-3 px-6 rounded-2xl shadow-lg text-lg font-medium text-white bg-black hover:bg-gray-800 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black disabled:opacity-50 disabled:cursor-not-allowed transition-all ease-in-out duration-200"
              >
                生成情侣合拍图 (生成{NUM_IMAGES_TO_GENERATE}张)
              </button>
            </div>

            {/* 自定义提示词区域 */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">或自定义提示词</h3>
              <textarea
                className="w-full p-3 bg-white/40 border border-white/40 rounded-2xl shadow-sm focus:ring-indigo-500 focus:border-indigo-500 mb-4 text-gray-800 resize-y min-h-[100px] hover:bg-white/70 focus:bg-white/70 transition-colors"
                placeholder="例如：一条围巾搭配时尚街头风的亚洲女生，夜晚的城市背景，氛围感拉满..."
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                aria-label="自定义图片生成提示词"
              ></textarea>
              <button
                onClick={() => handleGenerateImage(GenerationScenario.CUSTOM)}
                disabled={!selectedImage || loading || !customPrompt.trim()}
                className="w-full flex justify-center py-3 px-6 rounded-2xl shadow-lg text-lg font-medium text-white bg-black hover:bg-gray-800 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black disabled:opacity-50 disabled:cursor-not-allowed transition-all ease-in-out duration-200"
              >
                生成自定义图片 (生成{NUM_IMAGES_TO_GENERATE}张)
              </button>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg" role="alert">
                <p className="font-medium">错误:</p>
                <p>{error}</p>
              </div>
            )}
            {loading && (
              <div className="mt-4" aria-live="polite">
                <LoadingSpinner />
                <p className="text-center text-gray-600 mt-2">正在生成{NUM_IMAGES_TO_GENERATE}张图片... 这可能需要一些时间。</p>
              </div>
            )}
          </section>
        </main>

        {/* Generated Images Display */}
        {generatedImages.length > 0 && (
          <section className="bg-white/60 backdrop-blur-md border border-white/40 shadow-xl rounded-[2rem] p-6">
            <h2 className="text-2xl font-bold text-black tracking-tight mb-4">3. 您生成的图片</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {generatedImages.map((image) => (
                <GeneratedImageCard key={image.id} image={image} onZoom={openZoomModal} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Zoom Modal */}
      {showZoomModal && currentZoomImageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 backdrop-blur-sm"
          onClick={closeZoomModal}
          role="dialog"
          aria-modal="true"
          aria-label="放大图片视图"
        >
          <div className="relative max-w-4xl max-h-[90vh] mx-auto p-4" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={closeZoomModal}
              className="absolute -top-3 -right-3 sm:top-2 sm:right-2 bg-white text-gray-800 rounded-full p-2 shadow-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              aria-label="关闭图片视图"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <img src={currentZoomImageUrl} alt="放大图片" className="max-w-full max-h-full object-contain rounded-lg shadow-xl" />
          </div>
        </div>
      )}
    </div>
  );
};

