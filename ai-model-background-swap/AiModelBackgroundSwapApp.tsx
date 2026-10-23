import React, { useState, useCallback, useEffect } from 'react';
import { AppProps } from '../../types';
import GlassPanel from './components/GlassPanel';
import FileUpload from './components/FileUpload';
import SelectOption from './components/SelectOption';
import { AspectRatio, ImageEditMode, GeneratedImage, ImagePart, ContentPart, SceneOption } from './types';
import { generateEditedImage, toBase64, extractImageUrls } from './services/geminiService';
import { cacheGeneratedAsset } from '../../shared_services/localGeneratedAssetCache';

const APP_ID = 'ai-model-background-swap';

const getAspectRatioLabel = (ratio: AspectRatio): string => {
  switch (ratio) {
    case AspectRatio.SQUARE:
      return '正方形 (1:1)';
    case AspectRatio.PORTRAIT:
      return '竖图 (3:4)';
    case AspectRatio.LANDSCAPE:
      return '横图 (4:3)';
    case AspectRatio.VERTICAL_VIDEO:
      return '短视频 (9:16)';
    case AspectRatio.HORIZONTAL_VIDEO:
      return '宽视频 (16:9)';
    default:
      return ratio;
  }
};

const getSceneLabel = (scene: SceneOption): string => {
  switch (scene) {
    case SceneOption.STUDIO_WHITE:
      return '纯白影棚';
    case SceneOption.MINIMALIST_GREY:
      return '极简灰色背景';
    case SceneOption.SOFT_LIGHT_STUDIO:
      return '柔和光影摄影棚';
    case SceneOption.SUNLIT_BEACH:
      return '阳光海滩';
    case SceneOption.URBAN_STREET:
      return '城市街景 (时尚)';
    case SceneOption.GREEN_PARK:
      return '绿色公园 (户外休闲)';
    case SceneOption.COZY_CAFE:
      return '舒适咖啡馆 (生活方式)';
    case SceneOption.MODERN_LIVING_ROOM:
      return '现代客厅 (家居)';
    case SceneOption.LUXURY_BOUTIQUE:
      return '奢华精品店 (高端)';
    case SceneOption.VINTAGE_LIBRARY:
      return '复古图书馆 (文艺)';
    case SceneOption.ABSTRACT_GEOMETRIC:
      return '抽象几何';
    case SceneOption.WATERCOLOR_SPLASH:
      return '水彩泼墨';
    case SceneOption.RUSTIC_WOOD:
      return '复古木质桌面';
    default:
      return scene;
  }
};

