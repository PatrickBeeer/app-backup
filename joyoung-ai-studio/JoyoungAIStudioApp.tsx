import React, { useState, useRef, useEffect } from 'react';
import { AppProps } from '../../types';
import { GeneratedImage, GenerationStatus, ScenarioConfig, ProductCategory, SceneStyle, AspectRatio } from './types';
import { generateProductScenes } from './services/geminiService';
import LoadingOverlay from './components/LoadingOverlay';
import ImageLightbox from './components/ImageLightbox';
import { Icons } from './components/Icons';

// --- Configuration Data ---

const PRODUCT_CATEGORIES: ProductCategory[] = [
  { id: 'soymilk', name: '豆浆机', enName: 'Joyoung Soymilk Maker' },
  { id: 'airfryer', name: '空气炸锅', enName: 'Air Fryer' },
  { id: 'ricecooker', name: '电饭煲', enName: 'Rice Cooker' },
  { id: 'blender', name: '破壁机', enName: 'High Speed Blender' },
  { id: 'kettle', name: '养生壶', enName: 'Health Pot' },
  { id: 'other', name: '其他产品', enName: 'Kitchen Appliance' },
];

const SCENE_STYLES: SceneStyle[] = [
  { 
    id: 'modern', 
    name: '现代简约', 
    description: '干净明亮，都市厨房格调',
    vibe: 'minimalist, high-key lighting, modern marble textures, clean lines'
  },
  { 
    id: 'warm', 
    name: '温馨居家', 
    description: '暖色调，充满生活烟火气',
    vibe: 'warm tone, cozy family atmosphere, wooden textures, soft morning light'
  },
  { 
    id: 'zen', 
    name: '中式雅致', 
    description: '木质纹理，东方禅意美学',
    vibe: 'oriental aesthetics, bamboo and wood elements, tea ceremony vibe, soft diffuse light'
  },
  { 
    id: 'outdoor', 
    name: '自然露营', 
    description: '户外自然，清新活力场景',
    vibe: 'outdoor nature setting, camping style, natural sunlight, green grass background'
  }
];

const ASPECT_RATIOS: { id: AspectRatio, label: string, icon: React.ElementType }[] = [
  { id: '1:1', label: '1:1 方形', icon: Icons.Square },
  { id: '3:4', label: '3:4 纵向', icon: Icons.Smartphone },
  { id: '4:3', label: '4:3 横向', icon: Icons.Monitor },
  { id: '16:9', label: '16:9 宽屏', icon: Icons.Layers },
  { id: '9:16', label: '9:16 全屏', icon: Icons.Smartphone },
];

// --- Helper Functions ---

const getScenariosForStyle = (styleId: string, productEnName: string): ScenarioConfig[] => {
  const productRef = `the ${productEnName}`;
  
  switch (styleId) {
    case 'warm':
      return [
        { id: 'warm-1', iconName: 'Sun', title: '元气早餐', promptSuffix: `${productRef} placed on a wooden breakfast table with fresh toast, milk and fruits. Warm morning sunlight, shallow depth of field.` },
        { id: 'warm-2', iconName: 'Home', title: '温馨厨房', promptSuffix: `${productRef} on a kitchen counter with warm ambient lighting, blurred background of a cozy family kitchen.` },
        { id: 'warm-3', iconName: 'Coffee', title: '午后时光', promptSuffix: `${productRef} on a coffee table next to a vase of flowers and a book, sunlight streaming through sheer curtains.` },
        { id: 'warm-4', iconName: 'Flame', title: '丰盛晚餐', promptSuffix: `${productRef} in a dining setting with warm tungsten lighting, creating an inviting and appetizing atmosphere.` }
      ];
    case 'zen':
      return [
        { id: 'zen-1', iconName: 'Coffee', title: '茶室雅韵', promptSuffix: `${productRef} placed on a bamboo mat or dark wooden table, oriental tea set in background. Zen atmosphere.` },
        { id: 'zen-2', iconName: 'Moon', title: '静谧空间', promptSuffix: `${productRef} in a clean, minimalist space with a bonsai tree and soft, diffuse lighting. Peaceful mood.` },
        { id: 'zen-3', iconName: 'Home', title: '原木质感', promptSuffix: `${productRef} on a raw wood surface, emphasizing natural textures and shadows. Earthy tones.` },
        { id: 'zen-4', iconName: 'Sun', title: '窗前一隅', promptSuffix: `${productRef} by a traditional window with soft natural light entering, creating a calm and sophisticated look.` }
      ];
    case 'outdoor':
      return [
        { id: 'out-1', iconName: 'Sun', title: '草地野餐', promptSuffix: `${productRef} placed on a picnic blanket on green grass, bright natural sunlight, outdoor camping vibe.` },
        { id: 'out-2', iconName: 'ZoomIn', title: '自然光影', promptSuffix: `${productRef} on a portable camping table, dappled sunlight filtering through trees. Fresh and energetic.` },
        { id: 'out-3', iconName: 'Image', title: '露营派对', promptSuffix: `${productRef} in a glamping setup, string lights in background (blurred), dusk atmosphere.` },
        { id: 'out-4', iconName: 'Droplets', title: '清新晨露', promptSuffix: `${productRef} outdoors in the early morning, fresh atmosphere, dew drops on nearby leaves.` }
      ];
    case 'modern':
    default:
      return [
        { id: 'mod-1', iconName: 'Home', title: '极简中岛', promptSuffix: `${productRef} on a clean white marble kitchen island. High key lighting, sharp focus, modern interior.` },
        { id: 'mod-2', iconName: 'ZoomIn', title: '细节特写', promptSuffix: `Close-up shot of ${productRef} on a sleek surface, emphasizing product texture and material. Studio lighting.` },
        { id: 'mod-3', iconName: 'Moon', title: '高级灰调', promptSuffix: `${productRef} in a modern grey-toned kitchen, dramatic side lighting, premium editorial style.` },
        { id: 'mod-4', iconName: 'Image', title: '精致摆拍', promptSuffix: `${productRef} styled with simple geometric props, clean background, advertising photography style.` }
      ];
  }
};

