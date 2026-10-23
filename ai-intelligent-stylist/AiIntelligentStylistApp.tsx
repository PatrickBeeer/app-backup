import React, { useState } from 'react';
import { AppProps } from '../../types';
import { ImageUpload } from './components/ImageUpload';
import { AppStatus, UploadedImage, GarmentCategory, BackgroundStyle, AspectRatio, TimeOfDay, LightingType, ImageQuality, ModelEthnicity, ModelAge, ModelBodyShape, ModelPose, TryOnRequest } from './types';
import { generateTryOn } from './services/geminiService';

// Scene Data Configuration organized by STYLE -> SCENE
const SCENE_CATEGORIES = [
  {
    id: 'minimalist',
    label: '影棚/极简',
    options: [
      { id: 'plain_studio', label: '纯净影棚' },
      { id: 'morandi_studio', label: '莫兰迪色' },
      { id: 'podium_display', label: '几何展台' },
      { id: 'geometric_space', label: '空间构成' },
      { id: 'concrete_wall', label: '工业灰墙' },
      { id: 'sunlight_window', label: '自然窗边' },
    ]
  },
  {
    id: 'luxury',
    label: '商业/轻奢',
    options: [
      { id: 'art_gallery', label: '艺术画廊' },
      { id: 'luxury_hotel', label: '奢华酒店' },
      { id: 'fashion_boutique', label: '精品买手店' },
      { id: 'marble_hall', label: '大理石厅' },
      { id: 'spiral_staircase', label: '旋转楼梯' },
      { id: 'french_mansion', label: '法式洋房' },
    ]
  },
  {
    id: 'street',
    label: '街头/潮流',
    options: [
      { id: 'city_street', label: '都市街拍' },
      { id: 'brick_wall_alley', label: '复古砖墙' },
      { id: 'coffee_shop_exterior', label: '街角咖啡' },
      { id: 'neon_night', label: '赛博夜景' },
      { id: 'rooftop', label: '城市天台' },
      { id: 'skate_park', label: '滑板公园' },
    ]
  },
  {
    id: 'natural',
    label: '自然/度假',
    options: [
      { id: 'sunny_grassland', label: '阳光草地' },
      { id: 'flower_field', label: '浪漫花海' },
      { id: 'tennis_court', label: '网球场' },
      { id: 'yacht_deck', label: '游艇甲板' },
      { id: 'beach_resort', label: '海岛沙滩' },
      { id: 'quiet_forest', label: '静谧森林' },
    ]
  },
  {
    id: 'lifestyle',
    label: '家居/生活',
    options: [
      { id: 'cozy_living_room', label: '温馨客厅' },
      { id: 'bedroom_mirror', label: '卧室随拍' },
      { id: 'afternoon_cafe', label: '午后店内' },
      { id: 'study_corner', label: '书房一角' },
      { id: 'balcony_plants', label: '绿植阳台' },
      { id: 'modern_kitchen', label: '现代厨房' },
    ]
  },
  {
    id: 'professional',
    label: '职场/商务',
    options: [
      { id: 'modern_office', label: '现代办公' },
      { id: 'elevator_hall', label: '电梯间' },
      { id: 'office_lobby', label: '写字楼大堂' },
      { id: 'meeting_room', label: '会议室' },
      { id: 'cbd_skyline', label: 'CBD天际线' },
    ]
  },
];

