import React, { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon, AlertCircle, Wand2, Download, Home, UserSquare2, Sparkles, Loader2, ZoomIn, X, PenTool, ImagePlus, History, Trash2, ChevronDown, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from "motion/react";
import localforage from 'localforage';
import { AppProps } from '../../../types';
import {
  analyzeProductImage,
  generateStyledImages,
  editGeneratedImage,
  persistGeneratedImageTask,
  type InlineImagePart,
} from './services/geminiService';
import { cacheGeneratedAsset } from '../../../shared_services/localGeneratedAssetCache';

export interface HistoryItem {
  id: string;
  url: string;
  timestamp: number;
}

const APP_ID = 'home-storage';
const COST_PER_IMAGE = 10;
const COST_PER_IMAGE_4K = 35;
const COST_PER_RETRY_IMAGE = 15;
const GENERATED_IMAGE_COUNT = 2;

const fileToBase64 = (file: File): Promise<{ mimeType: string; data: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const [prefix, data] = result.split(',');
      const mimeType = prefix.match(/:(.*?);/)?.[1] || 'image/jpeg';
      resolve({ mimeType, data });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const defaultPlatform: AppProps['platform'] = {
  user: { id: 0, username: 'standalone-user', credits: 0 },
  credits: 0,
  checkBalance: () => true,
  deductCredits: async () => true,
  refreshCredits: async () => {},
  showRecharge: () => {},
  onBack: () => {
    window.location.href = '/app/';
  },
};

const parseDataUrl = (value: string): { mimeType: string; data: string } => {
  const match = String(value || '').match(/^data:([^;]+);base64,(.*)$/i);
  if (!match?.[1] || !match?.[2]) {
    throw new Error('图片数据格式无效');
  }

  return {
    mimeType: match[1],
    data: match[2],
  };
};

const blobToDataUrl = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('图片读取失败'));
    };
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(blob);
  });
};

const assetUrlToInlineImage = async (assetUrl: string): Promise<InlineImagePart> => {
  if (String(assetUrl || '').startsWith('data:')) {
    const parsed = parseDataUrl(assetUrl);
    return { inlineData: parsed };
  }

  const response = await fetch(assetUrl);
  if (!response.ok) {
    throw new Error(`无法读取图片资源 (HTTP ${response.status})`);
  }

  const blob = await response.blob();
  const dataUrl = await blobToDataUrl(blob);
  return { inlineData: parseDataUrl(dataUrl) };
};

const App: React.FC<Partial<AppProps>> = ({ platform, costs }) => {
  const activePlatform = platform ?? defaultPlatform;
  const activeCosts = costs ?? {};
  return <Workspace platform={activePlatform} costs={activeCosts} />;
}

export default App;

const STYLE_PROMPTS: Record<string, string> = {
  ikea: "Clean, modern, minimalist Scandinavian interior setting. Bright natural lighting, light wood textures, highly functional, organized space. Classic IKEA showroom style. High quality commercial photography.",
  xiaohongshu: "A trendy, cozy, aesthetic living space. Warm ambient lighting, soft luxurious textures, pastel and beige tones, delicate cinematic shadows. Popular Xiaohongshu (RED) influencer lifestyle aesthetic.",
  midcentury: "Mid-century modern interior. Teak wood furniture, retro color palettes (mustard, teal, burnt orange), geometric shapes, vintage sophistication, 1960s aesthetic.",
  nordic: "Nordic log cabin aesthetic. Abundant raw wood textures, white airy walls, cozy textiles, faux fur throws, large windows letting in cool natural light. Fresh and inviting.",
  luxury: "French luxury interior. Ornate wall moldings, marble surfaces, brass or gold accents, velvet textures, grand chandeliers, high ceilings. Elegant, expensive, and sophisticated.",
};

