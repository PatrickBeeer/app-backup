import React, { useState, useCallback, useEffect } from 'react';
import { AppProps } from '../../types';
import { ImageUploader } from './components/ImageUploader';
import { OptionSelector } from './components/OptionSelector';
import { GeneratedImageDisplay } from './components/GeneratedImageDisplay';
import { generateShoeImage } from './services/geminiService';
import { GENERATION_TYPES, SHOE_CATEGORIES, SHOE_MATERIALS, MODEL_STYLES, ASPECT_RATIOS } from './constants';
import type { GenerationType, ShoeCategory, ShoeMaterial, ModelStyle, ImageData, AspectRatio } from './types';

export const ShoeOutfitStylistApp: React.FC<AppProps> = ({ platform, costs }) => {
  const generationCost = costs?.GENERATE_SHOE_IMAGE ?? 10;
  const [imageData, setImageData] = useState<ImageData[] | null>(null);
  const [generationType, setGenerationType] = useState<GenerationType>(GENERATION_TYPES[0]);
  const [shoeCategory, setShoeCategory] = useState<ShoeCategory>(SHOE_CATEGORIES[0]);
  const [shoeMaterial, setShoeMaterial] = useState<ShoeMaterial>(SHOE_MATERIALS[0]);
  const [modelStyle, setModelStyle] = useState<ModelStyle>(MODEL_STYLES[0]);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(ASPECT_RATIOS[0]);
  const [customPrompt, setCustomPrompt] = useState('');
  const [seed, setSeed] = useState<number>(() => Math.floor(Math.random() * 1000000));
  const [isFineTuneOpen, setIsFineTuneOpen] = useState(false);

  const [generatedImages, setGeneratedImages] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const areControlsEnabled = imageData !== null && imageData.length > 0;

  useEffect(() => {
    const buildPrompt = () => {
        const aspectRatioNote = `重要：图片的宽高比必须严格为 ${aspectRatio}。`;
        console.log('[鞋子穿搭AI] 构建提示词 - 当前选择的图像比例:', aspectRatio);
        if (generationType === '模特图') {
            return `${aspectRatioNote}生成一张高分辨率、照片般逼真的电商模特生活照。一位${modelStyle}风格的模特穿着这双${shoeMaterial}材质的${shoeCategory}。背景应为干净、专业的影棚环境，或能够凸显鞋子的互补性户外场景。光线应明亮且具有商业感。焦点应在鞋子上，但整体画面需引人入胜且时尚。确保模特的姿势自然。请参考上传的所有图片来理解鞋子的全部细节和角度。`;
        } else if (generationType === '模特全身图') {
            return `${aspectRatioNote}生成一张高分辨率、照片般逼真的电商模特全身穿搭图。一位${modelStyle}风格的模特穿着这双${shoeMaterial}材质的${shoeCategory}，并搭配一套完整、时尚的服装。重点是展示鞋子如何融入整体造型。背景可以是时尚的城市街道、室内生活场景或简约的影棚。模特的姿势应自然且能展现全身轮廓。光线需专业，突出服装和鞋子的质感。请参考上传的所有图片来理解鞋子的全部细节和角度。`;
        } else { // 上脚图
            return `${aspectRatioNote}生成一张高分辨率、照片般逼真的电商"上脚"图。这是一张特写照片，聚焦于穿着这双${shoeMaterial}材质的${shoeCategory}的脚部。背景应为干净、极简的影棚环境或简洁、无干扰的表面，如干净的混凝土地面或木地板。光线必须专业，以突显鞋子的细节、质感和合脚度。拍摄角度应能美化鞋子。请参考上传的所有图片来理解鞋子的全部细节和角度。`;
        }
    };
    if (areControlsEnabled) {
      const prompt = buildPrompt();
      console.log('[鞋子穿搭AI] 生成的提示词预览（前200字符）:', prompt.substring(0, 200));
      setCustomPrompt(prompt);
    }
  }, [areControlsEnabled, generationType, shoeCategory, shoeMaterial, modelStyle, aspectRatio]);

  const handleImageUpload = (data: ImageData[] | null) => {
    setImageData(data);
    setGeneratedImages(null);
    setError(null);
    if (!data || data.length === 0) {
      setCustomPrompt('');
    }
  };

  const handleGenerateClick = useCallback(async () => {
    if (!imageData || imageData.length === 0) {
      setError('请先上传至少一张图片。');
      return;
    }
    if (!customPrompt.trim()) {
      setError('提示词不能为空。');
      return;
    }

    // 检查余额（不扣除）
    await platform.refreshCredits();

    if (!platform.checkBalance(generationCost)) {
      return; // 余额不足会自动显示充值弹窗
    }

    setIsLoading(true);
    setError(null);
    setGeneratedImages(null);

    try {
      console.log('[鞋子穿搭AI] 开始生成图片 - 参数:', {
        generationType,
        shoeCategory,
        shoeMaterial,
        modelStyle,
        aspectRatio: aspectRatio, // 明确记录
        aspectRatioType: typeof aspectRatio, // 记录类型
        seed,
        promptLength: customPrompt.length,
        imageCount: imageData.length
      });
      
      // 再次确认 aspectRatio 值
      console.log('[鞋子穿搭AI] 传递给 generateShoeImage 的 aspectRatio 值:', aspectRatio);
      
      const results = await generateShoeImage(imageData, {
        generationType,
        shoeCategory,
        shoeMaterial,
        modelStyle,
        aspectRatio: aspectRatio, // 明确传递
        customPrompt,
        seed,
      });

      setGeneratedImages(results);
      await platform.refreshCredits?.();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : '发生未知错误。');
    } finally {
      setIsLoading(false);
    }
  }, [imageData, generationType, shoeCategory, shoeMaterial, modelStyle, aspectRatio, customPrompt, seed, platform, generationCost]);

  const ControlsWrapper: React.FC<{ children: React.ReactNode; isDisabled: boolean }> = ({ children, isDisabled }) => (
    <div className={`transition-opacity duration-300 ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'opacity-100'}`}>
      <fieldset disabled={isDisabled} className="space-y-6">
        {children}
      </fieldset>
    </div>
  );

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

      <div className="min-h-screen font-sans bg-slate-50">
        <div className="flex items-center border-b border-slate-200 px-6 py-3 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
          <button
            onClick={platform.onBack}
            className="flex items-center text-slate-700 hover:text-blue-600 transition-colors font-medium py-1.5 px-2 rounded-lg hover:bg-slate-100"
          >
            <span className="mr-2 text-lg">←</span> 返回控制台
          </button>
        </div>
        <main className="p-4 sm:p-6 md:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-[450px_1fr] gap-8 max-w-screen-2xl mx-auto">
            {/* Control Panel */}
            <div className="lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)] flex flex-col">
              <div className="flex-grow bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 space-y-6 overflow-y-auto">
                
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold text-slate-800">上传产品图</h2>
                  <p className="text-sm text-slate-500">上传 1-3 张您的鞋子图片。</p>
                </div>
                <ImageUploader onImageUpload={handleImageUpload} />
                
                <ControlsWrapper isDisabled={!areControlsEnabled}>
                  <div className="space-y-6">
                    <h2 className="text-lg font-semibold text-slate-800">快速设置</h2>
                    <OptionSelector label="生成类型" options={GENERATION_TYPES} selected={generationType} onChange={setGenerationType as (s: string) => void} />
                    <OptionSelector label="图片比例" options={ASPECT_RATIOS} selected={aspectRatio} onChange={setAspectRatio as (s: string) => void} />
                    <OptionSelector label="鞋子品类" options={SHOE_CATEGORIES} selected={shoeCategory} onChange={setShoeCategory as (s: string) => void} />
                    <OptionSelector label="鞋子材质" options={SHOE_MATERIALS} selected={shoeMaterial} onChange={setShoeMaterial as (s: string) => void} />
                    {(generationType === '模特图' || generationType === '模特全身图') && (
                      <div className="animate-fade-in">
                        <OptionSelector label="模特风格" options={MODEL_STYLES} selected={modelStyle} onChange={setModelStyle as (s: string) => void} />
                      </div>
                    )}
                  </div>
                </ControlsWrapper>

                {/* 精准微调区域 - 移出 ControlsWrapper，允许独立编辑 */}
                <div className="pt-2">
                  <div className="border-t border-slate-200">
                    <button
                      onClick={() => setIsFineTuneOpen(!isFineTuneOpen)}
                      className="w-full flex justify-between items-center text-left text-lg font-semibold text-slate-800 pt-6 focus:outline-none"
                      aria-expanded={isFineTuneOpen}
                    >
                      <span>精准微调 (可选)</span>
                      <i className={`fas fa-chevron-down text-sm text-slate-400 transition-transform duration-300 ${isFineTuneOpen ? 'rotate-180' : ''}`}></i>
                    </button>
                  </div>

                  <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isFineTuneOpen ? 'max-h-[1000px] opacity-100 pt-6' : 'max-h-0 opacity-0'}`}>
                    <div className="space-y-6">
                      <div>
                        <h3 className="font-semibold mb-3 text-slate-700">优化提示词</h3>
                        <textarea
                            value={customPrompt}
                            onChange={(e) => setCustomPrompt(e.target.value)}
                            className="w-full h-32 bg-slate-50 rounded-xl p-3 text-slate-700 border border-slate-200/80 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all placeholder-slate-400"
                            placeholder="编辑提示词..."
                        />
                      </div>
                      <div className="pt-2">
                        <label htmlFor="seed-input" className="block font-semibold mb-3 text-slate-700">随机种子</label>
                        <div className="flex items-center gap-3">
                          <input
                            id="seed-input"
                            type="number"
                            value={seed}
                            onChange={(e) => setSeed(Number(e.target.value))}
                            className="w-full bg-slate-50 rounded-xl p-3 text-slate-700 border border-slate-200/80 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors"
                          />
                          <button
                            onClick={() => setSeed(Math.floor(Math.random() * 1000000))}
                            className="p-3 bg-slate-100 border border-slate-200/80 rounded-xl hover:bg-slate-200 transition-colors flex-shrink-0"
                            aria-label="生成新种子"
                            title="生成新种子"
                          >
                            <i className="fas fa-sync-alt text-slate-600"></i>
                          </button>
                        </div>
                         <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-xl text-sm text-purple-800 flex items-start gap-3">
                          <i className="fas fa-lightbulb mt-1 text-purple-500"></i>
                          <div>
                            <span className="font-bold">小贴士：</span>
                            种子决定了图片生成的初始随机状态。使用相同的提示词和种子，可以得到风格一致的图片。点击刷新按钮可获得一个新种子，探索不同风格。
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-6">
                <button
                  onClick={handleGenerateClick}
                  disabled={!areControlsEnabled || isLoading}
                  className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-xl text-lg transition-all duration-300 transform hover:scale-[1.02] flex items-center justify-center shadow-lg shadow-slate-900/10"
                >
                  {isLoading ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-3"></i>
                      正在生成...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-magic-wand-sparkles mr-3"></i>
                      生成图片
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Display Area */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 flex items-center justify-center min-h-[60vh] lg:min-h-[calc(100vh-8rem)] lg:sticky lg:top-24">
              <GeneratedImageDisplay 
                isLoading={isLoading} 
                error={error} 
                generatedImages={generatedImages} 
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