export const AiIntelligentStylistApp: React.FC<AppProps> = ({ platform, costs }) => {
  const generationCost = costs?.GENERATE_TRY_ON ?? 10;
  const [clothingImage, setClothingImage] = useState<UploadedImage | null>(null);
  const [modelImage, setModelImage] = useState<UploadedImage | null>(null);
  const [garmentCategory, setGarmentCategory] = useState<GarmentCategory>('tops');
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false);
  const [isSceneEnabled, setIsSceneEnabled] = useState<boolean>(true);
  const [activeSceneTab, setActiveSceneTab] = useState<string>('minimalist');
  const [backgroundStyle, setBackgroundStyle] = useState<BackgroundStyle>('plain_studio');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('default');
  const [lighting, setLighting] = useState<LightingType>('natural');
  const [imageQuality, setImageQuality] = useState<ImageQuality>('realistic');
  const [modelEthnicity, setModelEthnicity] = useState<ModelEthnicity>('asian');
  const [modelAge, setModelAge] = useState<ModelAge>('20s');
  const [modelBodyShape, setModelBodyShape] = useState<ModelBodyShape>('standard');
  const [modelPose, setModelPose] = useState<ModelPose>('standing_basic');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('3:4');
  const [isProductFocus, setIsProductFocus] = useState<boolean>(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    scene: true,
    model: false,
    composition: false,
  });
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleGenerate = async () => {
    if (!clothingImage) return;

    await platform.refreshCredits();

    // 检查余额（不扣除）
    if (!platform.checkBalance(generationCost)) {
      return; // 余额不足会自动显示充值弹窗
    }

    setStatus(AppStatus.GENERATING);
    setErrorMessage('');
    setGeneratedImageUrl(null);

    const finalBackgroundStyle = isSceneEnabled ? backgroundStyle : 'plain_studio';

    try {
      const url = await generateTryOn({
        clothingImage,
        modelImage,
        garmentCategory,
        backgroundStyle: finalBackgroundStyle,
        aspectRatio,
        isProductFocus,
        timeOfDay,
        lighting,
        imageQuality,
        modelEthnicity,
        modelAge,
        modelBodyShape,
        modelPose
      });

      setGeneratedImageUrl(url);
      await platform.refreshCredits?.();
      setStatus(AppStatus.SUCCESS);
    } catch (err: any) {
      // 请求失败，不扣费
      console.error('生成失败:', err);
      setStatus(AppStatus.ERROR);
      setErrorMessage(err.message || '生成失败，请检查网络或重试');
    }
  };

  const handleReset = () => {
    setClothingImage(null);
    setModelImage(null);
    setGeneratedImageUrl(null);
    setStatus(AppStatus.IDLE);
    setErrorMessage('');
  };

  const isLoading = status === AppStatus.GENERATING;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      <div className="flex items-center border-b border-slate-200 px-6 py-3 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <button
          onClick={platform.onBack}
          className="flex items-center text-slate-700 hover:text-blue-600 transition-colors font-medium py-1.5 px-2 rounded-lg hover:bg-slate-100"
        >
          <span className="mr-2 text-lg">←</span> 返回控制台
        </button>
      </div>
        <main className="container mx-auto px-4 py-8 w-full max-w-7xl">
          {/* Title */}
          <header className="text-center mb-8">
            <div className="inline-flex items-center gap-3 mb-2">
              <span className="text-4xl">✨</span>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
                AI 智能搭配师
              </h1>
            </div>
            <p className="text-lg text-slate-600">
              上传一件服装，AI 将自动为您补全全身穿搭，并生成专业电商展示图
            </p>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Input Section */}
            <div className="lg:col-span-5 space-y-4">
              {/* Step 1: Garment Upload & Category */}
              <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-indigo-400">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
                    </svg>
                    上传服装
                  </h3>
                  <span className="text-xs font-bold text-indigo-400 bg-indigo-900/30 px-2 py-1 rounded-full uppercase">Step 1</span>
                </div>
                
                <ImageUpload
                  label="上传服装图片"
                  subLabel="如：外套、连衣裙、上衣等"
                  image={clothingImage}
                  onUpload={setClothingImage}
                  onRemove={() => setClothingImage(null)}
                />

                {clothingImage && (
                  <div className="mt-4 pt-4 border-t border-slate-300 animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                      </svg>
                      这是什么类型的服装？
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {(['outerwear', 'tops', 'bottoms', 'dresses', 'outfits'] as GarmentCategory[]).map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setGarmentCategory(cat)}
                          className={`px-3 py-2 text-sm rounded-lg border transition-all ${
                            garmentCategory === cat 
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' 
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
                      <p className="text-xs text-indigo-400 mt-2 bg-indigo-900/20 p-2 rounded-md border border-indigo-800/50">
                        💡 AI 将自动搭配内搭和下装。
                      </p>
                    )}
                    {garmentCategory === 'tops' && (
                      <p className="text-xs text-indigo-400 mt-2 bg-indigo-900/20 p-2 rounded-md border border-indigo-800/50">
                        💡 AI 将自动搭配下装。
                      </p>
                    )}
                    {garmentCategory === 'bottoms' && (
                      <p className="text-xs text-indigo-400 mt-2 bg-indigo-900/20 p-2 rounded-md border border-indigo-800/50">
                        💡 AI 将自动搭配上装。
                      </p>
                    )}
                    {garmentCategory === 'outfits' && (
                      <p className="text-xs text-indigo-400 mt-2 bg-indigo-900/20 p-2 rounded-md border border-indigo-800/50">
                        💡 AI 将还原整套搭配效果 (包含配饰)。
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Advanced Settings Toggle */}
              <button 
                onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                className="w-full flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors group text-slate-700"
              >
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-indigo-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="font-medium text-sm">高级设置 (场景、模特、构图)</span>
                </div>
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  strokeWidth={2} 
                  stroke="currentColor" 
                  className={`w-4 h-4 text-slate-600 transition-transform duration-200 ${showAdvancedSettings ? 'rotate-180' : ''}`}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              {/* Advanced Settings Content */}
              {showAdvancedSettings && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  {/* Step 2: Scene & Atmosphere */}
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    <button 
                      onClick={() => toggleSection('scene')}
                      className="w-full p-4 flex items-center justify-between hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-2 font-semibold text-slate-800">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-indigo-400">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                        </svg>
                        场景与氛围设定
                      </div>
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        strokeWidth={2} 
                        stroke="currentColor" 
                        className={`w-5 h-5 text-slate-600 transition-transform ${openSections['scene'] ? 'rotate-180' : ''}`}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                    
                    {openSections['scene'] && (
                      <div className="p-4 border-t border-slate-200 space-y-6 animate-in slide-in-from-top-1 fade-in duration-200">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                              场景风格 (Style & Scene)
                            </label>
                            <button 
                              onClick={() => setIsSceneEnabled(!isSceneEnabled)}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                                isSceneEnabled ? 'bg-green-500' : 'bg-slate-200'
                              }`}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition transition-transform ${
                                  isSceneEnabled ? 'translate-x-6' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </div>

                          {isSceneEnabled && (
                            <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                              {/* Tabs (STYLES) */}
                              <div className="flex overflow-x-auto pb-2 scrollbar-hide border-b border-slate-200 mb-3 space-x-4">
                                {SCENE_CATEGORIES.map((category) => (
                                  <button
                                    key={category.id}
                                    onClick={() => setActiveSceneTab(category.id)}
                                    className={`whitespace-nowrap px-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                                      activeSceneTab === category.id 
                                        ? 'border-indigo-600 text-indigo-400' 
                                        : 'border-transparent text-slate-500 hover:text-slate-700'
                                    }`}
                                  >
                                    {category.label}
                                  </button>
                                ))}
                              </div>

                              {/* Chips Grid (SCENES) */}
                              <div className="grid grid-cols-4 gap-2">
                                {SCENE_CATEGORIES.find(c => c.id === activeSceneTab)?.options.map((option) => (
                                  <button
                                    key={option.id}
                                    onClick={() => setBackgroundStyle(option.id)}
                                    className={`px-1 py-2 text-xs rounded-md border text-center transition-all ${
                                      backgroundStyle === option.id
                                        ? 'bg-indigo-900/50 border-indigo-600 text-indigo-300 font-medium'
                                        : 'bg-slate-100 border-slate-300 text-slate-600 hover:border-slate-600'
                                    }`}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Advanced Photography Settings */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-200 pt-4">
                          {/* Time Selection */}
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12H18.75m-3.75 0H12m-3.75 0H3.75m3.75 0v2.25m0-2.25V12m0 2.25H9m3.75 0H12m-3.75 0H3.75m3.75 0v2.25m0-2.25V15m0 2.25H9m3.75 0H12m-3.75 0H3.75m3.75 0v2.25m0-2.25V18m0 2.25H9m3.75 0H12m-3.75 0H3.75m3.75 0v2.25m0-2.25V21M12 21v-2.25m0 2.25H9m3.75 0H12m-3.75 0H3.75m3.75 0v-2.25m0 2.25H9m3.75 0H12m-3.75 0H3.75m3.75 0v-2.25m0 2.25H9m3.75 0H12" />
                              </svg>
                              时间
                            </label>
                            <select 
                              value={timeOfDay}
                              onChange={(e) => setTimeOfDay(e.target.value as TimeOfDay)}
                              className="w-full text-sm border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 py-2 bg-slate-100 text-slate-800"
                            >
                              <option value="default">智能默认</option>
                              <option value="morning">清晨 (Morning)</option>
                              <option value="noon">正午 (Noon)</option>
                              <option value="sunset">日落 (Sunset)</option>
                              <option value="night">夜晚 (Night)</option>
                            </select>
                          </div>

                          {/* Lighting Selection */}
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                              </svg>
                              光影
                            </label>
                            <select 
                              value={lighting}
                              onChange={(e) => setLighting(e.target.value as LightingType)}
                              className="w-full text-sm border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 py-2 bg-slate-100 text-slate-800"
                            >
                              <option value="natural">自然光 (Natural)</option>
                              <option value="studio">影棚光 (Studio)</option>
                              <option value="cinematic">电影感 (Cinematic)</option>
                              <option value="dramatic">强对比 (Dramatic)</option>
                              <option value="soft">柔光 (Soft)</option>
                            </select>
                          </div>
                          
                          {/* Quality/Texture Selection */}
                          <div className="col-span-2">
                            <label className="block text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                              </svg>
                              质感 & 风格
                            </label>
                            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                              {[
                                { id: 'realistic', label: '真实实拍' },
                                { id: 'editorial', label: '时尚大片' },
                                { id: 'lifestyle', label: '生活随拍' },
                                { id: 'film', label: '胶片复古' },
                                { id: 'xiaohongshu', label: '小红书风' }
                              ].map((opt) => (
                                <button
                                  key={opt.id}
                                  onClick={() => setImageQuality(opt.id as ImageQuality)}
                                  className={`py-1.5 px-1 text-xs rounded-md border text-center transition-all ${
                                    imageQuality === opt.id
                                      ? 'bg-violet-900/50 border-violet-500 text-violet-300 font-medium'
                                      : 'bg-slate-100 border-slate-300 text-slate-600 hover:border-slate-600'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Step 3: Model Settings */}
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    <button 
                      onClick={() => toggleSection('model')}
                      className="w-full p-4 flex items-center justify-between hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-2 font-semibold text-slate-800">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-indigo-400">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                        </svg>
                        模特设定 (可选)
                      </div>
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        strokeWidth={2} 
                        stroke="currentColor" 
                        className={`w-5 h-5 text-slate-600 transition-transform ${openSections['model'] ? 'rotate-180' : ''}`}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>

                    {openSections['model'] && (
                      <div className="p-4 border-t border-slate-200 space-y-4 animate-in slide-in-from-top-1 fade-in duration-200">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-2">人种</label>
                            <select
                              value={modelEthnicity}
                              onChange={(e) => setModelEthnicity(e.target.value as ModelEthnicity)}
                              className="w-full text-sm border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 py-2 bg-slate-100 text-slate-800"
                            >
                              <option value="asian">亚洲 (Asian)</option>
                              <option value="caucasian">欧美 (Caucasian)</option>
                              <option value="black">非裔 (Black)</option>
                              <option value="latino">拉美 (Latino)</option>
                              <option value="southeast_asian">东南亚 (SE Asian)</option>
                              <option value="mixed">混血 (Mixed)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-2">年龄段</label>
                            <select
                              value={modelAge}
                              onChange={(e) => setModelAge(e.target.value as ModelAge)}
                              className="w-full text-sm border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 py-2 bg-slate-100 text-slate-800"
                            >
                              <option value="teen">青年 (18-20)</option>
                              <option value="20s">20+ (20-29)</option>
                              <option value="30s">30+ (30-39)</option>
                              <option value="40s">成熟 (40+)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-2">身材 (Body Shape)</label>
                            <select
                              value={modelBodyShape}
                              onChange={(e) => setModelBodyShape(e.target.value as ModelBodyShape)}
                              className="w-full text-sm border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 py-2 bg-slate-100 text-slate-800"
                            >
                              <option value="slim">苗条 (Slim)</option>
                              <option value="standard">标准匀称 (Standard)</option>
                              <option value="athletic">运动健美 (Athletic)</option>
                              <option value="curvy">曲线沙漏 (Curvy)</option>
                              <option value="pear">梨形身材 (Pear)</option>
                              <option value="plus_size">大码丰满 (Plus Size)</option>
                              <option value="muscular">强壮肌肉 (Muscular)</option>
                              <option value="petite">娇小 (Petite)</option>
                              <option value="tall">高挑 (Tall)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-2">姿势 (Pose)</label>
                            <select
                              value={modelPose}
                              onChange={(e) => setModelPose(e.target.value as ModelPose)}
                              className="w-full text-sm border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 py-2 bg-slate-100 text-slate-800"
                            >
                              <optgroup label="站姿 (Standing)">
                                <option value="standing_basic">自然站立 (Basic)</option>
                                <option value="standing_crossed_arms">双手抱臂 (Confident)</option>
                                <option value="standing_hands_pocket">插兜 (Hands in Pocket)</option>
                                <option value="leaning_wall">靠墙站立 (Leaning)</option>
                              </optgroup>
                              <optgroup label="动态 (Dynamic)">
                                <option value="walking">走路/动态 (Walking)</option>
                                <option value="running">跑步/运动 (Running)</option>
                                <option value="dynamic_fashion">时尚大片 (High Fashion)</option>
                              </optgroup>
                              <optgroup label="坐姿 (Sitting)">
                                <option value="sitting_stool">坐高脚凳 (Stool)</option>
                                <option value="sitting_chair">坐椅 (Chair)</option>
                                <option value="sitting_floor">坐地 (Floor)</option>
                              </optgroup>
                              <optgroup label="特写 (Profile)">
                                <option value="looking_back">回眸 (Looking Back)</option>
                                <option value="side_profile">侧身 (Side Profile)</option>
                              </optgroup>
                            </select>
                          </div>
                        </div>
                        
                        <hr className="border-slate-200" />

                        {/* Optional Model Upload */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-medium text-slate-700">指定模特 (高级)</label>
                            <span className="text-xs text-slate-500">优先级高于人种设定</span>
                          </div>
                          <ImageUpload
                            label=""
                            subLabel="上传您想使用的模特照片"
                            image={modelImage}
                            onUpload={setModelImage}
                            onRemove={() => setModelImage(null)}
                            icon={
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                              </svg>
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Step 4: Composition & Ratio */}
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    <button 
                      onClick={() => toggleSection('composition')}
                      className="w-full p-4 flex items-center justify-between hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-2 font-semibold text-slate-800">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-indigo-400">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                        </svg>
                        构图与比例
                      </div>
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        strokeWidth={2} 
                        stroke="currentColor" 
                        className={`w-5 h-5 text-slate-600 transition-transform ${openSections['composition'] ? 'rotate-180' : ''}`}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>

                    {openSections['composition'] && (
                      <div className="p-4 border-t border-slate-200 space-y-4 animate-in slide-in-from-top-1 fade-in duration-200">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">图片比例</label>
                          <div className="grid grid-cols-4 gap-2">
                            {(['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '21:9'] as AspectRatio[]).map((ratio) => (
                              <button
                                key={ratio}
                                onClick={() => setAspectRatio(ratio)}
                                className={`py-2 text-xs rounded-lg border transition-all ${
                                  aspectRatio === ratio
                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                    : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                                }`}
                              >
                                {ratio}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Focus Mode Toggle */}
                        <div className="bg-indigo-900/20 p-3 rounded-lg border border-indigo-800/50">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-slate-700 flex items-center gap-2 cursor-pointer" onClick={() => setIsProductFocus(!isProductFocus)}>
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-indigo-400">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                              </svg>
                              聚焦产品细节 (半身)
                            </label>
                            <button 
                              onClick={() => setIsProductFocus(!isProductFocus)}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                                isProductFocus ? 'bg-indigo-600' : 'bg-slate-200'
                              }`}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition transition-transform ${
                                  isProductFocus ? 'translate-x-6' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </div>
                          <p className="text-xs text-slate-600 mt-1 ml-6">
                            {isProductFocus 
                              ? "生成半身特写，突出材质与细节。" 
                              : "生成全身展示，包含鞋履搭配。"}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Generate Button */}
              <button
                onClick={handleGenerate}
                disabled={!clothingImage || isLoading}
                className={`
                  w-full py-4 px-6 rounded-xl font-bold text-white shadow-lg transition-all transform hover:-translate-y-0.5 active:translate-y-0
                  flex items-center justify-center gap-2
                  ${!clothingImage || isLoading
                    ? 'bg-slate-200 cursor-not-allowed shadow-none'
                    : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:shadow-indigo-500/30'
                  }
                `}
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>正在设计穿搭...</span>
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                    </svg>
                    <span>生成效果图</span>
                  </>
                )}
              </button>

              {status === AppStatus.ERROR && (
                <div className="p-4 bg-red-900/20 border border-red-800/50 rounded-xl flex items-start space-x-3 text-red-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-sm">{errorMessage}</div>
                </div>
              )}
            </div>

            {/* Output Section */}
            <div className="lg:col-span-7">
              <div className="bg-white border border-slate-200 rounded-2xl shadow-xl h-full overflow-hidden flex flex-col min-h-[600px]">
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
                    <div className="text-center text-slate-500 max-w-sm">
                      <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-slate-300">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 text-indigo-400/50">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                        </svg>
                      </div>
                      <h4 className="text-slate-700 font-medium mb-1">准备就绪</h4>
                      <p className="text-sm">上传服装，开始您的 AI 穿搭设计之旅。</p>
                    </div>
                  )}

                  {status === AppStatus.GENERATING && (
                    <div className="text-center space-y-6 max-w-md">
                      <div className="relative w-32 h-32 mx-auto">
                        <div className="absolute inset-0 border-4 border-slate-200 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="text-indigo-600 w-10 h-10 animate-pulse">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                          </svg>
                        </div>
                      </div>
                      <div>
                        <h4 className="text-lg font-semibold text-slate-800">AI 正在生成中...</h4>
                        <p className="text-slate-600 mt-2">
                          正在分析服装细节... 智能匹配单品... 渲染场景光影...
                        </p>
                      </div>
                    </div>
                  )}

                  {status === AppStatus.SUCCESS && generatedImageUrl && (
                    <div className="relative w-full h-full flex items-center justify-center group animate-in fade-in duration-700">
                      <div className="relative cursor-zoom-in" onClick={() => setIsPreviewOpen(true)}>
                        <img 
                          src={generatedImageUrl} 
                          alt="生成的效果图" 
                          className="max-h-[700px] w-auto object-contain rounded-lg shadow-lg"
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/10 rounded-lg pointer-events-none">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="text-white drop-shadow-md w-12 h-12 opacity-80">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                          </svg>
                        </div>
                      </div>
                      
                      <div className="absolute bottom-8 flex gap-3 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 pointer-events-none">
                        <a 
                          href={generatedImageUrl} 
                          download={`ai-style-${Date.now()}.png`}
                          className="pointer-events-auto flex items-center space-x-2 bg-white text-slate-800 px-6 py-3 rounded-full font-bold shadow-xl hover:bg-slate-100 transition-colors border border-slate-300"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021.75 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                          </svg>
                          <span>下载高清大图</span>
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Full Screen Image Preview Modal */}
            {isPreviewOpen && generatedImageUrl && (
              <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsPreviewOpen(false)}>
                <button 
                  className="absolute top-4 right-4 text-white hover:text-gray-300 p-2"
                  onClick={() => setIsPreviewOpen(false)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <img 
                  src={generatedImageUrl} 
                  alt="全屏预览" 
                  className="max-w-full max-h-full object-contain rounded-md shadow-2xl"
                  onClick={(e) => e.stopPropagation()} 
                />
                <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
                  <a 
                    href={generatedImageUrl} 
                    download={`ai-style-${Date.now()}.png`}
                    className="flex items-center space-x-2 bg-white/10 text-white border border-white/20 px-6 py-3 rounded-full font-bold backdrop-blur-md hover:bg-white/20 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021.75 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    <span>下载图片</span>
                  </a>
                </div>
              </div>
            )}
          </div>
        </main>
    </div>
  );
};

