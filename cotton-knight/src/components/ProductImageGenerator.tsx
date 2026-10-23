import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, Download, History, Image as ImageIcon, Loader2, Maximize2, SlidersHorizontal, Sparkles, Trash2, X } from 'lucide-react';
import { ImageUpload } from './ImageUpload';
import localforage from 'localforage';
import { APP_ID, generateProductImages, type UploadedImage } from '../services/geminiService';

export interface HistoryItem {
  id: string;
  url: string;
  prompt: string;
  createdAt: number;
}

const MODELS = [
  { id: 'nanobanana', label: '香蕉nanobanana (10积分/图)' },
  { id: 'image-2', label: 'image-2 (5积分/图)' },
] as const;

const PRESETS = [
  { label: "云端柔嫩", value: "产品置于柔软洁白的云朵之中，背景是渐变的浅蓝色天空，梦幻轻盈，极具空气感，强调极致的柔软与亲肤感" },
  { label: "自然草本", value: "产品放置在清新的绿草地上，周围有晶莹的水滴或透明气泡点缀，背景是蓝天，充满生机与自然健康感" },
  { label: "清透水波", value: "产品放置在清透的水面上，周围有动态的飞溅水花或水波纹，背景带有些许自然森林绿意，强调纯净、保湿与水润感" },
  { label: "晴空阶梯", value: "产品放置在干净纯白的几何阶梯或展台上，背景是明朗的蓝天白云，阳光洒落带来清晰的光影，空间感与通透感强" },
  { label: "居家温馨", value: "背景是阳光明媚的温馨居家环境，浅色原木桌面和米白色亚麻桌布，旁边有几缕清晨的阳光，氛围治愈柔和" },
  { label: "质感大理石", value: "产品放置在白色高级大理石台面上，背景是浅灰色的极简墙面，侧面有柔和的窗外自然光打在产品上，凸显高级质感" },
  { label: "浴室场景", value: "现代极简的高级浴室场景，白色洗手台，背景是干净的浅色瓷砖，产品旁边有晶莹的水滴，体现清洁与清爽感" },
  { label: "丝绸质感", value: "产品放置在浅色（如香槟色或浅蓝色）的丝绸背景上，丝绸呈现出高级的波浪褶皱与丝滑光泽，突出产品的细腻与亲肤" },
  { label: "几何艺术", value: "极简的几何石膏展台，低饱和度的莫兰迪色系（如浅燕麦色或低灰度蓝），侧面柔和主光，高级感棚拍，凸显现代设计感" },
  { label: "母婴呵护", value: "温馨柔和的婴儿房背景，浅色调，周围有柔软的毛绒玩具或婴儿毯，光线温暖柔和，强调极致的安全与呵护感" },
];

