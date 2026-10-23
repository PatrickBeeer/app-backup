import React, { useState, useRef, DragEvent } from 'react';
import { Upload, Image as ImageIcon, Loader2, Sparkles, Download, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppProps } from '../../../types';
import { generateLicensePlateScene } from './lib/gemini';

type GenerationModel = 'flash' | 'pro';
type ImageSize = '2K' | '4K';

const SCENE_TEMPLATES = [
  {
    id: 'marble-wood',
    name: '温馨大理石与光影',
    prompt: '浅米色大理石墙面背景，上方有温暖的聚光灯向下照射。纯净背景，除了我上传的产品外，绝对不要生成任何额外的数字、文字（如WELCOME）、门牌号或其他多余道具。'
  },
  {
    id: 'dark-grooved',
    name: '深色竖纹门板',
    prompt: '现代深灰色哑光入户门背景。门板上半部分平滑，下半部分带有优雅的竖向凹槽纹理，高级建筑光影质感。纯净背景，除了我上传的产品外，绝对不要生成任何额外的数字、文字、门牌号或其他多余道具。'
  },
  {
    id: 'minimalist-black',
    name: '极简纯黑门板',
    prompt: '光滑、极简的纯黑色哑光门板背景。右侧隐约可见干净的白色墙面或门框。现代、时尚、高对比度的光影效果。纯净背景，除了我上传的产品外，绝对不要生成任何额外的数字、文字、门牌号或其他多余道具。'
  }
];

