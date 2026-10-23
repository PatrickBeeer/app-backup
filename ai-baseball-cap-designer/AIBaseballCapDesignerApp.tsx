import React, { useState, useCallback } from 'react';
import { AppProps } from '../../types';
import { ImageUploader } from './components/ImageUploader';
import { DesignGallery } from './components/DesignGallery';
import { TechPackView } from './components/TechPackView';
import { GenerationSteps, Step } from './components/GenerationSteps';
import { generateDesigns, generateTechPack, generateMaterialsList } from './services/geminiService';
import type { GeneratedDesign, Material } from './types';

type AppState = 'upload' | 'generating_designs' | 'show_designs' | 'generating_pack' | 'show_pack';

const INITIAL_STEPS: Step[] = [
  { id: 'analyze', label: '深度分析设计基因与工艺细节', status: 'pending' },
  { id: 'iteration', label: '基于迭代强度构思创意方案', status: 'pending' },
  { id: 'stillLife1', label: '方案一：生成高精细静物 Master 图', status: 'pending' },
  { id: 'model1', label: '方案一：渲染模特佩戴展示效果', status: 'pending' },
  { id: 'stillLife2', label: '方案二：生成高精细静物 Master 图', status: 'pending' },
  { id: 'model2', label: '方案二：渲染模特佩戴展示效果', status: 'pending' },
];

export const AIBaseballCapDesignerApp: React.FC<AppProps> = ({ platform, costs }) => {
  const perImageGenerationCost = costs.GENERATE_IMAGE ?? costs.GENERATE_DESIGN ?? 10;
  const designImagesPerRun = 4;
  const designGenerationCost = perImageGenerationCost * designImagesPerRun;
  const techPackGenerationCost = perImageGenerationCost;

  const [appState, setAppState] = useState<AppState>('upload');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [generatedDesigns, setGeneratedDesigns] = useState<GeneratedDesign[]>([]);
  const [selectedDesign, setSelectedDesign] = useState<GeneratedDesign | null>(null);
  const [techPackImage, setTechPackImage] = useState<string | null>(null);
  const [materialsList, setMaterialsList] = useState<Material[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);

  const handleImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      setUploadedImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleError = (err: any, fallbackState: AppState) => {
    console.error(err);
    const message = err?.message || '';
    setError('操作失败：' + (message || '未知错误'));
    setAppState(fallbackState);
  };

  const updateStepStatus = (id: string, status: Step['status']) => {
    setSteps(prev => prev.map(step => step.id === id ? { ...step, status } : step));
  };

  const handleGenerateDesigns = useCallback(async (intensity: number) => {
    if (!uploadedImage) return;

    // 设计流程默认会生成 4 张图：2 张静物 + 2 张模特图。
    if (!platform.checkBalance(designGenerationCost)) {
      return; // 余额不足会自动显示充值弹窗
    }

    setAppState('generating_designs');
    setSteps(INITIAL_STEPS.map(s => ({ ...s, status: 'pending' })));
    setGeneratedDesigns([]);
    setLoadingMessage(`正在进行 ${intensity}% 强度的创意迭代...`);
    setError(null);

    try {
      const designs = await generateDesigns(
        uploadedImage,
        intensity,
        (stepId, status) => {
          updateStepStatus(stepId, status);
          const currentStepLabel = INITIAL_STEPS.find(s => s.id === stepId)?.label;
          if (currentStepLabel && status === 'active') {
            setLoadingMessage(currentStepLabel);
          }
        },
        (designIndex, design) => {
          setGeneratedDesigns((prev) => {
            const next = [...prev];
            next[designIndex] = design;
            return next;
          });
        }
      );
      setGeneratedDesigns(designs);
      setAppState('show_designs');
      await platform.refreshCredits?.();
    } catch (err) {
      handleError(err, 'upload');
    }
  }, [uploadedImage, platform, designGenerationCost, perImageGenerationCost]);

  const handleSelectDesign = (design: GeneratedDesign) => {
    setSelectedDesign(design);
    handleGenerateTechPack(design.stillLifeUrl);
  };

  const handleGenerateTechPack = async (imageUrl: string) => {
    if (!platform.checkBalance(techPackGenerationCost)) {
      return;
    }

    setAppState('generating_pack');
    setLoadingMessage('正在创建技术图纸和材料清单...');
    setError(null);
    setTechPackImage(null);
    setMaterialsList(null);

    try {
      const [techPackUrl, materials] = await Promise.all([
        generateTechPack(imageUrl),
        generateMaterialsList(imageUrl)
      ]);

      setTechPackImage(techPackUrl);
      setMaterialsList(materials);
      setAppState('show_pack');
      await platform.refreshCredits?.();
    } catch (err) {
      handleError(err, 'show_designs');
    }
  };

  const handleReset = () => {
    setAppState('upload');
    setUploadedImage(null);
    setGeneratedDesigns([]);
    setSelectedDesign(null);
    setTechPackImage(null);
    setMaterialsList(null);
    setError(null);
    setLoadingMessage('');
    setSteps(INITIAL_STEPS);
  };

  const renderContent = () => {
    const visibleGeneratedDesigns = generatedDesigns.filter((design) => design?.stillLifeUrl || design?.modelUrl);

    switch (appState) {
      case 'generating_designs':
        return (
          <div className="w-full space-y-8">
            <GenerationSteps steps={steps} currentMessage={loadingMessage} />
            {visibleGeneratedDesigns.length > 0 && (
              <DesignGallery
                originalImage={uploadedImage!}
                designs={visibleGeneratedDesigns}
                onSelectDesign={handleSelectDesign}
                techPackGenerationCost={techPackGenerationCost}
                isGenerating
              />
            )}
          </div>
        );
      case 'generating_pack':
        return (
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin mb-6"></div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">{loadingMessage}</h3>
            <p className="text-gray-500 italic">正在解析 3D 结构并提取物料规格...</p>
          </div>
        );
      case 'show_designs':
        return (
          <DesignGallery
            originalImage={uploadedImage!}
            designs={generatedDesigns}
            onSelectDesign={handleSelectDesign}
            techPackGenerationCost={techPackGenerationCost}
            isGenerating={false}
          />
        );
      case 'show_pack':
        return (
          <TechPackView
            selectedDesign={selectedDesign!}
            techPackImage={techPackImage!}
            materialsList={materialsList}
            onReset={handleReset}
          />
        );
      case 'upload':
      default:
        return (
          <ImageUploader
            onImageUpload={handleImageUpload}
            onGenerate={handleGenerateDesigns}
            designGenerationCost={designGenerationCost}
            uploadedImage={uploadedImage}
          />
        );
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <header className="bg-white/60 backdrop-blur-md border border-white/40 shadow-xl rounded-[2rem] p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-black tracking-tight flex items-center gap-3">
                <span className="text-4xl">🧢</span>
                AI 棒球帽 <span className="text-cyan-600">产品设计师</span>
              </h1>
              <p className="mt-2 text-lg text-gray-600">
                上传设计原型，AI 帮你迭代生成新方案、模特效果图、生产技术图纸及材料清单
              </p>
            </div>
            {appState !== 'upload' && (
              <button
                onClick={handleReset}
                className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                重新开始
              </button>
            )}
          </div>
        </header>

        {/* Error Message */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg" role="alert">
            <p className="font-bold text-sm">操作失败</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Main Content */}
        <main className="bg-white/60 backdrop-blur-md border border-white/40 shadow-xl rounded-[2rem] p-6 flex flex-col items-center justify-center min-h-[400px]">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};