// --- Main Component ---

export const JoyoungAIStudioApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [progress, setProgress] = useState(0);
  
  // Configuration State
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory>(PRODUCT_CATEGORIES[0]);
  const [selectedStyle, setSelectedStyle] = useState<SceneStyle>(SCENE_STYLES[0]);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [customPrompt, setCustomPrompt] = useState("");
  
  // Lightbox State
  const [lightboxImage, setLightboxImage] = useState<{url: string, title: string} | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fake progress bar logic
  // Note: Gemini API 不支持实时进度回调，这里使用模拟进度条提升用户体验
  useEffect(() => {
    let interval: any;
    if (status === GenerationStatus.GENERATING) {
      setProgress(0);
      interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 95) {
            clearInterval(interval);
            return 95;
          }
          return prev + Math.floor(Math.random() * 2) + 1;
        });
      }, 1600);
    }
    return () => clearInterval(interval);
  }, [status]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const newFiles = Array.from(event.target.files);
      const totalFiles = [...selectedImages, ...newFiles].slice(0, 3); // Max 3 images
      
      setSelectedImages(totalFiles);
      
      // Create previews
      const newPreviews = totalFiles.map(file => URL.createObjectURL(file));
      // Revoke old object URLs to avoid memory leaks
      previewUrls.forEach(url => URL.revokeObjectURL(url));
      setPreviewUrls(newPreviews);
      
      setResults([]);
      setStatus(GenerationStatus.IDLE);
    }
  };

  const removeImage = (index: number) => {
    const newImages = [...selectedImages];
    newImages.splice(index, 1);
    setSelectedImages(newImages);

    const newPreviews = [...previewUrls];
    URL.revokeObjectURL(newPreviews[index]);
    newPreviews.splice(index, 1);
    setPreviewUrls(newPreviews);
  };

  const handleGenerate = async () => {
    if (selectedImages.length === 0) return;

    // 检查余额（不扣除）
    if (!platform.checkBalance(costs.GENERATE_PRODUCT_SCENES)) {
      return; // 余额不足会自动显示充值弹窗
    }

    setStatus(GenerationStatus.GENERATING);
    try {
      const scenarios = getScenariosForStyle(selectedStyle.id, selectedCategory.enName);
      const generatedImages = await generateProductScenes(
        selectedImages, 
        scenarios, 
        {
          customDetails: customPrompt,
          aspectRatio,
        }
      );

      setResults(generatedImages);
      setStatus(GenerationStatus.COMPLETE);
      await platform.refreshCredits?.();
      
      setProgress(100);
    } catch (error) {
      console.error(error);
      setStatus(GenerationStatus.ERROR);
    }
  };

  const handleReset = () => {
    selectedImages.forEach((_, i) => removeImage(i));
    setSelectedImages([]);
    setPreviewUrls([]);
    setResults([]);
    setStatus(GenerationStatus.IDLE);
    setProgress(0);
  };

  const handleDownload = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper to get aspect ratio class for preview
  const getAspectRatioClass = (ratio: AspectRatio) => {
    switch (ratio) {
      case '1:1': return 'aspect-square';
      case '3:4': return 'aspect-[3/4]';
      case '4:3': return 'aspect-[4/3]';
      case '16:9': return 'aspect-video';
      case '9:16': return 'aspect-[9/16]';
      default: return 'aspect-square';
    }
  };

  return (
    <div className="animate-fade-in min-h-screen bg-slate-50">
        {/* Loading & Lightbox Overlays */}
        {status === GenerationStatus.GENERATING && <LoadingOverlay progress={progress} />}
        {lightboxImage && (
          <ImageLightbox 
            imageUrl={lightboxImage.url} 
            altText={lightboxImage.title}
            onClose={() => setLightboxImage(null)}
            onDownload={() => handleDownload(lightboxImage.url, `joyoung-${Date.now()}.png`)}
          />
        )}

        {/* Main Content */}
        <main className="max-w-[1600px] w-full mx-auto p-4 lg:p-6 flex flex-col md:flex-row gap-6 lg:gap-8 overflow-hidden min-h-screen">
          
          {/* LEFT PANEL: Configuration */}
          <section className="w-full md:w-[420px] lg:w-[480px] flex flex-col gap-6 h-full overflow-y-auto no-scrollbar md:pr-2 pb-24 md:pb-0">
            
            {/* 1. Upload Section */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-gray-800 flex items-center gap-2">
                  <Icons.Upload className="w-5 h-5 text-orange-500" />
                  产品原图 ({selectedImages.length}/3)
                </h2>
                {selectedImages.length > 0 && (
                  <button onClick={handleReset} className="text-xs text-gray-400 hover:text-orange-500 flex items-center gap-1">
                    <Icons.Refresh className="w-3 h-3" /> 重置
                  </button>
                )}
              </div>

              {selectedImages.length === 0 ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full aspect-[4/3] rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 hover:bg-orange-50 hover:border-orange-300 transition-all cursor-pointer flex flex-col items-center justify-center gap-3 group"
                >
                  <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Icons.Camera className="w-8 h-8 text-gray-400 group-hover:text-orange-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-600">点击上传产品图</p>
                    <p className="text-xs text-gray-400 mt-1">支持 JPG, PNG (最多3张)</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                   {/* Existing Images */}
                   {previewUrls.map((url, index) => (
                      <div key={index} className="relative group rounded-lg overflow-hidden border border-gray-200 bg-gray-50 aspect-square">
                        <img src={url} alt={`Product ${index}`} className="w-full h-full object-contain p-2" />
                        <button 
                          onClick={() => removeImage(index)}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                        >
                          <Icons.X className="w-3 h-3" />
                        </button>
                      </div>
                   ))}
                   
                   {/* Add more button if less than 3 */}
                   {selectedImages.length < 3 && (
                     <div 
                       onClick={() => fileInputRef.current?.click()}
                       className="aspect-square rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 hover:bg-orange-50 hover:border-orange-300 transition-all cursor-pointer flex flex-col items-center justify-center gap-1 group"
                     >
                       <Icons.Camera className="w-6 h-6 text-gray-300 group-hover:text-orange-500" />
                       <span className="text-xs text-gray-400 group-hover:text-orange-600">添加</span>
                     </div>
                   )}
                </div>
              )}
              <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*" multiple className="hidden" />
            </div>

            {/* 2. Image Settings (Ratio Only) */}
            <div className={`bg-white rounded-2xl p-6 shadow-sm border border-gray-100 transition-opacity ${selectedImages.length === 0 ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
              <h2 className="font-bold text-gray-800 flex items-center gap-2 mb-4">
                <Icons.Layers className="w-5 h-5 text-orange-500" />
                画面比例
              </h2>
              
              <div className="flex flex-wrap gap-2">
                {ASPECT_RATIOS.map((ratio) => {
                  const Icon = ratio.icon;
                  return (
                    <button
                      key={ratio.id}
                      onClick={() => setAspectRatio(ratio.id)}
                      className={`flex flex-col items-center justify-center p-2 rounded-lg border min-w-[60px] transition-all ${
                        aspectRatio === ratio.id 
                        ? 'bg-orange-50 border-orange-500 text-orange-700' 
                        : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className="w-5 h-5 mb-1" />
                      <span className="text-xs font-medium">{ratio.id}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 3. Scenario Settings */}
            <div className={`bg-white rounded-2xl p-6 shadow-sm border border-gray-100 transition-opacity ${selectedImages.length === 0 ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
              <h2 className="font-bold text-gray-800 flex items-center gap-2 mb-4">
                <Icons.Sparkles className="w-5 h-5 text-orange-500" />
                风格与场景
              </h2>

              {/* Category */}
              <div className="mb-6">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">3. 产品类型</label>
                <div className="grid grid-cols-3 gap-2">
                  {PRODUCT_CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-2 py-2.5 rounded-lg text-xs font-medium transition-all border truncate ${
                        selectedCategory.id === cat.id 
                        ? 'bg-orange-50 border-orange-500 text-orange-700' 
                        : 'bg-white border-gray-200 text-gray-600 hover:border-orange-200'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scene Style */}
              <div className="mb-6">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">4. 场景风格</label>
                <div className="grid grid-cols-1 gap-2">
                  {SCENE_STYLES.map(style => (
                    <div 
                      key={style.id}
                      onClick={() => setSelectedStyle(style)}
                      className={`relative p-3 rounded-xl border-2 transition-all cursor-pointer flex items-center gap-3 ${
                        selectedStyle.id === style.id
                        ? 'border-orange-500 bg-orange-50/50'
                        : 'border-transparent bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${selectedStyle.id === style.id ? 'bg-orange-100 text-orange-600' : 'bg-white text-gray-400'}`}>
                        {style.id === 'modern' && <Icons.Home className="w-5 h-5" />}
                        {style.id === 'warm' && <Icons.Coffee className="w-5 h-5" />}
                        {style.id === 'zen' && <Icons.Moon className="w-5 h-5" />}
                        {style.id === 'outdoor' && <Icons.Sun className="w-5 h-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-gray-800 text-sm truncate">{style.name}</div>
                        <div className="text-xs text-gray-500 truncate">{style.description}</div>
                      </div>
                      {selectedStyle.id === style.id && (
                        <Icons.Check className="w-4 h-4 text-orange-500 flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom Details */}
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">5. 自定义细节 (可选)</label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="例如：放在木质桌面上..."
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all resize-none bg-gray-50 focus:bg-white min-h-[80px]"
                  maxLength={100}
                />
              </div>
            </div>

            {/* Generate Button */}
            <div className={`sticky bottom-0 bg-gray-50 pt-2 pb-2 ${selectedImages.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}>
               <button
                onClick={handleGenerate}
                disabled={selectedImages.length === 0 || status === GenerationStatus.GENERATING}
                className="w-full bg-gradient-to-r from-orange-600 to-red-500 hover:from-orange-500 hover:to-red-400 text-white font-bold py-4 rounded-xl shadow-xl shadow-orange-200 flex items-center justify-center gap-2 text-lg transition-all active:scale-95"
              >
                <Icons.Sparkles className="w-5 h-5 animate-pulse" />
                生成 4 张场景图
              </button>
            </div>
          </section>

          {/* RIGHT PANEL: Results */}
          <section className="flex-1 bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
             <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
                <div>
                  <h2 className="font-bold text-xl text-gray-800">生成结果</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {results.length > 0 ? `已生成 (${aspectRatio})` : '等待生成任务...'}
                  </p>
                </div>
                {results.length > 0 && (
                   <button onClick={() => setResults([])} className="text-sm text-gray-400 hover:text-red-500 flex items-center gap-1">
                     <Icons.X className="w-4 h-4" /> 清空
                   </button>
                )}
             </div>

             <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
                {results.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-4 min-h-[400px]">
                    <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center">
                      <Icons.Image className="w-10 h-10 text-gray-300" />
                    </div>
                    <div className="text-center">
                      <p className="font-medium">暂无生成图片</p>
                      <p className="text-sm mt-2 max-w-xs mx-auto">请在左侧上传产品图、设置比例并选择风格。</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-12">
                    {results.map((img) => (
                      <div key={img.id} className="group relative bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-md transition-all">
                        {/* Image container with dynamic aspect ratio */}
                        <div 
                          className={`relative overflow-hidden bg-gray-100 cursor-pointer ${getAspectRatioClass(img.aspectRatio as AspectRatio)}`}
                          onClick={() => setLightboxImage({url: img.url, title: img.scenario})}
                        >
                          <img 
                            src={img.url} 
                            alt={img.scenario} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                             <div className="bg-white/90 backdrop-blur text-gray-800 px-4 py-2 rounded-full font-medium text-sm flex items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-transform">
                               <Icons.ZoomIn className="w-4 h-4" /> 点击放大
                             </div>
                          </div>
                        </div>
                        
                        <div className="p-4 flex items-center justify-between bg-white relative z-10">
                          <div>
                             <h3 className="font-bold text-gray-800 text-sm">{img.scenario}</h3>
                             <p className="text-xs text-gray-500 mt-0.5">{selectedStyle.name} · {aspectRatio}</p>
                          </div>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(img.url, `joyoung-${img.id}.png`);
                            }}
                            className="p-2 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-full transition-colors"
                            title="下载原图"
                          >
                            <Icons.Download className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
             </div>
          </section>

        </main>
    </div>
  );
};


