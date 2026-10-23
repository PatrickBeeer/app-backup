import React, { useRef, useState } from 'react';
import {
  Upload,
  Image as ImageIcon,
  Sparkles,
  RefreshCw,
  Download,
  Trash2,
  Plus,
  AlertCircle,
  Wind,
  Hotel,
  Briefcase,
  UtensilsCrossed,
} from 'lucide-react';
import { motion } from 'motion/react';
import { AppProps } from '../../../types';
import { generateProductImage } from './lib/gemini';

const IMAGE_COUNT = 3;
type ImageSize = '2K' | '4K';
const COST_PER_IMAGE = 5;

const STYLE_PRESETS = [
  { id: 'zen', label: '禅意极简', prompt: '极简、禅意、留白、深色石材背景、柔和定向光影、高质感木材' },
  { id: 'hotel', label: '高级酒店', prompt: '高端酒店大堂、大理石墙面、暖色调氛围灯光、奢华石材纹理、尊贵感' },
  { id: 'office', label: '现代办公', prompt: '现代办公空间、极简白墙或玻璃幕墙、明亮自然光、专业干练、高科技感' },
  { id: 'room', label: '包厢场景', prompt: '高端餐饮包厢、私密高级、环境光柔和、产品自身发光、自发光效果、环境暗调以突出产品光芒' },
  { id: 'room2', label: '包厢场景 2', prompt: '新中式高级包厢、深色原木与石材墙面结合、产品自身柔和发光、背景包含精致木质门框、中式丝绸窗帘或室内大型绿植、环境光影深邃、高保真写实质感、自发光效果' },
];

interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  timestamp: number;
}

