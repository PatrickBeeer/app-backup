/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  Settings, 
  Image as ImageIcon, 
  Download, 
  Maximize2, 
  RefreshCw, 
  Sparkles,
  ChevronRight,
  Plus,
  Trash2,
  Check,
  Loader2,
  Zap,
  Send,
  Camera,
  Users,
  Package,
  LayoutGrid,
  Heart,
  Video,
  ChevronLeft,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';
import { 
  generateKocotreeVisuals, 
  GenerationParams, 
  GeneratedImage, 
  detectModelInImage,
  detectModelCount
} from './services/geminiService';
import Markdown from 'react-markdown';
import { AppProps } from '../../../types';

const InpaintingCanvas = ({ image, onMaskChange }: { image: string, onMaskChange: (mask: string) => void }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const img = new Image();
    img.src = image;
    img.onload = () => {
      const container = containerRef.current;
      if (!container) return;
      
      const containerWidth = container.clientWidth;
      const scale = containerWidth / img.width;
      const height = img.height * scale;
      
      canvas.width = containerWidth;
      canvas.height = height;
      
      context.lineJoin = 'round';
      context.lineCap = 'round';
      context.lineWidth = 20;
      context.strokeStyle = 'rgba(255, 0, 0, 0.5)';
      setCtx(context);
    };
  }, [image]);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    if (ctx && canvasRef.current) {
      // Create a black and white mask
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = canvasRef.current.width;
      maskCanvas.height = canvasRef.current.height;
      const maskCtx = maskCanvas.getContext('2d');
      if (maskCtx) {
        maskCtx.fillStyle = 'black';
        maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
        maskCtx.drawImage(canvasRef.current, 0, 0);
        // Convert red to white
        const imageData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
        for (let i = 0; i < imageData.data.length; i += 4) {
          if (imageData.data[i] > 0) { // If red channel > 0
            imageData.data[i] = 255;
            imageData.data[i+1] = 255;
            imageData.data[i+2] = 255;
          } else {
            imageData.data[i] = 0;
            imageData.data[i+1] = 0;
            imageData.data[i+2] = 0;
          }
          imageData.data[i+3] = 255;
        }
        maskCtx.putImageData(imageData, 0, 0);
        onMaskChange(maskCanvas.toDataURL('image/png'));
      }
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !ctx || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const clearMask = () => {
    if (ctx && canvasRef.current) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      onMaskChange("");
    }
  };

  return (
    <div ref={containerRef} className="relative w-full rounded-2xl overflow-hidden border border-white/40 shadow-sm bg-black/5">
      <img src={image} alt="Scene" className="w-full block" referrerPolicy="no-referrer" />
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        className="absolute inset-0 cursor-crosshair touch-none"
      />
      <button 
        onClick={clearMask}
        className="absolute bottom-2 right-2 px-3 py-1 bg-black/80 text-white text-[10px] font-bold rounded-full hover:bg-black transition-all"
      >
        重置涂抹
      </button>
      <div className="absolute top-2 left-2 px-3 py-1 bg-black/60 text-white text-[10px] font-bold rounded-full pointer-events-none">
        涂抹模特融合区域
      </div>
    </div>
  );
};

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

const SCENE_PRESETS = [
  { id: 'grassland', name: '绿意草地', icon: '🌱' },
  { id: 'snow', name: '极地雪原', icon: '❄️' },
  { id: 'rooftop', name: '城市天台', icon: '🏙️' },
  { id: 'beach', name: '阳光沙滩', icon: '🏖️' },
];

const AGE_RANGES = [
  { id: '1-3', name: '1-3 岁', description: '婴童/可爱' },
  { id: '3-5', name: '3-5 岁', description: '幼童/灵动' },
  { id: '6-8', name: '6-8 岁', description: '小童/活泼' },
  { id: '9-12', name: '9-12 岁', description: '中大童/表现力' }
] as const;

const ASPECT_RATIOS = ["1:1", "3:4", "9:16", "16:9"] as const;
const RESOLUTIONS = ["1K", "2K", "4K", "720p", "1080p"] as const;
const CAMERA_ANGLES = [
  { id: 'eye', name: '平视视角', description: '亲和交互，强调真实感。' },
  { id: 'side', name: '侧拍视角', description: '展现侧面轮廓与动感' },
  { id: 'low', name: '活力仰拍', description: '增加视觉冲击力。' },
  { id: 'dutch', name: '动感斜拍', description: '利用对角线构图增加运动感。适合表现极限运动和动感抓拍' },
  { id: 'high', name: '俯拍视角', description: '灵动可爱感' },
  { id: 'back', name: '背面视角', description: '展现背部设计与意境' }
] as const;

const MODEL_ACTIONS = [
  { id: 'natural', name: '自然律动', description: '奔跑抓拍、旋转、发丝飞扬、行走的瞬间、裙摆摇动' },
  { id: 'explore', name: '探索交互', description: '依靠建筑/树木、手抚花草、利用光影遮挡、借用道具' },
  { id: 'lifestyle', name: '生活化/日常', description: '整理衣角、喝水、遮阳遮光、自然的松弛感' },
  { id: 'story', name: '情绪故事感', description: '呆萌好奇、专注思考、不经意的回眸、惊讶张嘴、委屈撇嘴' }
] as const;

const MODEL_EXPRESSIONS = [
  { id: 'default', name: '默认表情', description: '自然抓拍、随机表情' },
  { id: 'peek', name: '躲猫猫式萌动', description: '手部遮脸、灵趣互动、捕捉眼神' },
  { id: 'sky', name: '纯真仰头大笑', description: '后仰大笑、舒展肢体、释放阳光感' },
  { id: 'aha', name: '好奇发现瞬间', description: '专注低头、惊讶微嘴、剧情化探索' },
  { id: 'sweet', name: '甜美温婉微笑', description: '柔和眼神、亲切笑容、高治愈力' }
] as const;

const COMPOSITION_PRESETS = [
  { id: 'full', name: '全景', description: '展现完整场景与模特全身' },
  { id: 'medium', name: '中景', description: '展现模特膝盖以上，强调动作' },
  { id: 'close', name: '近景', description: '展现模特胸部以上，强调表情' },
] as const;

const SKU_ANGLES = ["正面", "侧面", "背面"] as const;

const NAV_ITEMS = [
  { id: 'real-shot', name: '实景拍摄', icon: Camera },
  { id: 'model-transfer', name: '模特迁移', icon: Users },
  { id: 'sku-shot', name: 'SKU实拍', icon: Package },
  { id: 'main-image', name: '主图生成', icon: LayoutGrid },
  { id: 'xiaohongshu', name: '小红书种草', icon: Heart },
  { id: 'resize', name: '尺寸修改', icon: Maximize2 },
] as const;

const APP_ID = 's_kk-tree';

