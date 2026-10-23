import React, { useState } from 'react';
import { AppProps } from '../../types';
import { Header } from './components/Header';
import { UploadZone } from './components/UploadZone';
import { Controls } from './components/Controls';
import { Gallery } from './components/Gallery';
import { ImageEditor } from './components/ImageEditor';
import { AgeGroup, Ethnicity, GenerationStatus, GeneratedImage, AspectRatio, EditOptions, SceneStyle, CompositionRatio, ImageResolution } from './types';
import { generateProductScenes, refineProductScene } from './services/geminiService';

export const KidsStrollerAIStudioApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [ageGroup, setAgeGroup] = useState<AgeGroup>(AgeGroup.PRESCHOOL);
  const [ethnicity, setEthnicity] = useState<Ethnicity>(Ethnicity.CAUCASIAN);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [resolution, setResolution] = useState<ImageResolution>('2K');
  const [sceneStyle, setSceneStyle] = useState<SceneStyle>(SceneStyle.OUTDOOR);
  const [compositionRatio, setCompositionRatio] = useState<CompositionRatio>(CompositionRatio.BALANCED);
  const [productSize, setProductSize] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [seed, setSeed] = useState<number>(Math.floor(Math.random() * 2000000000));
  const [status, setStatus] = useState<GenerationStatus>('idle');
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingImage, setEditingImage] = useState<GeneratedImage | null>(null);
  const [isRefining, setIsRefining] = useState(false);

  const cost = costs?.GENERATE_SCENE_IMAGE ?? 20;

  const handleGenerate = async () => {
    if (!imageBase64) return;
    await platform.refreshCredits();
    if (!platform.checkBalance(cost)) return;

    setStatus('generating');
    setErrorMessage(null);
    setGeneratedImages([]);

    try {
      const imageUrls = await generateProductScenes(
        imageBase64,
        ageGroup,
        ethnicity,
        aspectRatio,
        resolution,
        sceneStyle,
        compositionRatio,
        productSize,
        customPrompt,
        seed
      );

      const newImages: GeneratedImage[] = imageUrls.map((url, index) => ({
        id: Date.now().toString() + index,
        url,
        createdAt: Date.now(),
      }));

      if (newImages.length === 0) {
        throw new Error("模型未返回图片。");
      }

      setGeneratedImages(newImages);
      await platform.refreshCredits?.();
      setStatus('success');
    } catch (error: any) {
      console.error(error);
      setStatus('error');
      setErrorMessage("无法生成场景。模型可能繁忙，或者图片内容无法识别，请重试。");
    }
  };

  const handleRefine = async (options: EditOptions) => {
    if (!editingImage) return;
    setIsRefining(true);
    try {
      const newImageUrl = await refineProductScene(editingImage.url, options, aspectRatio);
      const newImage: GeneratedImage = { id: Date.now().toString(), url: newImageUrl, createdAt: Date.now() };
      setGeneratedImages((prev) => [newImage, ...prev]);
      setEditingImage(null);
      setStatus('success');
    } catch (error: any) {
      console.error("Refine failed", error);
      alert("微调失败: " + (error.message || "未知错误"));
    } finally {
      setIsRefining(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f0f2f5] bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-purple-100/60 via-blue-50/40 to-pink-100/40 font-sans text-gray-800">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4 px-4 pt-4">
        <button onClick={platform.onBack} className="text-slate-700 hover:text-blue-600 transition-colors font-medium py-1.5 px-2 rounded-lg hover:bg-slate-100">
          <span className="mr-2 text-lg">←</span> 返回控制台
        </button>
      </div>
      <Header />

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          <div className="lg:col-span-4 space-y-8 sticky top-24">
            <div className="lg:hidden mb-6">
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">创作工坊</h1>
              <p className="text-gray-500">秒级生成惊艳视觉大片。</p>
            </div>
            <UploadZone onImageSelected={setImageBase64} selectedImage={imageBase64} />
            <Controls
              ageGroup={ageGroup}
              setAgeGroup={setAgeGroup}
              ethnicity={ethnicity}
              setEthnicity={setEthnicity}
              aspectRatio={aspectRatio}
              setAspectRatio={setAspectRatio}
              resolution={resolution}
              setResolution={setResolution}
              sceneStyle={sceneStyle}
              setSceneStyle={setSceneStyle}
              compositionRatio={compositionRatio}
              setCompositionRatio={setCompositionRatio}
              productSize={productSize}
              setProductSize={setProductSize}
              customPrompt={customPrompt}
              setCustomPrompt={setCustomPrompt}
              seed={seed}
              setSeed={setSeed}
              onGenerate={handleGenerate}
              status={status}
              disabled={!imageBase64}
            />
            {status === 'error' && errorMessage && (
              <div className="bg-red-50/50 backdrop-blur-md text-red-700 p-6 rounded-3xl text-sm flex items-start gap-3 border border-red-100/50">
                <i className="fa-solid fa-circle-exclamation mt-0.5"></i>
                <p>{errorMessage}</p>
              </div>
            )}
          </div>
          <div className="lg:col-span-8 min-h-[500px]">
            {status === 'idle' && generatedImages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 bg-white/40 backdrop-blur-md rounded-[2.5rem] border border-white/40 p-12 min-h-[600px] transition-all">
                <div className="w-24 h-24 bg-white/60 rounded-full flex items-center justify-center mb-8 shadow-sm">
                  <i className="fa-solid fa-wand-sparkles text-3xl text-gray-300"></i>
                </div>
                <h2 className="text-3xl font-bold text-gray-900 mb-4 tracking-tight">准备好开始创作了吗？</h2>
                <p className="max-w-md text-center text-gray-500 leading-relaxed">上传您的产品图片，开始使用 AI 生成电影级电商场景。</p>
              </div>
            ) : (
              <Gallery images={generatedImages} isLoading={status === 'generating'} aspectRatio={aspectRatio} onEdit={(img) => setEditingImage(img)} />
            )}
          </div>
        </div>
      </main>

      {editingImage && (
        <ImageEditor image={editingImage} onClose={() => setEditingImage(null)} onGenerate={handleRefine} isProcessing={isRefining} />
      )}
    </div>
  );
};
