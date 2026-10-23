import React, { useState, useCallback, useEffect } from 'react';
import { AppProps } from '../../types';
import { Spinner } from './components/Spinner';
import { ImageUploader } from './components/ImageUploader';
import { GeneratedImageDisplay } from './components/GeneratedImageDisplay';
import { OptionsSelector } from './components/OptionsSelector';
import { generateModelImage, sceneDescriptions } from './services/geminiService';
import type { FileWithPreview } from './types';

export const CooksharkSunglassesModelApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [sunglassesFile, setSunglassesFile] = useState<FileWithPreview | null>(null);
  const [generatedImageUrls, setGeneratedImageUrls] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Options State
  const [gender, setGender] = useState('Female');
  const [scene, setScene] = useState('Street');
  const [aspectRatio, setAspectRatio] = useState('3:4');
  const [modelStyle, setModelStyle] = useState('白种人');
  const [age, setAge] = useState('25-30岁');
  const [seed, setSeed] = useState<string>(() => String(Math.floor(Math.random() * 1000000)));
  const [prompt, setPrompt] = useState('');

  const buildPrompt = useCallback(() => {
    const sceneDescription = sceneDescriptions[scene] || '在高端时尚环境中。';
    return `请严格按照以下要求创作一张逼真的时尚广告图片，宽高比必须为 ${aspectRatio}：
1.  **核心主体**: 一位时尚的${gender === 'Female' ? '女性' : '男性'}模特，自信地佩戴所提供的太阳镜。
2.  **模特特征**:
    *   **年龄**: ${age}。
    *   **人种**: ${modelStyle}。
    *   **真实感**: 必须具有极高的照片真实感。皮肤需要保留自然的毛孔、纹理和细微瑕疵，严禁出现任何塑料感或过度平滑的人工痕迹。
    *   **微表情**: 模特的表情需要自然、放松，带有微妙的情绪流露（如一丝笑意、沉思的眼神），避免僵硬或不自然的姿势。
3.  **场景与光线**:
    *   **场景**: ${sceneDescription}
    *   **光线**: 模拟专业单反相机（如 Canon EOS R5 搭配 85mm f/1.2 镜头）的拍摄效果。光线必须符合逻辑且自然，能突出模特的特征和太阳镜的细节，营造出柔和的景深和电影感。
4.  **整体氛围**: 优雅、酷炫且令人向往。`;
  }, [gender, scene, aspectRatio, modelStyle, age]);

  // Effect to update prompt when options change
  useEffect(() => {
    setPrompt(buildPrompt());
  }, [buildPrompt]);

  const handleImageUpload = useCallback((file: FileWithPreview) => {
    if (sunglassesFile) {
      URL.revokeObjectURL(sunglassesFile.preview);
    }
    setSunglassesFile(file);
    setGeneratedImageUrls(null);
    setError(null);
  }, [sunglassesFile]);

  const handleGenerate = async () => {
    if (!sunglassesFile || !prompt) return;

    // 检查余额（不扣除）
    if (!platform.checkBalance(costs.GENERATE_MODEL_IMAGE)) {
      return; // 余额不足会自动显示充值弹窗
    }

    setIsLoading(true);
    setError(null);
    setGeneratedImageUrls(null);

    try {
      const imageUrls = await generateModelImage(sunglassesFile, prompt, aspectRatio, seed);
      
      if (!imageUrls || imageUrls.length === 0) {
        throw new Error('API 未返回任何图片。请重试。');
      }

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

  const handleResetPrompt = () => {
    setPrompt(buildPrompt());
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
      <main className="flex-grow container mx-auto px-4 py-8 w-full">
         <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 w-full max-w-7xl mx-auto items-start">
            {/* Left Column: Controls Panel */}
            <div className="lg:col-span-2 bg-white/60 backdrop-blur-xl rounded-[2.5rem] shadow-2xl shadow-slate-400/10 border border-white/60 flex flex-col transition-all duration-300 hover:-translate-y-1">
                <div className="p-6 sm:p-8">
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-2xl font-bold mb-4 text-slate-800 tracking-tight">创作设置</h2>
                            <ImageUploader
                                onImageUpload={handleImageUpload}
                                isLoading={isLoading}
                                uploadedFile={sunglassesFile}
                                onReset={handleReset}
                            />
                        </div>
                        <div className={`transition-opacity duration-500 ${sunglassesFile ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                            <h2 className="text-2xl font-bold mb-4 text-slate-800 tracking-tight">定制模特</h2>
                            <OptionsSelector
                                gender={gender}
                                setGender={setGender}
                                scene={scene}
                                setScene={setScene}
                                aspectRatio={aspectRatio}
                                setAspectRatio={setAspectRatio}
                                modelStyle={modelStyle}
                                setModelStyle={setModelStyle}
                                age={age}
                                setAge={setAge}
                                seed={seed}
                                setSeed={setSeed}
                                prompt={prompt}
                                setPrompt={setPrompt}
                                onResetPrompt={handleResetPrompt}
                                disabled={isLoading || !sunglassesFile}
                            />
                        </div>
                    </div>
                </div>

                {/* Fixed Generate Button */}
                <div className="flex-shrink-0 p-6 sm:p-8 mt-auto border-t border-white/60">
                    <button
                        onClick={handleGenerate}
                        disabled={!sunglassesFile || isLoading}
                        className="w-full flex items-center justify-center bg-gradient-to-r from-blue-500 to-purple-600 text-white font-bold py-4 px-4 rounded-full transition-all duration-300 disabled:from-slate-400 disabled:to-slate-500 disabled:cursor-not-allowed text-lg shadow-lg transform hover:scale-[1.03] disabled:scale-100"
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

            {/* Right Column: Results Display Area */}
            <div className="lg:col-span-3 sticky top-8 h-fit">
                <GeneratedImageDisplay
                    imageUrls={generatedImageUrls}
                    isLoading={isLoading}
                    error={error}
                    aspectRatio={aspectRatio}
                />
            </div>
        </div>
      </main>
    </div>
  );
};


