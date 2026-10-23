import React, { useState, useCallback, useEffect } from 'react';
import { AppProps } from '../../types';
import { Scene, DEFAULT_SOURCE_IMAGE_URL } from './constants';
import { fileToInfo, urlToBase64 } from './utils/imageUtils';
import { generateMockup } from './services/geminiService';
import { SceneSelector } from './components/SceneSelector';
import { ImageDisplay } from './components/ImageDisplay';
import { Loader } from './components/Loader';
import { ImageUploader } from './components/ImageUploader';
import { ImageModal } from './components/ImageModal';
import { CustomSceneModal } from './components/CustomSceneModal';

interface SourceImageInfo {
  base64: string;
  mimeType: string;
}

interface HistoryItem {
  id: string;
  url: string;
  sceneName: string;
  timestamp: number;
}

const GENERATED_IMAGE_COUNT = 2;

export const AiAdMaterialGeneratorApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [sourceImageInfo, setSourceImageInfo] = useState<SourceImageInfo | null>(null);
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);
  const [refImageInfo, setRefImageInfo] = useState<SourceImageInfo | null>(null);
  const [refImageUrl, setRefImageUrl] = useState<string | null>(null);
  const [useRefImage, setUseRefImage] = useState<boolean>(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<string>('1:1');
  const [dimensions, setDimensions] = useState<string>('');
  const [material, setMaterial] = useState<string>('');
  const [productType, setProductType] = useState<string>('wall');
  const [smartRecognition, setSmartRecognition] = useState<boolean>(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);

  const costPerImage = costs?.GENERATE_EFFECT_IMAGE ?? 9;
  const totalCostPerRun = costPerImage * GENERATED_IMAGE_COUNT;

  useEffect(() => {
    const initializeSourceImage = async () => {
      try {
        if (!DEFAULT_SOURCE_IMAGE_URL) return;
        setError(null);
        const { base64, mimeType } = await urlToBase64(DEFAULT_SOURCE_IMAGE_URL);
        const dataUrl = `data:${mimeType};base64,${base64}`;
        setSourceImageInfo({ base64, mimeType });
        setSourceImageUrl(dataUrl);
      } catch (err) {
        console.error('Failed to load default image. The app will proceed without it.', err);
      } finally {
        setIsInitializing(false);
      }
    };
    initializeSourceImage();
  }, []);

  const handleImageUpload = useCallback(async (file: File) => {
    if (!file) return;
    setIsProcessing(true);
    setError(null);
    setGeneratedImages([]);
    try {
      const { base64, mimeType, dataUrl } = await fileToInfo(file);
      setSourceImageInfo({ base64, mimeType });
      setSourceImageUrl(dataUrl);
    } catch (err) {
      setError('图片处理失败，请选择其他图片。');
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleRefImageUpload = useCallback(async (file: File) => {
    if (!file) return;
    try {
      const { base64, mimeType, dataUrl } = await fileToInfo(file);
      setRefImageInfo({ base64, mimeType });
      setRefImageUrl(dataUrl);
    } catch (err) {
      console.error('Failed to process reference image', err);
    }
  }, []);

  const performGeneration = useCallback(async (promptText: string, sceneName: string) => {
    if (!sourceImageInfo) {
      setError('原图尚未加载完成或处理失败。');
      return;
    }
    if (!platform.checkBalance(totalCostPerRun)) return;

    setIsProcessing(true);
    setError(null);
    const activeRefImage = useRefImage ? refImageInfo : null;

    try {
      const generationPromises = [
        generateMockup(sourceImageInfo.base64, sourceImageInfo.mimeType, promptText, aspectRatio, productType, dimensions, material, smartRecognition, activeRefImage),
        generateMockup(sourceImageInfo.base64, sourceImageInfo.mimeType, promptText, aspectRatio, productType, dimensions, material, smartRecognition, activeRefImage),
      ];
      const newImages = await Promise.all(generationPromises);
      const validImages = newImages.filter((img) => img);
      if (validImages.length === 0) {
        setError('生成失败，未产生有效图片，未扣费。');
        setIsProcessing(false);
        return;
      }

      setGeneratedImages((prev) => [...validImages, ...prev]);
      const newHistoryItems = validImages.map((url) => ({
        id: Date.now().toString() + Math.random().toString().slice(2, 8),
        url,
        sceneName,
        timestamp: Date.now(),
      }));
      setHistory((prev) => [...newHistoryItems, ...prev]);
      await platform.refreshCredits?.();
    } catch (err: any) {
      setError(err?.message || '生成过程中发生未知错误。');
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  }, [sourceImageInfo, aspectRatio, dimensions, material, productType, smartRecognition, refImageInfo, useRefImage, platform, totalCostPerRun]);

  const handleSceneSelect = useCallback(
    async (scene: Scene) => {
      if (scene.id === 'custom') setIsCustomModalOpen(true);
      else await performGeneration(scene.prompt, scene.name);
    },
    [performGeneration]
  );

  const handleCustomSubmit = useCallback(
    async (prompt: string) => {
      setIsCustomModalOpen(false);
      await performGeneration(prompt, '自定义场景');
    },
    [performGeneration]
  );

  const busy = isInitializing || isProcessing;

  return (
    <div className="min-h-screen bg-white font-sans relative overflow-x-hidden selection:bg-lime-300 selection:text-black">
      {busy && <Loader isInitializing={isInitializing} />}
      <div className="fixed top-[-10%] right-[-10%] w-[500px] h-[500px] bg-lime-300 rounded-full blur-3xl opacity-20 pointer-events-none z-0"></div>
      <div className="fixed bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-blue-400 rounded-full blur-3xl opacity-10 pointer-events-none z-0"></div>

      <div className="relative z-10 flex flex-col md:flex-row min-h-screen">
        <div className="w-full md:w-[40%] lg:w-[35%] bg-lime-300 p-6 md:p-12 border-b md:border-b-0 md:border-r border-black flex flex-col">
          <header className="mb-12">
            <div className="inline-block bg-black text-lime-300 px-3 py-1 text-xs font-bold uppercase tracking-widest mb-4">公测版 v1.0</div>
            <h1 className="text-6xl lg:text-7xl font-black tracking-tighter text-black leading-[0.9] mb-6">智能<br />效果图生成</h1>
            <p className="text-lg font-medium text-black/80 max-w-md leading-relaxed">为广告物料一键生成极度逼真的场景效果图。</p>
          </header>

          <div className="space-y-8 flex-1">
            <div className="space-y-4">
              <h2 className="text-2xl font-bold tracking-tight text-black flex items-center gap-2">
                <span className="w-6 h-6 bg-black text-lime-300 rounded-full flex items-center justify-center text-sm">1</span>上传素材
              </h2>
              <div className="bg-white border border-black p-1 shadow-hard-sm transition-transform hover:-translate-y-0.5">
                <ImageUploader onImageUpload={handleImageUpload} isLoading={busy} previewUrl={sourceImageUrl} label="上传物料原图" />
              </div>
            </div>

            <div className="space-y-6">
              <h2 className="text-2xl font-bold tracking-tight text-black flex items-center gap-2">
                <span className="w-6 h-6 bg-black text-lime-300 rounded-full flex items-center justify-center text-sm">2</span>参数配置
              </h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-white border border-black p-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-black">智能识别主体</span>
                    <span className="text-xs text-gray-500">自动去除原图多余背景</span>
                  </div>
                  <button onClick={() => setSmartRecognition(!smartRecognition)} disabled={busy} className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 ease-in-out border border-black ${smartRecognition ? 'bg-black' : 'bg-gray-200'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${smartRecognition ? 'translate-x-6' : 'translate-x-0'}`}></div>
                  </button>
                </div>

                <div className="bg-white border border-black p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-black">风格/场景参考</span>
                      <span className="text-xs text-gray-500">上传图片作为场景参考(可选)</span>
                    </div>
                    <button onClick={() => setUseRefImage(!useRefImage)} disabled={busy} className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 ease-in-out border border-black ${useRefImage ? 'bg-black' : 'bg-gray-200'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${useRefImage ? 'translate-x-6' : 'translate-x-0'}`}></div>
                    </button>
                  </div>
                  {useRefImage && (
                    <div className="pt-2 animate-fade-in">
                      <ImageUploader onImageUpload={handleRefImageUpload} isLoading={busy} previewUrl={refImageUrl} compact={true} label="上传参考图" />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-black/70">画面比例</label>
                  <div className="flex border border-black bg-white">
                    {['1:1', '3:4', '16:9'].map((ratio) => (
                      <button key={ratio} onClick={() => setAspectRatio(ratio)} disabled={busy || !sourceImageInfo} className={`flex-1 py-3 text-sm font-bold border-r border-black last:border-r-0 transition-all ${aspectRatio === ratio ? 'bg-black text-lime-300' : 'bg-white text-black hover:bg-gray-100'} disabled:opacity-50`}>{ratio}</button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-black/70">物料形态</label>
                  <div className="flex border border-black bg-white">
                    {[{ id: 'wall', label: '贴墙/挂式' }, { id: 'standing', label: '落地立牌' }, { id: 'outdoor', label: '大型户外' }].map((type) => (
                      <button key={type.id} onClick={() => setProductType(type.id)} disabled={busy || !sourceImageInfo} className={`flex-1 py-3 text-xs md:text-sm font-bold border-r border-black last:border-r-0 transition-all ${productType === type.id ? 'bg-black text-lime-300' : 'bg-white text-black hover:bg-gray-100'} disabled:opacity-50`}>{type.label}</button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="dimensions-input" className="block text-xs font-bold uppercase tracking-wider mb-2 text-black/70">物理尺寸</label>
                  <input id="dimensions-input" type="text" value={dimensions} onChange={(e) => setDimensions(e.target.value)} placeholder="例如: 30cm x 20cm 或 1.8m高" disabled={busy || !sourceImageInfo} className="w-full bg-white border border-black p-4 text-black placeholder-gray-400 focus:outline-none focus:ring-4 focus:ring-black/10 disabled:opacity-50 font-medium" />
                </div>
                <div>
                  <label htmlFor="material-input" className="block text-xs font-bold uppercase tracking-wider mb-2 text-black/70">表面材质</label>
                  <input id="material-input" type="text" value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="例如: 拉丝不锈钢、亚克力" disabled={busy || !sourceImageInfo} className="w-full bg-white border border-black p-4 text-black placeholder-gray-400 focus:outline-none focus:ring-4 focus:ring-black/10 disabled:opacity-50 font-medium" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 bg-white p-6 md:p-12 overflow-y-auto">
          {error && (
            <div className="mb-8 bg-red-50 border border-red-500 text-red-600 px-6 py-4 font-medium flex items-center gap-3">
              <span className="text-xl">!</span>{error}
            </div>
          )}

          <section className="mb-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold tracking-tight text-black flex items-center gap-2">
                <span className="w-6 h-6 bg-black text-white rounded-full flex items-center justify-center text-sm">3</span>场景选择
              </h2>
              {sourceImageUrl && <div className="hidden sm:block w-16 h-16 border border-gray-200 p-1"><img src={sourceImageUrl} alt="Source" className="w-full h-full object-contain" /></div>}
            </div>
            <SceneSelector onSelectScene={handleSceneSelect} isLoading={busy || !sourceImageInfo} />
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold tracking-tight text-black mb-8 flex items-center gap-2">
              <span className="w-6 h-6 bg-black text-white rounded-full flex items-center justify-center text-sm">4</span>生成结果
            </h2>
            <ImageDisplay generatedImages={generatedImages} onImageSelect={setSelectedImage} waitingText={`等待生成结果 ${totalCostPerRun}积分/次`} />
          </section>

          {history.length > 0 && (
            <section className="border-t border-gray-100 pt-8">
              <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gray-300"></span>历史记录 ({history.length})
              </h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                {history.map((item) => (
                  <div key={item.id} onClick={() => setSelectedImage(item.url)} className="group relative aspect-square bg-gray-50 border border-gray-100 cursor-pointer overflow-hidden hover:border-black transition-colors">
                    <img src={item.url} alt={item.sceneName} className="w-full h-full object-cover" />
                    <div className="absolute inset-x-0 bottom-0 bg-black/70 p-1 translate-y-full group-hover:translate-y-0 transition-transform">
                      <p className="text-[10px] text-white truncate text-center">{item.sceneName}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {selectedImage && <ImageModal imageUrl={selectedImage} onClose={() => setSelectedImage(null)} />}
      <CustomSceneModal isOpen={isCustomModalOpen} onClose={() => setIsCustomModalOpen(false)} onSubmit={handleCustomSubmit} />
    </div>
  );
};