export const AiModelBackgroundSwapApp: React.FC<AppProps> = ({ platform, costs }) => {
  const generationCost = costs?.GENERATE_IMAGE ?? 10;
  const [editMode, setEditMode] = useState<ImageEditMode>(ImageEditMode.CHANGE_MODEL);
  const [uploadedProductImage, setUploadedProductImage] = useState<File | null>(null);
  const [uploadedNewModelImage, setUploadedNewModelImage] = useState<File | null>(null);
  const [selectedScene, setSelectedScene] = useState<SceneOption | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.SQUARE);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [productImagePreview, setProductImagePreview] = useState<string | null>(null);
  const [newModelImagePreview, setNewModelImagePreview] = useState<string | null>(null);

  useEffect(() => {
    if (uploadedProductImage) {
      const reader = new FileReader();
      reader.onloadend = () => setProductImagePreview(reader.result as string);
      reader.readAsDataURL(uploadedProductImage);
    } else {
      setProductImagePreview(null);
    }
  }, [uploadedProductImage]);

  useEffect(() => {
    if (uploadedNewModelImage) {
      const reader = new FileReader();
      reader.onloadend = () => setNewModelImagePreview(reader.result as string);
      reader.readAsDataURL(uploadedNewModelImage);
    } else {
      setNewModelImagePreview(null);
    }
  }, [uploadedNewModelImage]);

  const handleProductImageUpload = useCallback((file: File | null) => {
    setUploadedProductImage(file);
  }, []);

  const handleNewModelImageUpload = useCallback((file: File | null) => {
    setUploadedNewModelImage(file);
  }, []);

  const handleSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);
    setGeneratedImages([]);

    await platform.refreshCredits();

    // 检查余额（不扣除）
    if (!platform.checkBalance(generationCost)) {
      setIsLoading(false);
      return; // 余额不足会自动显示充值弹窗
    }

    if (!uploadedProductImage) {
      setError('请上传商品模特图。');
      setIsLoading(false);
      return;
    }

    const contents: ContentPart[] = [];
    let instruction = '';

    try {
      const base64ProductImage = await toBase64(uploadedProductImage);
      const productImagePart: ImagePart = {
        inlineData: {
          mimeType: uploadedProductImage.type,
          data: base64ProductImage,
        },
      };
      contents.push(productImagePart);

      if (editMode === ImageEditMode.CHANGE_MODEL || editMode === ImageEditMode.CHANGE_BOTH) {
        if (!uploadedNewModelImage) {
          setError('在此模式下，请上传新的模特图。');
          setIsLoading(false);
          return;
        }
        const base64NewModelImage = await toBase64(uploadedNewModelImage);
        const newModelImagePart: ImagePart = {
          inlineData: {
            mimeType: uploadedNewModelImage.type,
            data: base64NewModelImage,
          },
        };
        contents.push(newModelImagePart);

        instruction = `【最高优先指令：服装迁移、身份重塑与自由姿势演变】
任务：将图片1中的【服装穿搭】完美迁移到图片2模特的【长相身份】上。

核心执行准则：
1. **服装绝对提取**：必须完整保留图片1中服装（款式、纹理、面料褶皱、色彩）的所有细节，将其作为唯一服装来源。
2. **长相强制克隆**：结果图片必须完全使用图片2模特的【脸型、五官、发型、发色、肤色】。严禁出现图1模特的任何面部特征。
3. **姿势随境而变**：**不要**死板跟随图1的原始姿势。请根据当前选择的场景氛围，自由调整模特的身体动态、手势和构图。模特应呈现出最符合商业时尚大片逻辑的自然姿势，使画面更具动感和协调性。
4. **物理光影重塑**：根据新背景或环境，重新渲染模特和服装的高光与阴影，确保其在三维空间中看起来百分之百真实融合。`;

        if (editMode === ImageEditMode.CHANGE_MODEL) {
          instruction += `\n- **背景约束**：保持图片1的原有背景，但在该背景下重新演绎更具时尚感的姿势。`;
        } else {
          instruction += `\n- **场景重塑**：在全新的 "${getSceneLabel(selectedScene!)}" 场景中生成，姿势必须与该特定环境完美契合。`;
        }
      } else if (editMode === ImageEditMode.CHANGE_BACKGROUND) {
        instruction = `任务：背景无缝替换。
- 目标：将图片1的背景替换为 "${getSceneLabel(selectedScene!)}"。
- 约束：百分之百保留图片1中的模特（长相、身体）和服装穿搭。
- 融合：根据新背景的光影环境校正人物边缘。`;
      }

      contents.push({ text: instruction });

      const response = await generateEditedImage(contents, aspectRatio);
      const urls = extractImageUrls(response);

      if (urls.length > 0) {
        urls.forEach((url) => {
          cacheGeneratedAsset({ appId: APP_ID, source: url });
        });
        setGeneratedImages(urls.map((url, index) => ({ url, alt: `生成的图片 ${index + 1}` })));
        await platform.refreshCredits?.();
      } else if (response.text) {
        setError(`生成完成，但未返回图片。模型响应：${response.text}`);
      } else {
        setError('图片生成失败或未返回任何图片。');
      }
    } catch (err: any) {
      console.error('提交错误:', err);
      setError(`图片生成失败: ${err.message || '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  }, [editMode, uploadedProductImage, uploadedNewModelImage, selectedScene, aspectRatio, platform, generationCost]);

  const isSubmitDisabled = isLoading || !uploadedProductImage ||
    ((editMode === ImageEditMode.CHANGE_MODEL || editMode === ImageEditMode.CHANGE_BOTH) && !uploadedNewModelImage) ||
    ((editMode === ImageEditMode.CHANGE_BACKGROUND || editMode === ImageEditMode.CHANGE_BOTH) && !selectedScene);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-7xl">
        {/* Header with back button */}
        <div className="flex items-center border-b border-slate-200 px-6 py-3 bg-white/50 backdrop-blur-sm sticky top-0 z-10 mb-4">
          <button
            onClick={platform.onBack}
            className="flex items-center text-slate-700 hover:text-blue-600 transition-colors font-medium py-1.5 px-2 rounded-lg hover:bg-slate-100"
          >
            <span className="mr-2 text-lg">←</span> 返回控制台
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full">
          <GlassPanel className="flex flex-col gap-6">
            <h1 className="text-3xl font-bold text-black tracking-tight mb-4">AI 模特长相重塑</h1>

            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <FileUpload
                label="1. 上传商品图 (仅提取服装穿搭)"
                onFileChange={handleProductImageUpload}
                required
                currentFilePreview={productImagePreview}
              />

              <div className="flex flex-col gap-2">
                <label className="block text-gray-600 text-sm font-semibold mb-2 uppercase tracking-wide">
                  2. 选择编辑模式
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <SelectOption
                    value={ImageEditMode.CHANGE_MODEL}
                    label="只换模特"
                    isSelected={editMode === ImageEditMode.CHANGE_MODEL}
                    onSelect={(value) => setEditMode(value as ImageEditMode)}
                    disabled={isLoading}
                  />
                  <SelectOption
                    value={ImageEditMode.CHANGE_BACKGROUND}
                    label="只换背景"
                    isSelected={editMode === ImageEditMode.CHANGE_BACKGROUND}
                    onSelect={(value) => setEditMode(value as ImageEditMode)}
                    disabled={isLoading}
                  />
                  <SelectOption
                    value={ImageEditMode.CHANGE_BOTH}
                    label="全换 (推荐)"
                    isSelected={editMode === ImageEditMode.CHANGE_BOTH}
                    onSelect={(value) => setEditMode(value as ImageEditMode)}
                    disabled={isLoading}
                  />
                </div>
              </div>

              {(editMode === ImageEditMode.CHANGE_MODEL || editMode === ImageEditMode.CHANGE_BOTH) && (
                <FileUpload
                  label="3. 上传目标模特图 (极致长相克隆)"
                  onFileChange={handleNewModelImageUpload}
                  required
                  currentFilePreview={newModelImagePreview}
                />
              )}

              {(editMode === ImageEditMode.CHANGE_BACKGROUND || editMode === ImageEditMode.CHANGE_BOTH) && (
                <div className="flex flex-col gap-2">
                  <label className="block text-gray-600 text-sm font-semibold mb-2 uppercase tracking-wide">
                    选择背景场景
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                    {Object.values(SceneOption).map((scene) => (
                      <SelectOption
                        key={scene}
                        value={scene}
                        label={getSceneLabel(scene)}
                        isSelected={selectedScene === scene}
                        onSelect={(value) => setSelectedScene(value as SceneOption)}
                        disabled={isLoading}
                        className="p-3 text-sm"
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <label className="block text-gray-600 text-sm font-semibold mb-2 uppercase tracking-wide">
                  输出比例
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {Object.values(AspectRatio).map((ratio) => (
                    <SelectOption
                      key={ratio}
                      value={ratio}
                      label={getAspectRatioLabel(ratio)}
                      isSelected={aspectRatio === ratio}
                      onSelect={(value) => setAspectRatio(value as AspectRatio)}
                      disabled={isLoading}
                    />
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className={`
                  mt-6 px-8 py-4 bg-black text-white text-lg font-semibold rounded-2xl
                  hover:scale-[1.02] hover:shadow-xl transition-all duration-300
                  flex items-center justify-center
                  ${isSubmitDisabled ? 'opacity-70 cursor-not-allowed' : ''}
                `}
                disabled={isSubmitDisabled}
              >
                {isLoading ? '正在进行深度身份克隆与姿势演变...' : `开始生成 (消耗 ${generationCost} 积分)`}
              </button>

              {error && (
                <div className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
                  {error}
                </div>
              )}
            </form>
          </GlassPanel>

          <GlassPanel className="flex flex-col gap-6">
            <h2 className="text-3xl font-bold text-black tracking-tight mb-4">生成结果预览</h2>
            
            {isLoading && (
              <div className="flex flex-col items-center justify-center p-12 text-gray-600 animate-pulse">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-lg font-medium">身份克隆中，姿势重塑中...</p>
                <p className="text-sm mt-2 text-gray-500 text-center">正在将服装迁移至新模特，并根据场景调整最佳姿势</p>
              </div>
            )}

            {!isLoading && generatedImages.length === 0 && !error && (
              <div className="flex flex-col items-center justify-center p-12 text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-16 h-16 mb-4 opacity-50">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                </svg>
                <p className="text-center">克隆并演变后的模特大图将在此展示</p>
              </div>
            )}

            {generatedImages.length > 0 && (
              <div className="grid grid-cols-1 gap-4">
                {generatedImages.map((image, index) => (
                  <div key={index} className="relative group rounded-2xl overflow-hidden shadow-2xl">
                    <img src={image.url} alt={image.alt} className="w-full h-auto" />
                    <a
                      href={image.url}
                      download={`ai-cloned-model-${index + 1}.png`}
                      className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    >
                      <span className="bg-white text-black px-6 py-2 rounded-full font-bold">保存并下载</span>
                    </a>
                  </div>
                ))}
              </div>
            )}
          </GlassPanel>
        </div>
      </div>
    </div>
  );
};

