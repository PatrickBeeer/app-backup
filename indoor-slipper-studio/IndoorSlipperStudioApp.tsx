import React, { useState, useCallback } from 'react';
import { AppProps } from '../../types';
import { Spinner } from './components/Spinner';
import { generateModelImage } from './services/geminiService';
import { ETHNICITY_OPTIONS, SCENE_OPTIONS, IMAGE_TYPE_OPTIONS, ASPECT_RATIO_OPTIONS } from './constants';
import type { Ethnicity, SceneStyle, ImageType, AspectRatio, FileWithPreview } from './types';
import ImageUploader from './components/ImageUploader';
import OptionSelector from './components/OptionSelector';
import ResultDisplay from './components/ResultDisplay';
import Accordion from './components/Accordion';

export const IndoorSlipperStudioApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [productImage, setProductImage] = useState<FileWithPreview | null>(null);
  const [selectedImageType, setSelectedImageType] = useState<ImageType>(IMAGE_TYPE_OPTIONS[0]);
  const [selectedEthnicity, setSelectedEthnicity] = useState<Ethnicity>(ETHNICITY_OPTIONS[0]);
  const [selectedAge, setSelectedAge] = useState<number>(25);
  const [selectedScene, setSelectedScene] = useState<SceneStyle>(SCENE_OPTIONS[0]);
  const [customScene, setCustomScene] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatio>(ASPECT_RATIO_OPTIONS[1]);
  const [generatedImageUrls, setGeneratedImageUrls] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [openAccordion, setOpenAccordion] = useState<string | null>(null);

  const handleImageUpload = useCallback((file: FileWithPreview) => {
    if (productImage) {
      URL.revokeObjectURL(productImage.preview);
    }
    setProductImage(file);
    setGeneratedImageUrls(null);
    setError(null);
  }, [productImage]);

  const handleReset = useCallback(() => {
    if (productImage) {
      URL.revokeObjectURL(productImage.preview);
    }
    setProductImage(null);
    setGeneratedImageUrls(null);
    setError(null);
    setIsLoading(false);
  }, [productImage]);

  const toggleAccordion = (title: string) => {
    setOpenAccordion(openAccordion === title ? null : title);
  };

  const handleGenerateClick = useCallback(async () => {
    if (!productImage) {
      setError('请先上传一张产品图片。');
      return;
    }

    const scene = selectedScene.value === 'custom' ? customScene : selectedScene.value;
    if (selectedScene.value === 'custom' && !scene.trim()) {
      setError('请输入自定义场景描述。');
      return;
    }

    // 检查余额（不扣除）
    if (!platform.checkBalance(costs.GENERATE_MODEL_IMAGE)) {
      return; // 余额不足会自动显示充值弹窗
    }

    setIsLoading(true);
    setError(null);
    setGeneratedImageUrls(null);

    try {
      const imageUrls = await generateModelImage(
        productImage,
        selectedEthnicity.value,
        scene,
        selectedImageType.value,
        selectedAspectRatio.value,
        selectedAge,
        customPrompt
      );

      if (!imageUrls || imageUrls.length === 0) {
        throw new Error('API 未返回任何图片。请重试。');
      }

      setGeneratedImageUrls(imageUrls);
      await platform.refreshCredits?.();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : '生成图片失败。模型可能拒绝了该请求，请尝试使用不同的图片或提示重试。');
    } finally {
      setIsLoading(false);
    }
  }, [productImage, selectedEthnicity, selectedScene, selectedImageType, selectedAspectRatio, customScene, selectedAge, customPrompt, platform, costs]);

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
      <main className="flex-grow min-h-screen gradient-bg text-slate-900">
        <div className="container mx-auto p-4 md:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Control Panel */}
            <div className="bg-white/60 backdrop-blur-md border border-white/40 shadow-xl rounded-[2rem] p-6 md:p-8 flex flex-col">
              <div className="flex-grow space-y-6">
                <ImageUploader 
                  onImageUpload={handleImageUpload}
                  isLoading={isLoading}
                  uploadedFile={productImage}
                  onReset={handleReset}
                />

                <div className="border-t border-white/40 pt-6">
                  <OptionSelector
                    title="2. 选择图片类型"
                    options={IMAGE_TYPE_OPTIONS}
                    selectedValue={selectedImageType.value}
                    onChange={(value) => setSelectedImageType(IMAGE_TYPE_OPTIONS.find(o => o.value === value) || IMAGE_TYPE_OPTIONS[0])}
                    name="imageType"
                  />
                </div>

                <div className="border-t border-white/40 pt-6">
                  <h2 className="text-xl font-semibold text-black tracking-tight mb-4">3. 选择场景风格</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {SCENE_OPTIONS.map((option) => (
                      <div key={option.value}>
                        <input
                          type="radio"
                          id={`scene-${option.value}`}
                          name="scene"
                          value={option.value}
                          checked={selectedScene.value === option.value}
                          onChange={(e) => setSelectedScene(SCENE_OPTIONS.find(o => o.value === e.target.value) || SCENE_OPTIONS[0])}
                          className="sr-only"
                        />
                        <label
                          htmlFor={`scene-${option.value}`}
                          className={`block w-full text-center py-3 px-2 rounded-xl cursor-pointer transition-all duration-200 text-sm font-medium border-0 ${
                            selectedScene.value === option.value 
                              ? 'bg-black text-white shadow-md' 
                              : 'bg-white/40 text-slate-700 hover:bg-white/60'
                          }`}
                        >
                          {option.label}
                        </label>
                      </div>
                    ))}
                  </div>
                  {selectedScene.value === 'custom' && (
                    <div className="pt-3">
                      <input
                        type="text"
                        value={customScene}
                        onChange={(e) => setCustomScene(e.target.value)}
                        placeholder="例如：阳光下的沙滩"
                        className="w-full bg-white/40 text-slate-800 placeholder-slate-500 rounded-xl border-0 focus:ring-2 focus:ring-black/50 transition duration-200 p-3"
                      />
                    </div>
                  )}
                </div>
                
                <div className="border-t border-white/40 pt-2">
                  <Accordion title="4. 高级选项" isOpen={openAccordion === 'advanced'} onToggle={() => toggleAccordion('advanced')}>
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-lg font-medium text-black mb-3">模特人种</h3>
                        <OptionSelector
                          options={ETHNICITY_OPTIONS}
                          selectedValue={selectedEthnicity.value}
                          onChange={(value) => setSelectedEthnicity(ETHNICITY_OPTIONS.find(o => o.value === value) || ETHNICITY_OPTIONS[0])}
                          name="ethnicity"
                        />
                      </div>
                      <div>
                        <h3 className="text-lg font-medium text-black mb-3">模特年龄</h3>
                        <div className="flex items-center space-x-4">
                          <input
                            type="range"
                            min="18"
                            max="50"
                            value={selectedAge}
                            onChange={(e) => setSelectedAge(Number(e.target.value))}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-black"
                          />
                          <span className="font-semibold text-black w-12 text-center bg-white/40 rounded-md py-1">{selectedAge}</span>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-lg font-medium text-black mb-3">图片比例</h3>
                        <OptionSelector
                          options={ASPECT_RATIO_OPTIONS}
                          selectedValue={selectedAspectRatio.value}
                          onChange={(value) => setSelectedAspectRatio(ASPECT_RATIO_OPTIONS.find(o => o.value === value) || ASPECT_RATIO_OPTIONS[0])}
                          name="aspectRatio"
                        />
                      </div>
                      <div>
                        <h3 className="text-lg font-medium text-black mb-3">自定义提示词 (可选)</h3>
                        <textarea
                          value={customPrompt}
                          onChange={(e) => setCustomPrompt(e.target.value)}
                          placeholder="例如：模特穿着白色的袜子，手里拿着一杯咖啡"
                          className="w-full bg-white/40 text-slate-800 placeholder-slate-500 rounded-xl border-0 focus:ring-2 focus:ring-black/50 transition duration-200 p-3 h-24"
                          rows={3}
                        />
                      </div>
                    </div>
                  </Accordion>
                </div>
              </div>
              
              <div className="pt-6 mt-auto">
                <button
                  onClick={handleGenerateClick}
                  disabled={!productImage || isLoading}
                  className="w-full flex items-center justify-center text-lg font-semibold py-4 px-6 rounded-2xl bg-black text-white disabled:bg-slate-400 disabled:cursor-not-allowed transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg disabled:hover:scale-100"
                >
                  {isLoading ? (
                    <>
                      <Spinner size="sm" />
                      <span className="ml-3">生成中...</span>
                    </>
                  ) : (
                    `✨ 生成两张图片 (消耗 ${costs.GENERATE_MODEL_IMAGE} 积分)`
                  )}
                </button>
              </div>
            </div>
            
            {/* Result Display */}
            <div className="bg-white/60 backdrop-blur-md border border-white/40 shadow-xl rounded-[2rem] p-6 md:p-8">
              <ResultDisplay 
                isLoading={isLoading}
                generatedImageUrls={generatedImageUrls}
                error={error}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

