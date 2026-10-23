import React, { useState, useRef } from 'react';
import { 
  Box, 
  Upload, 
  Sparkles, 
  Layers, 
  PenTool, 
  RefreshCw, 
  ChevronRight, 
  Download, 
  CheckCircle2,
  X,
  Plus,
  Maximize2,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Stage, Layer, Image as KonvaImage, Text, Rect, Circle, Line } from 'react-konva';
import useImage from 'use-image';
import { cn } from './utils';
import { generatePackagingDesign, generateUnfoldedView, generateAIAnnotations, editPackagingDesign, identifyBoxType, GenerationResult } from './services/packagingApiService';
import confetti from 'canvas-confetti';

type Step = 'input' | 'designs' | 'unfolded' | 'annotate';

interface Annotation {
  id: string;
  x: number;
  y: number;
  labelX?: number;
  labelY?: number;
  text: string;
  type: 'material' | 'process';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return '生成失败，请稍后重试。';
}

export default function App() {
  const [step, setStep] = useState<Step>('input');
  const [prompt, setPrompt] = useState('');
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [designs, setDesigns] = useState<GenerationResult[]>([]);
  const [selectedDesign, setSelectedDesign] = useState<GenerationResult | null>(null);
  const [unfoldedImage, setUnfoldedImage] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [newAnnotationText, setNewAnnotationText] = useState('');
  const [annotationType, setAnnotationType] = useState<'material' | 'process'>('material');
  const [modificationPrompt, setModificationPrompt] = useState('');
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [selectedAnnotationDetail, setSelectedAnnotationDetail] = useState<Annotation | null>(null);
  const [selectedBoxType, setSelectedBoxType] = useState('插口盒 (Tuck End)');
  const [apiError, setApiError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<any>(null);
  const [unfoldedImg] = useImage(unfoldedImage || '');

  const BOX_TYPES = [
    '插口盒 (Tuck End)',
    '天地盖 (Lid & Base)',
    '飞机盒 (Mailer Box)',
    '抽屉盒 (Sleeve Box)',
    '书型盒 (Book Style)',
    '自立袋 (Stand-up Pouch)',
    '三边封袋 (Flat Pouch)',
    '手提袋 (Carrier Bag)',
    '圆筒包装 (Tube)',
    '异形礼盒 (Special Shape)'
  ];

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setReferenceImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const onGenerate = async () => {
    if (!prompt) return;
    setIsGenerating(true);
    setApiError(null);
    try {
      const results = await generatePackagingDesign(prompt, referenceImage || undefined);
      setDesigns(results);
      setStep('designs');
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch (error) {
      console.error(error);
      setApiError(getErrorMessage(error));
    } finally {
      setIsGenerating(false);
    }
  };

  const onRegenerate = async () => {
    setIsGenerating(true);
    setApiError(null);
    try {
      const results = await generatePackagingDesign(prompt, referenceImage || undefined);
      setDesigns(results);
    } catch (error) {
      console.error(error);
      setApiError(getErrorMessage(error));
    } finally {
      setIsGenerating(false);
    }
  };

  const onModifyDesign = async () => {
    if (!selectedDesign || !modificationPrompt) return;
    setIsGenerating(true);
    setApiError(null);
    try {
      const result = await editPackagingDesign(selectedDesign.imageUrl, modificationPrompt);
      if (result) {
        // Replace the selected design with the modified one or add it to the list
        const updatedDesigns = designs.map(d => d === selectedDesign ? result : d);
        setDesigns(updatedDesigns);
        setSelectedDesign(result);
        setModificationPrompt('');
        confetti({
          particleCount: 50,
          spread: 50,
          origin: { y: 0.8 }
        });
      }
    } catch (error) {
      console.error(error);
      setApiError(getErrorMessage(error));
    } finally {
      setIsGenerating(false);
    }
  };

  const onSelectDesign = async (design: GenerationResult) => {
    setSelectedDesign(design);
    setIsGenerating(true);
    try {
      const boxType = await identifyBoxType(design.imageUrl);
      setSelectedBoxType(boxType);
    } catch (error) {
      console.error("Auto-identification failed", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const onGenerateUnfolded = async () => {
    if (!selectedDesign) return;
    setIsGenerating(true);
    setApiError(null);
    try {
      // 1. Generate Unfolded View
      const result = await generateUnfoldedView(selectedDesign.imageUrl, prompt, selectedBoxType);
      if (result) {
        setUnfoldedImage(result);
        
        // 2. Automatically generate annotations
        const aiAnnotations = await generateAIAnnotations(result, prompt);
        const mappedAnnotations: Annotation[] = aiAnnotations.map(a => ({
          id: Math.random().toString(36).substr(2, 9),
          x: (a.targetX / 100) * 800,
          y: (a.targetY / 100) * 600,
          labelX: (a.labelX / 100) * 800,
          labelY: (a.labelY / 100) * 600,
          text: a.text,
          type: a.type as 'material' | 'process'
        }));
        setAnnotations(mappedAnnotations);
        
        setStep('unfolded');
      }
    } catch (error) {
      console.error(error);
      setApiError(getErrorMessage(error));
    } finally {
      setIsGenerating(false);
    }
  };

  const onStartAnnotating = async () => {
    if (!unfoldedImage) return;
    setIsGenerating(true);
    setApiError(null);
    try {
      const aiAnnotations = await generateAIAnnotations(unfoldedImage, prompt);
      
      // Map relative coordinates (0-100) to canvas size (800x600)
      const mappedAnnotations: Annotation[] = aiAnnotations.map(a => ({
        id: Math.random().toString(36).substr(2, 9),
        x: (a.targetX / 100) * 800,
        y: (a.targetY / 100) * 600,
        labelX: (a.labelX / 100) * 800,
        labelY: (a.labelY / 100) * 600,
        text: a.text,
        type: a.type as 'material' | 'process'
      }));

      setAnnotations(mappedAnnotations);
      setStep('annotate');
    } catch (error) {
      console.error(error);
      setApiError(getErrorMessage(error));
    } finally {
      setIsGenerating(false);
    }
  };

  const addAnnotation = (e: any) => {
    if (!isAnnotating) return;
    const stage = e.target.getStage();
    const pointerPosition = stage.getPointerPosition();
    
    const newAnnotation: Annotation = {
      id: Math.random().toString(36).substr(2, 9),
      x: pointerPosition.x,
      y: pointerPosition.y,
      text: newAnnotationText || (annotationType === 'material' ? '环保纸张' : '烫金工艺'),
      type: annotationType
    };
    
    setAnnotations([...annotations, newAnnotation]);
    setNewAnnotationText('');
    setIsAnnotating(false);
  };

  const removeAnnotation = (id: string) => {
    setAnnotations(annotations.filter(a => a.id !== id));
  };

  const PROCESS_DETAILS: Record<string, { desc: string; example?: string }> = {
    '烫金': {
      desc: '烫金工艺是通过加热和压力将金属箔转移到印刷品表面。它能产生强烈的金属光泽，显著提升包装的视觉档次和触感高级感，常用于Logo或核心装饰元素。',
    },
    'UV印刷': {
      desc: 'UV印刷利用紫外线瞬间干燥油墨，产生高亮度、色彩鲜艳且耐磨损的效果。局部UV常用于提亮特定图案，增加画面的视觉层次感和立体感。',
    },
    '烫金工艺': {
      desc: '烫金工艺是通过加热和压力将金属箔转移到印刷品表面。它能产生强烈的金属光泽，显著提升包装的视觉档次和触感高级感。',
    },
    '环保纸张': {
      desc: '选用可降解或回收再利用的纸张材质，符合可持续发展理念，同时能赋予产品自然、亲和的品牌调性。',
    },
  };

  const downloadImage = (dataUrl: string, filename: string) => {
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const steps = [
    { id: 'input', label: '设计需求', icon: Sparkles },
    { id: 'designs', label: '效果图', icon: Layers },
    { id: 'unfolded', label: '展开图', icon: Maximize2 },
    { id: 'annotate', label: '标注工艺', icon: PenTool },
  ] as const;

  const canNavigateTo = (targetStep: Step) => {
    if (targetStep === 'input') return true;
    if (targetStep === 'designs') return designs.length > 0;
    if (targetStep === 'unfolded') return !!unfoldedImage;
    if (targetStep === 'annotate') return annotations.length > 0 || !!unfoldedImage;
    return false;
  };

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-[#1A1A1A] font-sans selection:bg-emerald-100">
      {/* Header */}
      <header className="border-b border-black/5 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-emerald-200">
              <Box size={18} />
            </div>
            <span className="font-bold text-xl tracking-tight">包装设计工作台</span>
          </div>
          
          <nav className="hidden md:flex items-center gap-1 bg-black/5 p-1 rounded-full">
            {steps.map((s) => {
              const reachable = canNavigateTo(s.id);
              return (
                <button 
                  key={s.id}
                  onClick={() => reachable && setStep(s.id)}
                  disabled={!reachable}
                  className={cn(
                    "flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all",
                    step === s.id ? "bg-white text-emerald-600 shadow-sm" : reachable ? "text-black/60 hover:text-black hover:bg-black/5" : "text-black/20 cursor-not-allowed"
                  )}
                >
                  <s.icon size={14} />
                  {s.label}
                </button>
              );
            })}
          </nav>

        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        {apiError && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {apiError}
          </div>
        )}
        <AnimatePresence mode="wait">
          {/* Step 1: Input */}
          {step === 'input' && (
            <motion.div 
              key="input"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl mx-auto"
            >
              <div className="text-center mb-12">
                <h1 className="text-4xl font-bold tracking-tight mb-4">创作您的下一个包装杰作</h1>
                <p className="text-black/50 text-lg">描述您的包装愿景，让 AI 为您完成繁重的工作。</p>
              </div>

              <div className="bg-white p-8 rounded-3xl shadow-xl shadow-black/5 border border-black/5 space-y-8">
                <div className="space-y-2">
                  <label className="text-sm font-semibold uppercase tracking-wider text-black/40">设计需求描述</label>
                  <textarea 
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="例如：一个极简主义的有机茶盒，带有植物插图，柔和的色彩，具有高级感..."
                    className="w-full h-32 p-4 rounded-2xl bg-black/5 border-transparent focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none resize-none text-lg"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold uppercase tracking-wider text-black/40">参考图 (可选)</label>
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "relative border-2 border-dashed rounded-2xl transition-all cursor-pointer group",
                      referenceImage ? "border-emerald-500/50 bg-emerald-50/30" : "border-black/10 hover:border-emerald-500/50 hover:bg-emerald-50/30"
                    )}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleImageUpload} 
                      className="hidden" 
                      accept="image/*"
                    />
                    
                    {referenceImage ? (
                      <div className="p-4 flex items-center gap-4">
                        <img src={referenceImage} alt="Reference" className="w-20 h-20 object-cover rounded-lg shadow-md" />
                        <div className="flex-1">
                          <p className="font-medium text-emerald-700">图片已上传</p>
                          <p className="text-sm text-emerald-600/60">点击更换图片</p>
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setReferenceImage(null); }}
                          className="p-2 hover:bg-emerald-100 rounded-full text-emerald-700"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    ) : (
                      <div className="py-12 flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center text-black/40 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors">
                          <Upload size={24} />
                        </div>
                        <p className="font-medium text-black/60">拖拽图片到此处或点击浏览</p>
                        <p className="text-xs text-black/40 uppercase tracking-widest">支持 PNG, JPG，最大 10MB</p>
                      </div>
                    )}
                  </div>
                </div>

                <button 
                  onClick={onGenerate}
                  disabled={!prompt || isGenerating}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-black/10 disabled:text-black/30 text-white rounded-2xl font-bold text-lg shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2 group"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="animate-spin" size={20} />
                      正在生成，请稍候...
                    </>
                  ) : (
                    <>
                      生成设计方案
                      <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 2: Designs */}
          {step === 'designs' && (
            <motion.div 
              key="designs"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight">设计方案</h2>
                  <p className="text-black/50">选择您最喜欢的方案以生成展开图。</p>
                </div>
                <button 
                  onClick={onRegenerate}
                  disabled={isGenerating}
                  className="flex items-center gap-2 px-6 py-3 bg-white border border-black/10 rounded-xl font-semibold hover:bg-black/5 transition-all text-sm"
                >
                  <RefreshCw size={16} className={isGenerating ? "animate-spin" : ""} />
                  重新生成
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                {designs.map((design, idx) => (
                  <div 
                    key={idx}
                    onClick={() => onSelectDesign(design)}
                    className={cn(
                      "group relative bg-white rounded-3xl overflow-hidden border-2 transition-all cursor-pointer",
                      selectedDesign === design ? "border-emerald-500 ring-4 ring-emerald-500/10" : "border-transparent hover:border-black/10"
                    )}
                  >
                    <img src={design.imageUrl} alt={`Design ${idx + 1}`} className="w-full aspect-square object-cover" />
                    
                    {/* Image Actions Overlay */}
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setZoomedImage(design.imageUrl); }}
                        className="p-3 bg-white/90 backdrop-blur-sm rounded-full text-black hover:bg-white transition-all transform hover:scale-110"
                        title="放大查看"
                      >
                        <Maximize2 size={20} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); downloadImage(design.imageUrl, `design-${idx + 1}.png`); }}
                        className="p-3 bg-white/90 backdrop-blur-sm rounded-full text-black hover:bg-white transition-all transform hover:scale-110"
                        title="下载图片"
                      >
                        <Download size={20} />
                      </button>
                    </div>

                    <div className="absolute top-4 right-4 z-10">
                      {selectedDesign === design && (
                        <div className="bg-emerald-500 text-white p-2 rounded-full shadow-lg">
                          <CheckCircle2 size={20} />
                        </div>
                      )}
                    </div>
                    <div className="p-4 bg-white/90 backdrop-blur-sm border-t border-black/5">
                      <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-1">{design.prompt}</p>
                    </div>
                  </div>
                ))}
              </div>

              {selectedDesign && (
                <div className="space-y-6">
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="max-w-xl mx-auto bg-white p-6 rounded-3xl shadow-lg border border-black/5 space-y-4"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles size={18} className="text-emerald-600" />
                      <h3 className="font-bold">修改当前方案</h3>
                    </div>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={modificationPrompt}
                        onChange={(e) => setModificationPrompt(e.target.value)}
                        placeholder="例如：把背景改成深蓝色，或者增加更多花卉元素..."
                        className="flex-1 p-3 rounded-xl bg-black/5 border-transparent focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none text-sm"
                      />
                      <button 
                        onClick={onModifyDesign}
                        disabled={!modificationPrompt || isGenerating}
                        className="px-6 py-3 bg-black text-white rounded-xl font-bold text-sm hover:bg-black/80 transition-all disabled:bg-black/10 flex items-center gap-2"
                      >
                        {isGenerating ? <RefreshCw className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                        修改
                      </button>
                    </div>
                  </motion.div>

                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="max-w-xl mx-auto bg-white p-6 rounded-3xl shadow-lg border border-black/5 space-y-4"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Maximize2 size={18} className="text-emerald-600" />
                      <h3 className="font-bold">选择盒型结构 (提升展开图准确度)</h3>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                      {BOX_TYPES.map(type => (
                        <button
                          key={type}
                          onClick={() => setSelectedBoxType(type)}
                          className={cn(
                            "px-3 py-2 rounded-xl text-[10px] font-bold transition-all border leading-tight h-10 flex items-center justify-center text-center",
                            selectedBoxType === type 
                              ? "bg-emerald-600 text-white border-emerald-600 shadow-md" 
                              : "bg-black/5 text-black/60 border-transparent hover:bg-black/10"
                          )}
                        >
                          {type.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                </div>
              )}

              <div className="flex justify-center pt-8">
                <button 
                  onClick={onGenerateUnfolded}
                  disabled={!selectedDesign || isGenerating}
                  className="px-12 py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-black/10 disabled:text-black/30 text-white rounded-2xl font-bold text-lg shadow-lg shadow-emerald-200 transition-all flex items-center gap-2"
                >
                  {isGenerating ? (
                    <RefreshCw className="animate-spin" size={20} />
                  ) : (
                    <>
                      生成包装展开图
                      <Maximize2 size={20} />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 3: Unfolded View */}
          {step === 'unfolded' && (
            <motion.div 
              key="unfolded"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight">包装展开图</h2>
                  <p className="text-black/50">您的 2D 平面布局已准备就绪，可以进行材质和工艺标注。</p>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={onGenerateUnfolded}
                    disabled={isGenerating}
                    className="flex items-center gap-2 px-6 py-3 bg-white border border-black/10 rounded-xl font-semibold hover:bg-black/5 transition-all text-sm disabled:opacity-50"
                  >
                    <RefreshCw size={16} className={isGenerating ? "animate-spin" : ""} />
                    重新生成
                  </button>
                  <button 
                    onClick={onStartAnnotating}
                    disabled={isGenerating}
                    className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 disabled:bg-black/10 disabled:text-black/30"
                  >
                    {isGenerating ? (
                      <RefreshCw className="animate-spin" size={16} />
                    ) : (
                      <PenTool size={16} />
                    )}
                    {isGenerating ? "AI正在分析工艺..." : "AI自动标注工艺"}
                  </button>
                </div>
              </div>

              <div className="bg-white p-4 rounded-3xl shadow-xl shadow-black/5 border border-black/5 overflow-hidden relative group">
                <img src={unfoldedImage!} alt="Unfolded Die-line" className="w-full h-auto rounded-2xl" />
                
                {/* Image Actions Overlay */}
                <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                  <button 
                    onClick={() => setZoomedImage(unfoldedImage)}
                    className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-xl font-semibold hover:bg-gray-50 transition-all shadow-xl transform hover:-translate-y-1"
                  >
                    <Maximize2 size={18} />
                    放大查看
                  </button>
                  <button 
                    onClick={() => downloadImage(unfoldedImage!, 'unfolded-dieline.png')}
                    className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-xl font-semibold hover:bg-gray-50 transition-all shadow-xl transform hover:-translate-y-1"
                  >
                    <Download size={18} />
                    下载展开图
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 4: Annotate */}
          {step === 'annotate' && (
            <motion.div 
              key="annotate"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid lg:grid-cols-[1fr_320px] gap-8 h-[calc(100vh-200px)]"
            >
              <div className="bg-white rounded-3xl shadow-xl shadow-black/5 border border-black/5 overflow-hidden relative flex flex-col">
                <div className="p-4 border-b border-black/5 flex items-center justify-between bg-white/80 backdrop-blur-sm z-10">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setAnnotationType('material')}
                      className={cn(
                        "px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                        annotationType === 'material' ? "bg-emerald-600 text-white shadow-md" : "bg-black/5 text-black/60 hover:bg-black/10"
                      )}
                    >
                      材质
                    </button>
                    <button 
                      onClick={() => setAnnotationType('process')}
                      className={cn(
                        "px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                        annotationType === 'process' ? "bg-indigo-600 text-white shadow-md" : "bg-black/5 text-black/60 hover:bg-black/10"
                      )}
                    >
                      工艺
                    </button>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-black/40">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      {isAnnotating ? "点击画布放置标注" : "选择工具开始标注"}
                    </div>
                    <button 
                      onClick={() => setIsAnnotating(!isAnnotating)}
                      className={cn(
                        "p-2 rounded-full transition-all",
                        isAnnotating ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"
                      )}
                    >
                      {isAnnotating ? <X size={20} /> : <Plus size={20} />}
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-auto bg-[#F5F5F5] flex items-center justify-center p-8">
                  <div className="bg-white shadow-2xl rounded-lg overflow-hidden">
                    <Stage 
                      width={800} 
                      height={600} 
                      onClick={addAnnotation}
                      ref={stageRef}
                    >
                      <Layer>
                        {unfoldedImg && (
                          <KonvaImage 
                            image={unfoldedImg} 
                            width={800} 
                            height={600} 
                          />
                        )}
                        {annotations.map((ann) => {
                          const lX = ann.labelX ?? (ann.x + 40);
                          const lY = ann.labelY ?? (ann.y - 40);
                          
                          return (
                            <React.Fragment key={ann.id}>
                              {/* Target Point on Box */}
                              <Circle 
                                x={ann.x} 
                                y={ann.y} 
                                radius={6} 
                                fill={ann.type === 'material' ? '#059669' : '#4F46E5'} 
                                stroke="#fff"
                                strokeWidth={2}
                                onClick={() => setSelectedAnnotationDetail(ann)}
                                onTap={() => setSelectedAnnotationDetail(ann)}
                              />
                              
                              {/* Connector Line */}
                              <Line 
                                points={[ann.x, ann.y, lX, lY + 15]}
                                stroke={ann.type === 'material' ? '#059669' : '#4F46E5'}
                                strokeWidth={1.5}
                                opacity={0.6}
                                dash={[4, 4]}
                              />
                              
                              {/* Label in Blank Area */}
                              <Rect 
                                x={lX} 
                                y={lY} 
                                width={100} 
                                height={30} 
                                fill="white" 
                                cornerRadius={6}
                                shadowBlur={10}
                                shadowColor="rgba(0,0,0,0.1)"
                                onClick={() => setSelectedAnnotationDetail(ann)}
                                onTap={() => setSelectedAnnotationDetail(ann)}
                              />
                              <Rect 
                                x={lX} 
                                y={lY} 
                                width={4} 
                                height={30} 
                                fill={ann.type === 'material' ? '#059669' : '#4F46E5'} 
                                cornerRadius={[6, 0, 0, 6]}
                              />
                              <Text 
                                x={lX + 12} 
                                y={lY + 9} 
                                text={ann.text} 
                                fontSize={11} 
                                fontStyle="bold"
                                fill="#1a1a1a"
                                onClick={() => setSelectedAnnotationDetail(ann)}
                                onTap={() => setSelectedAnnotationDetail(ann)}
                              />
                            </React.Fragment>
                          );
                        })}
                      </Layer>
                    </Stage>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-white p-6 rounded-3xl shadow-xl shadow-black/5 border border-black/5">
                  <h3 className="font-bold text-lg mb-4">标注列表</h3>
                  <div className="space-y-3 max-h-[400px] overflow-auto pr-2">
                    {annotations.length === 0 ? (
                      <div className="text-center py-8 text-black/30">
                        <PenTool size={32} className="mx-auto mb-2 opacity-20" />
                        <p className="text-sm">暂无标注</p>
                      </div>
                    ) : (
                      annotations.map((ann) => (
                        <div 
                          key={ann.id}
                          className="group flex items-center justify-between p-3 rounded-xl bg-black/5 border border-transparent hover:border-black/10 transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-2 h-2 rounded-full",
                              ann.type === 'material' ? "bg-emerald-500" : "bg-indigo-500"
                            )} />
                            <div>
                              <p className="text-xs font-bold uppercase tracking-widest text-black/40">{ann.type}</p>
                              <p className="text-sm font-medium">{ann.text}</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => removeAnnotation(ann.id)}
                            className="p-1.5 text-black/20 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="bg-white p-6 rounded-3xl shadow-xl shadow-black/5 border border-black/5">
                  <h3 className="font-bold text-lg mb-4">添加新标注</h3>
                  <div className="space-y-4">
                    {annotationType === 'process' && (
                      <div className="flex gap-2 mb-2">
                        {['烫金', 'UV印刷'].map(p => (
                          <div key={p} className="flex-1 flex gap-1">
                            <button
                              onClick={() => {
                                setNewAnnotationText(p);
                                setIsAnnotating(true);
                              }}
                              className="flex-1 py-2 px-3 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold border border-indigo-100 hover:bg-indigo-100 transition-all text-left"
                            >
                              建议: {p}
                            </button>
                            <button
                              onClick={() => setSelectedAnnotationDetail({
                                id: 'temp',
                                x: 0,
                                y: 0,
                                text: p,
                                type: 'process'
                              })}
                              className="p-2 bg-indigo-50 text-indigo-400 rounded-lg border border-indigo-100 hover:bg-indigo-100 hover:text-indigo-600 transition-all"
                              title="查看详情"
                            >
                              <Info size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <input 
                      type="text" 
                      value={newAnnotationText}
                      onChange={(e) => setNewAnnotationText(e.target.value)}
                      placeholder="例如：哑光覆膜"
                      className="w-full p-3 rounded-xl bg-black/5 border-transparent focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none text-sm"
                    />
                    <button 
                      onClick={() => setIsAnnotating(true)}
                      className="w-full py-3 bg-black text-white rounded-xl font-bold text-sm hover:bg-black/80 transition-all flex items-center justify-center gap-2"
                    >
                      <Plus size={16} />
                      在画布上放置
                    </button>
                  </div>
                </div>

                <button 
                  onClick={() => {
                    const uri = stageRef.current.toDataURL();
                    const link = document.createElement('a');
                    link.download = 'packaging-spec.png';
                    link.href = uri;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 flex items-center justify-center gap-2"
                >
                  <Download size={20} />
                  导出设计规范
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Zoom Modal */}
      <AnimatePresence>
        {zoomedImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 md:p-12"
            onClick={() => setZoomedImage(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-full max-h-full"
              onClick={(e) => e.stopPropagation()}
            >
              <button 
                onClick={() => setZoomedImage(null)}
                className="absolute -top-12 right-0 text-white hover:text-emerald-400 transition-colors flex items-center gap-2 font-medium"
              >
                <X size={24} />
                关闭
              </button>
              <img 
                src={zoomedImage} 
                alt="Zoomed view" 
                className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl border border-white/10"
              />
              <div className="mt-4 flex justify-center">
                <button 
                  onClick={() => downloadImage(zoomedImage, 'packaging-design.png')}
                  className="flex items-center gap-2 px-8 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-900/20"
                >
                  <Download size={20} />
                  下载原图
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Annotation Detail Modal */}
      <AnimatePresence>
        {selectedAnnotationDetail && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setSelectedAnnotationDetail(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className={cn(
                "p-6 text-white flex items-center justify-between",
                selectedAnnotationDetail.type === 'material' ? "bg-emerald-600" : "bg-indigo-600"
              )}>
                <div className="flex items-center gap-3">
                  <Box size={24} />
                  <h3 className="text-xl font-bold">{selectedAnnotationDetail.text}</h3>
                </div>
                <button onClick={() => setSelectedAnnotationDetail(null)} className="hover:rotate-90 transition-transform">
                  <X size={24} />
                </button>
              </div>
              <div className="p-8 space-y-6">
                {PROCESS_DETAILS[selectedAnnotationDetail.text]?.example && (
                  <div className="rounded-xl overflow-hidden border border-black/5 shadow-inner">
                    <img 
                      src={PROCESS_DETAILS[selectedAnnotationDetail.text].example} 
                      alt="工艺示例" 
                      className="w-full h-32 object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="bg-black/5 py-1 px-3 text-[10px] font-bold text-black/40 uppercase tracking-widest text-center">
                      效果示例图 (Example)
                    </div>
                  </div>
                )}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-black/40 mb-2">详情说明</h4>
                  <p className="text-black/70 leading-relaxed text-sm">
                    {PROCESS_DETAILS[selectedAnnotationDetail.text]?.desc || '该工艺/材质的详细说明正在整理中，它将为您的包装设计带来独特的视觉效果。'}
                  </p>
                </div>
                <div className="pt-4 border-t border-black/5 flex justify-end">
                  <button 
                    onClick={() => setSelectedAnnotationDetail(null)}
                    className="px-6 py-2 bg-black text-white rounded-xl font-bold text-sm hover:bg-black/80 transition-all"
                  >
                    知道了
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-black/5 text-center">
        <p className="text-black/30 text-sm font-medium">由 API Manager 与 Gemini 图像能力提供支持</p>
      </footer>
    </div>
  );
}
