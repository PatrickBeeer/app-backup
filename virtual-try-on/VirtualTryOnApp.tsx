import React, { useState } from 'react';
import { Shirt, User, Sparkles, AlertCircle, Loader2, Download, Layers, MapPin, Frame, ZoomIn } from 'lucide-react';
import { ImageUpload } from './components/ImageUpload';
import { AppStatus, GarmentCategory, BackgroundStyle, AspectRatio, UploadedImage } from './types';
import { generateTryOn } from './services/geminiService';
import { AppProps } from '../../types';

export const VirtualTryOnApp: React.FC<AppProps> = ({ platform, costs }) => {
  // State
  const [clothingImage, setClothingImage] = useState<UploadedImage | null>(null);
  const [modelImage, setModelImage] = useState<UploadedImage | null>(null);
  const [garmentCategory, setGarmentCategory] = useState<GarmentCategory>('tops');
  const [backgroundStyle, setBackgroundStyle] = useState<BackgroundStyle>('studio');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('3:4');
  const [isProductFocus, setIsProductFocus] = useState<boolean>(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const tryOnCost = Number.isFinite(Number(costs?.GENERATE_TRY_ON)) ? Number(costs.GENERATE_TRY_ON) : 10;

  // 生成效果图（使用平台积分系统）
  const handleGenerate = async () => {
    if (!clothingImage) {
      setErrorMessage('请先上传服装图片');
      return;
    }

    await platform.refreshCredits();

    // 检查余额（不扣除）
    if (!platform.checkBalance(tryOnCost)) {
      return; // 余额不足会自动显示充值弹窗
    }

    setErrorMessage('');
    setGeneratedImageUrl(null);
    setStatus(AppStatus.GENERATING);

    try {
      const url = await generateTryOn({
        clothingImage,
        modelImage,
        garmentCategory,
        backgroundStyle,
        aspectRatio,
        isProductFocus
      });

      setGeneratedImageUrl(url);
      await platform.refreshCredits?.();
      setStatus(AppStatus.SUCCESS);
    } catch (error: any) {
      // 请求失败，不扣费
      console.error('生成失败:', error);
      const errorMsg = error.message || "生成失败，请稍后重试。";
      setErrorMessage(errorMsg);
      setStatus(AppStatus.ERROR);
    }
  };

  // 重置
  const handleReset = () => {
    setClothingImage(null);
    setModelImage(null);
    setGeneratedImageUrl(null);
    setStatus(AppStatus.IDLE);
    setErrorMessage('');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-20 font-sans">
      <div className="flex items-center border-b border-slate-200 px-6 py-3 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <button
          onClick={platform.onBack}
          className="flex items-center text-slate-700 hover:text-blue-600 transition-colors font-medium py-1.5 px-2 rounded-lg hover:bg-slate-100"
        >
          <span className="mr-2 text-lg">←</span> 返回控制台
        </button>
      </div>
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Intro Section */}
        <div className="text-center mb-10">
          <h2 className="text-3xl font-extrabold text-slate-900 sm:text-4xl mb-4">
            AI 时尚工作室
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            上传一件服装，AI 将自动为您补全全身穿搭，并生成专业电商展示图。
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Input Section */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Step 1: Garment Upload & Category */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <Shirt className="w-5 h-5 text-indigo-400" />
                  1. 服装上传
                </h3>
                <span className="text-xs font-bold text-indigo-400 bg-indigo-900/50 px-2 py-1 rounded-full uppercase">必填</span>
              </div>
              
              <ImageUpload
                label="上传服装图片"
                subLabel="如：外套、连衣裙、上衣等"
                image={clothingImage}
                onUpload={setClothingImage}
                onRemove={() => setClothingImage(null)}
              />

              {clothingImage && (
                <div className="mt-4 pt-4 border-t border-slate-200 animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    这是什么类型的服装？
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {(['outerwear', 'tops', 'bottoms', 'dresses', 'outfits'] as GarmentCategory[]).map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setGarmentCategory(cat)}
                        className={`px-3 py-2 text-sm rounded-lg border transition-all ${
                          garmentCategory === cat 
                            ? 'bg-indigo-600 text-slate-900 border-indigo-600 shadow-sm' 
                            : 'bg-slate-100 text-slate-700 border-slate-300 hover:border-indigo-500'
                        } ${cat === 'outfits' ? 'col-span-2 sm:col-span-1' : ''}`}
                      >
                        {cat === 'outerwear' && '外套 / 夹克'}
                        {cat === 'tops' && '上装 / 衬衫'}
                        {cat === 'bottoms' && '下装 / 裤裙'}
                        {cat === 'dresses' && '连身裙'}
                        {cat === 'outfits' && '套装 / 搭配'}
                      </button>
                    ))}
                  </div>
                  {garmentCategory === 'outerwear' && (
                     <p className="text-xs text-indigo-400 mt-2 bg-indigo-900/30 p-2 rounded-md">
                      💡 AI 将自动搭配内搭和下装。
                    </p>
                  )}
                  {garmentCategory === 'tops' && (
                     <p className="text-xs text-indigo-400 mt-2 bg-indigo-900/30 p-2 rounded-md">
                      💡 AI 将自动搭配下装。
                    </p>
                  )}
                  {garmentCategory === 'bottoms' && (
                     <p className="text-xs text-indigo-400 mt-2 bg-indigo-900/30 p-2 rounded-md">
                      💡 AI 将自动搭配上装。
                    </p>
                  )}
                  {garmentCategory === 'outfits' && (
                     <p className="text-xs text-indigo-400 mt-2 bg-indigo-900/30 p-2 rounded-md">
                      💡 AI 将还原整套搭配效果 (包含配饰)。
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Step 2: Model & Environment */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
               <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <User className="w-5 h-5 text-indigo-400" />
                  2. 模特 & 场景设置
                </h3>
              
              <div className="grid grid-cols-2 gap-4">
                 {/* Environment Selector */}
                 <div className="col-span-2 sm:col-span-1">
                    <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      拍摄场景
                    </label>
                    <select 
                      value={backgroundStyle}
                      onChange={(e) => setBackgroundStyle(e.target.value as BackgroundStyle)}
                      className="w-full p-2.5 bg-slate-100 border border-slate-300 text-slate-800 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block"
                    >
                      <option value="studio">专业影棚 (纯净)</option>
                      <option value="urban">都市街头 (时尚)</option>
                      <option value="luxury">高级室内 (奢华)</option>
                      <option value="nature">自然户外 (清新)</option>
                      <option value="beach">阳光海滩 (度假)</option>
                    </select>
                 </div>

                 {/* Aspect Ratio Selector */}
                 <div className="col-span-2 sm:col-span-1">
                    <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                      <Frame className="w-4 h-4" />
                      图片比例
                    </label>
                    <select 
                      value={aspectRatio}
                      onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                      className="w-full p-2.5 bg-slate-100 border border-slate-300 text-slate-800 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block"
                    >
                      <option value="1:1">1:1 (正方形)</option>
                      <option value="3:4">3:4 (人像竖屏)</option>
                      <option value="9:16">9:16 (全屏/故事)</option>
                      <option value="4:3">4:3 (横屏)</option>
                      <option value="16:9">16:9 (宽屏)</option>
                    </select>
                 </div>
              </div>

               {/* Focus Mode Toggle */}
               <div className="bg-indigo-900/30 p-3 rounded-lg border border-indigo-800/50">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-700 flex items-center gap-2 cursor-pointer" onClick={() => setIsProductFocus(!isProductFocus)}>
                      <ZoomIn className="w-4 h-4 text-indigo-400" />
                      聚焦产品细节 (半身展示)
                    </label>
                    <button 
                      onClick={() => setIsProductFocus(!isProductFocus)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-white ${
                        isProductFocus ? 'bg-indigo-600' : 'bg-slate-200'
                      }`}
                    >
                      <span className="sr-only">Toggle product focus</span>
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition transition-transform ${
                          isProductFocus ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 ml-6">
                    {isProductFocus 
                      ? "生成半身特写，突出服装材质与剪裁细节。" 
                      : "生成全身模特展示，包含鞋履搭配与整体造型。"}
                  </p>
               </div>

               {/* Optional Model Upload */}
               <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-slate-700">指定模特 (可选)</label>
                    <span className="text-xs text-slate-600">默认：AI 自动生成模特</span>
                  </div>
                  <ImageUpload
                    label=""
                    subLabel="上传您想使用的模特照片"
                    image={modelImage}
                    onUpload={setModelImage}
                    onRemove={() => setModelImage(null)}
                    icon={<User size={24} />}
                  />
               </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={!clothingImage || status === AppStatus.GENERATING}
              className={`w-full py-4 px-6 rounded-xl font-bold text-slate-900 shadow-lg transition-all transform hover:-translate-y-0.5 active:translate-y-0
                ${!clothingImage || status === AppStatus.GENERATING
                  ? 'bg-slate-200 cursor-not-allowed shadow-none text-slate-600'
                  : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:shadow-indigo-500/30'
                }`}
            >
              {status === AppStatus.GENERATING ? (
                <span className="flex items-center justify-center space-x-2">
                  <Loader2 className="animate-spin" />
                  <span>正在设计穿搭...</span>
                </span>
              ) : (
                <span className="flex items-center justify-center space-x-2">
                  <Sparkles size={20} />
                  <span>生成效果图 (消耗 {tryOnCost} 积分)</span>
                </span>
              )}
            </button>

            {status === AppStatus.ERROR && (
              <div className="p-4 bg-red-900/30 border border-red-800/50 rounded-xl flex items-start space-x-3 text-red-400">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div className="text-sm">{errorMessage}</div>
              </div>
            )}
          </div>

          {/* Output Section */}
          <div className="lg:col-span-7">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 h-full overflow-hidden flex flex-col min-h-[600px]">
              <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-100/50">
                <h3 className="font-semibold text-slate-800">实时预览</h3>
                {status === AppStatus.SUCCESS && (
                  <button 
                    onClick={handleReset}
                    className="text-sm text-slate-600 hover:text-indigo-400 font-medium transition-colors"
                  >
                    开始新设计
                  </button>
                )}
              </div>
              
              <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-50/50 relative">
                {status === AppStatus.IDLE && (
                  <div className="text-center text-slate-600 max-w-sm">
                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-slate-300">
                      <Sparkles className="w-10 h-10 text-indigo-500" />
                    </div>
                    <h4 className="text-slate-800 font-medium mb-1">准备就绪</h4>
                    <p className="text-sm">上传服装，开始您的 AI 穿搭设计之旅。</p>
                  </div>
                )}

                {status === AppStatus.GENERATING && (
                  <div className="text-center space-y-6 max-w-md">
                    <div className="relative w-32 h-32 mx-auto">
                      <div className="absolute inset-0 border-4 border-slate-300 rounded-full"></div>
                      <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Sparkles className="text-indigo-400 w-10 h-10 animate-pulse" />
                      </div>
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-slate-900">AI 正在生成中...</h4>
                      <p className="text-slate-600 mt-2">
                        正在分析服装细节... 智能匹配单品... 渲染场景光影...
                      </p>
                    </div>
                  </div>
                )}

                {status === AppStatus.SUCCESS && generatedImageUrl && (
                  <div className="relative w-full h-full flex items-center justify-center group animate-in fade-in duration-700">
                    <img 
                      src={generatedImageUrl} 
                      alt="Generated Try-On" 
                      className="max-h-[700px] w-auto object-contain rounded-lg shadow-lg"
                    />
                    <div className="absolute bottom-8 flex gap-3 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
                      <a 
                        href={generatedImageUrl} 
                        download={`ai-style-${Date.now()}.png`}
                        className="flex items-center space-x-2 bg-slate-100 text-slate-900 px-6 py-3 rounded-full font-bold shadow-xl hover:bg-slate-200 transition-colors border border-slate-300"
                      >
                        <Download size={20} />
                        <span>下载高清大图</span>
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