export default function ProductImageGenerator() {
  const [prompt, setPrompt] = useState('');
  const [referenceImage, setReferenceImage] = useState<UploadedImage | null>(null);
  const [styleReferenceImage, setStyleReferenceImage] = useState<UploadedImage | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [model, setModel] = useState<(typeof MODELS)[number]['id']>(MODELS[0].id);
  const [showSettings, setShowSettings] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [promptUsed, setPromptUsed] = useState('');

  useEffect(() => {
    const loadHistory = async () => {
      const storedHistory: HistoryItem[] | null = await localforage.getItem('image_history');
      if (storedHistory) {
        setHistory(storedHistory);
      }
    };
    loadHistory();
  }, []);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError('');
    setPromptUsed('');

    try {
      if (!referenceImage) {
        throw new Error('请先上传商品主体图');
      }

      const result = await generateProductImages({
        prompt,
        model,
        referenceImage,
        styleReferenceImage,
        numberOfImages: 2,
        aspectRatio: '1:1',
        imageSize: model === 'nanobanana' ? '2K' : '1K',
      });

      if (result.images.length > 0) {
        setImages(result.images);
        setPromptUsed(result.promptUsed);

        const newHistoryItems: HistoryItem[] = result.images.map((url: string) => ({
          id: crypto.randomUUID(),
          url,
          prompt: prompt || result.promptUsed || 'Product Image',
          createdAt: Date.now(),
        }));

        const currentHistory = (await localforage.getItem<HistoryItem[]>('image_history')) || [];
        const updatedHistory = [...newHistoryItems, ...currentHistory];
        await localforage.setItem('image_history', updatedHistory);
        setHistory(updatedHistory);
      } else {
        throw new Error('未返回图片');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = (imageUrl: string) => {
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `${APP_ID}-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleRemix = (imageUrl: string, type: 'product' | 'style') => {
    const match = imageUrl.match(/^data:(image\/[a-zA-Z0-9]+);base64,(.+)$/);
    if (match) {
      const imgData = { mimeType: match[1], data: match[2] };
      if (type === 'product') {
        setReferenceImage(imgData);
      } else {
        setStyleReferenceImage(imgData);
      }
    }
    setFullscreenImage(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteHistory = async (id: string) => {
    const newHistory = history.filter(item => item.id !== id);
    setHistory(newHistory);
    await localforage.setItem('image_history', newHistory);
  };

  return (
    <div className="min-h-screen bg-[#F0F2F5] relative flex items-center justify-center p-4 lg:p-8 font-sans overflow-hidden">
      {/* Decorative background shapes mimicking the reference image abstract shapes */}
      <div className="absolute top-0 left-0 w-[800px] h-[800px] bg-[#E3E8E4] rounded-full mix-blend-multiply filter blur-3xl opacity-70 -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-[1000px] h-[1000px] bg-[#FFF8E7] rounded-full mix-blend-multiply filter blur-3xl opacity-70 translate-x-1/3 translate-y-1/3" />
      
      <div className="w-full max-w-[1440px] bg-white/95 backdrop-blur-xl rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] border border-white/50 overflow-hidden relative z-10 flex flex-col min-h-[85vh]">
        
        {/* Main Content Area */}
        <main className="flex-1 flex flex-col lg:flex-row px-8 lg:px-12 pt-12 pb-12 gap-12 lg:gap-16">
          
          {/* Left Column: Form & Text */}
          <div className="w-full lg:w-[45%] flex flex-col justify-center max-w-xl mx-auto lg:mx-0">
            <div className="mb-8">
              <p className="text-[10px] sm:text-xs font-semibold tracking-[0.2em] text-stone-400 uppercase mb-4">Ai Powered • Product Image</p>
              <h1 className="text-5xl sm:text-6xl lg:text-[4rem] font-bold tracking-tight text-stone-900 leading-[1.1] mb-6">
                洗脸巾-主图生成
              </h1>
              <p className="text-stone-500 text-base sm:text-lg leading-relaxed max-w-[90%]">
                上传洗脸巾商品主体图，选择或描述您想要的场景风格，一键生成高品质、吸引眼球的电商展示主图。
              </p>
            </div>

            <div className="space-y-5">
              {/* Image Upload Area */}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <ImageUpload
                    image={referenceImage}
                    onUpload={setReferenceImage}
                    title="商品主体图 (必填)"
                    placeholder="上传主体"
                  />
                </div>
                <div className="flex-1">
                  <ImageUpload
                    image={styleReferenceImage}
                    onUpload={setStyleReferenceImage}
                    title="参考风格图 (可选)"
                    placeholder="上传风格"
                  />
                </div>
              </div>

              {/* Collapsible Presets Section */}
              <details className="group bg-stone-50 border border-stone-200 rounded-2xl overflow-hidden transition-all duration-300">
                <summary className="flex justify-between items-center font-medium cursor-pointer list-none p-4 text-sm text-stone-700 select-none">
                  <span className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-blue-500" /> 常用主图风格</span>
                  <span className="transition-transform duration-300 group-open:-rotate-180 text-stone-400">
                    <ChevronDown className="w-4 h-4" />
                  </span>
                </summary>
                <div className="p-4 pt-0 border-t border-stone-100 bg-white">
                  <div className="flex flex-wrap gap-2 mt-4">
                    {PRESETS.map(preset => (
                      <button
                        key={preset.label}
                        onClick={() => setPrompt(preset.value)}
                        className="text-xs bg-stone-50 border border-stone-200 text-stone-600 px-3 py-1.5 rounded-full hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors shadow-sm"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </details>

              <textarea
                className="w-full bg-stone-50 border border-stone-200 rounded-2xl p-4 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none transition-all"
                rows={2}
                placeholder="（非必填项）描述你想要的背景与氛围，例如：极简纯白背景，柔和自然光..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isGenerating}
              />
              
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || !referenceImage}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white px-6 py-3.5 rounded-full text-sm font-medium transition-all shadow-lg shadow-blue-600/20"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      生成中...
                    </>
                  ) : (
                    <>生成图片</>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSettings((prev) => !prev)}
                  className="flex items-center justify-center gap-2 bg-[#FEE9CD] hover:bg-[#FCD8B0] text-[#D97706] px-6 py-3.5 rounded-full text-sm font-medium transition-colors"
                  aria-expanded={showSettings}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  设置
                </button>
                <button 
                  onClick={() => {
                    setPrompt('');
                    setPromptUsed('');
                    setImages([]);
                    setReferenceImage(null);
                    setStyleReferenceImage(null);
                    setModel(MODELS[0].id);
                    setShowSettings(false);
                  }}
                  className="flex items-center justify-center px-6 py-3.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-full text-sm font-medium transition-colors"
                >
                  重置
                </button>
              </div>

              <AnimatePresence initial={false}>
                {showSettings && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-stone-800">AI 模型</span>
                        <span className="text-xs text-stone-500">生成 2 张图</span>
                      </div>
                      <div className="flex flex-col gap-2">
                        {MODELS.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setModel(item.id)}
                            className={`text-left px-3 py-2 rounded-xl border ${
                              model === item.id
                                ? 'bg-blue-50 border-blue-200 text-blue-700'
                                : 'bg-white border-transparent text-stone-500 hover:bg-stone-100 hover:text-stone-900'
                            } transition-colors shadow-sm`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {promptUsed && (
                <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-900">
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">本次生成使用的英文场景提示词</p>
                  <p className="mt-2 leading-6">{promptUsed}</p>
                </div>
              )}
              
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                  {error}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Visual Showcase */}
          <div className="w-full lg:w-[55%] relative flex items-center justify-center mt-8 lg:mt-0">
            {/* The aesthetic frosted glass container for images or placeholder */}
            <div className="w-full h-full min-h-[400px] lg:min-h-full rounded-[2.5rem] relative overflow-hidden shadow-2xl p-2 lg:p-4 bg-white/40 border border-white/60">
              {/* Inner container mimicking the glass shape */}
              <div className="absolute inset-0 m-4 rounded-[2rem] overflow-hidden bg-stone-100">
                {images.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 h-full w-full p-2">
                    {images.map((img, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.1 }}
                        className="relative group cursor-pointer rounded-xl overflow-hidden"
                        onClick={() => setFullscreenImage(img)}
                      >
                        <img src={img} referrerPolicy="no-referrer" alt={`变体 ${idx + 1}`} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-4 backdrop-blur-[2px]">
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleDownload(img); }}
                              className="p-2 bg-black/40 hover:bg-black/60 rounded-full text-white backdrop-blur-md transition-colors"
                              title="下载"
                            >
                              <Download className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setFullscreenImage(img); }}
                              className="p-2 bg-black/40 hover:bg-black/60 rounded-full text-white backdrop-blur-md transition-colors"
                              title="全屏查看"
                            >
                              <Maximize2 className="w-5 h-5" />
                            </button>
                          </div>
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRemix(img, 'style'); }}
                              className="w-full flex items-center justify-center gap-1 bg-white/90 hover:bg-white text-stone-900 px-3 py-2 rounded-xl font-medium transition-colors text-xs shadow-sm"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              提取风格
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRemix(img, 'product'); }}
                              className="w-full flex items-center justify-center gap-1 bg-blue-600/90 hover:bg-blue-600 text-white px-3 py-2 rounded-xl font-medium transition-colors text-xs shadow-sm"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              提取商品
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  // Gradient placeholder matching the reference style
                  <div className="w-full h-full relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-[#FADDE1] via-[#FCE3CF] to-[#9BCBEE] opacity-90" />
                    <div className="absolute top-0 right-0 w-[120%] h-[120%] bg-gradient-to-tl from-[#DDB6ED]/40 via-transparent to-transparent mix-blend-overlay" />
                    {/* Glassy reflection curves */}
                    <svg className="absolute inset-0 w-full h-full mix-blend-overlay opacity-50" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <path d="M 0,100 C 30,60 70,80 100,0 L 100,100 Z" fill="url(#glass-gradient)" />
                      <defs>
                        <linearGradient id="glass-gradient" x1="0" y1="1" x2="1" y2="0">
                          <stop offset="0%" stopColor="rgba(255,255,255,0.8)" />
                          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <svg className="absolute inset-0 w-full h-full mix-blend-overlay opacity-30" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <path d="M 0,0 C 40,30 60,10 100,60 L 100,0 Z" fill="url(#glass-gradient-top)" />
                      <defs>
                        <linearGradient id="glass-gradient-top" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="rgba(255,255,255,0.9)" />
                          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                       <ImageIcon className="w-16 h-16 text-white/50 drop-shadow-md" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>

        {/* Fullscreen Overlay */}
        <AnimatePresence>
          {fullscreenImage && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col"
            >
              <div className="flex-1 relative flex items-center justify-center p-4">
                <button
                  onClick={() => setFullscreenImage(null)}
                  className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition-colors z-10"
                >
                  <X className="w-6 h-6" />
                </button>
                <img 
                  src={fullscreenImage} 
                  referrerPolicy="no-referrer" 
                  alt="全屏预览" 
                  className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" 
                />
              </div>
              
              <div className="p-6 bg-gradient-to-t from-black via-black to-transparent flex gap-4 max-w-md mx-auto w-full">
                <button
                  onClick={() => handleDownload(fullscreenImage)}
                  className="flex-1 flex items-center justify-center gap-2 bg-white text-black hover:bg-zinc-200 px-4 py-3.5 rounded-xl font-medium transition-colors"
                >
                  <Download className="w-5 h-5" />
                  下载
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
      
      {/* History Floating Button */}
      <button
        onClick={() => setShowHistory(true)}
        className="fixed bottom-8 right-8 p-4 bg-white hover:bg-stone-50 text-stone-900 rounded-full shadow-2xl transition-all hover:scale-105 z-40 border border-stone-200"
        title="History"
      >
        <History className="w-6 h-6 text-stone-600" />
      </button>

      {/* History Sidebar Overlay */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm"
          >
            {/* Click outside to close */}
            <div className="absolute inset-0" onClick={() => setShowHistory(false)} />
            
            {/* Sidebar panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full max-w-sm h-full bg-white shadow-2xl relative flex flex-col"
            >
              <div className="p-6 border-b border-stone-100 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-stone-900 flex items-center gap-2">
                  <History className="w-5 h-5 text-stone-500" />
                  生成历史
                </h2>
                <button
                  onClick={() => setShowHistory(false)}
                  className="p-2 hover:bg-stone-100 rounded-full text-stone-500 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-stone-400 h-full opacity-60">
                    <History className="w-12 h-12 mb-3" />
                    <p className="text-sm">暂无历史记录</p>
                  </div>
                ) : (
                  history.map((item) => (
                    <div key={item.id} className="group relative rounded-2xl overflow-hidden bg-stone-50 border border-stone-100 shadow-sm">
                      <img
                        src={item.url}
                        alt="历史生成图"
                        className="w-full aspect-square object-cover"
                      />
                      
                      {/* Hover Actions */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-3">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => handleDownload(item.url)}
                            className="p-2 bg-white/20 hover:bg-white/40 rounded-full text-white backdrop-blur-md transition-colors"
                            title="下载"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setFullscreenImage(item.url);
                              setShowHistory(false);
                            }}
                            className="p-2 bg-white/20 hover:bg-white/40 rounded-full text-white backdrop-blur-md transition-colors"
                            title="全屏"
                          >
                            <Maximize2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteHistory(item.id)}
                            className="p-2 bg-red-500/80 hover:bg-red-500 rounded-full text-white backdrop-blur-md transition-colors ml-1"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="text-xs text-white/90 truncate bg-black/40 px-2 py-1 rounded backdrop-blur-sm">
                          {new Date(item.createdAt).toLocaleString()} · {item.prompt}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
