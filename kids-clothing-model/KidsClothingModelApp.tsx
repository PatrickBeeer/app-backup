import React, { useState, useCallback } from 'react';
import { AppProps } from '../../types';
import { Header } from './components/Header';
import { ImageUploader } from './components/ImageUploader';
import { OptionsPanel } from './components/OptionsPanel';
import { GeneratedImage } from './components/GeneratedImage';
import { generateModelImages } from './services/geminiService';
import { ClothingType, ModelAge, ImageStyle, ModelGender, AspectRatio } from './types';
import { FineTuningPanel } from './components/FineTuningPanel';
import { Spinner } from './components/icons/Spinner';
const IMAGES_PER_GENERATION = 4;
const PER_IMAGE_COST = 10;

export const KidsClothingModelApp: React.FC<AppProps> = ({ platform }) => {
  const generationCost = IMAGES_PER_GENERATION * PER_IMAGE_COST;
  // Product & Ref Images
  const [uploadedImages, setUploadedImages] = useState<{ file: File; base64: string }[]>([]);
  const [modelRefImage, setModelRefImage] = useState<{ file: File; base64: string } | null>(null);
  const [styleRefImage, setStyleRefImage] = useState<{ file: File; base64: string } | null>(null);

  // Quick Settings
  const [clothingType, setClothingType] = useState<ClothingType>(ClothingType.DRESS);
  const [modelGender, setModelGender] = useState<ModelGender>(ModelGender.FEMALE);
  const [imageStyle, setImageStyle] = useState<ImageStyle>(ImageStyle.STUDIO);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.PORTRAIT);

  // Fine-tuning Settings
  const [isFineTuningOpen, setIsFineTuningOpen] = useState<boolean>(false);
  const [modelAge, setModelAge] = useState<ModelAge>(ModelAge.AGE_4_6);
  const [clothingDetails, setClothingDetails] = useState<string>('');
  const [modelBodyType, setModelBodyType] = useState<string>('');
  const [seed, setSeed] = useState<string>('');
  
  // App State
  const [generatedImageUrls, setGeneratedImageUrls] = useState<(string | null | undefined)[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleImageUpload = (files: { file: File; base64: string }[]) => {
    setUploadedImages(files);
    setGeneratedImageUrls(null);
    setError(null);
  };

  const handleGenerateClick = useCallback(async () => {
    if (uploadedImages.length === 0) {
      setError('请先上传一张产品图片。');
      return;
    }

    try {
      await platform.refreshCredits();
    } catch (refreshError) {
      console.warn('refreshCredits before generation failed, using cached credits instead:', refreshError);
    }

    // 检查余额（不扣除）
    if (!platform.checkBalance(generationCost)) {
      return; // 余额不足会自动显示充值弹窗
    }

    setIsLoading(true);
    setError(null);
    setGeneratedImageUrls(Array(IMAGES_PER_GENERATION).fill(undefined));

    try {
      const modelDescription = modelGender === ModelGender.DUO
        ? `一对可爱的${modelAge}中国小模特，一男一女`
        : `一个可爱的${modelAge}中国小${modelGender}模特`;
        
      let clothingInstruction: string;
      if (uploadedImages.length > 1) {
          clothingInstruction = `请将上传的第一张图片作为主服装，第二张图片作为搭配的服装或配饰，为模特打造一套完整、协调的穿搭。`;
      } else if (modelGender === ModelGender.DUO) {
          clothingInstruction = `让其中一位模特清晰地展示上传图片中的这件${clothingType}，另一位模特则穿着风格协调的服装。`;
      } else {
          clothingInstruction = `模特必须穿着上传图片中的这件${clothingType}。`;
      }

      const allImagesForPrompt = [...uploadedImages];
      let modelRefInstruction = '';
      if (modelRefImage) {
        allImagesForPrompt.push(modelRefImage);
        modelRefInstruction = `**面部参考**: 第 ${allImagesForPrompt.length} 张图片是模特面部参考图，请严格根据此图生成模特的相貌、发型和神态。`;
      }

      let styleRefInstruction = '';
      if (styleRefImage) {
        allImagesForPrompt.push(styleRefImage);
        styleRefInstruction = `**风格参考**: 第 ${allImagesForPrompt.length} 张图片是风格参考图，请严格根据此图生成图片的整体构图、光线、色调和氛围。`;
      }

      const prompt = `
        请根据上传的服装图片，生成一张高质量、风格自然的童装模特图。

        要求如下：
        1.  **服装**: ${clothingInstruction} ${clothingDetails ? `服装细节要求: ${clothingDetails}。` : ''} 请务必精确还原服装的款式、颜色、图案和质感。
        2.  **模特**: ${modelDescription}。${modelBodyType ? `模特体型要求: ${modelBodyType}。` : ''} 姿势自然、表情生动。如果是双人模特，请让他们之间有自然的互动。 ${modelRefInstruction}
        3.  **场景与风格**: 请采用 **${imageStyle}** 风格。 ${styleRefInstruction}
        4.  **构图与质量**: 整体图片风格要求明亮、温馨、有活力，适合用于高端童装电商展示。光线要自然柔和，构图专业，照片级真实感。
        5.  **重要**: 生成的图片中，模特的面部清晰、五官端正、表情自然可爱。
      `;
      
      const imageParts = allImagesForPrompt.map(img => ({
          base64: img.base64.split(',')[1],
          mimeType: img.file.type,
      }));
      
      const parsedSeed = seed ? Number.parseInt(seed, 10) : NaN;
      const seedNumber = Number.isFinite(parsedSeed) ? parsedSeed : undefined;
      const results = await generateModelImages(
        imageParts,
        prompt,
        aspectRatio,
        seedNumber,
        (index, result) => {
          setGeneratedImageUrls((prev) => {
            const next = prev ? [...prev] : Array(IMAGES_PER_GENERATION).fill(undefined);
            next[index] = result.success ? result.imageUrl : null;
            return next;
          });
        }
      );

      // 检查是否有至少一张成功的图片
      const successCount = results.filter(r => r.success).length;
      if (successCount === 0) {
        // 所有图片都失败了，显示错误
        const errorMessages = results.map((r, i) => r.error || `图片 ${i + 1} 生成失败`).join('；');
        setError(`所有图片生成失败：${errorMessages}`);
        return;
      }

      // 将结果转换为数组格式，成功的显示图片，失败的显示 null
      const imageResults = results.map(result => result.success ? result.imageUrl! : null);
      setGeneratedImageUrls(imageResults);

      try {
        await platform.refreshCredits?.();
      } catch (refreshError) {
        console.warn('refreshCredits after generation failed:', refreshError);
      }

      // 如果有部分失败，显示警告信息（但不阻止显示成功的图片）
      const failedCount = results.length - successCount;
      if (failedCount > 0) {
        const failedMessages = results
          .map((r, i) => !r.success ? `图片 ${i + 1}` : null)
          .filter(Boolean)
          .join('、');
        console.warn(`部分图片生成失败：${failedMessages}`);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : '图片生成失败，请稍后重试。');
    } finally {
      setIsLoading(false);
    }
  }, [
    uploadedImages, modelRefImage, styleRefImage, 
    clothingType, modelGender, imageStyle, aspectRatio, 
    modelAge, clothingDetails, modelBodyType, seed, platform, generationCost
  ]);

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
      <div className="relative flex-grow min-h-screen bg-gradient-to-br from-blue-50 via-violet-50 to-rose-50 text-slate-700 font-sans overflow-hidden">
        {/* Decorative Orbs */}
        <div className="absolute top-0 -left-4 w-96 h-96 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-blob"></div>
        <div className="absolute top-0 -right-4 w-96 h-96 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-96 h-96 bg-rose-200 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-blob animation-delay-4000"></div>
        
        <div className="relative z-10">
          <Header />
          <main className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Controls Column */}
              <div className="flex flex-col gap-6 p-6 sm:p-8 bg-white/40 backdrop-blur-xl rounded-[2.5rem] shadow-2xl shadow-violet-500/10 border border-white/60">
                <div>
                  <ImageUploader onImageUpload={handleImageUpload} />
                </div>
                
                <div className="border-t border-slate-200/80"></div>

                <div className="space-y-4">
                  <h2 className="text-lg font-semibold text-slate-800">快速设置</h2>
                  <OptionsPanel
                    clothingType={clothingType}
                    onClothingTypeChange={setClothingType}
                    modelGender={modelGender}
                    onModelGenderChange={setModelGender}
                    imageStyle={imageStyle}
                    onImageStyleChange={setImageStyle}
                    aspectRatio={aspectRatio}
                    onAspectRatioChange={setAspectRatio}
                  />
                </div>

                <FineTuningPanel
                  isOpen={isFineTuningOpen}
                  onToggle={() => setIsFineTuningOpen(!isFineTuningOpen)}
                  modelAge={modelAge}
                  onModelAgeChange={setModelAge}
                  clothingDetails={clothingDetails}
                  onClothingDetailsChange={setClothingDetails}
                  modelBodyType={modelBodyType}
                  onModelBodyTypeChange={setModelBodyType}
                  seed={seed}
                  onSeedChange={setSeed}
                  onModelRefUpload={setModelRefImage}
                  onStyleRefUpload={setStyleRefImage}
                />
                
                <div>
                  <button
                    onClick={handleGenerateClick}
                    disabled={isLoading || uploadedImages.length === 0}
                    className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-full shadow-lg shadow-indigo-500/20 text-base font-medium text-white bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:from-slate-400 disabled:to-slate-400 disabled:shadow-none disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 disabled:scale-100"
                  >
                    {isLoading ? (
                      <>
                        <Spinner />
                        生成中...
                      </>
                    ) : (
                      `✨ 立即生成模特图 (${IMAGES_PER_GENERATION}张，${PER_IMAGE_COST}积分/张，共${generationCost}积分)`
                    )}
                  </button>
                </div>
              </div>

              {/* Display Column */}
              <div className="p-8 bg-white/40 backdrop-blur-xl rounded-[2.5rem] shadow-2xl shadow-violet-500/10 border border-white/60 flex items-center justify-center min-h-[400px] lg:min-h-[600px] transition-all duration-300 hover:-translate-y-2 hover:shadow-violet-500/20">
                <GeneratedImage
                  imageUrls={generatedImageUrls}
                  isLoading={isLoading}
                  error={error}
                />
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

