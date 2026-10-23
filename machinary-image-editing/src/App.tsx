import { useState, useRef, type ChangeEvent, type DragEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AppProps } from '../../../types';
import { 
  Upload, 
  Sparkles, 
  Image as ImageIcon, 
  Download, 
  RefreshCw, 
  Zap,
  Maximize2,
  X,
  Monitor,
  Box
} from 'lucide-react';
import { retouchImage } from './services/gemini';
const DEFAULT_GENERATE_COST = 8;
const SIZE_OPTIONS = ['1:1', '4:3', '16:9', '4:1', '1:4'];
const RESOLUTION_OPTIONS = ['512px', '1K', '2K', '4K'];

interface HistoryItem {
  id: string;
  original: string;
  retouched: string;
  timestamp: number;
}

export default function App({ platform, costs }: AppProps) {
  const generateCost = costs?.GENERATE_IMAGE ?? DEFAULT_GENERATE_COST;
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [retouchedImage, setRetouchedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState('1:1');
  const [selectedResolution, setSelectedResolution] = useState('1K');
  const [metallicIntensity, setMetallicIntensity] = useState(80);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('请上传图片文件。');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setOriginalImage(reader.result as string);
      setRetouchedImage(null);
      setError(null);
      setMetallicIntensity(80);
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadImageFile(file);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      loadImageFile(file);
    }
  };

  const processImage = async (isUpdate: boolean = false) => {
    const baseImage = isUpdate && retouchedImage ? retouchedImage : originalImage;
    if (!baseImage) return;

    if (!platform.checkBalance?.(generateCost)) {
      setError(`积分不足，需要 ${generateCost} 积分。`);
      platform.showRecharge();
      return;
    }
    
    setIsProcessing(true);
    setError(null);
    try {
      const mimeType = baseImage.split(';')[0].split(':')[1];
      const result = await retouchImage(
        baseImage, 
        mimeType, 
        selectedSize, 
        selectedResolution, 
        metallicIntensity,
        isUpdate
      );

      setRetouchedImage(result);
      await platform.refreshCredits?.();
      
      if (!isUpdate) {
        const newItem: HistoryItem = {
          id: Math.random().toString(36).slice(2, 11),
          original: baseImage,
          retouched: result,
          timestamp: Date.now(),
        };
        setHistory(prev => [newItem, ...prev].slice(0, 10));
      }
    } catch (err) {
      if (err instanceof Error && err.message) {
        setError(err.message);
      } else {
        setError("精修失败，请稍后重试。");
      }
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadImage = () => {
    if (!retouchedImage) return;
    const link = document.createElement('a');
    link.href = retouchedImage;
    link.download = `retouched-${Date.now()}.png`;
    link.click();
  };

  return (
    <div className="min-h-screen flex flex-col font-sans bg-[#f0f2f5] text-zinc-900">
      {/* Header */}
      <header className="h-20 flex items-center justify-between px-12 sticky top-0 z-40 bg-[#f0f2f5]/80 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-black rounded-2xl flex items-center justify-center shadow-lg">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">金属机器精修</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold">Industrial Perfection AI</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-1.5 rounded-full bg-white/80 border border-white/40 shadow-sm text-[10px] uppercase tracking-widest font-bold text-zinc-600">
            Mechanical & Electronics Expert
          </div>
        </div>
      </header>

      <main className="flex-1 p-12 max-w-7xl mx-auto w-full space-y-12">
        {/* Hero Section */}
        <section className="text-center space-y-4 max-w-2xl mx-auto">
          <h2 className="text-5xl font-bold tracking-tight text-black">顶级金属视觉重塑</h2>
          <p className="text-zinc-500 text-lg">全域环境反光抹除 • 内部结构 100% 几何保真 • 极致金属质感</p>
        </section>

        {/* Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          {/* Controls - Left */}
          <div className="lg:col-span-3 space-y-6">
            <div className="glass-panel p-8 space-y-8">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-400">
                  <Box className="w-4 h-4" /> 尺寸选择
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {SIZE_OPTIONS.map((size) => (
                    <button
                      key={size}
                      onClick={() => setSelectedSize(size)}
                      className={`px-4 py-3 rounded-2xl text-sm font-medium transition-all text-left flex items-center justify-between ${
                        selectedSize === size 
                          ? 'bg-black text-white shadow-lg scale-[1.02]' 
                          : 'bg-white/40 text-zinc-600 hover:bg-white/60'
                      }`}
                    >
                      {size}
                      {selectedSize === size && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-400">
                  <Monitor className="w-4 h-4" /> 清晰度选择
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {RESOLUTION_OPTIONS.map((res) => (
                    <button
                      key={res}
                      onClick={() => setSelectedResolution(res)}
                      className={`px-4 py-3 rounded-2xl text-sm font-medium transition-all text-left flex items-center justify-between ${
                        selectedResolution === res 
                          ? 'bg-black text-white shadow-lg scale-[1.02]' 
                          : 'bg-white/40 text-zinc-600 hover:bg-white/60'
                      }`}
                    >
                      {res}
                      {selectedResolution === res && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Main Canvas - Center */}
          <div className="lg:col-span-9 space-y-8">
            {!originalImage ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="aspect-[16/9] glass-panel flex flex-col items-center justify-center gap-6 cursor-pointer hover:bg-white/80 transition-all group border-dashed border-2 border-zinc-200"
              >
                <div className="w-20 h-20 rounded-3xl bg-black flex items-center justify-center group-hover:scale-110 transition-transform shadow-2xl">
                  <Upload className="w-10 h-10 text-white" />
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-black">上传产品原图</p>
                  <p className="text-zinc-500 mt-2">支持拖拽图片到此处 • 自动识别金属材质</p>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  accept="image/*" 
                  className="hidden" 
                />
              </motion.div>
            ) : (
              <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Original */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                      <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Input / 原始产品图</span>
                      <button 
                        onClick={() => { setOriginalImage(null); setRetouchedImage(null); }}
                        className="text-[10px] uppercase tracking-widest text-zinc-400 hover:text-black font-bold flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" /> Reset
                      </button>
                    </div>
                    <div className="aspect-square glass-panel overflow-hidden relative group cursor-zoom-in" onClick={() => setPreviewImage(originalImage)}>
                      <img src={originalImage} alt="Original" className="w-full h-full object-contain p-8" />
                      <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Maximize2 className="w-8 h-8 text-black/20" />
                      </div>
                    </div>
                  </div>

                  {/* Retouched */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                      <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Output / 精修结果</span>
                      {retouchedImage && (
                        <button 
                          onClick={downloadImage}
                          className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-blue-100 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" /> 下载图片
                        </button>
                      )}
                    </div>
                    <div className="aspect-square glass-panel overflow-hidden relative">
                      <AnimatePresence mode="wait">
                        {isProcessing ? (
                          <motion.div 
                            key="loading"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm z-10"
                          >
                            <div className="w-12 h-12 border-4 border-zinc-100 border-t-black rounded-full animate-spin mb-6" />
                            <p className="text-xl font-bold text-black">正在重塑金属质感...</p>
                            <p className="text-[10px] text-zinc-400 mt-2 uppercase tracking-[0.2em] font-bold">Nuclear Reflection Removal • {selectedResolution}</p>
                          </motion.div>
                        ) : retouchedImage ? (
                          <motion.img 
                            key="result"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            src={retouchedImage} 
                            alt="Retouched" 
                            className="w-full h-full object-contain p-8 cursor-zoom-in" 
                            onClick={() => setPreviewImage(retouchedImage)}
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-300">
                            <ImageIcon className="w-20 h-20 mb-4 opacity-20" />
                            <p className="text-xs font-bold uppercase tracking-widest">等待处理</p>
                          </div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>

                {/* Action Button */}
                {!retouchedImage && !isProcessing && (
                  <div className="flex justify-center">
                    <button
                      onClick={() => {
                        void processImage();
                      }}
                      className="px-16 py-6 rounded-[2rem] bg-black text-white font-bold text-xl flex items-center justify-center gap-4 hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-black/20"
                    >
                      <Sparkles className="w-7 h-7" />
                      开始核弹级精修 ({generateCost}积分)
                    </button>
                  </div>
                )}

                {/* Metallic Intensity Slider - Moved to bottom of main area */}
                {retouchedImage && !isProcessing && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-panel p-8 max-w-2xl mx-auto space-y-6"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center shadow-lg">
                          <Zap className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-black">金属质感精细调节</p>
                          <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">Fine-tune Metallic Intensity</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-bold text-black">{metallicIntensity}%</span>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={metallicIntensity}
                        onChange={(e) => setMetallicIntensity(parseInt(e.target.value))}
                        className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-black"
                      />
                      <div className="flex justify-between text-[10px] uppercase tracking-widest text-zinc-400 font-bold">
                        <span>哑光拉丝 (Matte)</span>
                        <span>镜面抛光 (Mirror)</span>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <button
                        onClick={() => {
                          void processImage(true);
                        }}
                        className="flex-1 py-5 rounded-2xl bg-black text-white font-bold text-sm uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-xl flex items-center justify-center gap-2"
                      >
                        <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
                        应用质感更新 ({generateCost}积分)
                      </button>
                      <button
                        onClick={downloadImage}
                        className="px-8 py-5 rounded-2xl bg-blue-600 text-white font-bold text-sm uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-xl flex items-center justify-center gap-2"
                      >
                        <Download className="w-5 h-5" />
                        下载作品
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* History */}
        {history.length > 0 && (
          <section className="pt-12 border-t border-zinc-200">
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-8">Recent Work / 历史作品</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-6">
              {history.map((item) => (
                <div 
                  key={item.id} 
                  onClick={() => { setOriginalImage(item.original); setRetouchedImage(item.retouched); }}
                  className="aspect-square glass-panel overflow-hidden cursor-pointer hover:scale-105 transition-all group"
                >
                  <img src={item.retouched} alt="History" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Preview Modal */}
      <AnimatePresence>
        {previewImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-white/90 backdrop-blur-xl flex items-center justify-center p-12"
            onClick={() => setPreviewImage(null)}
          >
            <button className="absolute top-12 right-12 p-4 rounded-full bg-black text-white hover:scale-110 transition-transform">
              <X className="w-8 h-8" />
            </button>
            <motion.img 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              src={previewImage} 
              alt="Preview" 
              className="max-w-full max-h-full object-contain shadow-2xl rounded-3xl"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="h-20 border-t border-zinc-200 bg-white/40 flex items-center justify-between px-12 text-[10px] uppercase tracking-widest text-zinc-400 font-bold">
        <div className="flex items-center gap-8">
          <span className="flex items-center gap-2 text-black"><Zap className="w-3 h-3" /> Gemini 2.5 Industrial</span>
          <span>Precision: High</span>
        </div>
        <div className="flex items-center gap-8">
          <span className="text-zinc-300">© 2026 金属机器精修 AI Studio</span>
        </div>
      </footer>
    </div>
  );
}