const CustomCubicalSceneApp: React.FC<AppProps> = ({ platform }) => {
  const [images, setImages] = useState<(string | null)[]>([null, null, null]);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '3:4' | '4:3' | '9:16' | '16:9'>('1:1');
  const [imageSize, setImageSize] = useState<ImageSize>('2K');
  const [installationType, setInstallationType] = useState<'table' | 'wall' | 'side' | 'room'>('table');
  const [selectedStyle, setSelectedStyle] = useState<string>('zen');

  const fileInputRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  const getTotalCost = (): number => {
    return IMAGE_COUNT * COST_PER_IMAGE;
  };

  const downloadImage = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
  };

  const handleImageUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const newImages = [...images];
      newImages[index] = reader.result as string;
      setImages(newImages);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = (index: number) => {
    const newImages = [...images];
    newImages[index] = null;
    setImages(newImages);
  };

  const handleGenerate = async () => {
    const model = 'flash';
    const validImages = images.filter((img): img is string => img !== null);
    if (validImages.length === 0) {
      setError('请至少上传一张产品图片。');
      return;
    }
    if (!prompt.trim()) {
      setError('请描述您想要的产品场景。');
      return;
    }

    const totalCharge = getTotalCost();
    if (!platform.checkBalance(totalCharge)) {
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedImages([]);

    try {
      const results = await generateProductImage(
        validImages,
        prompt,
        aspectRatio,
        imageSize,
        model,
        installationType,
        IMAGE_COUNT,
        (url, index) => {
          const progressive: GeneratedImage = {
            id: `${Date.now()}-${index}`,
            url,
            prompt,
            timestamp: Date.now(),
          };
          setGeneratedImages(prev => [progressive, ...prev]);
        }
      );

      if (results.length === 0) {
        throw new Error('未能生成图片，请尝试更换描述词。');
      }
      await platform.refreshCredits?.();

      const finalImages = results.map((url, idx) => ({
        id: `${Date.now()}-final-${idx}`,
        url,
        prompt,
        timestamp: Date.now() - idx,
      }));
      setGeneratedImages(finalImages);
    } catch (err: any) {
      console.error(err);
      setError(err.message || '生成图片失败，请重试。');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadAll = async () => {
    for (const img of generatedImages.slice(0, IMAGE_COUNT)) {
      await downloadImage(img.url, `custom-cubical-scene-${img.id}.png`);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-gray-900 font-sans">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={platform.onBack}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50"
            >
              返回
            </button>
            <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">包厢场景工作室</h1>
              <p className="text-[11px] text-gray-500">默认单次生成 3 张图片（15 积分）</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Upload className="w-4 h-4" />
              产品原图
              <span className="text-[10px] font-normal text-gray-400 ml-auto">最多 3 张</span>
            </h2>

            <div className="grid grid-cols-3 gap-3 mb-6">
              {images.map((img, idx) => (
                <div key={idx} className="relative aspect-square rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 overflow-hidden group hover:border-indigo-400 transition-colors">
                  {img ? (
                    <>
                      <img src={img} alt={`Ref ${idx}`} className="w-full h-full object-contain p-2" />
                      <button
                        type="button"
                        onClick={() => removeImage(idx)}
                        className="absolute top-1 right-1 p-1 bg-white/90 rounded-md shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3 text-red-500" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRefs[idx].current?.click()}
                      className="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-indigo-600"
                    >
                      <Plus className="w-5 h-5" />
                      <span className="text-[10px] font-medium">上传</span>
                    </button>
                  )}
                  <input
                    type="file"
                    ref={fileInputRefs[idx]}
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(idx, e)}
                  />
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-gray-50 space-y-4">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">场景风格</label>
              <div className="grid grid-cols-2 gap-3">
                {STYLE_PRESETS.map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => {
                      setSelectedStyle(style.id);
                      setPrompt(style.prompt);
                      if (style.id === 'room' || style.id === 'room2') {
                        setInstallationType('room');
                      } else if (installationType === 'room') {
                        setInstallationType('table');
                      }
                    }}
                    className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 transition-all font-bold text-sm ${
                      selectedStyle === style.id
                        ? 'bg-indigo-50 border-indigo-600 text-indigo-700 shadow-sm'
                        : 'bg-white border-gray-100 text-gray-500 hover:border-gray-200'
                    }`}
                  >
                    {style.id === 'zen' && <Wind className="w-4 h-4" />}
                    {style.id === 'hotel' && <Hotel className="w-4 h-4" />}
                    {style.id === 'office' && <Briefcase className="w-4 h-4" />}
                    {(style.id === 'room' || style.id === 'room2') && <UtensilsCrossed className="w-4 h-4" />}
                    {style.label}
                  </button>
                ))}
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">场景描述</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="例如：在深色石材桌面上，伴有侧向柔光，背景有极简禅意绿植"
                  className="w-full h-28 p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">安装形式</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'table', label: '桌牌展示' },
                    { id: 'wall', label: '单面贴墙' },
                    { id: 'side', label: '侧挂双面' },
                  ].map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      disabled={installationType === 'room'}
                      onClick={() => setInstallationType(type.id as 'table' | 'wall' | 'side')}
                      className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${
                        installationType === type.id
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : installationType === 'room'
                            ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">图片比例</label>
                <div className="grid grid-cols-5 gap-2">
                  {(['1:1', '3:4', '4:3', '9:16', '16:9'] as const).map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      onClick={() => setAspectRatio(ratio)}
                      className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${
                        aspectRatio === ratio
                          ? 'bg-black text-white border-black'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">清晰度</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['2K', '4K'] as const).map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setImageSize(size)}
                      className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                        imageSize === size
                          ? 'bg-black text-white border-black'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2 text-red-600 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>{error}</p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className={`py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg ${
                    isGenerating
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'
                  }`}
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      生成中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      生成3张（15积分）
                    </>
                  )}
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight">生成画廊</h2>
            <div className="flex items-center gap-4">
              {generatedImages.length >= IMAGE_COUNT && (
                <button
                  type="button"
                  onClick={handleDownloadAll}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  下载最新 {IMAGE_COUNT} 张
                </button>
              )}
              <div className="text-xs text-gray-400 font-medium">
                <span>{generatedImages.length} 个结果</span>
              </div>
            </div>
          </div>

          {generatedImages.length === 0 && !isGenerating ? (
            <div className="h-[520px] border-2 border-dashed border-gray-200 rounded-3xl flex flex-col items-center justify-center text-center p-12 bg-white/50">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                <ImageIcon className="w-10 h-10 text-gray-300" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">尚未生成图片</h3>
              <p className="text-gray-500 max-w-xs mx-auto leading-relaxed">上传产品图并填写场景描述，即可开始生成。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {isGenerating && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="aspect-square bg-white rounded-3xl border border-gray-100 shadow-sm flex flex-col items-center justify-center p-8 text-center"
                >
                  <div className="relative w-24 h-24 mb-6">
                    <div className="absolute inset-0 border-4 border-indigo-100 rounded-full" />
                    <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Sparkles className="w-8 h-8 text-indigo-600" />
                    </div>
                  </div>
                  <h3 className="font-bold text-gray-900 mb-1">正在创作图片</h3>
                  <p className="text-xs text-gray-400 animate-pulse">图片将逐张出现...</p>
                </motion.div>
              )}

              {generatedImages.map((img) => (
                <motion.div
                  key={img.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="group relative bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-xl transition-all"
                >
                  <div className="aspect-square overflow-hidden bg-gray-50">
                    <img
                      src={img.url}
                      alt={img.prompt}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="p-4 flex items-center justify-between bg-white">
                    <div className="overflow-hidden pr-3">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">场景描述</p>
                      <p className="text-xs text-gray-700 truncate font-medium">{img.prompt}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => downloadImage(img.url, `custom-cubical-scene-${img.id}.png`)}
                      className="p-2 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors shrink-0"
                      title="下载"
                    >
                      <Download className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default CustomCubicalSceneApp;