function resolveGeneratePlan(mode: string): { actionType: string; count: number } {
  switch (mode) {
    case 'model-transfer':
      return { actionType: 'GENERATE_MODEL_TRANSFER', count: 1 };
    case 'sku-shot':
      return { actionType: 'GENERATE_SKU_SHOT', count: 2 };
    case 'main-image':
      return { actionType: 'GENERATE_MAIN_IMAGE', count: 4 };
    case 'xiaohongshu':
      return { actionType: 'GENERATE_XIAOHONGSHU', count: 3 };
    case 'resize':
      return { actionType: 'GENERATE_RESIZE', count: 1 };
    default:
      return { actionType: 'GENERATE_IMAGE', count: 2 };
  }
}

function resolveUnitCost(costs: AppProps['costs'], actionType: string): number {
  const raw = costs?.[actionType] ?? costs?.GENERATE_IMAGE ?? 10;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}

export default function App({ platform, costs }: AppProps) {
  const [activeNav, setActiveNav] = useState<string>('real-shot');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isInpainting, setIsInpainting] = useState(false);
  const [productImages, setProductImages] = useState<string[]>([]);
  const [mainImageModelImages, setMainImageModelImages] = useState<string[]>([]);
  const [mainImageModelCounts, setMainImageModelCounts] = useState<number[]>([1, 1, 1, 1]);
  const [mainImageCameraAngles, setMainImageCameraAngles] = useState<string[]>([CAMERA_ANGLES[0].name, CAMERA_ANGLES[0].name, CAMERA_ANGLES[0].name, CAMERA_ANGLES[0].name]);
  const [mainImageModelActions, setMainImageModelActions] = useState<string[]>([MODEL_ACTIONS[0].name, MODEL_ACTIONS[0].name, MODEL_ACTIONS[0].name, MODEL_ACTIONS[0].name]);
  const [propImages, setPropImages] = useState<string[]>([]);
  const [modelTransferModelImages, setModelTransferModelImages] = useState<string[]>([]);
  const [modelTransferSceneImages, setModelTransferSceneImages] = useState<string[]>([]);
  const [aspectRatio, setAspectRatio] = useState<typeof ASPECT_RATIOS[number]>("3:4");
  const [resolution, setResolution] = useState<typeof RESOLUTIONS[number]>("1K");
  const [ageRange, setAgeRange] = useState<typeof AGE_RANGES[number]['name']>(AGE_RANGES[1].name);
  const [modelCount, setModelCount] = useState<number>(1);
  const [scene, setScene] = useState(SCENE_PRESETS[0].name);
  const [cameraAngle, setCameraAngle] = useState<typeof CAMERA_ANGLES[number]['name']>(CAMERA_ANGLES[0].name);
  const [modelAction, setModelAction] = useState<typeof MODEL_ACTIONS[number]['name']>(MODEL_ACTIONS[0].name);
  const [modelExpression, setModelExpression] = useState<typeof MODEL_EXPRESSIONS[number]['name']>(MODEL_EXPRESSIONS[0].name);
  const [composition, setComposition] = useState<typeof COMPOSITION_PRESETS[number]['name']>(COMPOSITION_PRESETS[1].name);
  const [interactionEnhanced, setInteractionEnhanced] = useState(true);
  const [globalPrompt, setGlobalPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingMore, setIsGeneratingMore] = useState<string | null>(null);
  const [isRefining, setIsRefining] = useState<string | null>(null);
  const [refinementInputs, setRefinementInputs] = useState<Record<string, string>>({});
  const [isModelAssetsCollapsed, setIsModelAssetsCollapsed] = useState(false);
  const [skuModelImage, setSkuModelImage] = useState<string | null>(null);
  const [skuAngle, setSkuAngle] = useState<typeof SKU_ANGLES[number]>("正面");
  const [targetColors, setTargetColors] = useState<string>("粉色, 蓝色, 绿色");
  const [xiaohongshuTopic, setXiaohongshuTopic] = useState<string>("春季童装穿搭灵感");
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentSeed, setCurrentSeed] = useState<number>(Math.floor(Math.random() * 1000000));
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);
  const [sceneHasModel, setSceneHasModel] = useState(false);
  const [maskImage, setMaskImage] = useState("");
  const [isDetectingModel, setIsDetectingModel] = useState(false);

  const currentGeneratePlan = resolveGeneratePlan(activeNav);
  const currentUnitCost = resolveUnitCost(costs, currentGeneratePlan.actionType);
  const currentGenerateCost = currentUnitCost * currentGeneratePlan.count;
  const variationUnitCost = resolveUnitCost(costs, 'GENERATE_VARIATION');
  const variationTotalCost = variationUnitCost * 4;
  
  useEffect(() => {
    void platform.refreshCredits();
  }, [platform]);

  useEffect(() => {
    const checkApiKey = async () => {
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      }
    };
    checkApiKey();
  }, []);

  useEffect(() => {
    setResults([]);
    setError(null);
    setMaskImage("");
  }, [activeNav]);

  // Reset dimensions when switching mode
  useEffect(() => {
    if (activeNav === 'resize') {
      setAspectRatio("3:4");
      setResolution("1K");
    }
  }, [activeNav]);

  const handleSelectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mainImageModelInputRef = useRef<HTMLInputElement>(null);
  const propInputRef = useRef<HTMLInputElement>(null);
  const modelTransferModelInputRef = useRef<HTMLInputElement>(null);
  const modelTransferSceneInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeNav === 'main-image' && mainImageModelImages.length > 0) {
      const detect = async () => {
        try {
          const count = await detectModelCount(mainImageModelImages);
          setMainImageModelCounts([count, count, count, count]);
        } catch (err) {
          console.error("Model count detection error:", err);
        }
      };
      detect();
    }
  }, [mainImageModelImages, activeNav]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const filesArray = Array.from(files) as File[];
      filesArray.forEach((file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setProductImages(prev => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeProductImage = (index: number) => {
    setProductImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleMainImageModelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach((file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setMainImageModelImages(prev => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeMainImageModelImage = (index: number) => {
    setMainImageModelImages(prev => prev.filter((_, i) => i !== index));
  };

  const handlePropUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach((file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPropImages(prev => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removePropImage = (index: number) => {
    setPropImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleModelTransferModelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      const file = files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        setModelTransferModelImages([reader.result as string]);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSkuModelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSkuModelImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleModelTransferSceneUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      const file = files[0];
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        setModelTransferSceneImages([base64]);
        setMaskImage("");
        setIsDetectingModel(true);
        try {
          const hasModel = await detectModelInImage(base64);
          setSceneHasModel(hasModel);
        } catch (err) {
          console.error("Detection error:", err);
        } finally {
          setIsDetectingModel(false);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (activeNav === 'model-transfer') {
      if (modelTransferModelImages.length === 0 || modelTransferSceneImages.length === 0) {
        setError("模特迁移模式下，模特图和场景图均为必传项");
        return;
      }
    } else if (activeNav === 'sku-shot') {
      if (!skuModelImage) {
        setError("SKU实拍模式下，模特图为必传项");
        return;
      }
      if (productImages.length === 0) {
        setError("SKU实拍模式下，请至少上传一张产品颜色图");
        return;
      }
    } else if (productImages.length === 0) {
      setError("请至少上传一张产品图");
      return;
    }

    const plan = resolveGeneratePlan(activeNav);
    const unitCost = resolveUnitCost(costs, plan.actionType);
    const estimatedCost = unitCost * plan.count;
    if (!platform.checkBalance(estimatedCost)) {
      platform.showRecharge();
      return;
    }

    setIsGenerating(true);
    setError(null);
    setResults([]); // Clear previous results
    const newSeed = Math.floor(Math.random() * 1000000);
    setCurrentSeed(newSeed);
    try {
      if (!hasApiKey && window.aistudio) {
        await handleSelectKey();
      }

      const params: GenerationParams = {
        aspectRatio,
        resolution,
        scene: activeNav === 'model-transfer' ? '自定义场景' : scene,
        cameraAngle: activeNav === 'sku-shot' ? "近景" : cameraAngle,
        ageRange,
        modelCount,
        modelAction,
        modelExpression,
        composition,
        interactionEnhanced,
        globalPrompt,
        productImages: activeNav === 'model-transfer' ? modelTransferModelImages : productImages,
        mainImageModelImages: activeNav === 'main-image' ? mainImageModelImages : undefined,
        mainImageModelCounts: activeNav === 'main-image' ? mainImageModelCounts : undefined,
        mainImageCameraAngles: activeNav === 'main-image' ? mainImageCameraAngles : undefined,
        mainImageModelActions: activeNav === 'main-image' ? mainImageModelActions : undefined,
        propImages: activeNav === 'model-transfer' ? modelTransferSceneImages : propImages,
        skuModelImage: skuModelImage || undefined,
        skuAngle,
        targetColors: targetColors.split(",").map(c => c.trim()).filter(c => c !== ""),
        xiaohongshuTopic,
        maskImage: (activeNav === 'model-transfer' || activeNav === 'main-image') ? maskImage : undefined,
        seed: newSeed,
        mode: activeNav as any
      };

      const visuals = await generateKocotreeVisuals(params, plan.count, {
        onImage: (image) => {
          setResults(prev => [...prev, image]);
        }
      });
      const actualCost = unitCost * visuals.length;
      if (actualCost > 0) {
        await platform.refreshCredits();
      }
    } catch (err: any) {
      console.error("Generation error:", err);
      const errorMessage = err.message || "Generation failed. Please try again.";
      setError(errorMessage);
      
      if (errorMessage.includes("Requested entity was not found") && window.aistudio) {
        setHasApiKey(false);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateMore = async (baseImage: GeneratedImage) => {
    const actionType = 'GENERATE_VARIATION';
    const unitCost = resolveUnitCost(costs, actionType);
    const estimatedCost = unitCost * 4;
    if (!platform.checkBalance(estimatedCost)) {
      platform.showRecharge();
      return;
    }

    setIsGeneratingMore(baseImage.id);
    setError(null);
    try {
      if (!hasApiKey && window.aistudio) {
        await handleSelectKey();
      }

      const params: GenerationParams = {
        ...baseImage.params,
        referenceImage: baseImage.url,
        isVariation: true,
        seed: Math.floor(Math.random() * 1000000)
      };
      const moreVisuals = await generateKocotreeVisuals(params, 4, {
        onImage: (image) => {
          setResults(prev => [...prev, image]);
        }
      });
      const actualCost = unitCost * moreVisuals.length;
      if (actualCost > 0) {
        await platform.refreshCredits();
      }
    } catch (err: any) {
      console.error("Generate more error:", err);
      const errorMessage = err.message || "Failed to generate more variations.";
      setError(errorMessage);
      
      if (errorMessage.includes("Requested entity was not found") && window.aistudio) {
        setHasApiKey(false);
      }
    } finally {
      setIsGeneratingMore(null);
    }
  };

  const handleRefine = async (baseImage: GeneratedImage) => {
    const refinementText = refinementInputs[baseImage.id] || "Refine the masked area based on the scene and style.";

    const actionType = 'REFINE_IMAGE';
    const unitCost = resolveUnitCost(costs, actionType);
    if (!platform.checkBalance(unitCost)) {
      platform.showRecharge();
      return;
    }
    
    setIsRefining(baseImage.id);
    setError(null);
    try {
      if (!hasApiKey && window.aistudio) {
        await handleSelectKey();
      }

      const params: GenerationParams = {
        ...baseImage.params,
        globalPrompt: refinementText,
        composition: baseImage.params.composition || COMPOSITION_PRESETS[1].name,
        maskImage: maskImage,
        referenceImage: baseImage.url,
        isRefinement: true,
        seed: Math.floor(Math.random() * 1000000)
      };
      const refinedVisuals = await generateKocotreeVisuals(params, 1, {
        onImage: (image) => {
          setResults(prev => [...prev, image]);
        }
      });
      if (refinedVisuals.length > 0) {
        await platform.refreshCredits();
      }
      setRefinementInputs(prev => ({ ...prev, [baseImage.id]: "" }));
      setMaskImage(""); // Clear mask after use
    } catch (err: any) {
      console.error("Refine error:", err);
      const errorMessage = err.message || "指令微调失败，请重试";
      setError(errorMessage);
      
      if (errorMessage.includes("Requested entity was not found") && window.aistudio) {
        setHasApiKey(false);
      }
    } finally {
      setIsRefining(null);
    }
  };

  const downloadAll = async () => {
    const zip = new JSZip();
    results.forEach((img, index) => {
      const base64Data = img.url.split(',')[1];
      zip.file(`kocotree-${img.type}-${index}.png`, base64Data, { base64: true });
    });
    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = "kocotree-studio-pro-export.zip";
    link.click();
  };

  const downloadSingle = (url: string, name: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.png`;
    link.click();
  };

  return (
    <div className="flex min-h-screen items-start bg-[#f0f2f5] p-6 gap-6 font-sans">
      {/* Global Navigation Sidebar */}
      <nav className={`${isSidebarCollapsed ? 'w-24' : 'w-72'} bg-white/60 backdrop-blur-2xl rounded-[2.5rem] border border-white/40 shadow-2xl flex flex-col p-8 transition-all duration-500 ease-in-out`}>
        <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} mb-12 px-2`}>
          {!isSidebarCollapsed && <h2 className="text-2xl font-bold tracking-tight text-black">AI STUDIO</h2>}
          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="text-gray-400 hover:text-black transition-colors p-1 hover:bg-white/40 rounded-lg"
          >
            {isSidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>

        <div className="flex-1 flex flex-col gap-2">
          {NAV_ITEMS.map((item) => {
            const isActive = activeNav === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id)}
                className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-4'} px-4 py-4 rounded-2xl transition-all duration-300 group ${
                  isActive 
                    ? 'bg-black text-white shadow-lg shadow-black/10' 
                    : 'text-gray-500 hover:bg-white/40 hover:text-black'
                }`}
                title={isSidebarCollapsed ? item.name : ""}
              >
                <Icon size={20} strokeWidth={isActive ? 2.5 : 1.5} className="transition-transform group-hover:scale-110 shrink-0" />
                {!isSidebarCollapsed && (
                  <span className={`text-sm font-bold tracking-wide ${isActive ? 'opacity-100' : 'opacity-70'}`}>
                    {item.name}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {!isSidebarCollapsed && (
          <div className="mt-auto pt-8">
            <div className="bg-gray-100/50 rounded-2xl p-6 border border-white/40">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-1">当前版本</p>
              <p className="text-sm font-bold text-black">v2.4.0 Pro</p>
            </div>
          </div>
        )}
      </nav>

      {/* Configuration Sidebar */}
      <aside className="w-96 bg-white/60 backdrop-blur-2xl rounded-[2.5rem] border border-white/40 shadow-2xl p-8 flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center text-white shadow-lg">
              <Zap size={24} fill="currentColor" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-black">Kocotree</h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mt-1">Studio Pro</p>
            </div>
          </div>
          {!hasApiKey && (
            <button 
              onClick={handleSelectKey}
              className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold hover:bg-amber-200 transition-colors"
            >
              <Zap size={12} />
              配置 Key
            </button>
          )}
        </div>

        {activeNav === 'model-transfer' ? (
          <>
            {/* Model Transfer Uploads */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">模特资产 ({modelTransferModelImages.length}/1) <span className="text-red-500">*</span></label>
                <button 
                  onClick={() => setIsModelAssetsCollapsed(!isModelAssetsCollapsed)}
                  className="text-gray-400 hover:text-black transition-colors"
                >
                  {isModelAssetsCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
              
              {!isModelAssetsCollapsed && (
                <div className="space-y-3">
                  {modelTransferModelImages.map((img, idx) => (
                    <div key={idx} className="group relative aspect-square rounded-2xl overflow-hidden border border-white/40 shadow-sm bg-white/40">
                      <img src={img} alt={`Model ${idx}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      <button 
                        onClick={() => setModelTransferModelImages([])}
                        className="absolute top-2 right-2 w-7 h-7 bg-black/80 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {modelTransferModelImages.length === 0 && (
                    <button 
                      onClick={() => modelTransferModelInputRef.current?.click()}
                      className="w-full aspect-square rounded-2xl border-2 border-dashed border-white/60 hover:border-black transition-all flex flex-col items-center justify-center gap-2 bg-white/30 text-gray-400 hover:text-black hover:bg-white/50"
                    >
                      <Plus size={24} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">上传模特图 (限1张)</span>
                    </button>
                  )}
                </div>
              )}
              <input 
                type="file" 
                ref={modelTransferModelInputRef} 
                onChange={handleModelTransferModelUpload} 
                className="hidden" 
                accept="image/*"
              />
            </section>

            <section className="space-y-4">
              <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">场景资产 ({modelTransferSceneImages.length}/1) <span className="text-red-500">*</span></label>
              <div className="space-y-3">
                {modelTransferSceneImages.map((img, idx) => (
                  <div key={idx} className="space-y-3">
                    {sceneHasModel ? (
                      <InpaintingCanvas image={img} onMaskChange={setMaskImage} />
                    ) : (
                      <div className="group relative aspect-square rounded-2xl overflow-hidden border border-white/40 shadow-sm bg-white/40">
                        <img src={img} alt={`Scene ${idx}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                    )}
                    <button 
                      onClick={() => {
                        setModelTransferSceneImages([]);
                        setSceneHasModel(false);
                        setMaskImage("");
                      }}
                      className="w-full py-2 bg-white/40 hover:bg-red-50 text-gray-500 hover:text-red-500 rounded-xl text-[10px] font-bold transition-all border border-white/40"
                    >
                      移除并重新上传
                    </button>
                  </div>
                ))}
                {modelTransferSceneImages.length === 0 && (
                  <button 
                    onClick={() => modelTransferSceneInputRef.current?.click()}
                    disabled={isDetectingModel}
                    className="w-full aspect-video rounded-2xl border-2 border-dashed border-white/60 hover:border-black transition-all flex flex-col items-center justify-center gap-2 bg-white/30 text-gray-400 hover:text-black hover:bg-white/50 disabled:opacity-50"
                  >
                    {isDetectingModel ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <>
                        <Plus size={24} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">上传场景图 (限1张)</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <input 
                type="file" 
                ref={modelTransferSceneInputRef} 
                onChange={handleModelTransferSceneUpload} 
                className="hidden" 
                accept="image/*"
              />
            </section>
          </>
        ) : activeNav === 'sku-shot' ? (
          <>
            {/* SKU Model Upload */}
            <section className="space-y-4">
              <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">模特图 (SKU) <span className="text-red-500">*</span></label>
              <div className="space-y-3">
                {skuModelImage ? (
                  <div className="group relative aspect-[3/4] rounded-2xl overflow-hidden border border-white/40 shadow-sm bg-white/40">
                    <img src={skuModelImage} alt="SKU Model" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    <button 
                      onClick={() => setSkuModelImage(null)}
                      className="absolute top-2 right-2 w-7 h-7 bg-black/80 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = (e) => handleSkuModelUpload(e as any);
                      input.click();
                    }}
                    className="w-full aspect-[3/4] rounded-2xl border-2 border-dashed border-white/60 hover:border-black transition-all flex flex-col items-center justify-center gap-2 bg-white/30 text-gray-400 hover:text-black hover:bg-white/50"
                  >
                    <Plus size={24} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">上传模特图</span>
                  </button>
                )}
              </div>
            </section>

            <section className="space-y-4">
              <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">产品颜色图 ({productImages.length}) <span className="text-red-500">*</span></label>
              <div className="grid grid-cols-2 gap-3">
                {productImages.map((img, idx) => (
                  <div key={idx} className="group relative aspect-square rounded-2xl overflow-hidden border border-white/40 shadow-sm bg-white/40">
                    <img src={img} alt={`SKU Color ${idx}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    <button 
                      onClick={() => removeProductImage(idx)}
                      className="absolute top-2 right-2 w-7 h-7 bg-black/80 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-2xl border-2 border-dashed border-white/60 hover:border-black transition-all flex flex-col items-center justify-center gap-2 bg-white/30 text-gray-400 hover:text-black hover:bg-white/50"
                >
                  <Plus size={24} />
                  <span className="text-[10px] font-bold uppercase tracking-wider">添加颜色</span>
                </button>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
                accept="image/*"
                multiple
              />
            </section>

            <section className="space-y-4">
              <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">拍摄视角</label>
              <div className="flex gap-2">
                {SKU_ANGLES.map((angle) => (
                  <button
                    key={angle}
                    onClick={() => setSkuAngle(angle)}
                    className={`flex-1 py-2 rounded-xl text-[10px] font-bold transition-all border ${
                      skuAngle === angle 
                        ? 'bg-black text-white border-black' 
                        : 'bg-white/40 text-gray-500 border-white/40 hover:border-black/20'
                    }`}
                  >
                    {angle}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-4">
              <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">模特动作 (ACTION)</label>
              <div className="grid grid-cols-2 gap-2">
                {MODEL_ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    onClick={() => setModelAction(action.name)}
                    className={`p-3 rounded-2xl text-left transition-all border ${
                      modelAction === action.name 
                        ? 'bg-white border-black shadow-lg ring-1 ring-black' 
                        : 'bg-white/40 border-white/40 hover:border-black/20'
                    }`}
                  >
                    <p className={`text-[10px] font-bold ${modelAction === action.name ? 'text-black' : 'text-gray-600'}`}>{action.name}</p>
                    <p className="text-[8px] text-gray-400 mt-1 line-clamp-2 leading-relaxed">{action.description}</p>
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-4">
              <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">模特表情 (EXPRESSION)</label>
              <div className="grid grid-cols-2 gap-2">
                {MODEL_EXPRESSIONS.map((expr) => (
                  <button
                    key={expr.id}
                    onClick={() => setModelExpression(expr.name)}
                    className={`p-3 rounded-2xl text-left transition-all border ${
                      modelExpression === expr.name 
                        ? 'bg-white border-black shadow-lg ring-1 ring-black' 
                        : 'bg-white/40 border-white/40 hover:border-black/20'
                    }`}
                  >
                    <p className={`text-[10px] font-bold ${modelExpression === expr.name ? 'text-black' : 'text-gray-600'}`}>{expr.name}</p>
                    <p className="text-[8px] text-gray-400 mt-1 line-clamp-2 leading-relaxed">{expr.description}</p>
                  </button>
                ))}
              </div>
            </section>
          </>
        ) : (
          <>
            {/* Product Upload */}
            <section className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">
                  {activeNav === 'main-image' ? '上传产品图的三视图' : 
                   activeNav === 'resize' ? '上传待修改图片' : '产品资产'} ({productImages.length})
                </label>
                {activeNav === 'main-image' && (
                  <p className="text-[8px] text-gray-400 font-medium">可以上传多张产品三视图</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {productImages.map((img, idx) => (
                  <div key={idx} className="group relative aspect-square rounded-2xl overflow-hidden border border-white/40 shadow-sm bg-white/40">
                    <img src={img} alt={`Product ${idx}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    <button 
                      onClick={() => removeProductImage(idx)}
                      className="absolute top-2 right-2 w-7 h-7 bg-black/80 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-2xl border-2 border-dashed border-white/60 hover:border-black transition-all flex flex-col items-center justify-center gap-2 bg-white/30 text-gray-400 hover:text-black hover:bg-white/50"
                >
                  <Plus size={24} />
                  <span className="text-[10px] font-bold uppercase tracking-wider">添加资产</span>
                </button>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
                accept="image/*"
                multiple
              />
            </section>

            {activeNav === 'main-image' && (
              <section className="space-y-4">
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">
                  上传模特图 ({mainImageModelImages.length})
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {mainImageModelImages.map((img, idx) => (
                    <div key={idx} className="group relative aspect-square rounded-2xl overflow-hidden border border-white/40 shadow-sm bg-white/40">
                      <img src={img} alt={`Model ${idx}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      <button 
                        onClick={() => removeMainImageModelImage(idx)}
                        className="absolute top-2 right-2 w-7 h-7 bg-black/80 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button 
                    onClick={() => mainImageModelInputRef.current?.click()}
                    className="aspect-square rounded-2xl border-2 border-dashed border-white/60 hover:border-black transition-all flex flex-col items-center justify-center gap-2 bg-white/30 text-gray-400 hover:text-black hover:bg-white/50"
                  >
                    <Plus size={24} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">添加模特</span>
                  </button>
                </div>
                <input 
                  type="file" 
                  ref={mainImageModelInputRef} 
                  onChange={handleMainImageModelUpload} 
                  className="hidden" 
                  accept="image/*"
                  multiple
                />
              </section>
            )}

            {activeNav !== 'main-image' && activeNav !== 'xiaohongshu' && activeNav !== 'resize' && (
              <section className="space-y-4">
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">道具资产 ({propImages.length})</label>
                <div className="grid grid-cols-2 gap-3">
                  {propImages.map((img, idx) => (
                    <div key={idx} className="group relative aspect-square rounded-2xl overflow-hidden border border-white/40 shadow-sm bg-white/40">
                      <img src={img} alt={`Prop ${idx}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      <button 
                        onClick={() => removePropImage(idx)}
                        className="absolute top-2 right-2 w-7 h-7 bg-black/80 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button 
                    onClick={() => propInputRef.current?.click()}
                    className="aspect-square rounded-2xl border-2 border-dashed border-white/60 hover:border-black transition-all flex flex-col items-center justify-center gap-2 bg-white/30 text-gray-400 hover:text-black hover:bg-white/50"
                  >
                    <Plus size={24} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">添加道具</span>
                  </button>
                </div>
                <input 
                  type="file" 
                  ref={propInputRef} 
                  onChange={handlePropUpload} 
                  className="hidden" 
                  accept="image/*"
                  multiple
                />
              </section>
            )}

            {/* Xiaohongshu Topic */}
            {/* Xiaohongshu Topic Removed */}
          </>
        )}

        {/* Configuration */}
        <section className="space-y-8">
          {activeNav === 'resize' ? null : (
            <>
              {!['model-transfer', 'sku-shot'].includes(activeNav) && (
                <div className="space-y-4">
                  <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">模特配置</label>
                  <div className="grid grid-cols-2 gap-3">
                    {activeNav !== 'main-image' && (
                      <div className="space-y-2">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">年龄区间</span>
                        <select 
                          value={ageRange}
                          onChange={(e) => setAgeRange(e.target.value as any)}
                          className="w-full bg-white/40 backdrop-blur-md border border-white/40 rounded-2xl p-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-black/5"
                        >
                          {AGE_RANGES.map(range => <option key={range.id} value={range.name}>{range.name} ({range.description})</option>)}
                        </select>
                      </div>
                    )}
                    {activeNav !== 'main-image' && (
                      <div className="space-y-2">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">模特数量</span>
                        <select 
                          value={modelCount}
                          onChange={(e) => setModelCount(parseInt(e.target.value))}
                          className="w-full bg-white/40 backdrop-blur-md border border-white/40 rounded-2xl p-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-black/5"
                        >
                          <option value={1}>1 人</option>
                          <option value={2}>2 人 (一男一女)</option>
                          <option value={3}>3 人 (两男一女)</option>
                        </select>
                      </div>
                    )}
                    {(modelCount > 1 || activeNav === 'main-image') && (
                      <div className="col-span-2 space-y-2">
                        <div className="flex items-center justify-between bg-white/40 backdrop-blur-md border border-white/40 rounded-2xl p-3">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-black uppercase tracking-wider">互动增强</span>
                            <span className="text-[8px] text-gray-400 font-medium">多人模特时启用亲密互动抓拍</span>
                          </div>
                          <button 
                            onClick={() => setInteractionEnhanced(!interactionEnhanced)}
                            className={`w-12 h-6 rounded-full transition-all relative ${interactionEnhanced ? 'bg-black' : 'bg-gray-300'}`}
                          >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${interactionEnhanced ? 'right-1' : 'left-1'}`} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeNav === 'main-image' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                  <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">方案详细配置</label>
                  <div className="space-y-6">
                    {[1, 2, 3, 4].map((num) => (
                      <div key={num} className="p-4 rounded-2xl bg-white/30 border border-white/40 space-y-4">
                        <div className="flex items-center justify-between border-b border-black/5 pb-2">
                          <span className="text-[11px] font-bold text-black uppercase tracking-wider">方案 {num}</span>
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                          <div className="space-y-2">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">模特数量</span>
                            <select 
                              value={mainImageModelCounts[num-1]}
                              onChange={(e) => {
                                const newCounts = [...mainImageModelCounts];
                                newCounts[num-1] = parseInt(e.target.value);
                                setMainImageModelCounts(newCounts);
                              }}
                              className="w-full bg-white/40 backdrop-blur-md border border-white/40 rounded-2xl p-2.5 text-[11px] font-medium focus:outline-none"
                            >
                              <option value={1}>1 人</option>
                              <option value={2}>2 人</option>
                              <option value={3}>3 人</option>
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">构图视角</span>
                              <select 
                                value={mainImageCameraAngles[num-1]}
                                onChange={(e) => {
                                  const newAngles = [...mainImageCameraAngles];
                                  newAngles[num-1] = e.target.value;
                                  setMainImageCameraAngles(newAngles);
                                }}
                                className="w-full bg-white/40 backdrop-blur-md border border-white/40 rounded-2xl p-2.5 text-[11px] font-medium focus:outline-none"
                              >
                                {CAMERA_ANGLES.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                              </select>
                            </div>
                            <div className="space-y-2">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">模特动作</span>
                              <select 
                                value={mainImageModelActions[num-1]}
                                onChange={(e) => {
                                  const newActions = [...mainImageModelActions];
                                  newActions[num-1] = e.target.value;
                                  setMainImageModelActions(newActions);
                                }}
                                className="w-full bg-white/40 backdrop-blur-md border border-white/40 rounded-2xl p-2.5 text-[11px] font-medium focus:outline-none"
                              >
                                {MODEL_ACTIONS.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!['sku-shot', 'main-image'].includes(activeNav) && (
                <>
                  <div className={`space-y-4 ${activeNav === 'model-transfer' && sceneHasModel ? 'opacity-50 pointer-events-none' : ''}`}>
                    <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">拍摄视角 {activeNav === 'model-transfer' && sceneHasModel && '(场景图已锁定视角)'}</label>
                    <div className="grid grid-cols-2 gap-3">
                      {CAMERA_ANGLES.map(angle => (
                        <button
                          key={angle.id}
                          disabled={activeNav === 'model-transfer' && sceneHasModel}
                          onClick={() => {
                            setCameraAngle(angle.name);
                            if (angle.id === 'dutch') {
                              setModelAction('自然律动');
                            }
                          }}
                          className={`p-3 rounded-2xl border transition-all text-left flex flex-col gap-1 ${cameraAngle === angle.name ? 'border-black bg-white/80 shadow-md' : 'border-white/40 bg-white/30 hover:bg-white/50'}`}
                        >
                          <span className="text-[10px] font-bold text-black uppercase tracking-wider">{angle.name}</span>
                          <span className="text-[8px] text-gray-400 font-medium">{angle.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={`space-y-4 ${activeNav === 'model-transfer' && sceneHasModel ? 'opacity-50 pointer-events-none' : ''}`}>
                    <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">构图方式 (Composition) {activeNav === 'model-transfer' && sceneHasModel && '(场景图已锁定构图)'}</label>
                    <div className="grid grid-cols-2 gap-3">
                      {COMPOSITION_PRESETS.map(comp => (
                        <button
                          key={comp.id}
                          disabled={activeNav === 'model-transfer' && sceneHasModel}
                          onClick={() => setComposition(comp.name)}
                          className={`p-3 rounded-2xl border transition-all text-left flex flex-col gap-1 ${composition === comp.name ? 'border-black bg-white/80 shadow-md' : 'border-white/40 bg-white/30 hover:bg-white/50'}`}
                        >
                          <span className="text-[10px] font-bold text-black uppercase tracking-wider">{comp.name}</span>
                          <span className="text-[8px] text-gray-400 font-medium leading-tight">{comp.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={`space-y-4 ${activeNav === 'model-transfer' && sceneHasModel ? 'opacity-50 pointer-events-none' : ''}`}>
                    <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">模特动作 (Action) {activeNav === 'model-transfer' && sceneHasModel && '(场景图已锁定动作)'}</label>
                    <div className="grid grid-cols-2 gap-3">
                      {MODEL_ACTIONS.map(action => (
                        <button
                          key={action.id}
                          disabled={activeNav === 'model-transfer' && sceneHasModel}
                          onClick={() => setModelAction(action.name)}
                          className={`p-3 rounded-2xl border transition-all text-left flex flex-col gap-1 ${modelAction === action.name ? 'border-black bg-white/80 shadow-md' : 'border-white/40 bg-white/30 hover:bg-white/50'}`}
                        >
                          <span className="text-[10px] font-bold text-black uppercase tracking-wider">{action.name}</span>
                          <span className="text-[8px] text-gray-400 font-medium leading-tight">{action.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={`space-y-4 ${activeNav === 'model-transfer' && sceneHasModel ? 'opacity-50 pointer-events-none' : ''}`}>
                    <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">模特表情 (Expression) {activeNav === 'model-transfer' && sceneHasModel && '(场景图已锁定表情)'}</label>
                    <div className="grid grid-cols-2 gap-3">
                      {MODEL_EXPRESSIONS.map(expr => (
                        <button
                          key={expr.id}
                          disabled={activeNav === 'model-transfer' && sceneHasModel}
                          onClick={() => setModelExpression(expr.name)}
                          className={`p-3 rounded-2xl border transition-all text-left flex flex-col gap-1 ${modelExpression === expr.name ? 'border-black bg-white/80 shadow-md' : 'border-white/40 bg-white/30 hover:bg-white/50'}`}
                        >
                          <span className="text-[10px] font-bold text-black uppercase tracking-wider">{expr.name}</span>
                          <span className="text-[8px] text-gray-400 font-medium leading-tight">{expr.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {!['model-transfer'].includes(activeNav) && (
                <div className="space-y-4">
                  <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">场景预设</label>
                  <div className="grid grid-cols-2 gap-3">
                    {SCENE_PRESETS.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setScene(s.name)}
                        className={`p-4 rounded-2xl border transition-all flex flex-col gap-2 ${scene === s.name ? 'border-black bg-white/80 shadow-md scale-105' : 'border-white/40 bg-white/30 hover:bg-white/50'}`}
                      >
                        <span className="text-xl">{s.icon}</span>
                        <span className="text-[10px] font-bold text-black uppercase tracking-wider">{s.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">全局提示词实验室</label>
                <textarea 
                  value={globalPrompt}
                  onChange={(e) => setGlobalPrompt(e.target.value)}
                  className="w-full h-28 bg-white/40 backdrop-blur-md border border-white/40 rounded-2xl p-4 resize-none text-xs focus:outline-none focus:ring-2 focus:ring-black/5"
                  placeholder="自定义背景细节、光影强度..."
                />
              </div>
            </>
          )}

          <div className="space-y-4 pt-6 border-t border-black/5">
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">尺寸</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {ASPECT_RATIOS.map(r => (
                    <button
                      key={r}
                      onClick={() => setAspectRatio(r as any)}
                      className={`py-1.5 rounded-lg border text-[9px] font-bold transition-all ${aspectRatio === r ? 'bg-black text-white border-black shadow-sm' : 'bg-white/50 border-white/40 hover:border-black/20'}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">清晰度</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {RESOLUTIONS.map(r => (
                    <button
                      key={r}
                      onClick={() => setResolution(r as any)}
                      className={`py-1.5 rounded-lg border text-[9px] font-bold transition-all ${resolution === r ? 'bg-black text-white border-black shadow-sm' : 'bg-white/50 border-white/40 hover:border-black/20'}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <button 
          onClick={handleGenerate}
          disabled={isGenerating}
          className="w-full py-5 bg-black text-white rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-black/10 mt-auto hover:scale-[1.02] transition-all disabled:opacity-50"
        >
          {isGenerating ? <Loader2 className="animate-spin" /> : <Sparkles size={20} />}
          <span className="tracking-[0.06em] font-bold text-sm text-center leading-snug">
            {isGenerating ? '正在生成视觉资产...' : 
             `${activeNav === 'resize' ? '开始修改尺寸' : '开始生成'} (${currentUnitCost}积分/张${currentGeneratePlan.count > 1 ? `，约${currentGenerateCost}积分` : ''})`}
          </span>
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-h-[calc(100vh-3rem)] relative bg-white/60 backdrop-blur-2xl rounded-[2.5rem] border border-white/40 shadow-2xl p-10">
        <AnimatePresence>
          {results.length === 0 && !isGenerating && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="h-full flex flex-col items-center justify-center text-center gap-8"
            >
              <div className="w-32 h-32 rounded-[2.5rem] bg-white/60 backdrop-blur-xl shadow-2xl flex items-center justify-center text-black border border-white/40">
                <ImageIcon size={56} strokeWidth={1.5} />
              </div>
              <div className="space-y-3">
                <h2 className="text-3xl font-bold tracking-tight">准备好您的视觉盛宴了吗？</h2>
                <p className="text-gray-500 max-w-md mx-auto text-sm leading-relaxed">上传产品并配置参数，AI 将为您自动生成符合品牌 DNA 的商业级视觉资产。</p>
              </div>
            </motion.div>
          )}

          {isGenerating && results.length === 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-full flex flex-col items-center justify-center gap-10"
            >
              <div className="relative">
                <div className="w-40 h-40 rounded-full border-[6px] border-white/20 border-t-black animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Zap className="text-black animate-pulse" size={48} fill="currentColor" />
                </div>
              </div>
              <div className="text-center space-y-3">
                <h3 className="text-2xl font-bold tracking-tight">正在构建动态视觉管线</h3>
                <p className="text-gray-400 font-medium tracking-wide animate-pulse">正在处理：{ageRange} | {modelCount}人模式 + {scene} 场景</p>
              </div>
            </motion.div>
          )}

          {results.length > 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-w-6xl mx-auto space-y-16 pb-20"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h2 className="text-4xl font-bold tracking-tight">智能画廊</h2>
                  <p className="text-gray-500 font-medium tracking-wide">已生成 {results.length} 张商业级视觉资产</p>
                </div>
                {isGenerating && (
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-500 tracking-widest uppercase">
                    <Loader2 className="animate-spin" size={14} />
                    继续生成中
                  </div>
                )}
                <button 
                  onClick={downloadAll}
                  className="flex items-center gap-3 px-8 py-4 bg-white/60 backdrop-blur-md border border-white/40 rounded-2xl font-bold text-black hover:bg-white/80 transition-all shadow-lg hover:scale-105"
                >
                  <Download size={20} />
                  <span className="uppercase tracking-wider">一键打包下载 (ZIP)</span>
                </button>
              </div>

              {activeNav === 'xiaohongshu' && results[0]?.caption && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/40 shadow-xl space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center text-white">
                        <Heart size={20} fill="currentColor" />
                      </div>
                      <h3 className="text-lg font-bold tracking-tight">小红书种草文案</h3>
                    </div>
                    <button 
                      onClick={() => navigator.clipboard.writeText(results[0].caption || "")}
                      className="px-4 py-2 bg-black text-white rounded-xl text-[10px] font-bold uppercase tracking-wider hover:scale-105 transition-all"
                    >
                      复制全文
                    </button>
                  </div>
                  <div className="p-6 bg-gray-50/50 rounded-2xl border border-gray-100">
                    <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed selection:bg-black selection:text-white">
                      {results[0].caption}
                    </p>
                  </div>
                </motion.div>
              )}

                    {/* Product Gallery */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 pb-20">
                      {results.map((img, idx) => (
                        <React.Fragment key={img.id}>
                          <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: (idx % 4) * 0.1 }}
                      className="flex flex-col gap-4"
                    >
                    <div 
                      className="group relative rounded-[2rem] overflow-hidden shadow-xl bg-white/40 border border-white/40 aspect-[3/4] cursor-pointer"
                      onClick={() => setSelectedImage(img)}
                    >
                      <img 
                        src={img.url} 
                        alt={`Product ${idx}`} 
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute top-5 left-5 z-10 flex flex-col gap-2">
                        <span className="px-3 py-1.5 bg-white/80 backdrop-blur-md text-[10px] font-bold rounded-xl text-black shadow-sm uppercase tracking-wider">
                          方案 {idx + 1}
                        </span>
                      </div>
                    </div>

                    {/* Action Area Below Image */}
                    <div className="flex flex-col gap-3 px-2">
                      {img.caption && activeNav !== 'xiaohongshu' && (
                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 mb-2">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[8px] font-bold uppercase tracking-widest text-gray-400">小红书文案</span>
                            <button 
                              onClick={() => navigator.clipboard.writeText(img.caption || "")}
                              className="text-[8px] font-bold text-gray-500 hover:text-black transition-colors"
                            >
                              复制文案
                            </button>
                          </div>
                          <p className="text-[10px] text-gray-600 whitespace-pre-wrap leading-relaxed">{img.caption}</p>
                        </div>
                      )}
                      {activeNav !== 'sku-shot' ? (
                        <>
                          <div className="flex gap-2">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleGenerateMore(img);
                          }}
                          disabled={!!isGeneratingMore}
                          className="flex-1 py-3.5 bg-white border border-white/40 shadow-sm text-black rounded-2xl font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-gray-50 transition-all hover:scale-[1.02]"
                        >
                          {isGeneratingMore === img.id ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                          生成同类型 (4张, {variationUnitCost}积分/张, 约{variationTotalCost}积分)
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadSingle(img.url, `kocotree-${img.id}`);
                          }}
                          className="w-12 h-12 bg-white border border-white/40 shadow-sm text-black rounded-2xl flex items-center justify-center hover:bg-gray-50 transition-all hover:scale-[1.05]"
                          title="下载此图片"
                        >
                          <Download size={18} />
                        </button>
                      </div>
                      
                      <div className="relative flex items-center">
                        <input 
                          type="text"
                          value={refinementInputs[img.id] || ""}
                          onChange={(e) => setRefinementInputs(prev => ({ ...prev, [img.id]: e.target.value }))}
                          placeholder="局部重绘或指令微调..."
                          className="w-full bg-white/60 backdrop-blur-md border border-white/40 rounded-2xl pl-4 pr-12 py-3 text-[10px] text-black placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black/5 transition-all shadow-sm"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleRefine(img);
                            }
                          }}
                        />
                        <button 
                          onClick={() => handleRefine(img)}
                          disabled={isRefining === img.id}
                          title={`微调 (${resolveUnitCost(costs, 'REFINE_IMAGE')}积分/张)`}
                          className="absolute right-2 w-8 h-8 bg-black text-white rounded-xl flex items-center justify-center hover:scale-105 transition-all disabled:opacity-50 disabled:hover:scale-100"
                        >
                          {isRefining === img.id ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
                        </button>
                      </div>
                    </>
                  ) : (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadSingle(img.url, `kocotree-${img.id}`);
                      }}
                      className="w-full py-3.5 bg-white border border-white/40 shadow-sm text-black rounded-2xl font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-gray-50 transition-all hover:scale-[1.02]"
                    >
                      <Download size={14} />
                      下载图片
                    </button>
                  )}
                </div>
              </motion.div>
                </React.Fragment>
              ))}
            </div>
          </motion.div>
          )}
        </AnimatePresence>

      </main>

      {/* Modal for Zoom */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-6 md:p-12 backdrop-blur-3xl"
            onClick={() => {
              setSelectedImage(null);
              setIsInpainting(false);
              setMaskImage("");
            }}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-5xl h-full flex items-center justify-center"
              onClick={e => e.stopPropagation()}
            >
              <div className="relative group max-h-full flex items-center justify-center w-full">
                {/* Large Exit Button on the right */}
                <button 
                  onClick={() => {
                    setSelectedImage(null);
                    setIsInpainting(false);
                    setMaskImage("");
                  }}
                  className="absolute -right-4 md:-right-28 top-1/2 -translate-y-1/2 w-20 h-20 bg-white/5 hover:bg-white/10 text-white rounded-full flex items-center justify-center transition-all border border-white/10 backdrop-blur-xl z-[110] group/exit shadow-2xl"
                  title="关闭预览"
                >
                  <Plus className="rotate-45 group-hover/exit:scale-110 transition-transform" size={40} />
                </button>

                {isInpainting ? (
                  <div className="w-full max-w-2xl bg-white/5 p-8 rounded-[3rem] border border-white/10 backdrop-blur-2xl">
                    <div className="mb-6 space-y-2">
                      <h3 className="text-2xl font-bold text-white tracking-tight">局部重绘模式</h3>
                      <p className="text-white/40 text-sm">请在下方图片中涂抹您想要重新生成的区域</p>
                    </div>
                    
                    <InpaintingCanvas image={selectedImage.url} onMaskChange={setMaskImage} />
                    
                    <div className="mt-8 grid grid-cols-2 gap-4">
                      <button 
                        onClick={() => {
                          setIsInpainting(false);
                          setMaskImage("");
                        }}
                        className="py-4 bg-white/10 text-white rounded-2xl font-bold uppercase tracking-wider hover:bg-white/20 transition-all border border-white/10"
                      >
                        取消
                      </button>
                      <button 
                        onClick={() => {
                          handleRefine(selectedImage);
                          setSelectedImage(null);
                          setIsInpainting(false);
                        }}
                        className="py-4 bg-white text-black rounded-2xl font-bold uppercase tracking-wider hover:scale-105 transition-all shadow-xl shadow-white/10"
                      >
                        确认重绘
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="relative flex flex-col items-center gap-8">
                    {/* Download Button at top-right of image */}
                    <div className="absolute -top-16 right-0 z-[110] flex gap-3">
                      <button 
                        onClick={() => setIsInpainting(true)}
                        className="h-14 px-6 bg-white text-black rounded-2xl flex items-center gap-3 font-bold uppercase tracking-wider hover:scale-105 transition-all shadow-xl"
                      >
                        <Sparkles size={20} />
                        局部重绘
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadSingle(selectedImage.url, 'kocotree-export');
                        }}
                        className="w-14 h-14 bg-white/10 hover:bg-white/20 text-white rounded-2xl flex items-center justify-center transition-all border border-white/10 backdrop-blur-md shadow-2xl"
                        title="下载原图"
                      >
                        <Download size={24} />
                      </button>
                    </div>

                    <img 
                      src={selectedImage.url} 
                      alt="Zoomed" 
                      className="max-w-full max-h-[80vh] rounded-[3rem] shadow-[0_0_120px_rgba(0,0,0,0.6)] object-contain border border-white/10 select-none"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-10 right-10 bg-black text-white px-8 py-5 rounded-[2rem] shadow-2xl flex items-center gap-4 z-[100] border border-white/20 backdrop-blur-xl"
          >
            <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/20">
              <Trash2 size={20} />
            </div>
            <div>
              <p className="font-bold text-sm uppercase tracking-wider">生成出错</p>
              <p className="text-xs text-white/60 mt-0.5">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="ml-6 w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-all">
              <Plus className="rotate-45" size={20} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
