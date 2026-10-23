import React, { useState, useCallback } from 'react';
import { AppProps } from '../../types';
import { Header } from './components/Header';
import { ControlPanel } from './components/ControlPanel';
import { DisplayPanel } from './components/DisplayPanel';
import { generate3DModel } from './services/geminiService';
import { cacheGeneratedAsset } from '../../shared_services/localGeneratedAssetCache';
import { Template } from './types';
import { TEMPLATES } from './constants';
import { LoadingSpinnerIcon } from './constants';

export const FlatTo3DApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string | null>(null);
  const [clothingType, setClothingType] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<Template>(TEMPLATES[0]);
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      setUploadedImage(reader.result as string);
      setImageMimeType(file.type);
      setGeneratedImage(null);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = useCallback(async () => {
    if (!uploadedImage || !imageMimeType || !clothingType || !selectedTemplate) {
      setError("请上传图片并选择所有选项后再生成。");
      return;
    }

    const finalPrompt = selectedTemplate.id === 'custom' ? customPrompt : selectedTemplate.prompt;

    if (selectedTemplate.id === 'custom' && !finalPrompt.trim()) {
      setError("自定义模式下请输入有效的提示词。");
      return;
    }

    // 检查余额（不扣除）
    if (!platform.checkBalance(costs.GENERATE_3D_MODEL)) {
      return; // 余额不足会自动显示充值弹窗
    }
    
    setIsLoading(true);
    setError(null);
    setGeneratedImage(null);

    try {
      const base64Data = uploadedImage.split(',')[1];
      const result = await generate3DModel(base64Data, imageMimeType, clothingType, finalPrompt);

      const imageSrc = `data:image/png;base64,${result}`;
      if (result) {
        cacheGeneratedAsset({ appId: "flat-to-3d", source: imageSrc });
      }
      setGeneratedImage(imageSrc);
      await platform.refreshCredits?.();
    } catch (err) {
      console.error(err);
      setError("生成3D模型时发生错误。请检查您的API密钥并重试。");
    } finally {
      setIsLoading(false);
    }
  }, [uploadedImage, imageMimeType, clothingType, selectedTemplate, customPrompt, platform, costs]);

  return (
    <div className="h-[calc(100vh-200px)] max-h-[calc(100vh-200px)] flex flex-col bg-slate-50 text-slate-800 font-sans overflow-hidden">
      <div className="flex items-center border-b border-slate-200 px-6 py-3 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <button
          onClick={platform.onBack}
          className="flex items-center text-slate-700 hover:text-blue-600 transition-colors font-medium py-1.5 px-2 rounded-lg hover:bg-slate-100"
        >
          <span className="mr-2 text-lg">←</span> 返回控制台
        </button>
      </div>
        <Header />
        <div className="flex flex-1 overflow-hidden">
          <aside className="w-[450px] flex-shrink-0 border-r border-slate-200 flex flex-col bg-white/80 backdrop-blur-2xl">
            <div className="flex-1 p-6 overflow-y-auto">
              <ControlPanel
                onImageUpload={handleImageUpload}
                uploadedImage={uploadedImage}
                clothingType={clothingType}
                setClothingType={setClothingType}
                selectedTemplate={selectedTemplate}
                setSelectedTemplate={setSelectedTemplate}
                customPrompt={customPrompt}
                setCustomPrompt={setCustomPrompt}
              />
            </div>
            <div className="p-6 border-t border-slate-200 bg-white/80 backdrop-blur-md">
              <button
                onClick={handleGenerate}
                disabled={isLoading || !uploadedImage || !clothingType}
                className="w-full bg-indigo-600 text-white font-bold py-4 px-4 rounded-xl hover:bg-indigo-700 disabled:bg-slate-200 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center shadow-lg shadow-indigo-500/20"
              >
                {isLoading ? (
                  <>
                    <LoadingSpinnerIcon />
                    生成中...
                  </>
                ) : (
                  '生成3D图'
                )}
              </button>
            </div>
          </aside>

          <main className="flex-1 p-4 md:p-8 flex items-center justify-center overflow-y-auto">
            <DisplayPanel generatedImage={generatedImage} isLoading={isLoading} error={error} />
          </main>
        </div>
    </div>
  );
};

