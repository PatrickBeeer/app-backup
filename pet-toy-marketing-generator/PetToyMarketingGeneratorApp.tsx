import React, { useState, useCallback, useEffect } from 'react';
import { AppProps } from '../../types';
import { Header } from './components/Header';
import { ImageUploader } from './components/ImageUploader';
import { GeneratedImagesView } from './components/GeneratedImagesView';
import { ImageModal } from './components/ImageModal';
import { fileToBase64 } from './utils/fileUtils';
import { generateImage } from './services/geminiService';
import { GenerationType, AspectRatio, SceneType } from './types';

const GlassmorphicCard: React.FC<{children: React.ReactNode, className?: string}> = ({ children, className }) => (
  <div className={`bg-white/40 backdrop-blur-xl border border-white/60 shadow-2xl rounded-[40px] p-8 transition-all duration-300 hover:-translate-y-1 ${className}`}>
    {children}
  </div>
);

const Spinner: React.FC = () => (
  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

export const PetToyMarketingGeneratorApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [productImage, setProductImage] = useState<File | null>(null);
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null);
  const [productDescription, setProductDescription] = useState<string>('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [sceneType, setSceneType] = useState<SceneType>('studio');
  const [seed, setSeed] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [isAdvancedSettingsOpen, setIsAdvancedSettingsOpen] = useState(false);
  
  const [generatedSceneImage, setGeneratedSceneImage] = useState<string | null>(null);
  const [generatedAnimalImage, setGeneratedAnimalImage] = useState<string | null>(null);
  
  const [isLoading, setIsLoading] = useState<GenerationType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  const generateRandomSeed = useCallback(() => {
    const newSeed = Math.floor(Math.random() * 1000000);
    setSeed(String(newSeed));
  }, []);

  useEffect(() => {
    generateRandomSeed();
  }, [generateRandomSeed]);

  const handleImageUpload = (file: File) => {
    setProductImage(file);
    setProductImageUrl(URL.createObjectURL(file));
    setGeneratedSceneImage(null);
    setGeneratedAnimalImage(null);
    setError(null);
  };

  const handleGenerate = useCallback(async (type: GenerationType) => {
    if (!productImage) {
      setError('请先上传一张产品图片。');
      return;
    }

    // 检查余额（不扣除）
    if (!platform.checkBalance(costs.GENERATE_IMAGE)) {
      return; // 余额不足会自动显示充值弹窗
    }

    setIsLoading(type);
    setError(null);

    try {
      const { base64, mimeType } = await fileToBase64(productImage);
      
      const descriptionText = productDescription ? ` 关于这个玩具有以下描述：${productDescription}` : '';
      const customPromptText = customPrompt ? ` ${customPrompt}` : '';
      const realismPrompt = ' 确保产品与环境无缝融合，特别注意光照、阴影、反射和纹理的真实感，力求达到照片级真实效果。';

      let scenePrompt = '';
      switch(sceneType) {
        case 'studio':
          scenePrompt = '在一个专业、干净的工作室环境中。背景应简洁，例如浅色纯色背景或木质表面，以突出产品。';
          break;
        case 'indoor':
          scenePrompt = '在一个具有ins风和奶油风质感的现代室内空间。场景要明亮、干净、有设计感，充满自然光。可以包含简约时尚的家具、绿植、艺术挂画和柔软的纺织品，营造出一种年轻人喜爱的高级、舒适且适合拍照的氛围。';
          break;
        case 'outdoor':
          scenePrompt = '在一个充满活力的户外自然环境中，例如绿草如茵的公园、金色的沙滩或整洁的后院。';
          break;
      }

      const prompt = type === GenerationType.Scene
        ? `将此宠物玩具产品放置在${scenePrompt}${descriptionText}${realismPrompt}${customPromptText}`
        : `展示一只快乐顽皮的猫或狗（根据玩具类型选择最合适的动物）正在${scenePrompt}积极地玩这个产品。${descriptionText}${realismPrompt}${customPromptText}`;
      
      const numericSeed = parseInt(seed, 10);
      const imageUrl = await generateImage(
        base64, 
        mimeType, 
        prompt, 
        aspectRatio,
        !isNaN(numericSeed) ? numericSeed : undefined
      );
      
      // extractImageFromResponse 已经返回完整的 data URL，不需要再加前缀
      if (type === GenerationType.Scene) {
        setGeneratedSceneImage(imageUrl);
      } else {
        setGeneratedAnimalImage(imageUrl);
      }
      await platform.refreshCredits?.();

    } catch (err: any) {
      console.error('Error generating image:', err);
      setError(err.message || '图片生成失败，请稍后重试。');
    } finally {
      setIsLoading(null);
    }
  }, [productImage, productDescription, aspectRatio, sceneType, seed, customPrompt, platform, costs]);

  const handleZoomImage = (imageUrl: string) => setZoomedImage(imageUrl);
  const handleCloseZoom = () => setZoomedImage(null);

  const sceneTypeOptions: { key: SceneType; label: string }[] = [
    { key: 'studio', label: '专业影棚' },
    { key: 'indoor', label: '温馨室内' },
    { key: 'outdoor', label: '活力户外' },
  ];

  return (
    <div className="min-h-screen text-slate-800 antialiased relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-0 -left-4 w-96 h-96 bg-purple-200 rounded-full mix-blend-multiply filter blur-2xl opacity-40 animate-blob"></div>
      <div className="absolute top-0 -right-4 w-96 h-96 bg-sky-200 rounded-full mix-blend-multiply filter blur-2xl opacity-40 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-20 w-96 h-96 bg-pink-200 rounded-full mix-blend-multiply filter blur-2xl opacity-40 animate-blob animation-delay-4000"></div>

      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
          {/* Left Column: Uploader and Controls */}
          <GlassmorphicCard className="space-y-6 lg:col-span-3">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-800">1. 上传产品图片</h2>
              <ImageUploader onImageUpload={handleImageUpload} imageUrl={productImageUrl} />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-800">2. (可选) 添加产品描述</h2>
              <textarea
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
                rows={3}
                className="w-full mt-1 p-3 bg-white/50 border border-white/60 rounded-2xl focus:ring-2 focus:ring-violet-400 focus:border-violet-400 transition placeholder:text-slate-400"
                placeholder="例如：猫咪喜欢追逐这个小球，它的直径大约5厘米。"
              />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-800">3. 选择图片比例</h2>
              <div className="mt-2 grid grid-cols-3 gap-3">
                {(['1:1', '3:4', '9:16'] as AspectRatio[]).map(ratio => (
                  <button 
                    key={ratio}
                    onClick={() => setAspectRatio(ratio)}
                    className={`px-4 py-2 text-sm font-medium rounded-full transition-all duration-300 ${
                      aspectRatio === ratio 
                        ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg scale-105' 
                        : 'bg-white/50 text-slate-600 hover:bg-white/80'
                    }`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-800">4. 选择场景类型</h2>
              <div className="mt-2 grid grid-cols-3 gap-3">
                {sceneTypeOptions.map(({ key, label }) => (
                  <button 
                    key={key}
                    onClick={() => setSceneType(key)}
                    className={`px-4 py-2 text-sm font-medium rounded-full transition-all duration-300 ${
                      sceneType === key
                        ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg scale-105'
                        : 'bg-white/50 text-slate-600 hover:bg-white/80'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="space-y-4 border-t border-white/60 pt-4">
              <button onClick={() => setIsAdvancedSettingsOpen(!isAdvancedSettingsOpen)} className="w-full flex justify-between items-center">
                <h2 className="text-xl font-semibold text-slate-800">5. (可选) 高级设置</h2>
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-slate-600 transition-transform duration-300 ${isAdvancedSettingsOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
              {isAdvancedSettingsOpen && (
                <div className="space-y-4 animate-fade-in">
                  <div>
                    <label htmlFor="custom-prompt-input" className="text-sm font-medium text-slate-600 block">自定义提示词</label>
                    <textarea
                      id="custom-prompt-input"
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      rows={2}
                      className="w-full mt-1 p-3 bg-white/50 border border-white/60 rounded-2xl focus:ring-2 focus:ring-violet-400 focus:border-violet-400 transition placeholder:text-slate-400"
                      placeholder="例如：特写镜头，皮克斯风格..."
                    />
                  </div>
                  <div>
                    <label htmlFor="seed-input" className="text-sm font-medium text-slate-600 block">随机种子</label>
                    <div className="flex items-center gap-2">
                      <input
                        id="seed-input"
                        type="text"
                        value={seed}
                        onChange={(e) => setSeed(e.target.value)}
                        className="w-full mt-1 p-3 bg-white/50 border border-white/60 rounded-2xl focus:ring-2 focus:ring-violet-400 focus:border-violet-400 transition placeholder:text-slate-400"
                        placeholder="留空则完全随机"
                      />
                      <button
                        onClick={generateRandomSeed}
                        className="mt-1 p-3 bg-white/50 rounded-full hover:bg-white/80 transition-all duration-300 active:scale-95"
                        aria-label="生成新种子"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-600" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                    <div className="mt-2 p-3 bg-sky-500/10 rounded-xl flex items-start gap-3 border border-sky-500/20">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-sky-600 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                      <p className="text-xs text-slate-600">
                        <strong>小贴士：</strong>使用相同的"随机种子"可以生成风格相似的图片，便于系列创作。点击刷新按钮可探索全新风格。
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4 pt-4 border-t border-white/60">
              <h2 className="text-xl font-semibold text-slate-800">6. 选择生成类型</h2>
              <button
                onClick={() => handleGenerate(GenerationType.Scene)}
                disabled={!productImage || !!isLoading}
                className="w-full bg-gradient-to-r from-sky-500 to-indigo-500 text-white font-bold py-3 px-4 rounded-full hover:scale-105 hover:shadow-lg disabled:from-slate-400 disabled:to-slate-400 disabled:opacity-70 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center"
              >
                {isLoading === GenerationType.Scene ? <Spinner /> : '生成产品场景图'}
              </button>
              <button
                onClick={() => handleGenerate(GenerationType.Animal)}
                disabled={!productImage || !!isLoading}
                className="w-full bg-gradient-to-r from-pink-500 to-orange-400 text-white font-bold py-3 px-4 rounded-full hover:scale-105 hover:shadow-lg disabled:from-slate-400 disabled:to-slate-400 disabled:opacity-70 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center"
              >
                {isLoading === GenerationType.Animal ? <Spinner /> : '生成动物玩耍图'}
              </button>
            </div>
            {error && <p className="text-red-500 text-sm mt-4 text-center">{error}</p>}
          </GlassmorphicCard>

          {/* Right Column: Generated Images */}
          <GlassmorphicCard className="lg:col-span-2">
            <h2 className="text-xl font-semibold text-slate-800 mb-6">7. 查看生成结果</h2>
            <GeneratedImagesView
              sceneImage={generatedSceneImage}
              animalImage={generatedAnimalImage}
              isLoading={isLoading}
              onZoom={handleZoomImage}
            />
          </GlassmorphicCard>
        </div>
      </main>
      {zoomedImage && <ImageModal imageUrl={zoomedImage} onClose={handleCloseZoom} />}
      <style>{`
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 { animation-delay: 2s; }
        .animation-delay-4000 { animation-delay: 4s; }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

