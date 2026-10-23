
import React, { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { AppProps } from '../../types';
import { 
  Image as ImageIcon, 
  Layers, 
  Cpu, 
  Sparkles, 
  AlertCircle, 
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Info,
  Square
} from 'lucide-react';
import { ImageUploader } from './components/ImageUploader';
import { SceneSelector } from './components/SceneSelector';
import { GeneratedImageViewer } from './components/GeneratedImageViewer';
import { generateImageWithGemini } from './services/geminiService';
import { SceneType, UploadedImageData, AspectRatio, ImageSize, PerspectiveType } from './types';
import { SCENE_TYPES } from './constants';
import { Spinner } from './components/Spinner';
const FIXED_COST_PER_IMAGE = 10;

export const AiExhibitionDesignApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [uploadedImage, setUploadedImage] = useState<UploadedImageData | null>(null);
  const [selectedScene, setSelectedScene] = useState<SceneType>(SCENE_TYPES[0]);
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [imageSize, setImageSize] = useState<ImageSize>('1K');
  const [perspective, setPerspective] = useState<PerspectiveType>('front');
  const [imageCount, setImageCount] = useState<number>(1);
  const [generatedImageUrls, setGeneratedImageUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    upload: false,
    sceneSelect: false,
    config: false,
    engine: false
  });

  const toggleSection = (id: string) => {
    setCollapsedSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  void costs;
  const costPerImage = FIXED_COST_PER_IMAGE;
  const expectedCost = costPerImage * imageCount;

  const handleGenerateImage = useCallback(async () => {
    if (!uploadedImage) {
      setError("请先上传美陈装置图片。");
      return;
    }

    if (selectedScene.id === 'custom-scene' && !customPrompt.trim()) {
      setError("请输入自定义场景描述。");
      return;
    }

    const actionType = 'GENERATE_PRO';

    await platform.refreshCredits?.();

    if (!platform.checkBalance(expectedCost)) {
      return;
    }

    setLoading(true);
    setError(null);
    setGeneratedImageUrls([]);

    try {
      const urls = await generateImageWithGemini(
        uploadedImage, 
        selectedScene, 
        'pro', 
        customPrompt,
        aspectRatio,
        imageSize,
        perspective,
        imageCount,
        (url) => {
          setGeneratedImageUrls(prev => [...prev, url]);
        }
      );

      await platform.refreshCredits?.();

      // Ensure final state matches returned order and deduplicates callback pushes.
      setGeneratedImageUrls(urls);
    } catch (e: any) {
      setError(e.message || "生成失败，请检查网络或重试。");
    } finally {
      setLoading(false);
    }
  }, [uploadedImage, selectedScene, customPrompt, aspectRatio, imageSize, perspective, imageCount, platform, expectedCost]);

  return (
    <div className="min-h-screen bg-[#f0f2f5] text-black selection:bg-black selection:text-white pt-6">
      <header className="px-6 pb-6">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={platform.onBack}
              className="px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-white/60 border border-white/80 hover:bg-white transition-colors"
            >
              返回
            </button>
            <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center shadow-xl">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight leading-none">美陈视觉设计师</h1>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mt-1">AI-Powered Fusion Engine</p>
            </div>
          </div>
          <div className="hidden md:flex items-center space-x-2 bg-white/40 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/40 text-[10px] font-black uppercase tracking-widest text-gray-500">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span>System Ready</span>
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-12">
        <aside className="lg:col-span-4 space-y-6">
          {/* Step 1: Upload */}
          <motion.section 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="glass-panel p-6"
          >
            <div 
              className="flex items-center justify-between mb-6 cursor-pointer group"
              onClick={() => toggleSection('upload')}
            >
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-black/5 rounded-xl flex items-center justify-center group-hover:bg-black group-hover:text-white transition-all duration-300">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-black uppercase tracking-widest">上传装置</h2>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-xs font-black text-gray-300">STEP 01</span>
                {collapsedSections.upload ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
              </div>
            </div>
            <motion.div
              initial={false}
              animate={{ 
                height: collapsedSections.upload ? 0 : 'auto',
                opacity: collapsedSections.upload ? 0 : 1,
                marginTop: collapsedSections.upload ? 0 : 24
              }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <ImageUploader onImageUpload={setUploadedImage} />
            </motion.div>
          </motion.section>

          {/* Step 2: Scene */}
          <motion.section 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-panel p-6"
          >
            <div 
              className="flex items-center justify-between mb-6 cursor-pointer group"
              onClick={() => toggleSection('sceneSelect')}
            >
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-black/5 rounded-xl flex items-center justify-center group-hover:bg-black group-hover:text-white transition-all duration-300">
                  <Layers className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-black uppercase tracking-widest">选择场景</h2>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-xs font-black text-gray-300">STEP 02</span>
                {collapsedSections.sceneSelect ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
              </div>
            </div>
            <motion.div
              initial={false}
              animate={{ 
                height: collapsedSections.sceneSelect ? 0 : 'auto',
                opacity: collapsedSections.sceneSelect ? 0 : 1,
                marginTop: collapsedSections.sceneSelect ? 0 : 24
              }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <SceneSelector 
                selectedScene={selectedScene} 
                onSelectScene={setSelectedScene} 
                customPrompt={customPrompt}
                onCustomPromptChange={setCustomPrompt}
              />
            </motion.div>
          </motion.section>

          {/* Step 3: Configuration */}
          <motion.section 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-panel p-6"
          >
            <div 
              className="flex items-center justify-between mb-6 cursor-pointer group"
              onClick={() => toggleSection('config')}
            >
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-black/5 rounded-xl flex items-center justify-center group-hover:bg-black group-hover:text-white transition-all duration-300">
                  <Square className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-black uppercase tracking-widest">比例与清晰度</h2>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-xs font-black text-gray-300">STEP 03</span>
                {collapsedSections.config ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
              </div>
            </div>

            <motion.div
              initial={false}
              animate={{ 
                height: collapsedSections.config ? 0 : 'auto',
                opacity: collapsedSections.config ? 0 : 1,
                marginTop: collapsedSections.config ? 0 : 24
              }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="overflow-hidden space-y-6"
            >
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 ml-1">
                  画布比例 / Aspect Ratio
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {(['1:1', '3:4', '4:3', '9:16', '16:9'] as AspectRatio[]).map((ratio) => (
                    <button
                      key={ratio}
                      onClick={() => setAspectRatio(ratio)}
                      className={`py-2 text-[10px] font-black rounded-xl border transition-all duration-300 ${aspectRatio === ratio ? 'bg-black text-white border-black shadow-lg' : 'bg-white/40 text-gray-400 border-white/40 hover:border-black/20'}`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 ml-1">
                  渲染视角 / Perspective
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'front', name: '正面图' },
                    { id: 'side', name: '侧视图' },
                    { id: 'top', name: '鸟瞰图' }
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPerspective(p.id as PerspectiveType)}
                      className={`py-2 text-[10px] font-black rounded-xl border transition-all duration-300 ${perspective === p.id ? 'bg-black text-white border-black shadow-lg' : 'bg-white/40 text-gray-400 border-white/40 hover:border-black/20'}`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 ml-1">
                  生成数量 / Image Count
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([1, 2, 4] as const).map((count) => (
                    <button
                      key={count}
                      onClick={() => setImageCount(count)}
                      className={`py-2 text-[10px] font-black rounded-xl border transition-all duration-300 ${imageCount === count ? 'bg-black text-white border-black shadow-lg' : 'bg-white/40 text-gray-400 border-white/40 hover:border-black/20'}`}
                    >
                      {count} 张
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 ml-1">
                  输出分辨率 / Resolution
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['1K', '2K', '4K'] as ImageSize[]).map((size) => (
                    <button
                      key={size}
                      onClick={() => setImageSize(size)}
                      className={`py-2 text-[10px] font-black rounded-xl border transition-all duration-300 ${imageSize === size ? 'bg-black text-white border-black shadow-lg' : 'bg-white/40 text-gray-400 border-white/40 hover:border-black/20'}`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.section>

          {/* Step 4: Engine */}
          <motion.section 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-panel p-6"
          >
            <div 
              className="flex items-center justify-between mb-6 cursor-pointer group"
              onClick={() => toggleSection('engine')}
            >
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-black/5 rounded-xl flex items-center justify-center group-hover:bg-black group-hover:text-white transition-all duration-300">
                  <Cpu className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-black uppercase tracking-widest">渲染引擎</h2>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-xs font-black text-gray-300">STEP 04</span>
                {collapsedSections.engine ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
              </div>
            </div>
            
            <motion.div
              initial={false}
              animate={{ 
                height: collapsedSections.engine ? 0 : 'auto',
                opacity: collapsedSections.engine ? 0 : 1,
                marginTop: collapsedSections.engine ? 0 : 24
              }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="p-4 bg-white/40 rounded-[1.5rem] border border-white/50">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black tracking-wide">高品质引擎已锁定</span>
                  <span className="text-xs font-black text-emerald-600">10 积分 / 张</span>
                </div>
              </div>

              <button
                onClick={handleGenerateImage}
                disabled={loading || !uploadedImage}
                className="btn-primary w-full mt-8 flex items-center justify-center group"
                title={`本次将扣除 ${expectedCost} 积分`}
              >
                {loading ? (
                  <div className="flex items-center space-x-3">
                    <Spinner size="sm" />
                    <span>深度渲染中...</span>
                  </div>
                ) : (
                  <>
                    <span>立即生成设计图（{expectedCost} 积分）</span>
                    <ChevronRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
              <p className="mt-3 text-[10px] text-gray-500 font-bold tracking-wide">
                计费规则：固定 10 积分/张；当前 {imageCount} 张，共 {expectedCost} 积分。
              </p>
            </motion.div>
          </motion.section>
        </aside>

        {/* Preview Area */}
        <section className="lg:col-span-8 flex flex-col min-h-[700px]">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-panel p-8 flex-grow flex flex-col relative overflow-hidden"
          >
            <div className="flex items-center justify-between mb-8 relative z-10">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-black/5 rounded-xl flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-black" />
                </div>
                <h2 className="text-sm font-black uppercase tracking-widest">设计预览</h2>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-[10px] font-black text-gray-300">FINAL RENDER</span>
              </div>
            </div>

            <div className="flex-grow flex flex-col items-center justify-center rounded-[2rem] bg-white/40 border-2 border-dashed border-white/60 relative overflow-hidden">
              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute top-8 left-8 right-8 z-30 p-4 bg-red-500 text-white rounded-2xl text-xs font-bold flex items-center shadow-2xl"
                >
                  <AlertCircle className="w-4 h-4 mr-3 flex-shrink-0" />
                  {error}
                </motion.div>
              )}

              {generatedImageUrls.length > 0 ? (
                <div className="w-full h-full">
                  <GeneratedImageViewer imageUrls={generatedImageUrls} isGenerating={loading} />
                </div>
              ) : loading ? (
                <div className="flex flex-col items-center text-center p-12">
                  <div className="relative">
                    <Spinner size="lg" />
                    <motion.div 
                      animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className="absolute inset-0 bg-black/5 rounded-full blur-2xl"
                    />
                  </div>
                  <div className="mt-12 space-y-4">
                    <p className="text-2xl font-black tracking-tight text-black">
                      PRO 深度渲染中
                    </p>
                    <p className="text-sm text-gray-400 font-medium max-w-xs leading-relaxed mx-auto">
                      {imageCount > 1
                        ? `正在逐张生成 ${imageCount} 张设计方案，已完成后会立即显示...`
                        : '正在分析装置材质透明度、高动态环境光及全局闭塞，请稍候...'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center text-center p-12">
                  <div className="w-24 h-24 bg-white/60 rounded-[2rem] flex items-center justify-center mb-8 shadow-sm">
                    <ImageIcon className="w-10 h-10 text-gray-300" />
                  </div>
                  <p className="text-sm font-bold text-gray-400 max-w-[240px] leading-relaxed">
                    完成左侧配置后，点击按钮生成商业级渲染图
                  </p>
                  <div className="mt-8 flex items-center space-x-2 text-[10px] font-black text-gray-300 uppercase tracking-widest">
                    <Info className="w-3 h-3" />
                    <span>Supported Formats: PNG, JPG</span>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="max-w-[1440px] mx-auto px-6 py-12 flex flex-col md:flex-row items-center justify-between mt-12 opacity-40">
        <p className="text-[10px] font-black uppercase tracking-[0.2em]">&copy; {new Date().getFullYear()} PRO VISUAL DESIGN AI STUDIO</p>
        <div className="flex space-x-8 mt-4 md:mt-0">
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Industry Standard</span>
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Physics Based Rendering</span>
        </div>
      </footer>
    </div>
  );
};

export default AiExhibitionDesignApp;