export default function App({ platform }: AppProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [imageSize, setImageSize] = useState<ImageSize>('2K');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadImage = async (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
  };

  const getCostPerImage = (): number => {
    return 5;
  };

  const handleFile = (selectedFile: File) => {
    if (!selectedFile.type.startsWith('image/')) {
      setError('请上传图片文件。');
      return;
    }
    setFile(selectedFile);
    setPreviewUrl(URL.createObjectURL(selectedFile));
    setError(null);
    setGeneratedImage(null);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const generateScene = async (model: GenerationModel) => {
    if (!file) {
      setError('请先上传产品图片。');
      return;
    }
    if (!prompt.trim()) {
      setError('请描述您想要生成的场景。');
      return;
    }

    const charge = getCostPerImage();
    if (!platform.checkBalance(charge)) {
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const newImageUrl = await generateLicensePlateScene(file, prompt, model, imageSize);
      setGeneratedImage(newImageUrl);
      await platform.refreshCredits?.();
    } catch (err: any) {
      console.error(err);
      setError(err.message || '生成图片时发生错误。');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!generatedImage) return;
    await downloadImage(generatedImage, 'product-scene.png');
  };

  const clearImage = () => {
    setFile(null);
    setPreviewUrl(null);
    setGeneratedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="sticky top-0 z-20 bg-neutral-50/95 backdrop-blur-md mb-6 py-3 border-b border-neutral-200/80">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">门牌号场景生成</h1>
              <p className="text-neutral-500 mt-2">上传产品图并生成高质感门牌场景，默认 2K。</p>
            </div>
            <button
              type="button"
              onClick={platform.onBack}
              className="px-3 py-2 rounded-lg border border-neutral-300 text-sm font-semibold hover:bg-neutral-100"
            >
              返回
            </button>
          </div>
        </header>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Controls */}
          <div className="space-y-6">
            
            {/* Upload Area */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-neutral-200">
              <h2 className="text-sm font-medium uppercase tracking-wider text-neutral-500 mb-4">1. 产品图片</h2>
              
              {!previewUrl ? (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
                    isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-neutral-300 hover:border-neutral-400 bg-neutral-50'
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                    accept="image/*"
                    className="hidden"
                  />
                  <div className="mx-auto w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center mb-4">
                    <Upload className="w-5 h-5 text-neutral-600" />
                  </div>
                  <p className="text-neutral-700 font-medium">点击上传或拖拽图片至此</p>
                  <p className="text-neutral-400 text-sm mt-1">支持 PNG, JPG，最大 10MB</p>
                </div>
              ) : (
                <div className="relative rounded-2xl overflow-hidden border border-neutral-200 bg-neutral-100 group">
                  <img src={previewUrl} alt="Product preview" className="w-full h-64 object-contain" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button
                      onClick={clearImage}
                      className="bg-white text-red-600 px-4 py-2 rounded-full font-medium flex items-center gap-2 hover:bg-red-50 transition-colors shadow-sm"
                    >
                      <Trash2 className="w-4 h-4" /> 移除图片
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Templates Area */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-neutral-200">
              <h2 className="text-sm font-medium uppercase tracking-wider text-neutral-500 mb-4">2. 推荐场景模板</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {SCENE_TEMPLATES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setPrompt(t.prompt)}
                    className="text-left p-3 rounded-xl border border-neutral-200 hover:border-indigo-500 hover:bg-indigo-50 transition-colors text-sm group"
                  >
                    <span className="block font-medium text-neutral-800 mb-1 group-hover:text-indigo-700">{t.name}</span>
                    <span className="block text-neutral-500 text-xs line-clamp-2">{t.prompt}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt Area */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-neutral-200">
              <h2 className="text-sm font-medium uppercase tracking-wider text-neutral-500 mb-4">3. 场景描述</h2>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="例如：在清晨阳光透过窗户洒下的质朴木桌上，周围散落着咖啡豆..."
                className="w-full h-32 p-4 rounded-2xl border border-neutral-200 bg-neutral-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none transition-all"
              />
              
              {error && (
                <motion.p 
                  initial={{ opacity: 0, y: -10 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  className="text-red-500 text-sm mt-3 flex items-center gap-1"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" /> {error}
                </motion.p>
              )}

              <div className="mt-4">
                <label className="text-xs font-medium uppercase tracking-wider text-neutral-500 mb-2 block">清晰度</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['2K', '4K'] as const).map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setImageSize(size)}
                      className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                        imageSize === size
                          ? 'bg-neutral-900 text-white border-neutral-900'
                          : 'bg-white text-neutral-500 border-neutral-200 hover:border-neutral-300'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => generateScene('flash')}
                disabled={!file || !prompt.trim() || isGenerating}
                className={`py-4 rounded-2xl font-medium text-sm flex items-center justify-center gap-2 transition-all shadow-sm ${
                  !file || !prompt.trim() || isGenerating
                    ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                    : 'bg-neutral-900 text-white hover:bg-neutral-800 hover:shadow-md active:scale-[0.98]'
                }`}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" /> 正在生成...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" /> 生成（5积分）
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right Column: Result */}
          <div className="bg-white rounded-3xl shadow-sm border border-neutral-200 overflow-hidden flex flex-col min-h-[500px]">
            <div className="p-6 border-b border-neutral-100 flex justify-between items-center bg-white/50 backdrop-blur-sm z-10">
              <h2 className="text-sm font-medium uppercase tracking-wider text-neutral-500">生成结果</h2>
              {generatedImage && (
                <button
                  onClick={handleDownload}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-full transition-colors"
                >
                  <Download className="w-4 h-4" /> 下载
                </button>
              )}
            </div>
            
            <div className="flex-1 bg-neutral-100 relative flex items-center justify-center p-6">
              <AnimatePresence mode="wait">
                {isGenerating ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex flex-col items-center text-neutral-400"
                  >
                    <div className="w-16 h-16 border-4 border-neutral-200 border-t-indigo-500 rounded-full animate-spin mb-4" />
                    <p className="font-medium animate-pulse">AI 正在施展魔法...</p>
                  </motion.div>
                ) : generatedImage ? (
                  <motion.img
                    key="result"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    src={generatedImage}
                    alt="Generated scene"
                    className="w-full h-full object-contain rounded-xl shadow-sm"
                  />
                ) : (
                  <motion.div
                    key="placeholder"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center text-neutral-300"
                  >
                    <ImageIcon className="w-16 h-16 mb-3 opacity-50" />
                    <p className="font-medium">生成的场景将显示在这里</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
