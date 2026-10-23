import React, { useState, useRef } from 'react';
import {
  Upload,
  Sparkles,
  Download,
  Image as ImageIcon,
  User,
  Settings2,
  Maximize2,
  ChevronRight,
  AlertCircle,
  Layout,
  Layers,
  Monitor,
  MessageSquare,
  X,
  Square,
  RectangleVertical,
  Smartphone
} from '@/utils/lucide';
import { AppProps } from '../../types';
import { generateContent, extractImageFromResponse } from '../../shared_services/geminiProxyService';
import './index.css';

const DEFAULT_COST_PER_IMAGE = 10;
const MODEL_NAME = 'gemini-3.1-flash-image-preview';
const MODEL_TASK = 'image_gen' as const;
const SINGLE_IMAGE_TIMEOUT_MS = 90000;

const STYLES = [
  { id: 'modern', name: '顾家简约风', prompt: 'Modern minimalist high-end bedroom, neutral tones, soft morning sunlight, premium furniture, clean lines, professional interior photography, 8k resolution.' },
  { id: 'french', name: '法式奶油风', prompt: 'Elegant French romantic bedroom, cream colors, decorative moldings on walls, warm soft lighting, luxurious atmosphere, soft textures.' },
  { id: 'nordic', name: '北欧清爽风', prompt: 'Nordic bright bedroom, light oak wood furniture, airy atmosphere, natural green plants in corner, cozy and clean aesthetic.' },
  { id: 'zen', name: '日式原木风', prompt: 'Japanese Zen minimalist bedroom, low platform bed, tatami elements, natural wood textures, calm and peaceful lighting.' }
];

const TASKS = [
  { id: 'scene', name: '生成场景图', description: '将产品置入精美的卧室样板间', icon: Layout },
  { id: 'model', name: '生成模特图', description: '加入模特互动，增强代入感', icon: User }
];

const RESOLUTIONS = [
  { id: '2K', name: '2K 高清', description: '2048x2048' },
  { id: '4K', name: '4K 超清', description: '4096x4096' }
];

const ASPECT_RATIOS = [
  { id: '1:1', name: '1:1 正方形', icon: Square },
  { id: '3:4', name: '3:4 纵向', icon: RectangleVertical },
  { id: '9:16', name: '9:16 竖屏', icon: Smartphone },
  { id: '16:9', name: '16:9 横屏', icon: Monitor }
];

const ETHNICITIES = [
  { id: 'asian', name: '东亚面孔', prompt: 'East Asian' },
  { id: 'caucasian', name: '欧美面孔', prompt: 'Caucasian' },
  { id: 'hispanic', name: '拉丁面孔', prompt: 'Hispanic' },
  { id: 'black', name: '非裔面孔', prompt: 'African' }
];

const AGES = [
  { id: 'young', name: '青年 (20-30)', prompt: 'young adult' },
  { id: 'middle', name: '中年 (35-50)', prompt: 'middle-aged' },
  { id: 'child', name: '儿童', prompt: 'child' },
  { id: 'senior', name: '老年', prompt: 'senior' }
];

