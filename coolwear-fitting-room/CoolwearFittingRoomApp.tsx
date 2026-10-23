import React, { useRef, useState } from 'react';
import { AppProps } from '../../types';
import { UploadZone } from './components/UploadZone';
import { ResultView } from './components/ResultView';
import { Toast } from './components/Toast';
import { Lightbox } from './components/Lightbox';
import { ImageAsset, GenerationStatus, GeneratedResult } from './types';
import { generateClothingImage } from './services/geminiService';

// 风格预设定义
const STYLE_PRESETS = [
  {
    id: 'brand',
    label: '品牌目录风',
    description: '简约棚拍、清爽、东方美',
    prompt: '专业摄影棚光效，干净背景，极简构图，自然柔和的肌肤质感，高端时尚目录风格。',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7 text-indigo-500">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
      </svg>
    )
  },
  {
    id: 'neutral',
    label: '简约中性风',
    description: '18-25岁，酷飒短发女孩',
    prompt: '中性时尚风格，短发酷女孩，极简穿搭，城市街头抓拍，低饱和色调，毫不费力的时髦感。',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7 text-slate-600">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
      </svg>
    )
  },
  {
    id: 'sports',
    label: '欧美运动风',
    description: '健康肤色、力量感',
    prompt: '运动休闲风，健身房或户外跑道背景，健康的小麦肤色，充满活力的姿势，动感光影，健身美学。',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7 text-orange-500">
        <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
      </svg>
    )
  },
  {
    id: 'anime',
    label: '二次元/coser',
    description: '日漫国漫、破次元壁、Coser写真',
    prompt: '高品质Cosplay摄影，打破次元壁，日漫或国漫风格，精致的二次元妆容，还原动漫角色神韵，2.5D半写实渲染，梦幻光影，高颜值Coser。',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7 text-pink-500">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
      </svg>
    )
  },
  {
    id: 'street',
    label: '高街潮流',
    description: 'Y2K、大胆配色、个性',
    prompt: '高街潮流时尚，Y2K美学，大胆的配色，鱼眼镜头效果，涂鸦背景，叛逆的态度。',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7 text-purple-500">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" />
      </svg>
    )
  },
  {
    id: 'chinese',
    label: '清冷新中式',
    description: '东方韵味、极简、高级灰',
    prompt: '新中式风格，竹林庭院背景，清冷色调，优雅内敛的姿势，柔和光线，瓷白肌肤。',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7 text-emerald-500">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>
    )
  },
  {
    id: 'film',
    label: '胶片复古风',
    description: '颗粒感、暖色调、文艺',
    prompt: '复古胶片摄影，Kodak Portra 400 胶卷质感，温暖的颗粒感，怀旧氛围，90年代时尚感，自然抓拍。',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7 text-amber-500">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
      </svg>
    )
  },
  {
    id: 'korean',
    label: '韩系简约',
    description: '温柔、低饱和、日常',
    prompt: '韩系极简时尚，柔和的奶油色和米色调，自然裸妆，咖啡馆背景，温柔光线，日常穿搭感。',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7 text-rose-300">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
      </svg>
    )
  },
  {
    id: 'business',
    label: '职场通勤',
    description: '干练、精致、CBD背景',
    prompt: '现代商务休闲风，摩天大楼办公室背景，自信的姿势，利落的西装造型，专业布光，都市精英感。',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7 text-blue-400">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.25 2.25 0 0 0 2.25-2.25V4.5a2.25 2.25 0 0 0-2.25-2.25h-13.5A2.25 2.25 0 0 0 4.5 4.5v6c0 1.094.787 2.036 1.872 2.18" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.504-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.23v1.5c0 .621.504 1.125 1.125 1.125h11.25c.621 0 1.125-.504 1.125-1.125V4.23a2.25 2.25 0 0 0-4.5 0v.641c0 .285-.23.516-.515.516h-3.375a.516.516 0 0 1-.515-.516V4.23a2.25 2.25 0 0 0-4.5 0Z" />
      </svg>
    )
  },
  {
    id: 'cyberpunk',
    label: '赛博机能',
    description: '未来感、霓虹、机械',
    prompt: '赛博朋克风格，霓虹灯光效，机械感配饰，未来主义机能风穿搭，夜晚城市背景，高对比度冷暖色调。',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7 text-cyan-400">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12h1.5m1.5 0h1.5m-1.5 1.5l1.5-1.5m1.5-1.5l-1.5 1.5m-4.5 4.5H4.5m15 0h-1.5M15.75 21V19.5m-3 1.5V19.5m0-1.5v-1.5m-1.5 0H7.5m9 0h-3.75m3.75 0H21m-1.5-3H15.75m-6 0H5.25m4.5 0H12m.75-9H15M4.5 3v1.5m6.75 1.5h1.5m1.5-1.5l1.5-1.5M3 21h18" />
      </svg>
    )
  },
  {
    id: 'vacation',
    label: '海岛度假',
    description: '阳光、沙滩、松弛感',
    prompt: '海岛度假氛围，自然阳光，蓝天白云沙滩背景，轻松惬意的姿势，明亮清透的色调，夏日清爽感。',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7 text-sky-400">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.263-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
      </svg>
    )
  },
  {
    id: 'academy',
    label: '英伦学院',
    description: '复古、书卷气、优雅',
    prompt: '英伦学院风格，古典图书馆或校园背景，知性优雅，复古色调，胶片质感，文艺氛围。',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7 text-yellow-500">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z" />
      </svg>
    )
  }
];

