import React, { useState, useCallback, useEffect } from 'react';
import { Header } from './components/Header';
import { ImageUploader } from './components/ImageUploader';
import { GeneratedImageDisplay } from './components/GeneratedImageDisplay';
import { generateModelImage, sceneDescriptions } from './services/geminiService';
import type { FileWithPreview } from './types';
import { OptionsSelector } from './components/OptionsSelector';
import { Spinner } from './components/Spinner';
import { VideoGenerationPanel } from './components/VideoGenerationPanel';
import { Sparkles, Sliders, Camera, ShieldCheck } from 'lucide-react';

export default function App() {
  const [sunglassesFile, setSunglassesFile] = useState<FileWithPreview | null>(null);
  const [generations, setGenerations] = useState<string[][]>([]);
  const [activeGenerationIndex, setActiveGenerationIndex] = useState<number>(0);
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
  const [studioMode, setStudioMode] = useState<'image' | 'video'>('image');

  const buildPrompt = useCallback(() => {
    const sceneDescription = sceneDescriptions[scene] || '在高端时尚环境中。';
    return `请严格按照以下要求创作一张逼真的时尚广告图片，宽高比必须为 ${aspectRatio}：
1.  **核心主体**: 一位时尚的${gender === 'Female' ? '女性' : '男性'}模特，自信地佩戴所提供的太阳镜。
2.  **模特特征**:
    *   **年龄**: ${age}。
    *   **人种**: ${modelStyle}。
    *   **真实感**: 必须具有极高的照片真实感。皮肤要细腻、健康且真实，仅保留尺度正确、均匀而轻微的毛孔、细小纹理和自然肤色过渡；面部主体保持干净平整，不要夸张毛孔、粗糙颗粒、痘印、油腻高光或过度锐化。同时严禁蜡像感、塑料感、磨皮滤镜感和过度平滑的人工痕迹。
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
    setGenerations([]);
    setError(null);
  }, [sunglassesFile]);

  const handleGenerate = async () => {
    if (!sunglassesFile || !prompt) return;

    setIsLoading(true);
    setError(null);

    try {
      const imageUrls = await generateModelImage(sunglassesFile, prompt, aspectRatio, seed);
      if (!imageUrls || imageUrls.length === 0) {
        throw new Error('API 未返回任何图片。请重试。');
      }
      setGenerations(prev => [imageUrls, ...prev]);
      setActiveGenerationIndex(0);
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
    setGenerations([]);
    setError(null);
    setIsLoading(false);
  };

  const handleResetPrompt = () => {
      setPrompt(buildPrompt());
  };

  return (
    <div className="flex flex-col min-h-screen text-zinc-100 antialiased selection:bg-amber-500/30 selection:text-amber-200">
      <Header />
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6" data-studio-mode={studioMode}>
        <div className="studio-workbench">
          <aside className="studio-workbench-sidebar" aria-label="创作工作台">
            <div className="studio-workbench-title">工作台</div>
            <div className="studio-mode-pills" role="tablist" aria-label="生成模式">
              <button type="button" className={studioMode === 'image' ? 'active' : ''} onClick={() => setStudioMode('image')} role="tab" aria-selected={studioMode === 'image'}>图片生成</button>
              <button type="button" className={studioMode === 'video' ? 'active' : ''} onClick={() => setStudioMode('video')} role="tab" aria-selected={studioMode === 'video'}>视频生成</button>
            </div>
          </aside>
          <div className="studio-workbench-content">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
          {/* Left Column: Controls Panel */}
          <div className="image-control-card lg:col-span-2 bg-zinc-900/80 backdrop-blur-xl rounded-3xl border border-zinc-800/80 shadow-2xl flex flex-col overflow-hidden">
            <div className="p-5 sm:p-6 space-y-6">
              {/* Step 1: Upload */}
              <div>
                <div className="flex items-center space-x-2 mb-3">
                  <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 font-mono font-bold text-xs flex items-center justify-center border border-amber-500/40">
                    1
                  </span>
                  <h2 className="text-sm font-bold text-zinc-100 tracking-tight">上传/选择墨镜产品</h2>
                </div>
                <ImageUploader
                  onImageUpload={handleImageUpload}
                  isLoading={isLoading}
                  uploadedFile={sunglassesFile}
                  onReset={handleReset}
                />
              </div>

              {/* Step 2: Customization */}
              <div className="transition-all duration-300">
                <div className="flex items-center space-x-2 mb-3">
                  <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 font-mono font-bold text-xs flex items-center justify-center border border-amber-500/40">
                    2
                  </span>
                  <h2 className="text-sm font-bold text-zinc-100 tracking-tight">定制模特试戴与光影场景</h2>
                </div>
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
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Fixed Generate Button */}
            <div className="p-5 sm:p-6 mt-auto border-t border-zinc-800 bg-zinc-950/60">
              <button
                onClick={handleGenerate}
                disabled={!sunglassesFile || isLoading}
                className="w-full flex items-center justify-center bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black py-3.5 px-5 rounded-2xl transition-all duration-300 disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-sm uppercase tracking-wider shadow-xl shadow-amber-500/10 hover:shadow-amber-500/20 active:scale-[0.99]"
              >
                {isLoading ? (
                  <>
                    <Spinner />
                    <span className="ml-2.5 text-zinc-900 font-bold">4K 大片渲染中...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2 text-black" />
                    <span>生成时尚试戴大片</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right Column: Results Display Area */}
          <div className="image-preview-card lg:col-span-3 lg:sticky lg:top-20">
            <GeneratedImageDisplay
              generations={generations}
              activeGenerationIndex={activeGenerationIndex}
              setActiveGenerationIndex={setActiveGenerationIndex}
              isLoading={isLoading}
              error={error}
              aspectRatio={aspectRatio}
            />
          </div>
            </div>
            <VideoGenerationPanel />
          </div>
        </div>
      </main>
    </div>
  );
}