function Workspace({ platform, costs }: { platform: AppProps['platform']; costs: AppProps['costs'] }) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generationType, setGenerationType] = useState<'scene' | 'model'>('scene');
  const [modelStyle, setModelStyle] = useState<'asian' | 'jk' | 'caucasian' | 'influencer'>('asian');
  const [resolution, setResolution] = useState<'2K' | '4K'>('2K');
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '3:4' | '9:16' | '16:9'>('1:1');
  const [stylePreset, setStylePreset] = useState<'none' | 'ikea' | 'xiaohongshu' | 'midcentury' | 'nordic' | 'luxury'>('none');
  const [customPrompt, setCustomPrompt] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [sellingPoints, setSellingPoints] = useState("");
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [errorMap, setErrorMap] = useState<string | null>(null);
  const [isFullscreenZoom, setIsFullscreenZoom] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isStyleExpanded, setIsStyleExpanded] = useState(false);
  const [isAdvancedExpanded, setIsAdvancedExpanded] = useState(false);
  const costPerImage = Number(
    resolution === '4K'
      ? costs.GENERATE_IMAGE_4K ?? costs.image_gen_4k ?? costs.GENERATE_IMAGE ?? COST_PER_IMAGE_4K
      : costs.GENERATE_IMAGE ?? costs.image_gen ?? COST_PER_IMAGE
  );
  const retryCostPerImage = Number(costs.GENERATE_IMAGE_RETRY ?? costs.image_gen_retry ?? COST_PER_RETRY_IMAGE);
  const totalGenerationCost =
    resolution === '4K'
      ? Number(costs.GENERATE_IMAGE_4K ?? costs.image_gen_4k ?? COST_PER_IMAGE_4K)
      : costPerImage * GENERATED_IMAGE_COUNT;

  // Local editing state
  const [localEditingIdx, setLocalEditingIdx] = useState<number | null>(null);
  const [localEditPrompt, setLocalEditPrompt] = useState("");
  const [localGeneratingIdx, setLocalGeneratingIdx] = useState<number | null>(null);

  useEffect(() => {
    localforage.getItem<HistoryItem[]>('snapspace_history').then(data => {
      if (data) {
        setHistory(data);
      }
    });
  }, []);

  const saveHistory = async (newHistory: HistoryItem[]) => {
    setHistory(newHistory);
    await localforage.setItem('snapspace_history', newHistory);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const buildPrompt = () => {
    let basePrompt = 'You are an expert AI product photographer. Your task is to realistically integrate the FIRST image (the white-background product) into an environment. CRITICAL REQUIREMENT: STRICTLY PRESERVE THE EXACT PRODUCT IDENTITY. Do not alter, warp, hallucinate, or modify the text, logos, shape, proportions, or any structural details of the product. The product must look exactly as it does in the original image, just placed in a new realistic environment.\n\n';

    if (sellingPoints.trim()) {
      basePrompt += `Product Selling Points (highlight these features naturally in the environment context): ${sellingPoints.trim()}\n\n`;
    }

    if (productDescription.trim()) {
      basePrompt += `Product Description (use this for scale, placement, and context): ${productDescription.trim()}\n\n`;
    }

    if (stylePreset !== 'none') {
      basePrompt += `Style: ${STYLE_PROMPTS[stylePreset]}\n\n`;
    }

    if (referenceFile) {
      basePrompt += 'The SECOND image is a STYLE REFERENCE. Use its lighting, color palette, mood, and aesthetic room style for the environment. DO NOT put the product from the first image entirely inside the product of the second image; merely use the second image as an artistic reference for the background.\n\n';
    }

    if (customPrompt.trim()) {
      basePrompt += `Additional creative direction (MUST FOLLOW): ${customPrompt.trim()}\n\n`;
    }

    if (generationType === 'model') {
      let modelDesc = 'A stylish, elegant, and professional lifestyle model';
      switch (modelStyle) {
        case 'asian':
          modelDesc = 'An attractive, elegant Asian lifestyle model with a stylish professional look';
          break;
        case 'jk':
          modelDesc = 'A stylish Japanese/Korean lifestyle model in trendy fashion attire, professional eCommerce look';
          break;
        case 'caucasian':
          modelDesc = 'An elegant Caucasian lifestyle model with a sophisticated professional look';
          break;
        case 'influencer':
          modelDesc = 'A highly fashionable influencer lifestyle model with a premium eCommerce aesthetic';
          break;
      }

      basePrompt += `Subject: ${modelDesc} is elegantly interacting with or standing alongside the product in the scene. CRUCIAL TO AVOID AI-FEEL: The model MUST have realistic skin textures (e.g., slight pore texture, tiny freckles, natural skin imperfections) and display genuine lively emotions (e.g., smiling, happy, excited) instead of a blank or plastic expression. The photo must be professional commercial eCommerce photography, NOT an amateur selfie. Keep it highly realistic, high-end, and vibrant.\n\n`;
    }

    basePrompt += 'IMPORTANT: DO NOT generate any floating text, watermarks, labels, typography, or random letters in the environment or on the final image. The generated image MUST BE completely free of text.\n\n';

    return basePrompt;
  };

  const analyzeProduct = async (fileToAnalyze: File) => {
    setIsAnalyzing(true);
    setSellingPoints("");
    try {
      const { mimeType, data } = await fileToBase64(fileToAnalyze);
      const analysis = await analyzeProductImage({ mimeType, data });
      setSellingPoints(analysis);
    } catch (error: any) {
      console.error("Analysis failed", error);
      if (error.message?.includes('503') || error.message?.includes('Deadline expired') || error.message?.includes('UNAVAILABLE')) {
         setSellingPoints("API服务器繁忙超时（503异常）。您可以直接在这里手动输入卖点...");
      } else {
         setSellingPoints("自动识别失败，请手动输入卖点。");
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReferenceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setReferenceFile(selectedFile);
      setReferencePreviewUrl(URL.createObjectURL(selectedFile));
    }
  };

  const handleReferenceDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selectedFile = e.dataTransfer.files[0];
      if (selectedFile.type.startsWith('image/')) {
        setReferenceFile(selectedFile);
        setReferencePreviewUrl(URL.createObjectURL(selectedFile));
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile));
      setGeneratedImages([]);
      setErrorMap(null);
      await analyzeProduct(selectedFile);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selectedFile = e.dataTransfer.files[0];
      if (selectedFile.type.startsWith('image/')) {
        setFile(selectedFile);
        setPreviewUrl(URL.createObjectURL(selectedFile));
        setGeneratedImages([]);
        setErrorMap(null);
        await analyzeProduct(selectedFile);
      }
    }
  };

  const handleGenerate = async () => {
    if (!file) return;
    if (!platform.checkBalance(totalGenerationCost)) return;
    
    setIsGenerating(true);
    setGeneratedImages([]);
    setErrorMap(null);
    
    try {
      const { mimeType, data } = await fileToBase64(file);
      const parts: InlineImagePart[] = [{ inlineData: { data, mimeType } }];

      if (referenceFile) {
        const { mimeType: refMimeType, data: refData } = await fileToBase64(referenceFile);
        parts.push({ inlineData: { data: refData, mimeType: refMimeType } });
      }
      const prompt = buildPrompt();
      const newHistoryItems: HistoryItem[] = [];
      const persistenceJobs: Promise<void>[] = [];
      const imageUrls = await generateStyledImages({
        parts,
        prompt,
        aspectRatio,
        imageSize: resolution,
        imageCount: GENERATED_IMAGE_COUNT,
        onImage: ({ index, imageUrl }) => {
          setGeneratedImages((prev) => [...prev, imageUrl]);
          cacheGeneratedAsset({
            appId: APP_ID,
            source: imageUrl,
            title: `家居收纳方案 ${index + 1}`,
          });

          const persistenceJob = persistGeneratedImageTask(imageUrl, {
            title: `家居收纳方案 ${index + 1}`,
            index,
            prompt,
            generationType,
            customPrompt,
            aspectRatio,
            resolution,
            stylePreset,
            sellingPoints,
            productDescription,
          })
            .then((persistedUrl) => {
              const finalUrl = persistedUrl || imageUrl;
              if (finalUrl !== imageUrl) {
                setGeneratedImages((prev) => prev.map((currentUrl) => (currentUrl === imageUrl ? finalUrl : currentUrl)));
              }

              newHistoryItems.push({
                id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
                url: finalUrl,
                timestamp: Date.now(),
              });
            })
            .catch((persistError) => {
              console.warn('[home-storage] failed to persist generated image task', persistError);
              newHistoryItems.push({
                id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
                url: imageUrl,
                timestamp: Date.now(),
              });
            });

          persistenceJobs.push(persistenceJob);
        },
      });
      await Promise.allSettled(persistenceJobs);

      if (imageUrls.length > 0) {
        await platform.refreshCredits?.();
        if (imageUrls.length < GENERATED_IMAGE_COUNT) {
          setErrorMap(`已成功生成 ${imageUrls.length}/${GENERATED_IMAGE_COUNT} 张图片。`);
        }

        if (newHistoryItems.length > 0) {
          await saveHistory([...newHistoryItems, ...history].slice(0, 50));
        }
      } else {
        throw new Error("未能返回图像，可能是因为安全过滤机制拦截了请求。");
      }

    } catch (err: any) {
      console.error(err);
      if (err.message?.includes('403') || err.message?.includes('PERMISSION_DENIED')) {
        setErrorMap('当前账号无权调用图像生成服务。');
      } else if (err.message?.includes('503') || err.message?.includes('Deadline expired') || err.message?.includes('UNAVAILABLE')) {
        setErrorMap("云端生成超时 (503 异常)。由于服务器当前负载较高或模型处理所需时间过长，请求被中断，请直接再次点击生成按钮重试。");
      } else {
        setErrorMap(err.message || "生成期间发生了未知错误。");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = (imgUrl: string) => {
    if (!imgUrl) return;
    const link = document.createElement('a');
    link.href = imgUrl;
    link.download = `snapspace-pro-${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRegenerateSingle = async (idx: number) => {
    if (!file || !generatedImages[idx]) return;
    if (!platform.checkBalance(retryCostPerImage)) return;
    setLocalGeneratingIdx(idx);
    setErrorMap(null);
    try {
      const { mimeType, data } = await fileToBase64(file);
      const parts: InlineImagePart[] = [{ inlineData: { data, mimeType } }];

      if (referenceFile) {
        const { mimeType: refMimeType, data: refData } = await fileToBase64(referenceFile);
        parts.push({ inlineData: { data: refData, mimeType: refMimeType } });
      }

      const prompt = buildPrompt();
      const generated = await generateStyledImages({
        parts,
        prompt,
        aspectRatio,
        imageSize: resolution,
        imageCount: 1,
        billingTask: 'image_gen_retry',
      });

      const nextImage = generated[0] || '';
      const newImageUrl = nextImage
        ? await persistGeneratedImageTask(nextImage, {
            title: `家居收纳重生成方案 ${idx + 1}`,
            index: idx,
            prompt,
            generationType,
            customPrompt,
            aspectRatio,
            resolution,
            stylePreset,
            sellingPoints,
            productDescription,
          }).catch((persistError) => {
            console.warn('[home-storage] failed to persist regenerated image task', persistError);
            return nextImage;
          })
        : '';

      if (newImageUrl) {
        cacheGeneratedAsset({
          appId: APP_ID,
          source: newImageUrl,
          title: `家居收纳重生成方案 ${idx + 1}`,
        });
        const newImages = [...generatedImages];
        newImages[idx] = newImageUrl;
        setGeneratedImages(newImages);
        await platform.refreshCredits?.();
        const newItem: HistoryItem = { id: Date.now().toString(), url: newImageUrl, timestamp: Date.now() };
        saveHistory([newItem, ...history].slice(0, 50));
      } else {
        throw new Error("未能生成图片，请重试。");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMap(err.message || "未知错误");
    } finally {
      setLocalGeneratingIdx(null);
    }
  };

  const handleLocalEdit = async (idx: number) => {
    if (!generatedImages[idx] || !localEditPrompt.trim()) return;
    if (!platform.checkBalance(costPerImage)) return;
    setLocalGeneratingIdx(idx);
    setErrorMap(null);
    try {
      const sourceImage = await assetUrlToInlineImage(generatedImages[idx]);
      const generatedImageUrl = await editGeneratedImage(sourceImage.inlineData, localEditPrompt, aspectRatio, resolution);
      const newImageUrl = await persistGeneratedImageTask(generatedImageUrl, {
        title: `家居收纳局部编辑 ${idx + 1}`,
        index: idx,
        prompt: localEditPrompt,
        generationType,
        customPrompt,
        aspectRatio,
        resolution,
        stylePreset,
        sellingPoints,
        productDescription,
        sourceLabel: 'local_edit',
      }).catch((persistError) => {
        console.warn('[home-storage] failed to persist edited image task', persistError);
        return generatedImageUrl;
      });

      if (newImageUrl) {
        const newImages = [...generatedImages];
        newImages[idx] = newImageUrl;
        setGeneratedImages(newImages);
        await platform.refreshCredits?.();
        const newItem: HistoryItem = { id: Date.now().toString(), url: newImageUrl, timestamp: Date.now() };
        saveHistory([newItem, ...history].slice(0, 50));
        setLocalEditingIdx(null);
        setLocalEditPrompt("");
      } else {
        throw new Error("未能生成图片，请重试。");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMap(err.message || "未知错误");
    } finally {
      setLocalGeneratingIdx(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col selection:bg-blue-200 selection:text-black">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-black/[0.05] py-4 px-6 md:px-10 flex items-center justify-between sticky top-0 z-50 w-full mb-8">
        <div className="flex items-center gap-4 relative max-w-[1400px] w-full mx-auto">
           <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
             </div>
             <h1 className="text-[19px] font-semibold tracking-tight">SnapSpace</h1>
             <span className="text-[13px] text-gray-500 ml-2 hidden sm:inline-block">家居收纳 AI 工作台</span>
           </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 md:px-8 pb-12 grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        
        {/* Settings Panel */}
        <div className="xl:col-span-4 bg-white border border-black/[0.04] shadow-[0_4px_24px_rgb(0,0,0,0.02)] flex flex-col rounded-3xl lg:sticky lg:top-[100px]">
          <div className="p-6 md:p-8 space-y-10 flex-1">
             
            {/* Upload Area */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[15px] font-semibold tracking-tight">1. 上传商品图</h2>
              </div>
              <div 
                className={`relative border border-black/[0.08] p-8 transition-colors text-center cursor-pointer rounded-2xl
                  ${previewUrl ? 'bg-gray-50/50' : 'bg-[#f5f5f7] hover:bg-[#ebebef]'}
                `}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => !file && fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                />
                
                {previewUrl ? (
                  <div className="relative group">
                    <img src={previewUrl} alt="Preview" className="max-h-56 mx-auto object-contain bg-transparent rounded-xl" referrerPolicy="no-referrer" />
                    <button 
                      onClick={(e) => { e.stopPropagation(); setFile(null); setPreviewUrl(null); setGeneratedImages([]); }}
                      className="absolute inset-x-0 bottom-0 top-0 m-auto h-9 w-24 bg-black/60 backdrop-blur-md text-white opacity-0 group-hover:opacity-100 flex items-center justify-center font-medium text-[13px] mx-auto transition-all rounded-full hover:scale-105"
                    >
                      移除图片
                    </button>
                  </div>
                ) : (
                  <div className="py-6 flex flex-col items-center">
                    <div className="w-14 h-14 bg-white border border-black/[0.05] rounded-full flex items-center justify-center mb-5 shadow-sm text-gray-400 mx-auto">
                       <ImagePlus className="w-6 h-6" strokeWidth={1.5} />
                    </div>
                    <p className="text-[15px] font-medium text-gray-900 mb-1">拖拽或点击上传</p>
                    <p className="text-[13px] text-gray-400 mt-1">支持 PNG / JPG，最高 10MB</p>
                  </div>
                )}
              </div>
              
              <AnimatePresence>
                {isAnalyzing && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 p-4 bg-[#f5f5f7] rounded-xl flex items-center justify-center gap-2 text-[13px]"
                  >
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    <span className="text-gray-600">正在分析商品特征...</span>
                  </motion.div>
                )}
              </AnimatePresence>
              
              {previewUrl && !isAnalyzing && (
                <div className="mt-6 space-y-4 animate-in fade-in slide-in-from-top-2 text-left">
                  <div>
                    <label className="text-[13px] text-gray-500 mb-2 block">AI 提取卖点</label>
                    <textarea 
                      value={sellingPoints}
                      onChange={e => setSellingPoints(e.target.value)}
                      placeholder="商品功能卖点将被自动识别..."
                      className="w-full p-3.5 bg-gray-50 hover:bg-gray-100 focus:bg-white border border-black/[0.08] focus:border-[#0071e3] focus:ring-4 focus:ring-[#0071e3]/10 transition-all text-[15px] text-gray-900 resize-none h-[88px] rounded-xl placeholder:text-gray-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[13px] text-gray-500 mb-2 block">尺寸与场景</label>
                    <input 
                      type="text"
                      value={productDescription}
                      onChange={e => setProductDescription(e.target.value)}
                      placeholder="例：长 60cm，适合客厅"
                      className="w-full p-3.5 bg-gray-50 hover:bg-gray-100 focus:bg-white border border-black/[0.08] focus:border-[#0071e3] focus:ring-4 focus:ring-[#0071e3]/10 transition-all text-[15px] text-gray-900 rounded-xl placeholder:text-gray-400 outline-none"
                    />
                  </div>
                </div>
              )}
            </section>

            {/* Type Selection */}
            <section className={!previewUrl ? 'opacity-40 grayscale pointer-events-none transition-all' : 'transition-all mt-8'}>
               <h2 className="text-[15px] font-semibold tracking-tight mb-4">2. 生成类型</h2>
               <div className="grid grid-cols-2 gap-3">
                 <button
                  onClick={() => setGenerationType('scene')}
                  className={`flex flex-col items-center justify-center p-5 border transition-all rounded-2xl ${
                    generationType === 'scene' 
                      ? 'bg-white border-[#0071e3] shadow-[0_0_0_1px_rgba(0,113,227,1)] text-[#0071e3]' 
                      : 'bg-[#f5f5f7] border-transparent hover:bg-[#ebebef] text-gray-500'
                  }`}
                 >
                   <Home className={`w-6 h-6 mb-2 transition-colors ${generationType === 'scene' ? 'text-[#0071e3]' : 'text-gray-400'}`} strokeWidth={1.5} />
                   <span className="text-[14px] font-medium">纯净场景</span>
                 </button>
                 <button
                  onClick={() => setGenerationType('model')}
                  className={`flex flex-col items-center justify-center p-5 border transition-all rounded-2xl ${
                    generationType === 'model' 
                      ? 'bg-white border-[#0071e3] shadow-[0_0_0_1px_rgba(0,113,227,1)] text-[#0071e3]' 
                      : 'bg-[#f5f5f7] border-transparent hover:bg-[#ebebef] text-gray-500'
                  }`}
                 >
                   <UserSquare2 className={`w-6 h-6 mb-2 transition-colors ${generationType === 'model' ? 'text-[#0071e3]' : 'text-gray-400'}`} strokeWidth={1.5} />
                   <span className="text-[14px] font-medium">模特互动</span>
                 </button>
               </div>

              <AnimatePresence>
                {generationType === 'model' && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden mt-4"
                  >
                     <label className="text-[13px] text-gray-500 mb-2 block">模特风格</label>
                     <div className="flex bg-[#f5f5f7] p-1 rounded-xl">
                       {[
                         { id: 'asian', label: '亚裔' },
                         { id: 'jk', label: '日韩' },
                         { id: 'caucasian', label: '欧美' },
                         { id: 'influencer', label: '网红风' }
                       ].map(style => (
                         <button
                           key={style.id}
                           onClick={(e) => { e.preventDefault(); setModelStyle(style.id as any); }}
                           className={`flex-1 py-1.5 px-2 transition-all rounded-lg text-[13px] font-medium ${
                             modelStyle === style.id 
                              ? 'bg-white shadow-sm text-gray-900 border border-black/[0.04]' 
                              : 'text-gray-500 hover:text-gray-800'
                           }`}
                         >
                           {style.label}
                         </button>
                       ))}
                     </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            {/* Style Preset */}
            <section className={!previewUrl ? 'opacity-40 grayscale pointer-events-none transition-all' : 'transition-all mt-8'}>
               <div 
                 className="flex items-center justify-between cursor-pointer group mb-1"
                 onClick={() => setIsStyleExpanded(!isStyleExpanded)}
               >
                 <h2 className="text-[15px] font-semibold tracking-tight flex items-center gap-2">
                   3. 场景风格 <span className="font-normal text-gray-400 text-xs">({stylePreset === 'none' ? '无预设' : '已选定'})</span>
                 </h2>
                 <button className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-50 group-hover:bg-gray-100 transition-colors">
                   <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isStyleExpanded ? 'rotate-180' : ''}`} />
                 </button>
               </div>
               
               <AnimatePresence>
                 {isStyleExpanded && (
                   <motion.div
                     initial={{ height: 0, opacity: 0 }}
                     animate={{ height: 'auto', opacity: 1 }}
                     exit={{ height: 0, opacity: 0 }}
                     className="overflow-hidden"
                   >
                     <div className="pt-2 pb-2">
                       <div className="grid grid-cols-3 gap-2">
                         {[
                           { id: 'none', label: '无预设', icon: '✨' },
                           { id: 'ikea', label: '现代极简', icon: '🪑' },
                           { id: 'xiaohongshu', label: '奶油温馨', icon: '☁️' },
                           { id: 'midcentury', label: '中古复古', icon: '📻' },
                           { id: 'nordic', label: '北欧原木', icon: '🌲' },
                           { id: 'luxury', label: '法式轻奢', icon: '🥂' },
                         ].map(p => (
                           <button
                             key={p.id}
                             onClick={() => setStylePreset(p.id as any)}
                             className={`py-3 px-1 border transition-all text-center rounded-xl flex flex-col items-center justify-center gap-1.5 ${
                               stylePreset === p.id 
                                 ? 'bg-white border-[#0071e3] shadow-[0_0_0_1px_rgba(0,113,227,1)] text-[#0071e3]' 
                                 : 'bg-[#f5f5f7] border-transparent hover:bg-[#ebebef] text-gray-500'
                             }`}
                           >
                             <span className="text-[18px] leading-none text-gray-700">{p.icon}</span>
                             <span className={`font-medium text-[11px] whitespace-nowrap ${stylePreset === p.id ? 'text-[#0071e3]' : 'text-gray-500'}`}>{p.label}</span>
                           </button>
                         ))}
                       </div>
                     </div>
                   </motion.div>
                 )}
               </AnimatePresence>
            </section>
            
            {/* Advanced Customization */}
            <section className={!previewUrl ? 'opacity-40 grayscale pointer-events-none transition-all' : 'transition-all mt-6 pt-6 border-t border-black/[0.05]'}>
               <div 
                 className="flex items-center justify-between cursor-pointer group mb-1"
                 onClick={() => setIsAdvancedExpanded(!isAdvancedExpanded)}
               >
                 <h2 className="text-[15px] font-semibold tracking-tight flex items-center gap-2">
                   4. 自由引导 <span className="font-normal text-gray-400 text-xs">(选填，支持上传参考图)</span>
                 </h2>
                 <button className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-50 group-hover:bg-gray-100 transition-colors">
                   <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isAdvancedExpanded ? 'rotate-180' : ''}`} />
                 </button>
               </div>
               
               <AnimatePresence>
                 {isAdvancedExpanded && (
                   <motion.div
                     initial={{ height: 0, opacity: 0 }}
                     animate={{ height: 'auto', opacity: 1 }}
                     exit={{ height: 0, opacity: 0 }}
                     className="overflow-hidden"
                   >
                     <div className="pt-2 pb-2">
                       <div className="p-5 bg-gray-50 border border-black/[0.08] rounded-2xl">
                         {/* Reference Image */}
                         <div className="mb-4">
                           <label className="text-[13px] text-gray-800 font-medium mb-2 block">参考图 <span className="font-normal text-gray-400">(控制构图和光影)</span></label>
                           <div 
                             className={`relative border border-black/[0.1] border-dashed p-3 transition-colors text-center cursor-pointer rounded-xl
                               ${referencePreviewUrl ? 'bg-white' : 'bg-transparent hover:bg-black/[0.02]'}
                             `}
                             onDragOver={handleReferenceDrop}
                             onDrop={handleReferenceDrop}
                             onClick={() => !referenceFile && referenceInputRef.current?.click()}
                           >
                             <input 
                               type="file" 
                               accept="image/*" 
                               className="hidden" 
                               ref={referenceInputRef}
                               onChange={handleReferenceChange}
                             />
                             {referencePreviewUrl ? (
                               <div className="relative group">
                                 <img src={referencePreviewUrl} alt="Reference" className="h-16 mx-auto object-contain rounded-lg" referrerPolicy="no-referrer" />
                                 <button 
                                   onClick={(e) => { e.stopPropagation(); setReferenceFile(null); setReferencePreviewUrl(null); }}
                                   className="absolute inset-x-0 bottom-0 top-0 m-auto h-6 w-16 bg-black/60 backdrop-blur-md text-white opacity-0 group-hover:opacity-100 flex items-center justify-center font-medium text-[11px] transition-all rounded-full"
                                 >
                                   移除
                                 </button>
                               </div>
                             ) : (
                               <div className="py-2 flex flex-col items-center">
                                 <p className="text-[12px] font-medium text-gray-500">点击上传风格参考</p>
                               </div>
                             )}
                           </div>
                         </div>
           
                         {/* Custom Prompt */}
                         <div>
                           <label className="text-[13px] text-gray-800 font-medium mb-2 block">附加描述 <span className="font-normal text-gray-400">(进一步控制细节)</span></label>
                           <textarea 
                             value={customPrompt}
                             onChange={e => setCustomPrompt(e.target.value)}
                             placeholder="例如：放置在木质桌面上，旁边有绿植点缀..."
                             className="w-full p-3 bg-white border border-black/[0.08] focus:border-[#0071e3] focus:ring-4 focus:ring-[#0071e3]/10 transition-all resize-none text-[14px] text-gray-900 rounded-xl placeholder:text-gray-400 outline-none h-20"
                           />
                         </div>
                       </div>
                     </div>
                   </motion.div>
                 )}
               </AnimatePresence>
            </section>
            
            {/* Format Options */}
            <section className={!previewUrl ? 'opacity-40 grayscale pointer-events-none transition-all' : 'transition-all mt-8'}>
               <h2 className="text-[15px] font-semibold tracking-tight mb-4">5. 画幅与画质</h2>
               <div className="flex bg-[#f5f5f7] p-1 rounded-xl mb-4">
                 {['1:1', '3:4', '9:16', '16:9'].map(ratio => (
                   <button
                     key={ratio}
                     onClick={(e) => { e.preventDefault(); setAspectRatio(ratio as any); }}
                     className={`flex-1 py-1.5 text-[13px] font-medium transition-all rounded-lg ${
                       aspectRatio === ratio 
                        ? 'bg-white shadow-sm text-gray-900 border border-black/[0.04]' 
                        : 'text-gray-500 hover:text-gray-800'
                     }`}
                   >
                     {ratio}
                   </button>
                 ))}
               </div>
               
               <div className="flex bg-[#f5f5f7] p-1 rounded-xl">
                 {['2K', '4K'].map(res => (
                   <button
                     key={res}
                     onClick={(e) => { e.preventDefault(); setResolution(res as '2K' | '4K'); }}
                     className={`flex-1 py-2 text-[13px] font-medium transition-all rounded-lg flex items-center justify-center gap-2 ${
                       resolution === res 
                        ? 'bg-white shadow-sm text-gray-900 border border-black/[0.04]' 
                        : 'text-gray-500 hover:text-gray-800'
                     }`}
                   >
                     {res}
                     {res === '4K' && <span className="bg-yellow-100 text-yellow-800 text-[10px] px-1.5 py-0.5 rounded-sm ml-1">Pro</span>}
                   </button>
                 ))}
               </div>
            </section>
          </div>
          
          <div className="p-6 md:p-8 mt-auto border-t border-black/[0.05]">
             <button
               onClick={handleGenerate}
               disabled={!file || isGenerating}
               className={`w-full py-4 text-[15px] font-medium flex items-center justify-center gap-2 transition-all rounded-xl
                 ${(!file || isGenerating) 
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                  : 'bg-[#0071e3] text-white hover:bg-[#0077ED] active:scale-[0.98]'}
               `}
             >
               {isGenerating ? (
                 <>
                   <Loader2 className="w-5 h-5 animate-spin" /> 正在生成图片...
                 </>
               ) : (
                 <>
                   <Sparkles className="w-5 h-5" /> 生成高质量图片（{totalGenerationCost} 积分）
                 </>
               )}
             </button>
          </div>
        </div>

        {/* Output Panel */}
        <div className="xl:col-span-8 flex flex-col items-center justify-center min-h-[700px] h-full bg-[#f5f5f7] border border-black/[0.05] rounded-[2rem] relative overflow-hidden xl:sticky xl:top-[100px]">
           
           <AnimatePresence mode="wait">
             {generatedImages.length > 0 ? (
                <motion.div 
                  key="result"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 overflow-y-auto w-full h-full p-6 sm:p-12 z-10"
                >
                   <div className="w-full max-w-2xl mx-auto flex flex-col gap-6 items-center">
                     {(isGenerating || errorMap) && (
                       <div className="sticky top-0 z-20 w-full">
                         <div className="mb-2 rounded-2xl border border-black/[0.06] bg-white/90 px-4 py-3 shadow-sm backdrop-blur-md">
                           <div className="flex items-center gap-3 text-sm text-gray-700">
                             {isGenerating ? <Loader2 className="h-4 w-4 animate-spin text-[#0071e3]" /> : <AlertCircle className="h-4 w-4 text-amber-500" />}
                             <p>
                               {isGenerating
                                 ? `已返回 ${generatedImages.length}/${GENERATED_IMAGE_COUNT} 张图片，剩余结果继续生成中...`
                                 : errorMap}
                             </p>
                           </div>
                         </div>
                       </div>
                     )}
                     {generatedImages.map((imgUrl, idx) => (
                       <div key={idx} className="relative group w-full flex items-center justify-center">
                          <img 
                            src={imgUrl} 
                            alt={`Generated scene ${idx + 1}`} 
                            className="max-h-[70vh] max-w-full object-contain cursor-zoom-in rounded-xl shadow-md border border-black/[0.05]" 
                            referrerPolicy="no-referrer"
                            onClick={() => {
                              setFullscreenImage(imgUrl);
                              setIsFullscreenZoom(true);
                            }}
                          />

                          {/* Tool Actions overlay */}
                          <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                             <button 
                                onClick={() => handleRegenerateSingle(idx)}
                                disabled={localGeneratingIdx === idx}
                                className="bg-white/90 backdrop-blur-md border border-black/[0.05] text-gray-800 p-2.5 hover:bg-white transition-all rounded-full shadow-sm disabled:opacity-50"
                                title="重新生成这一张"
                             >
                                <Wand2 className="w-5 h-5" />
                             </button>
                             <button 
                                onClick={() => setLocalEditingIdx(localEditingIdx === idx ? null : idx)}
                                className="bg-white/90 backdrop-blur-md border border-black/[0.05] text-gray-800 p-2.5 hover:bg-white transition-all rounded-full shadow-sm"
                                title="局部修改"
                             >
                                <PenTool className="w-5 h-5" />
                             </button>
                             <button 
                                onClick={() => {
                                  setFullscreenImage(imgUrl);
                                  setIsFullscreenZoom(true);
                                }}
                                className="bg-white/90 backdrop-blur-md border border-black/[0.05] text-gray-800 p-2.5 hover:bg-white transition-all rounded-full shadow-sm"
                             >
                                <ZoomIn className="w-5 h-5" />
                             </button>
                             <button 
                                onClick={() => handleDownload(imgUrl)}
                                className="bg-white/90 backdrop-blur-md border border-black/[0.05] text-gray-800 p-2.5 hover:bg-white transition-all rounded-full shadow-sm"
                             >
                                <Download className="w-5 h-5" />
                             </button>
                          </div>

                          {/* Editing Overlay */}
                          <AnimatePresence>
                            {localEditingIdx === idx && (
                              <motion.div 
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: 20, opacity: 0 }}
                                className="absolute bottom-6 inset-x-6 mx-auto max-w-sm"
                              >
                                <div className="bg-white/95 backdrop-blur-xl border border-black/[0.05] p-3 rounded-2xl shadow-xl flex items-center gap-2">
                                  <input 
                                    type="text"
                                    value={localEditPrompt}
                                    onChange={e => setLocalEditPrompt(e.target.value)}
                                    placeholder="输入修改要求 (例如：换成黑色背景)"
                                    onKeyDown={e => e.key === 'Enter' && handleLocalEdit(idx)}
                                    className="flex-1 bg-transparent border-none focus:outline-none text-sm px-2 text-gray-900 placeholder:text-gray-400"
                                  />
                                  <button 
                                    onClick={() => handleLocalEdit(idx)}
                                    disabled={localGeneratingIdx === idx || !localEditPrompt.trim()}
                                    className="bg-[#0071e3] text-white p-2 rounded-xl hover:bg-[#0077ED] disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
                                  >
                                    {localGeneratingIdx === idx ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                                  </button>
                                  <button 
                                    onClick={() => setLocalEditingIdx(null)}
                                    className="bg-gray-100 text-gray-600 p-2 rounded-xl hover:bg-gray-200 transition-colors"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                          
                          {localGeneratingIdx === idx && (
                            <div className="absolute inset-0 bg-white/50 backdrop-blur-sm rounded-xl flex items-center justify-center z-20">
                              <Loader2 className="w-8 h-8 animate-spin text-[#0071e3]" />
                            </div>
                          )}
                       </div>
                     ))}
                   </div>
                </motion.div>
             ) : isGenerating ? (
                <motion.div 
                  key="loading"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  className="absolute inset-0 flex flex-col items-center justify-center text-gray-900 z-10"
                >
                   <Loader2 className="w-10 h-10 animate-spin text-gray-400 mb-6" />
                   <h3 className="text-[17px] font-semibold tracking-tight text-gray-900 mb-2">正在处理图像...</h3>
                   <p className="text-[13px] text-gray-500">这可能需要几秒钟的时间</p>
                </motion.div>
             ) : errorMap ? (
                <motion.div 
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-8 text-center max-w-sm z-10"
                >
                   <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <AlertCircle className="w-6 h-6 text-red-500" />
                   </div>
                   <h3 className="text-[15px] font-semibold text-gray-900 mb-2">系统提示</h3>
                   <p className="text-[13px] text-gray-500 leading-relaxed">{errorMap}</p>
                </motion.div>
             ) : (
                <motion.div 
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center p-12 z-10 flex flex-col items-center"
                >
                   <ImageIcon className="w-12 h-12 text-gray-300 mb-4" strokeWidth={1} />
                   <h2 className="text-[17px] font-medium text-gray-900 mb-2">效果预览</h2>
                   <p className="text-gray-500 max-w-[260px] mx-auto text-[13px] leading-relaxed">
                     上传您的商品图并填写描述，在此处查看生成的家居空间
                   </p>
                </motion.div>
             )}
           </AnimatePresence>

           {/* History Bar */}
           {history.length > 0 && (
             <motion.div 
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               className="w-full mt-auto bg-white/70 backdrop-blur-xl border-t border-black/[0.05] p-4 flex items-center gap-4 z-20"
             >
               <div className="flex flex-col items-center justify-center shrink-0 min-w-[48px]">
                 <History className="w-5 h-5 text-gray-400 mb-1" />
                 <span className="text-[10px] tracking-widest text-gray-400 font-medium">历史</span>
               </div>
               <div className="w-[1px] h-10 bg-gray-200 shrink-0 mx-1"></div>
               <div className="flex items-center gap-3 overflow-x-auto pb-2 -mb-2 scrollbar-hide flex-1">
                 {history.map(item => (
                   <div 
                     key={item.id} 
                     className={`relative group shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${generatedImages.includes(item.url) ? 'border-[#0071e3] shadow-md scale-[1.02]' : 'border-transparent hover:border-black/[0.1]'}`}
                     onClick={() => setGeneratedImages([item.url])}
                   >
                     <img src={item.url} className={`w-full h-full object-cover transition-transform duration-500 ${generatedImages.includes(item.url) ? 'scale-110' : 'group-hover:scale-110'}`} />
                     {!generatedImages.includes(item.url) && (
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                          <ZoomIn className="w-5 h-5 text-white" />
                        </div>
                     )}
                   </div>
                 ))}
               </div>
               <div className="shrink-0 pl-2 border-l border-black/[0.05]">
                 <button 
                   onClick={() => {
                     if(window.confirm('确定要清空所有历史生成的图片吗？此操作不可恢复。')) {
                       saveHistory([])
                     }
                   }} 
                   className="w-10 h-10 ml-2 bg-[#f5f5f7] hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-full flex items-center justify-center transition-all" 
                   title="清空历史"
                 >
                   <Trash2 className="w-4 h-4" />
                 </button>
               </div>
             </motion.div>
           )}
        </div>
      </main>

      {/* Fullscreen Zoom Modal */}
      <AnimatePresence>
        {isFullscreenZoom && fullscreenImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-white/95 backdrop-blur-sm flex items-center justify-center p-4 sm:p-12 cursor-zoom-out"
            onClick={() => setIsFullscreenZoom(false)}
          >
            <button 
              onClick={(e) => { e.stopPropagation(); setIsFullscreenZoom(false); }}
              className="absolute top-6 right-6 p-3 bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors rounded-full"
            >
              <X className="w-5 h-5" />
            </button>
            <img 
              src={fullscreenImage} 
              alt="Generated scene fullscreen" 
              className="w-auto h-auto max-w-full max-h-full object-contain cursor-default rounded-lg shadow-xl" 
              referrerPolicy="no-referrer"
              onClick={(e) => e.stopPropagation()}
            />
            <button 
              onClick={(e) => { e.stopPropagation(); handleDownload(fullscreenImage); }}
              className="absolute bottom-8 right-8 bg-[#0071e3] text-white px-6 py-3.5 text-[15px] font-medium hover:bg-[#0077ED] transition-colors flex items-center gap-2 rounded-full shadow-md"
            >
              <Download className="w-5 h-5" /> 保存图片
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