export const CoolwearFittingRoomApp: React.FC<AppProps> = ({ platform, costs }) => {
  const inFlightRef = useRef(false);
  const lastSubmitAtRef = useRef(0);
  const [productImage, setProductImage] = useState<ImageAsset | null>(null);
  const [refImage, setRefImage] = useState<ImageAsset | null>(null);
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [generatedHistory, setGeneratedHistory] = useState<GeneratedResult[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const handleGenerate = async () => {
    const now = Date.now();
    if (inFlightRef.current) {
      return;
    }
    // Prevent accidental rapid double-clicks before state disable takes effect.
    if (now - lastSubmitAtRef.current < 1200) {
      setToast({ message: '请求过于频繁，请稍候再试', type: 'info' });
      return;
    }

    if (!productImage) {
      setToast({ message: '请先上传产品图', type: 'error' });
      return;
    }

    // 检查余额（不扣除）
    if (!platform.checkBalance(costs.GENERATE_CLOTHING_IMAGE)) {
      return; // 余额不足会自动显示充值弹窗
    }

    inFlightRef.current = true;
    lastSubmitAtRef.current = now;
    setStatus(GenerationStatus.GENERATING);
    setErrorMsg(null);

    try {
      const resultImageUrls = await generateClothingImage(
        productImage,
        refImage,
        customPrompt,
        {
          imageCount: 2,
          clientMaxRetries: 2,
        }
      );

      const timestamp = Date.now();
      const newResults: GeneratedResult[] = resultImageUrls.map((url, index) => ({
        imageUrl: url,
        refImageUrl: refImage ? refImage.previewUrl : '',
        timestamp: timestamp + index
      }));

      setGeneratedHistory(prev => [...newResults, ...prev]);
      await platform.refreshCredits?.();
      setStatus(GenerationStatus.SUCCESS);
      setToast({ message: '生成成功！', type: 'success' });
    } catch (e: any) {
      // 请求失败，不扣费
      console.error(e);
      setStatus(GenerationStatus.ERROR);
      setErrorMsg(e.message || '生成失败，请检查网络或重试');
      setToast({ message: '生成失败，请重试', type: 'error' });
    } finally {
      inFlightRef.current = false;
    }
  };

  const handlePresetSelect = (preset: typeof STYLE_PRESETS[0]) => {
    setActivePresetId(preset.id);
    setCustomPrompt(preset.prompt);
    setRefImage(null);
  };

  const handleManualRefUpload = (image: ImageAsset) => {
    setRefImage(image);
    setActivePresetId(null);
  };

  const activePreset = STYLE_PRESETS.find(p => p.id === activePresetId);

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-800 font-sans">
      <div className="flex items-center border-b border-slate-200 px-6 py-3 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <button
          onClick={platform.onBack}
          className="flex items-center text-slate-700 hover:text-blue-600 transition-colors font-medium py-1.5 px-2 rounded-lg hover:bg-slate-100"
        >
          <span className="mr-2 text-lg">←</span> 返回控制台
        </button>
      </div>
        <main className="flex-grow container mx-auto px-4 py-8 w-full max-w-7xl">
          <header className="mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold">
              图片生成 · 每次 {costs.GENERATE_CLOTHING_IMAGE} 积分
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">内衣试衣间</h1>
            <p className="mt-2 text-sm md:text-base text-slate-600 max-w-3xl">
              上传服装图并选择风格灵感，快速生成高质量试衣效果图，适用于电商展示与素材创作。
            </p>
          </header>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Control Panel */}
            <div className="lg:col-span-4 space-y-8">
              {/* Upload Section */}
              <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-xl">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-800">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-indigo-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                  </svg>
                  上传素材
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <UploadZone 
                    label="产品静物图" 
                    description="上传服装平铺/挂拍图"
                    image={productImage}
                    onImageSelected={setProductImage}
                    onClear={() => setProductImage(null)}
                  />
                  <UploadZone 
                    label="风格参考图 (可选)" 
                    description="上传想要的构图/光影"
                    image={refImage}
                    onImageSelected={handleManualRefUpload}
                    onClear={() => { setRefImage(null); setActivePresetId(null); }}
                    customPreview={activePreset ? (
                      <div className="flex flex-col items-center justify-center text-center p-2">
                        <div className="scale-75 mb-1">{activePreset.icon}</div>
                        <span className="font-semibold text-indigo-400 text-xs line-clamp-1">{activePreset.label}</span>
                        <span className="text-[10px] text-slate-500 mt-1">已应用风格预设</span>
                      </div>
                    ) : null}
                  />
                </div>
              </div>

              {/* Style Selector */}
              <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-xl">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-800">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-indigo-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42" />
                  </svg>
                  风格灵感库
                </h2>
                <div className="flex overflow-x-auto gap-3 pb-4 custom-scrollbar snap-x">
                  {STYLE_PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      onClick={() => handlePresetSelect(preset)}
                      className={`
                        flex-shrink-0 w-28 p-3 rounded-xl border text-left transition-all snap-start
                        flex flex-col gap-2 relative overflow-hidden
                        ${activePresetId === preset.id 
                          ? 'border-indigo-500 bg-indigo-900/30 ring-1 ring-indigo-500' 
                          : 'border-slate-300 hover:border-indigo-600 hover:bg-slate-100'
                        }
                      `}
                    >
                      <div className="w-8 h-8 bg-slate-100 rounded-full shadow-sm flex items-center justify-center">
                        {preset.icon}
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-slate-800">{preset.label}</div>
                        <div className="text-[10px] text-slate-600 leading-tight mt-1">{preset.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Prompt Editor */}
              <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-xl">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-800">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-indigo-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
                  </svg>
                  AI 指令 (可编辑)
                </h2>
                <textarea
                  className="w-full h-32 p-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none bg-slate-100 text-slate-800"
                  placeholder="在这里输入或修改生成指令..."
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                />
                <div className="mt-2 text-xs text-slate-500">
                  提示：您可以直接修改上方文字来调整生成细节
                </div>
              </div>

              {/* Generate Button */}
              <button
                onClick={handleGenerate}
                disabled={status === GenerationStatus.GENERATING || !productImage}
                className={`
                  w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all transform active:scale-95
                  flex items-center justify-center gap-2
                  ${status === GenerationStatus.GENERATING || !productImage
                    ? 'bg-slate-200 text-slate-500 cursor-not-allowed shadow-none'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-500/50'
                  }
                `}
              >
                {status === GenerationStatus.GENERATING ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    正在生成...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
                    </svg>
                    开始生成
                  </>
                )}
              </button>
            </div>

            {/* Right Result Area */}
            <div className="lg:col-span-8 min-h-[600px]">
              <ResultView 
                status={status}
                resultUrl={generatedHistory[0]?.imageUrl || null}
                history={generatedHistory}
                error={errorMsg}
                onImageClick={setLightboxUrl}
              />
            </div>
          </div>
        </main>
      {/* Lightbox */}
      {lightboxUrl && (
        <Lightbox imageUrl={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}
      {/* Toast Notification */}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}
    </div>
  );
};

