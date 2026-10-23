import React, { useState, useCallback, useEffect } from 'react';
import { AppProps } from '../../types';
import { GenerationType, GeneratedImage } from './types';
import { generateStyledImage } from './services/geminiService';
import Header from './components/Header';
import ImageUploader from './components/ImageUploader';
import GenerationControls from './components/GenerationControls';
import GeneratedImageViewer from './components/GeneratedImageViewer';
import ImageModal from './components/ImageModal';

// Utility to convert file to base64
const fileToBase64 = (file: File): Promise<{ base64: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const mimeType = result.substring(5, result.indexOf(';'));
      const base64 = result.split(',')[1];
      resolve({ base64, mimeType });
    };
    reader.onerror = (error) => reject(error);
  });
};

const generationTypeMap: Record<GenerationType, string> = {
  [GenerationType.OnFoot]: '上脚图',
  [GenerationType.Scene]: '场景图',
  [GenerationType.Model]: '模特图',
  [GenerationType.Custom]: '自定义图',
};

const prompts: Record<Exclude<GenerationType, GenerationType.Custom>, string> = {
  [GenerationType.OnFoot]: "为这双袜子生成一张高清、逼真的上脚图，展示在一个可爱的婴儿或幼儿的脚上。背景要简洁、明亮，突出袜子的细节和质感。",
  [GenerationType.Scene]: "将这双袜子放置在一个 '{style}' 风格的温馨场景中。可以是将袜子整齐地叠放在婴儿床边，或者放在柔软的地毯上，旁边有一些木制玩具。整个画面要色彩和谐，光线柔和，营造出一种舒适、安全的感觉。",
  [GenerationType.Model]: "生成一张可爱的 '{style}' 模特照片，宝宝大约1-2岁，正在开心地玩耍，并穿着这双袜子。模特需要穿着简洁、时尚的童装，与袜子风格搭配。场景可以是明亮的室内游乐区或干净的家中。照片要充满活力和童趣。",
};

export const KidsSocksSceneModelGeneratorApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[]>([]);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [selectedGenerationTypes, setSelectedGenerationTypes] = useState<GenerationType[]>([]);
  const [isLoading, setIsLoading] = useState<GenerationType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sceneStyle, setSceneStyle] = useState<string>('温馨婴儿房');
  const [modelStyle, setModelStyle] = useState<string>('中国宝宝');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [selectedImageForModal, setSelectedImageForModal] = useState<GeneratedImage | null>(null);
  // INT32 范围：-2,147,483,648 到 2,147,483,647
  // Gemini API 的 seed 必须是 INT32 类型
  const [seed, setSeed] = useState<number>(() => Math.floor(Math.random() * 2147483647));

  useEffect(() => {
    const urls = uploadedImageUrls;
    return () => {
      urls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [uploadedImageUrls]);

  const handleImageUpload = (files: FileList) => {
    const currentFiles = [...uploadedFiles];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/') && currentFiles.length < 2) {
        currentFiles.push(file);
      }
    }
    setUploadedFiles(currentFiles);
    setUploadedImageUrls(currentFiles.map(f => URL.createObjectURL(f)));
    setGeneratedImages([]);
    setError(null);
  };

  const handleRemoveImage = (indexToRemove: number) => {
    const newFiles = uploadedFiles.filter((_, index) => index !== indexToRemove);
    setUploadedFiles(newFiles);
    setUploadedImageUrls(newFiles.map(f => URL.createObjectURL(f)));
  };

  const handleToggleGenerationType = (type: GenerationType) => {
    setSelectedGenerationTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const handleGenerateImage = useCallback(async (type: GenerationType) => {
    console.log('[童袜应用-主组件] 开始生成图片', {
      type,
      uploadedFilesCount: uploadedFiles.length,
      seed,
      sceneStyle,
      modelStyle,
      customPrompt: customPrompt.substring(0, 50),
    });

    if (uploadedFiles.length === 0) {
      setError('请先上传一张图片。');
      return;
    }
    if (type === GenerationType.Custom) return;

    await platform.refreshCredits();

    // 检查余额（不扣除）
    if (!platform.checkBalance(costs.GENERATE_IMAGE)) {
      console.log('[童袜应用-主组件] 余额不足');
      return; // 余额不足会自动显示充值弹窗
    }

    setIsLoading(prev => [...prev, type]);
    setError(null);
    setGeneratedImages(prev => prev.filter(img => img.type !== type));

    try {
      console.log('[童袜应用-主组件] 开始转换图片为 base64');
      const imagePromises = uploadedFiles.map((file, index) => {
        console.log(`[童袜应用-主组件] 转换图片 ${index + 1}:`, {
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
        });
        return fileToBase64(file);
      });
      const imageDatas = await Promise.all(imagePromises);

      console.log('[童袜应用-主组件] 图片转换完成:', {
        imageDatasCount: imageDatas.length,
        imageDatas: imageDatas.map((img, i) => ({
          index: i,
          mimeType: img.mimeType,
          base64Length: img.base64.length,
          base64Preview: img.base64.substring(0, 50),
          hasDataUrlPrefix: img.base64.includes('data:image'),
        })),
      });

      let finalPrompt: string;

      if (type === GenerationType.Model && customPrompt.trim()) {
        finalPrompt = customPrompt
          .replace(/{scene_style}/g, sceneStyle)
          .replace(/{model_style}/g, modelStyle);
        console.log('[童袜应用-主组件] 使用自定义提示词:', {
          finalPromptLength: finalPrompt.length,
          finalPromptPreview: finalPrompt.substring(0, 100),
        });
      } else {
        const basePrompt = prompts[type];
        let style: string | undefined = undefined;
        if (type === GenerationType.Scene) {
          style = sceneStyle;
        } else if (type === GenerationType.Model) {
          style = modelStyle;
        }
        
        if (style) {
          finalPrompt = basePrompt.replace('{style}', style);
        } else {
          finalPrompt = basePrompt;
        }
        console.log('[童袜应用-主组件] 使用默认提示词:', {
          type,
          style,
          finalPromptLength: finalPrompt.length,
          finalPromptPreview: finalPrompt.substring(0, 100),
        });
      }

      console.log('[童袜应用-主组件] 调用 generateStyledImage', {
        imagesCount: imageDatas.length,
        promptLength: finalPrompt.length,
        seed,
      });

      const generatedImageUrls = await generateStyledImage(imageDatas, finalPrompt, seed);
      
      console.log('[童袜应用-主组件] generateStyledImage 返回:', {
        resultsCount: generatedImageUrls.length,
        results: generatedImageUrls.map((url, i) => ({
          index: i,
          urlLength: url.length,
          urlPreview: url.substring(0, 50),
          isDataUrl: url.startsWith('data:'),
        })),
      });
      
      // generateStyledImage 已经返回完整的 data URL，不需要再加前缀
      const newImages: GeneratedImage[] = generatedImageUrls.map((imageUrl, index) => {
        const img = {
          id: `${type}-${Date.now()}-${Math.random()}-${index}`,
          type,
          url: imageUrl,
        };
        console.log(`[童袜应用-主组件] 创建图片对象 ${index + 1}:`, {
          id: img.id,
          type: img.type,
          urlLength: img.url.length,
          urlPreview: img.url.substring(0, 50),
        });
        return img;
      });

      setGeneratedImages(prev => {
        const updated = [
          ...prev.filter(img => img.type !== type), 
          ...newImages
        ];
        console.log('[童袜应用-主组件] 更新图片列表:', {
          previousCount: prev.length,
          newCount: updated.length,
          newImagesCount: newImages.length,
        });
        return updated;
      });
      await platform.refreshCredits?.();

    } catch (err: any) {
      console.error('[童袜应用-主组件] 生成失败:', {
        error: err,
        errorMessage: err.message,
        errorStack: err.stack,
        errorDetails: JSON.stringify(err, Object.getOwnPropertyNames(err)).substring(0, 500),
      });
      setError(err.message || `生成 ${generationTypeMap[type]} 失败，请重试。`);
    } finally {
      setIsLoading(prev => prev.filter(t => t !== type));
      console.log('[童袜应用-主组件] 生成流程结束');
    }
  }, [uploadedFiles, sceneStyle, modelStyle, customPrompt, seed, platform, costs]);

  const handleGenerateSelected = useCallback(async () => {
    if (selectedGenerationTypes.length === 0) {
      setError('请至少选择一种图片类型进行生成。');
      return;
    }
    await Promise.all(selectedGenerationTypes.map(type => handleGenerateImage(type)));
    setSelectedGenerationTypes([]);
  }, [selectedGenerationTypes, handleGenerateImage]);

  const handleOpenModal = (image: GeneratedImage) => {
    setSelectedImageForModal(image);
  };

  const handleCloseModal = () => {
    setSelectedImageForModal(null);
  };

  return (
    <div className="min-h-screen font-sans text-slate-800">
      <Header />
      <main className="container mx-auto p-4 md:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Controls */}
          <aside className="lg:col-span-4 xl:col-span-3 bg-white/60 backdrop-blur-xl p-6 rounded-2xl border border-white/30 shadow-xl shadow-blue-500/10">
            <div className='flex items-baseline justify-between'>
              <h2 className="text-xl font-bold text-slate-700">1. 上传图片</h2>
              <p className="text-xs text-slate-500">最多2张</p>
            </div>
            <p className="text-xs text-slate-500 mb-4">请上传同一个产品的图片，效果更佳。</p>
            <ImageUploader 
              onImageUpload={handleImageUpload} 
              onRemoveImage={handleRemoveImage}
              imageUrls={uploadedImageUrls} 
            />
            
            <div className="mt-8">
              <h2 className="text-xl font-bold text-slate-700 mb-4">2. 选择并生成</h2>
              <GenerationControls 
                selectedTypes={selectedGenerationTypes}
                onToggleType={handleToggleGenerationType}
                onGenerateSelected={handleGenerateSelected}
                isLoading={isLoading} 
                isDisabled={uploadedFiles.length === 0}
                sceneStyle={sceneStyle}
                onSceneStyleChange={setSceneStyle}
                modelStyle={modelStyle}
                onModelStyleChange={setModelStyle}
                customPrompt={customPrompt}
                onCustomPromptChange={setCustomPrompt}
                seed={seed}
                onSeedChange={setSeed}
              />
            </div>
          </aside>

          {/* Right Column: Results */}
          <section className="lg:col-span-8 xl:col-span-9">
            {error && (
              <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-r-lg" role="alert">
                <p className="font-bold">错误</p>
                <p>{error}</p>
              </div>
            )}
            <GeneratedImageViewer 
              images={generatedImages} 
              isLoadingTypes={isLoading}
              showPlaceholder={uploadedFiles.length === 0 && generatedImages.length === 0}
              onRegenerate={handleGenerateImage}
              onViewImage={handleOpenModal}
            />
          </section>
        </div>
      </main>
      {selectedImageForModal && (
        <ImageModal
          isOpen={!!selectedImageForModal}
          onClose={handleCloseModal}
          imageUrl={selectedImageForModal.url}
          title={generationTypeMap[selectedImageForModal.type]}
        />
      )}
    </div>
  );
};