export const HomeTextilePhotographyApp: React.FC<AppProps> = ({ platform, costs }) => {
  const generationFeePerImage = costs?.GENERATE_IMAGE ?? DEFAULT_COST_PER_IMAGE;
  const generationFeeTotal = generationFeePerImage * 2;

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [selectedStyle, setSelectedStyle] = useState(STYLES[0]);
  const [selectedTask, setSelectedTask] = useState(TASKS[0]);
  const [selectedResolution, setSelectedResolution] = useState(RESOLUTIONS[0]);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState(ASPECT_RATIOS[0]);
  const [selectedEthnicity, setSelectedEthnicity] = useState(ETHNICITIES[0]);
  const [selectedAge, setSelectedAge] = useState(AGES[0]);
  const [customPrompt, setCustomPrompt] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${label} 超时（${Math.floor(timeoutMs / 1000)}秒）`));
      }, timeoutMs);

      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('请上传有效的图片文件 (JPG, PNG等)');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedImage(reader.result as string);
      setGeneratedImages([]);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const generateImage = async () => {
    if (!selectedImage) return;

    if (!platform.checkBalance(generationFeeTotal)) {
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedImages([]);

    try {
      const base64Data = selectedImage.split(',')[1];
      const mimeType = selectedImage.split(';')[0].split(':')[1] || 'image/png';

      let taskPrompt = '';
      if (selectedTask.id === 'model') {
        taskPrompt = `Generate a high-quality commercial photo featuring a beautiful ${selectedEthnicity.prompt} ${selectedAge.prompt} model relaxing on the bed covered with this exact bedding set. The model should look natural and happy. `;
      } else {
        taskPrompt = 'Place this bedding set onto a neatly made bed in a beautiful bedroom. Keep the exact colors and patterns of the bedding. ';
      }

      const basePrompt = `${taskPrompt} Style: ${selectedStyle.prompt}. ${customPrompt ? `Additional requirements: ${customPrompt}. ` : ''}Make it look like a professional product shot for a high-end brand like Kuka Home. Realistic fabric folds, soft lighting, commercial photography grade.`;

      const perspectives = [
        'Wide shot perspective, showing the entire bed and the surrounding bedroom environment.',
        'Close-up perspective, focusing on the details, texture, and folds of the bedding on the bed.'
      ];

      const generateCall = async (perspective: string) => {
        const response = await generateContent({
          model: MODEL_NAME,
          task: MODEL_TASK,
          contents: {
            parts: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType,
                },
              },
              {
                text: `${basePrompt} Perspective: ${perspective}`,
              },
            ],
          },
          config: {
            imageConfig: {
              aspectRatio: selectedAspectRatio.id,
              imageSize: selectedResolution.id,
            },
          },
        });

        return extractImageFromResponse(response);
      };

      const validImages: string[] = [];
      let firstFailureMessage = '';

      for (let index = 0; index < perspectives.length; index++) {
        try {
          const image = await withTimeout(
            generateCall(perspectives[index]),
            SINGLE_IMAGE_TIMEOUT_MS,
            `视角 ${index + 1}`
          );

          if (image) {
            validImages.push(image);
            // 渐进展示：先展示第 1 张，再等待第 2 张。
            setGeneratedImages([...validImages]);
          } else if (!firstFailureMessage) {
            firstFailureMessage = `视角 ${index + 1} 未返回可用图片`;
          }
        } catch (err: any) {
          if (!firstFailureMessage) {
            firstFailureMessage = err?.message || `视角 ${index + 1} 生成失败`;
          }
        }
      }

      if (validImages.length === 0) {
        throw new Error(firstFailureMessage || '未能生成图片，请重试。');
      }

      setGeneratedImages(validImages);
      await platform.refreshCredits?.();
    } catch (err: any) {
      console.error(err);
      setError(err.message || '生成失败，请检查网络或稍后再试。');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-sans">
      <div className="bg-mesh" />

      <header className="h-20 flex items-center justify-between px-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-black rounded-2xl flex items-center justify-center shadow-lg">
            <Sparkles className="text-white w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-black">家纺/四件套AI影棚</h1>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">E-commerce Vision Studio</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-zinc-500 bg-white/70 px-3 py-1.5 rounded-xl shadow-sm">积分余额 {platform.credits}</span>
          <button onClick={platform.onBack} className="secondary-button !px-4 !py-2">返回</button>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row gap-8 p-6 lg:p-10 max-w-[1600px] mx-auto w-full overflow-hidden">
        <aside className="w-full lg:w-[380px] flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
          <div className="glass-panel p-8 flex flex-col gap-8">
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="label-caps">Step 01. 上传产品</h2>
                <ImageIcon className="w-4 h-4 text-zinc-300" />
              </div>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`group relative border-2 border-dashed rounded-[2rem] p-6 transition-all cursor-pointer flex flex-col items-center justify-center gap-4 text-center ${
                  isDragging
                    ? 'border-black bg-black/5 scale-[1.02]'
                    : 'border-zinc-200 hover:border-zinc-400 hover:bg-white/40'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleFileUpload}
                />
                {selectedImage ? (
                  <div className="relative w-full aspect-square rounded-3xl overflow-hidden shadow-sm">
                    <img src={selectedImage} alt="Product" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                      <span className="text-white text-xs font-medium">更换图片</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
                      isDragging ? 'bg-black text-white' : 'bg-white/80 text-zinc-400 shadow-sm group-hover:scale-110'
                    }`}>
                      <Upload className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-black">上传产品图</p>
                      <p className="text-[10px] text-zinc-400 mt-1">支持拖拽高清 JPG/PNG</p>
                    </div>
                  </>
                )}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="label-caps">Step 02. 选择模式</h2>
                <Layers className="w-4 h-4 text-zinc-300" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {TASKS.map((task) => {
                  const Icon = task.icon;
                  return (
                    <button
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className={`flex flex-col items-start p-4 rounded-2xl border transition-all text-left gap-3 ${
                        selectedTask.id === task.id
                          ? 'bg-black text-white border-black shadow-lg scale-[1.02]'
                          : 'bg-white/40 border-transparent hover:bg-white/60 text-zinc-600'
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${selectedTask.id === task.id ? 'text-white' : 'text-zinc-400'}`} />
                      <div>
                        <p className="text-xs font-bold">{task.name}</p>
                        <p className={`text-[9px] mt-0.5 leading-tight ${selectedTask.id === task.id ? 'text-zinc-400' : 'text-zinc-400'}`}>
                          {task.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="label-caps">Step 03. 场景风格</h2>
                <Monitor className="w-4 h-4 text-zinc-300" />
              </div>
              <div className="grid grid-cols-1 gap-2">
                {STYLES.map((style) => (
                  <button
                    key={style.id}
                    onClick={() => setSelectedStyle(style)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition-all text-sm font-medium ${
                      selectedStyle.id === style.id
                        ? 'bg-black/5 border-black/10 text-black'
                        : 'bg-white/40 border-transparent hover:bg-white/60 text-zinc-500'
                    }`}
                  >
                    {style.name}
                    {selectedStyle.id === style.id && <ChevronRight className="w-4 h-4" />}
                  </button>
                ))}
              </div>
            </section>

            <div className="pt-2">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-zinc-200 hover:border-zinc-400 transition-all text-xs font-bold text-zinc-500 hover:text-black bg-white/20"
              >
                <div className="flex items-center gap-2">
                  <Settings2 className={`w-4 h-4 transition-transform duration-500 ${showAdvanced ? 'rotate-180' : ''}`} />
                  <span>高级设置</span>
                </div>
                <ChevronRight className={`w-4 h-4 transition-transform duration-500 ${showAdvanced ? '-rotate-90' : 'rotate-90'}`} />
              </button>
            </div>

            {showAdvanced && (
              <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-top-4 duration-500">
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="label-caps">Step 04. 输出精度</h2>
                    <Maximize2 className="w-4 h-4 text-zinc-300" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {RESOLUTIONS.map((res) => (
                      <button
                        key={res.id}
                        onClick={() => setSelectedResolution(res)}
                        className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${
                          selectedResolution.id === res.id
                            ? 'bg-black/5 border-black/10 text-black font-bold'
                            : 'bg-white/40 border-transparent hover:bg-white/60 text-zinc-500'
                        }`}
                      >
                        <span className="text-xs">{res.id}</span>
                        <span className="text-[9px] opacity-60 font-medium">{res.name}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="label-caps">Step 05. 图片比例</h2>
                    <Settings2 className="w-4 h-4 text-zinc-300" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {ASPECT_RATIOS.map((ratio) => {
                      const Icon = ratio.icon;
                      return (
                        <button
                          key={ratio.id}
                          onClick={() => setSelectedAspectRatio(ratio)}
                          className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all gap-1 ${
                            selectedAspectRatio.id === ratio.id
                              ? 'bg-black/5 border-black/10 text-black font-bold'
                              : 'bg-white/40 border-transparent hover:bg-white/60 text-zinc-500'
                          }`}
                        >
                          <Icon className={`w-4 h-4 ${selectedAspectRatio.id === ratio.id ? 'text-black' : 'text-zinc-400'}`} />
                          <span className="text-[10px]">{ratio.id}</span>
                          <span className="text-[8px] opacity-60 font-medium">{ratio.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="label-caps">Step 06. 进阶需求</h2>
                    <MessageSquare className="w-4 h-4 text-zinc-300" />
                  </div>
                  <textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="例如：增加一盆绿植，或者背景换成海景房..."
                    className="glass-input w-full h-24 text-xs leading-relaxed resize-none placeholder:text-zinc-300"
                  />
                </section>

                {selectedTask.id === 'model' && (
                  <div className="flex flex-col gap-6">
                    <section>
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="label-caps">模特族裔</h2>
                        <User className="w-4 h-4 text-zinc-300" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {ETHNICITIES.map((eth) => (
                          <button
                            key={eth.id}
                            onClick={() => setSelectedEthnicity(eth)}
                            className={`px-3 py-2 rounded-xl border text-[10px] font-bold transition-all ${
                              selectedEthnicity.id === eth.id
                                ? 'bg-black text-white border-black'
                                : 'bg-white/40 border-transparent hover:bg-white/60 text-zinc-500'
                            }`}
                          >
                            {eth.name}
                          </button>
                        ))}
                      </div>
                    </section>

                    <section>
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="label-caps">模特年龄</h2>
                        <Settings2 className="w-4 h-4 text-zinc-300" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {AGES.map((age) => (
                          <button
                            key={age.id}
                            onClick={() => setSelectedAge(age)}
                            className={`px-3 py-2 rounded-xl border text-[10px] font-bold transition-all ${
                              selectedAge.id === age.id
                                ? 'bg-black text-white border-black'
                                : 'bg-white/40 border-transparent hover:bg-white/60 text-zinc-500'
                            }`}
                          >
                            {age.name}
                          </button>
                        ))}
                      </div>
                    </section>
                  </div>
                )}
              </div>
            )}

            <div className="pt-2">
              <button
                onClick={generateImage}
                disabled={!selectedImage || isGenerating}
                className="primary-button w-full flex items-center justify-center gap-3 group"
              >
                {isGenerating ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <span>正在艺术创作...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                    <span>立即生成大片</span>
                  </>
                )}
              </button>
              <p className="mt-3 text-[10px] text-zinc-400 font-bold text-center tracking-wider">按每张 {generationFeePerImage} 积分计费，双图共 {generationFeeTotal} 积分，失败不扣费</p>

              {error && (
                <div className="mt-4 p-3 bg-red-50/50 border border-red-100 rounded-2xl flex items-start gap-2 animate-in fade-in slide-in-from-top-2">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-red-600 font-medium leading-tight">{error}</p>
                </div>
              )}
            </div>
          </div>
        </aside>

        <section className="flex-1 flex flex-col gap-6 min-h-[600px]">
          <div className="glass-panel flex-1 p-10 flex flex-col relative overflow-hidden">
            {!selectedImage && generatedImages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto">
                <div className="w-24 h-24 rounded-[2.5rem] bg-white/40 flex items-center justify-center mb-8 shadow-inner">
                  <ImageIcon className="w-10 h-10 text-zinc-300" />
                </div>
                <h3 className="text-2xl font-bold text-black mb-4 tracking-tight">开启您的 AI 影棚</h3>
                <p className="text-zinc-500 text-sm leading-relaxed">
                  上传您的家纺产品，AI 将为您生成媲美顶级家居品牌大片的场景与模特实拍图。
                </p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-black tracking-tight">
                      {isGenerating ? '正在渲染中...' : '生成的视觉大片'}
                    </h2>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="px-2 py-0.5 bg-black/5 text-black text-[10px] font-bold rounded-md uppercase tracking-wider">
                        {selectedStyle.name}
                      </span>
                      <span className="px-2 py-0.5 bg-black/5 text-black text-[10px] font-bold rounded-md uppercase tracking-wider">
                        {selectedTask.name}
                      </span>
                    </div>
                  </div>

                  {generatedImages.length > 0 && !isGenerating && (
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          generatedImages.forEach((img, idx) => {
                            const link = document.createElement('a');
                            link.href = img;
                            link.download = `AI-Home-${Date.now()}-${idx}.png`;
                            link.click();
                          });
                        }}
                        className="secondary-button flex items-center gap-2 shadow-sm"
                      >
                        <Download className="w-4 h-4" />
                        <span>下载全部</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-8">
                  {generatedImages.length > 0 || isGenerating ? (
                    <>
                      {[0, 1].map((idx) => {
                        const img = generatedImages[idx];

                        if (img) {
                          return (
                            <div key={idx} className="flex flex-col gap-4">
                              <h4 className="label-caps">AI 效果图 {idx + 1}</h4>
                              <div className="flex-1 rounded-[2.5rem] overflow-hidden border bg-white shadow-2xl border-white/40 relative group/img min-h-[300px]">
                                <img
                                  src={img}
                                  alt={`Generated ${idx + 1}`}
                                  className="w-full h-full object-cover animate-in fade-in zoom-in-95 duration-1000 cursor-zoom-in"
                                  onClick={() => setZoomImage(img)}
                                />
                                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover/img:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => setZoomImage(img)}
                                    className="w-10 h-10 rounded-xl bg-white/80 backdrop-blur-md flex items-center justify-center text-black shadow-lg hover:bg-white transition-colors"
                                    title="放大查看"
                                  >
                                    <Maximize2 className="w-5 h-5" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      const link = document.createElement('a');
                                      link.href = img;
                                      link.download = `AI-Home-${Date.now()}-${idx}.png`;
                                      link.click();
                                    }}
                                    className="w-10 h-10 rounded-xl bg-black/80 backdrop-blur-md flex items-center justify-center text-white shadow-lg hover:bg-black transition-colors"
                                    title="下载图片"
                                  >
                                    <Download className="w-5 h-5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        if (isGenerating) {
                          return (
                            <div key={idx} className="flex flex-col gap-4">
                              <h4 className="label-caps">AI 效果图 {idx + 1}</h4>
                              <div className="flex-1 rounded-[2.5rem] overflow-hidden border bg-black/5 border-white/20 relative min-h-[300px]">
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
                                  <div className="relative">
                                    <div className="w-16 h-16 border-4 border-black/5 border-t-black rounded-full animate-spin" />
                                    <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-black animate-pulse" />
                                  </div>
                                  <div className="text-center">
                                    <p className="text-sm font-bold text-black">正在分析织物纹理...</p>
                                    <p className="text-[10px] text-zinc-400 mt-1 uppercase tracking-widest">正在渲染视角 {idx + 1}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        return null;
                      })}
                    </>
                  ) : (
                    <div className="col-span-2 flex flex-col gap-4">
                      <h4 className="label-caps">AI 效果图</h4>
                      <div className="flex-1 rounded-[2.5rem] border border-zinc-200 border-dashed flex items-center justify-center text-zinc-300 italic text-sm min-h-[300px]">
                        等待生成中...
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {zoomImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 md:p-10 animate-in fade-in duration-300"
          onClick={() => setZoomImage(null)}
        >
          <button
            className="absolute top-6 right-6 w-12 h-12 rounded-2xl bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors"
            onClick={() => setZoomImage(null)}
          >
            <X className="w-6 h-6" />
            <span className="sr-only">关闭</span>
          </button>

          <div className="relative max-w-full max-h-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
            <img
              src={zoomImage}
              alt="Zoomed"
              className="max-w-full max-h-[90vh] rounded-3xl shadow-2xl animate-in zoom-in-95 duration-500"
            />
            <div className="absolute bottom-[-60px] left-1/2 -translate-x-1/2 flex gap-4">
              <button
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = zoomImage;
                  link.download = `AI-Home-${Date.now()}.png`;
                  link.click();
                }}
                className="primary-button flex items-center gap-2"
              >
                <Download className="w-5 h-5" />
                <span>下载原图</span>
              </button>
              <button
                onClick={() => setZoomImage(null)}
                className="secondary-button !bg-white/20 !text-white hover:!bg-white/30"
              >
                关闭预览
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="h-12 px-10 flex items-center justify-between text-[10px] font-bold text-zinc-400 uppercase tracking-widest" />
    </div>
  );
};

export default HomeTextilePhotographyApp;