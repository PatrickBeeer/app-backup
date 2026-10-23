'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  Image as ImageIcon, 
  Sparkles, 
  Trash2, 
  Plus, 
  ArrowRight,
  RefreshCw,
  Palette,
  Maximize2,
  X,
  Check,
  Eraser,
  Pencil,
  Download,
  Type,
  Crop
} from 'lucide-react';

interface GeneratedImage {
  id: string;
  originalRef: string;
  result: string;
  status: 'loading' | 'success' | 'error';
  title?: string;
  tagline?: string;
  error?: string;
}

export default function Home() {
  const [refImages, setRefImages] = useState<string[]>([]);
  const [productImage, setProductImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('1K');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editingItem, setEditingItem] = useState<{ id: string, field: 'title' | 'tagline' } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [turboMode, setTurboMode] = useState(false);
  const [selectedModel, setSelectedModel] = useState('Nano Banana 2');

  // Inpainting related state
  const [showEditor, setShowEditor] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(40);
  const [refinementSteps, setRefinementSteps] = useState<Array<{ id: number; instruction: string; path: Array<{x: number, y: number}> }>>([]);
  const [currentPath, setCurrentPath] = useState<Array<{x: number, y: number}>>([]);

  const handleRefUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setRefImages(prev => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleProductUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProductImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const generateAll = async () => {
    if (!productImage || refImages.length === 0) return;
    
    setIsGenerating(true);
    const newResults: GeneratedImage[] = refImages.map((ref, idx) => ({
      id: Math.random().toString(36).substr(2, 9),
      originalRef: ref,
      result: '',
      status: 'loading'
    }));
    setResults(newResults);

    // Sequence generation to avoid hitting rate limits too hard simultaneously
    for (let i = 0; i < newResults.length; i++) {
        try {
            setIsGenerating(true);
            const res = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    referenceImage: refImages[i],
                    productImage,
                    prompt,
                    aspectRatio,
                    imageSize: size,
                    productConsistency: true
                })
            });

            // Robust error checking for non-JSON or server errors
            const contentType = res.headers.get("content-type");
            if (!res.ok || !contentType || !contentType.includes("application/json")) {
                const errorBody = await res.text();
                // If it's HTML, it's likely a server restart or platform error
                if (errorBody.includes("<!doctype html>") || errorBody.includes("<html")) {
                    console.error("Server returned HTML instead of JSON:", errorBody);
                    throw new Error("服务繁忙：图像合成处理目前压力较大，请尝试刷新页面或稍后重试。");
                }
                throw new Error(`合成协议异常 (Error ${res.status}): 网络处理已中断，请检查设置`);
            }

            const data = await res.json();
            
            if (data.imageUrl) {
                setResults(prev => prev.map(item => 
                    item.id === newResults[i].id ? { 
                        ...item, 
                        result: data.imageUrl, 
                        status: 'success',
                        title: data.title,
                        tagline: data.tagline
                    } : item
                ));
            } else {
                throw new Error(data.error || '生成失败：模型未返回结果');
            }
        } catch (err: any) {
            setResults(prev => prev.map(item => 
                item.id === newResults[i].id ? { ...item, status: 'error', error: err.message } : item
            ));
        }
    }
    setIsGenerating(false);
  };

  const handleEdit = async () => {
    if (!selectedImage) return;
    
    // Combine all instructions
    const styleConstraint = " (严格要求：仅修改文字内容，必须百分之百保持原有的字体、颜色、大小、样式、阴影和排列布局不变，严禁产生任何视觉偏移或风格变化)";
    const combinedPrompt = refinementSteps.length > 0 
      ? refinementSteps.map((s) => s.instruction || "无具体描述").join('; ') + styleConstraint
      : editPrompt ? editPrompt + styleConstraint : "";

    if (!combinedPrompt && !editPrompt) return;

    setIsEditing(true);

    // Get mask if drawing
    let maskData = null;
    if (canvasRef.current && showEditor) {
        // Create a black and white mask for Gemini
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = 1000;
        maskCanvas.height = 1000;
        const mctx = maskCanvas.getContext('2d');
        if (mctx) {
            mctx.fillStyle = 'black';
            mctx.fillRect(0, 0, 1000, 1000);
            
            mctx.strokeStyle = 'white';
            mctx.lineCap = 'round';
            mctx.lineJoin = 'round';

            refinementSteps.forEach(step => {
                if (step.path.length < 2) return;
                mctx.lineWidth = brushSize; // Use global brush size or per-step? Global for now
                mctx.beginPath();
                mctx.moveTo(step.path[0].x, step.path[0].y);
                for (let i = 1; i < step.path.length; i++) {
                    mctx.lineTo(step.path[i].x, step.path[i].y);
                }
                mctx.stroke();
            });
        }
        maskData = maskCanvas.toDataURL('image/png');
    }

    try {
        const res = await fetch('/api/edit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: selectedImage.result,
                editPrompt: combinedPrompt || editPrompt,
                maskImage: maskData,
                productConsistency: true
            })
        });

        const contentType = res.headers.get("content-type");
        if (!res.ok || !contentType || !contentType.includes("application/json")) {
            throw new Error(`微调请求失败 (HTTP ${res.status})`);
        }

        const data = await res.json();
        if (data.imageUrl) {
            setResults(prev => prev.map(item => 
                item.id === selectedImage.id ? { ...item, result: data.imageUrl } : item
            ));
            setSelectedImage(prev => prev ? { ...prev, result: data.imageUrl } : null);
            setShowEditor(false);
        } else {
            throw new Error(data.error || "编辑失败：模型未返回结果");
        }
    } catch (err: any) {
        console.error("Edit operation failed:", err);
    } finally {
        setIsEditing(false);
    }
  };

  // Drawing Logic
  useEffect(() => {
    if (showEditor && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            canvas.width = 1000;
            canvas.height = 1000;
            redrawCanvas();
        }
    }
  }, [showEditor, refinementSteps]);

  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw paths
    refinementSteps.forEach((step, idx) => {
        if (step.path.length < 2) return;
        
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(255, 69, 58, 0.4)'; // iOS Red with transparency
        ctx.lineWidth = brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.beginPath();
        ctx.moveTo(step.path[0].x, step.path[0].y);
        for (let i = 1; i < step.path.length; i++) {
            ctx.lineTo(step.path[i].x, step.path[i].y);
        }
        ctx.stroke();

        // Draw label
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 30px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const startX = step.path[0].x;
        const startY = step.path[0].y;
        
        ctx.beginPath();
        ctx.arc(startX, startY, 25, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#ffffff';
        ctx.fillText((idx + 1).toString(), startX, startY);
    });
  };

  const startDrawing = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    setIsDrawing(true);
    setCurrentPath([{ x, y }]);
  };

  const stopDrawing = () => {
    if (isDrawing && currentPath.length > 0) {
        setRefinementSteps(prev => [...prev, {
            id: Date.now(),
            instruction: '',
            path: currentPath
        }]);
    }
    setIsDrawing(false);
    setCurrentPath([]);
  };

  const draw = (e: React.PointerEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    setCurrentPath(prev => [...prev, { x, y }]);
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(255, 69, 58, 0.4)';
        ctx.lineWidth = brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        const lastPoint = currentPath[currentPath.length - 1];
        ctx.beginPath();
        ctx.moveTo(lastPoint.x, lastPoint.y);
        ctx.lineTo(x, y);
        ctx.stroke();
    }
  };

  const handleDownload = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Download failed:", err);
    }
  };

  const handleSaveText = () => {
    if (!editingItem) return;
    setResults(prev => prev.map(item => 
      item.id === editingItem.id ? { ...item, [editingItem.field]: editValue } : item
    ));
    if (selectedImage?.id === editingItem.id) {
        setSelectedImage(prev => prev ? { ...prev, [editingItem.field]: editValue } : null);
    }
    setEditingItem(null);
  };

  return (
    <main className="min-h-screen bg-[#f0f2f5] text-[#000] font-sans selection:bg-blue-50/50">
      <header className="fixed top-0 w-full z-50 bg-white/40 backdrop-blur-xl border-b border-white/20 py-4 px-6 md:px-12 flex justify-between items-center transition-all">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-black rounded-xl rotate-12 flex items-center justify-center shadow-lg">
            <Sparkles className="w-4 h-4 text-white -rotate-12" />
          </div>
          <h1 className="font-bold text-xl tracking-tight text-black">VisionCanvas <span className="text-ios-blue">一键复刻</span></h1>
        </div>
        <div className="hidden md:flex items-center gap-10 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">
           {/* Navigation removed as requested */}
        </div>
      </header>

      <div className="pt-24 pb-20 px-6 md:px-12 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 h-full items-start">
        
        {/* Left Control Panel */}
        <div className="lg:col-span-4 space-y-8">
            <section className="glass-panel p-8 space-y-6">
                <header className="flex justify-between items-center border-b border-white/20 pb-4">
                    <h2 className="font-bold text-[10px] uppercase tracking-[0.25em] text-zinc-400 flex items-center gap-2">
                        <ImageIcon className="w-3.5 h-3.5 text-ios-blue" />
                        参考设计库
                    </h2>
                    <span className="text-[10px] font-bold bg-white/40 text-ios-blue py-0.5 px-2.5 rounded-full border border-white/40">{refImages.length} 枚资产</span>
                </header>

                <div className="grid grid-cols-3 gap-4">
                    {refImages.map((img, idx) => (
                        <motion.div 
                          key={idx} 
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="relative group aspect-square rounded-[1.25rem] overflow-hidden border border-white/20 shadow-sm"
                        >
                            <img src={img} alt={`Ref ${idx}`} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors pointer-events-none"></div>
                            <button 
                              onClick={() => setRefImages(prev => prev.filter((_, i) => i !== idx))}
                              className="absolute top-2 right-2 bg-white/80 backdrop-blur-md p-1.5 rounded-xl opacity-0 group-hover:opacity-100 transition-all text-red-500 hover:bg-red-500 hover:text-white shadow-sm"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </motion.div>
                    ))}
                    <label className="flex flex-col items-center justify-center aspect-square rounded-[1.25rem] border-2 border-dashed border-white/40 hover:border-ios-blue/40 hover:bg-white/40 transition-all cursor-pointer group">
                        <Plus className="w-5 h-5 text-zinc-300 group-hover:text-ios-blue transition-colors" />
                        <input type="file" multiple accept="image/*" className="hidden" onChange={handleRefUpload} />
                    </label>
                </div>
            </section>

            <section className="glass-panel p-8 space-y-6">
                <header className="border-b border-white/20 pb-4">
                    <h2 className="font-bold text-[10px] uppercase tracking-[0.25em] text-zinc-400 flex items-center gap-2">
                        <Palette className="w-3.5 h-3.5 text-ios-blue" />
                        产品实拍资产
                    </h2>
                </header>

                {productImage ? (
                    <div className="relative group rounded-2xl overflow-hidden border border-white/20 bg-white/20 ring-1 ring-white/10">
                        <img src={productImage} alt="Product" className="w-full aspect-video object-contain p-4" />
                        <button 
                            onClick={() => setProductImage(null)}
                            className="absolute top-3 right-3 bg-white/80 backdrop-blur-md p-1.5 rounded-xl opacity-0 group-hover:opacity-100 transition-all text-red-500 hover:bg-red-500 hover:text-white shadow-sm"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ) : (
                    <label className="flex flex-col items-center justify-center p-10 rounded-[1.5rem] border-2 border-dashed border-white/40 hover:border-ios-blue/40 hover:bg-white/40 transition-all cursor-pointer group">
                        <div className="w-12 h-12 mb-4 bg-white/60 rounded-2xl flex items-center justify-center shadow-sm group-hover:bg-white transition-colors border border-white/40">
                            <Upload className="w-5 h-5 text-ios-blue" />
                        </div>
                        <span className="text-[10px] text-zinc-400 group-hover:text-ios-blue font-bold uppercase tracking-[0.2em] transition-colors">上传产品图</span>
                        <input type="file" accept="image/*" className="hidden" onChange={handleProductUpload} />
                    </label>
                )}
            </section>

            <section className="glass-panel p-8 space-y-8">
                <div className="space-y-4">
                    <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400 flex items-center gap-2">
                        <Pencil className="w-3 h-3 text-ios-blue" /> 风格上下文提示
                    </label>
                    <textarea 
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="极简工作室，肌理焦点，柔和环境光..."
                        className="ios-input w-full h-24 p-4 text-sm resize-none leading-relaxed"
                    />
                </div>

                <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-3">
                        <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400 pl-1">分辨率</label>
                        <select 
                            value={size} 
                            onChange={(e) => setSize(e.target.value)}
                            className="ios-input w-full p-3 text-xs font-medium appearance-none cursor-pointer"
                        >
                            <option value="512px">标准 (512px)</option>
                            <option value="1K">高清 (1K)</option>
                            <option value="2K">超清 (2K)</option>
                        </select>
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400 pl-1">纵横比</label>
                        <select 
                            value={aspectRatio} 
                            onChange={(e) => setAspectRatio(e.target.value)}
                            className="ios-input w-full p-3 text-xs font-medium appearance-none cursor-pointer"
                        >
                            <option value="1:1">方形 (1:1)</option>
                            <option value="4:3">卡片 (4:3)</option>
                            <option value="16:9">宽屏 (16:9)</option>
                        </select>
                    </div>
                </div>

                <button 
                    onClick={generateAll}
                    disabled={isGenerating || !productImage || refImages.length === 0}
                    className="ios-btn-primary w-full py-5 flex items-center justify-center gap-3 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:scale-100 disabled:shadow-none"
                >
                    {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 group-hover:rotate-12 transition-transform" />}
                    <span className="font-bold tracking-tight text-sm">开始智能生成资产 ({refImages.length})</span>
                </button>
            </section>
        </div>

        {/* Right Gallery Panel */}
        <div className="lg:col-span-8">
            <div className="glass-panel min-h-[600px] p-10 space-y-10">
                <header className="flex justify-between items-end border-b border-white/20 pb-8">
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight text-black">工作台 <span className="text-ios-blue font-medium">成果</span></h2>
                        <p className="text-zinc-400 text-[10px] font-bold uppercase tracking-[0.3em] mt-3">Synthesized visual assets for export</p>
                    </div>
                    {results.length > 0 && (
                        <button onClick={() => setResults([])} className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-300 hover:text-red-500 transition-colors flex items-center gap-2 py-2">
                            <Trash2 className="w-3 h-3" /> 清空画板
                        </button>
                    )}
                </header>

                {results.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-40 text-center space-y-8">
                        <div className="w-24 h-24 bg-white/40 backdrop-blur-md rounded-[2.5rem] flex items-center justify-center border border-white/60 shadow-sm">
                            <ImageIcon className="w-8 h-8 text-zinc-300" />
                        </div>
                        <div className="space-y-2">
                            <p className="text-black text-sm font-bold uppercase tracking-[0.3em]">等待素材上传</p>
                            <p className="text-zinc-400 text-xs font-medium">请上传参考图和产品图以开始合成</p>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        {results.map((item) => (
                            <motion.div 
                                key={item.id}
                                layoutId={item.id}
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`group relative rounded-[2rem] overflow-hidden border border-white/40 ${selectedImage?.id === item.id ? 'ring-2 ring-ios-blue' : ''} bg-white transition-all shadow-sm hover:shadow-xl hover:scale-[1.01]`}
                            >
                                <div className="aspect-square relative overflow-hidden bg-zinc-50/50">
                                    {item.status === 'loading' ? (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 backdrop-blur-sm">
                                            <div className="w-10 h-10 border-2 border-ios-blue/10 border-t-ios-blue rounded-full animate-spin mb-6" />
                                            <span className="text-[9px] font-bold uppercase tracking-[0.4em] text-ios-blue animate-pulse">正在处理像素</span>
                                        </div>
                                    ) : item.status === 'error' ? (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50/20 text-red-500 p-10 text-center">
                                            <X className="w-6 h-6 mb-4" />
                                            <p className="text-[10px] font-bold uppercase tracking-[0.2em]">合成协议故障</p>
                                            <p className="text-[10px] mt-3 font-medium leading-relaxed opacity-70 line-clamp-3">{item.error}</p>
                                        </div>
                                    ) : (
                                        <>
                                            <img src={item.result} alt="Result" className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" />
                                            
                                            {/* Actions Pill */}
                                            <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-500 z-20">
                                                <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/50 flex items-center p-1.5 gap-1">
                                                    <button 
                                                        onClick={() => {
                                                            setSelectedImage(item);
                                                            setShowEditor(true);
                                                        }}
                                                        className="flex items-center gap-2 px-4 py-2 text-[11px] font-bold text-zinc-900 hover:bg-zinc-50 rounded-xl transition-all active:scale-95"
                                                    >
                                                        <Type className="w-3.5 h-3.5 text-ios-blue" />
                                                        编辑文字
                                                    </button>
                                                    <div className="w-px h-4 bg-zinc-200/60 mx-1" />
                                                    <button 
                                                        className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded-xl transition-all"
                                                        title="裁剪"
                                                    >
                                                        <Crop className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDownload(item.result, `vision-canvas-${item.id}.png`)}
                                                        className="p-2 text-zinc-400 hover:text-ios-blue hover:bg-zinc-50 rounded-xl transition-all"
                                                        title="下载资产"
                                                    >
                                                        <Download className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Bottom Overlay Info */}
                                            <div className="absolute bottom-0 inset-x-0 p-6 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end min-h-[100px]">
                                                <div className="flex flex-col">
                                                    {editingItem?.id === item.id && editingItem?.field === 'title' ? (
                                                        <input 
                                                            autoFocus
                                                            value={editValue}
                                                            onChange={(e) => setEditValue(e.target.value)}
                                                            onBlur={handleSaveText}
                                                            onKeyDown={(e) => e.key === 'Enter' && handleSaveText()}
                                                            className="text-lg font-bold text-white border-b-2 border-ios-blue outline-none w-full bg-transparent"
                                                        />
                                                    ) : (
                                                        <span 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setEditingItem({ id: item.id, field: 'title' });
                                                                setEditValue(item.title || '');
                                                            }}
                                                            className="text-lg font-bold text-white truncate max-w-full cursor-text hover:text-ios-blue transition-colors"
                                                        >
                                                            {item.title || "点击编辑标题"}
                                                        </span>
                                                    )}
                                                    
                                                    {editingItem?.id === item.id && editingItem?.field === 'tagline' ? (
                                                        <input 
                                                            autoFocus
                                                            value={editValue}
                                                            onChange={(e) => setEditValue(e.target.value)}
                                                            onBlur={handleSaveText}
                                                            onKeyDown={(e) => e.key === 'Enter' && handleSaveText()}
                                                            className="text-sm font-medium text-white/80 border-b border-ios-blue outline-none w-full bg-transparent"
                                                        />
                                                    ) : (
                                                        <span 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setEditingItem({ id: item.id, field: 'tagline' });
                                                                setEditValue(item.tagline || '');
                                                            }}
                                                            className="text-sm font-medium text-white/80 truncate max-w-full cursor-text hover:text-ios-blue transition-colors mt-1"
                                                        >
                                                            {item.tagline || "点击编辑副标题"}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
      </div>

      {/* Geometric Modal Editor */}
      <AnimatePresence>
        {selectedImage && (
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-zinc-950/20 backdrop-blur-2xl flex items-center justify-center p-4 md:p-12"
            >
                <div className="glass-panel w-full max-w-7xl h-[90vh] grid grid-cols-1 md:grid-cols-12 overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.1)] border-white/60 bg-white/80">
                    <div className="md:col-span-8 p-12 bg-zinc-50/5 relative overflow-hidden flex items-center justify-center border-b md:border-b-0 md:border-r border-zinc-100 h-full">
                        {/* Modal Close Button moved to Sidebar or only one X used per screenshot */}
                        {!showEditor && (
                            <button 
                                onClick={() => setSelectedImage(null)}
                                className="absolute top-8 left-8 p-2.5 bg-white/80 hover:bg-white border border-zinc-200 text-zinc-400 hover:text-black rounded-2xl z-20 transition-all shadow-sm"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        )}

                        <div className="relative group shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] rounded-2xl overflow-hidden max-w-full bg-white transition-all duration-700">
                           <img 
                            src={selectedImage.result} 
                            alt="精修预览"
                            className="max-w-full max-h-[70vh] object-contain block" 
                           />
                           {showEditor && (
                             <canvas 
                                ref={canvasRef}
                                onPointerDown={startDrawing}
                                onPointerMove={draw}
                                onPointerUp={stopDrawing}
                                onPointerLeave={stopDrawing}
                                className="absolute inset-0 cursor-crosshair touch-none"
                                style={{ width: '100%', height: '100%' }}
                             />
                           )}
                           
                           <div className="absolute bottom-8 left-1/2 -translate-x-1/2 glass-panel bg-white/90 px-8 py-5 flex items-center gap-10 shadow-2xl border-white/80">
                                <div className="flex items-center gap-5 border-r border-zinc-200/50 pr-10">
                                    <button 
                                        onClick={() => setShowEditor(!showEditor)}
                                        className={`p-3 rounded-2xl transition-all ${showEditor ? 'bg-black text-white shadow-xl scale-110' : 'hover:bg-zinc-100 text-zinc-400'}`}
                                        title="笔刷模式"
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => handleDownload(selectedImage.result, `vision-canvas-export.png`)}
                                        className="p-3 hover:bg-zinc-100 text-zinc-400 rounded-2xl transition-colors"
                                        title="下载素材"
                                    >
                                        <Download className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => {
                                            setRefinementSteps([]);
                                            if (canvasRef.current) {
                                                const ctx = canvasRef.current.getContext('2d');
                                                ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                                            }
                                        }}
                                        className="p-3 hover:bg-zinc-100 text-zinc-400 rounded-2xl transition-colors"
                                        title="重置遮罩"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="flex items-center gap-5">
                                    <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-[0.3em]">笔刷直径</span>
                                    <input 
                                        type="range" 
                                        min="10" 
                                        max="150" 
                                        value={brushSize}
                                        onChange={(e) => setBrushSize(parseInt(e.target.value))}
                                        className="w-40 h-1 accent-black cursor-pointer bg-zinc-200 rounded-full appearance-none"
                                    />
                                </div>
                           </div>
                        </div>
                    </div>

                    <div className="md:col-span-4 p-8 flex flex-col h-full bg-white border-l border-zinc-100 overflow-hidden relative">
                        {/* Panel Header */}
                        <div className="flex justify-between items-center mb-8 pb-4">
                            <div className="flex items-center gap-2">
                                <Type className="w-4 h-4 text-zinc-400" />
                                <h3 className="font-bold text-sm text-zinc-900 tracking-tight">编辑文字</h3>
                            </div>
                            <button 
                                onClick={() => setSelectedImage(null)}
                                className="p-2 hover:bg-zinc-50 rounded-full transition-colors"
                            >
                                <X className="w-4 h-4 text-zinc-400" />
                            </button>
                        </div>

                        <section className="flex-1 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
                            <div className="space-y-3">
                                {refinementSteps.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-24 text-center space-y-5 bg-zinc-50/40 rounded-[2rem] border border-dashed border-zinc-200 p-8">
                                        <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-zinc-50">
                                            <Pencil className="w-5 h-5 text-zinc-200" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[11px] text-zinc-900 font-bold uppercase tracking-widest">点击画面标记文字</p>
                                            <p className="text-[10px] text-zinc-400 font-medium leading-relaxed">
                                                请在左侧图像上框选<br />
                                                需要修改的文字区域
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    refinementSteps.map((step) => (
                                        <motion.div 
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            key={step.id} 
                                            className="relative group"
                                        >
                                            <input 
                                                value={step.instruction}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setRefinementSteps(prev => prev.map(s => s.id === step.id ? { ...s, instruction: val } : s));
                                                }}
                                                placeholder="在此输入新内容..."
                                                className="w-full bg-zinc-50/60 border border-zinc-100 rounded-2xl p-5 pr-12 text-[13px] text-zinc-900 focus:bg-white focus:border-ios-blue/20 focus:ring-4 focus:ring-ios-blue/5 outline-none transition-all placeholder:text-zinc-300 font-medium"
                                            />
                                            <button 
                                                onClick={() => setRefinementSteps(prev => prev.filter(s => s.id !== step.id))}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 text-zinc-300 hover:text-red-500 hover:bg-white rounded-lg transition-all opacity-0 group-hover:opacity-100 shadow-sm border border-zinc-100"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </motion.div>
                                    ))
                                )}
                            </div>

                            {/* Settings Section matching reference */}
                            <div className="pt-8 space-y-6">
                                <div className="flex items-center justify-between border-t border-zinc-50 pt-8">
                                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">模型</span>
                                    <button 
                                        onClick={() => setSelectedModel(selectedModel === 'Nano Banana 2' ? 'Pro Pulse 3' : 'Nano Banana 2')}
                                        className="bg-white border border-zinc-100 hover:bg-zinc-50 px-5 py-2.5 rounded-2xl text-[11px] font-bold text-zinc-900 transition-all shadow-sm active:scale-95"
                                    >
                                        {selectedModel}
                                    </button>
                                </div>

                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">Turbo 加速模式</span>
                                        <p className="text-[9px] text-zinc-300 font-medium tracking-tight">极大提升生成响应速度</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button 
                                            onClick={() => setTurboMode(!turboMode)}
                                            className={`w-14 h-7 rounded-full p-1 transition-all relative flex items-center ${turboMode ? 'bg-zinc-900' : 'bg-zinc-100'}`}
                                        >
                                            <span className={`absolute left-3 text-[9px] font-bold transition-all ${turboMode ? 'opacity-0 -translate-x-1' : 'opacity-100 translate-x-0'}`}>OFF</span>
                                            <motion.div 
                                                initial={false}
                                                animate={{ x: turboMode ? 28 : 0 }}
                                                className="w-5 h-5 bg-white rounded-full shadow-md z-10" 
                                            />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Apply Button */}
                        <div className="mt-8 pt-8 border-t border-zinc-50 bg-white">
                            <button 
                                onClick={handleEdit}
                                disabled={isEditing || (editPrompt === '' && refinementSteps.length === 0)}
                                className="bg-zinc-950 hover:bg-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-300 text-white w-full py-5 rounded-[1.75rem] flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-2xl shadow-zinc-200"
                            >
                                {isEditing ? (
                                    <RefreshCw className="w-4 h-4 animate-spin opacity-50" />
                                ) : (
                                    <Sparkles className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                                )}
                                <span className="font-bold text-sm tracking-tight">应用修改</span>
                                {!isEditing && (
                                    <div className="flex items-center gap-1 opacity-60 ml-2">
                                        <div className="w-1 h-1 bg-white rounded-full" />
                                        <span className="text-[10px] font-bold">4</span>
                                    </div>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>
        )}
      </AnimatePresence>

      <footer className="py-12 border-t border-slate-200 px-12 max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-10">
         <div className="flex items-center gap-4">
            <div className="w-6 h-6 bg-slate-200 rounded-sm rotate-45"></div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest tracking-widest">© 2026 VisionCanvas 视觉引擎. 保留所有权利.</p>
         </div>
         <div className="flex gap-10 text-slate-300 font-black text-[9px] uppercase tracking-[0.25em]">
            <span className="hover:text-indigo-600 cursor-pointer transition-colors">API 开发文档</span>
            <span className="hover:text-indigo-600 cursor-pointer transition-colors">隐私政策</span>
            <span className="hover:text-indigo-600 cursor-pointer transition-colors">联系技术支持</span>
         </div>
      </footer>
    </main>
  );
}
