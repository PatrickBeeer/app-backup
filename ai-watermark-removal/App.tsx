
import React, { useState, useRef, useEffect } from 'react';
import Header from './components/Header';
import { ProcessingStep, RemovalMode } from './types';
import { fileToBase64, downloadImage } from './utils/imageUtils';
import { geminiService } from './services/geminiService';
import { AppProps } from '../../types';
export const AiWatermarkRemovalApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [step, setStep] = useState<ProcessingStep>(ProcessingStep.IDLE);
  const [mode, setMode] = useState<RemovalMode>(RemovalMode.AUTO);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [originalMimeType, setOriginalMimeType] = useState<string>('image/jpeg');
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [brushSize, setBrushSize] = useState(30);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    if (mode === RemovalMode.MANUAL && originalImage && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(79, 70, 229, 0.5)'; // Indigo-600 with opacity
      }
    }
  }, [mode, originalImage, step]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError("不支持的文件格式");
      return;
    }

    try {
      setError(null);
      setStep(ProcessingStep.UPLOADING);
      const base64 = await fileToBase64(file);
      setOriginalImage(base64);
      setOriginalMimeType(file.type || 'image/jpeg');
      setResultImage(null);
      setStep(ProcessingStep.IDLE);
    } catch (err) {
      setError("图片加载失败");
      setStep(ProcessingStep.ERROR);
    }
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.beginPath();
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || mode !== RemovalMode.MANUAL || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = (e as React.TouchEvent).touches[0].clientX;
      clientY = (e as React.TouchEvent).touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    ctx.lineWidth = brushSize;
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const getMaskBase64 = (): string | undefined => {
    if (mode === RemovalMode.AUTO || !canvasRef.current) return undefined;
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvasRef.current.width;
    tempCanvas.height = canvasRef.current.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return undefined;

    tempCtx.fillStyle = 'black';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    
    tempCtx.globalCompositeOperation = 'source-over';
    tempCtx.drawImage(canvasRef.current, 0, 0);
    
    const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    let hasDrawing = false;
    for (let i = 0; i < imgData.data.length; i += 4) {
      if (imgData.data[i + 3] > 0) {
        imgData.data[i] = 255;
        imgData.data[i+1] = 255;
        imgData.data[i+2] = 255;
        imgData.data[i+3] = 255;
        hasDrawing = true;
      }
    }
    if (!hasDrawing) return undefined;

    tempCtx.putImageData(imgData, 0, 0);
    return tempCanvas.toDataURL('image/png');
  };

  const processImage = async () => {
    if (!originalImage) return;
    try {
      setError(null);
      const mask = getMaskBase64();
      setStep(ProcessingStep.DETECTING);
      // Check balance before generation (no deduction yet)
      const price = costs?.REMOVE_WATERMARK ?? 8;
      if (!platform.checkBalance(price)) {
        return; // Platform will show recharge modal
      }

      const result = await geminiService.processWatermarkRemoval(originalImage, originalMimeType, mask);

      setResultImage(result);
      setStep(ProcessingStep.COMPLETED);
      await platform.refreshCredits?.();
    } catch (err: any) {
      setError(err.message || "处理失败，请重试");
      setStep(ProcessingStep.ERROR);
    }
  };

  const isProcessing = step === ProcessingStep.DETECTING || step === ProcessingStep.REMOVING;

  return (
    <div className="h-screen flex flex-col bg-slate-100 overflow-hidden">
      <Header />
      
      <main className="flex-grow flex flex-col md:flex-row overflow-hidden">
        {/* SIDEBAR: Configuration & Input */}
        <aside className="w-full md:w-80 lg:w-96 bg-white border-r border-slate-200 flex flex-col flex-shrink-0 z-10 shadow-sm overflow-y-auto">
          <div className="p-6 space-y-8">
            {/* Header Area */}
            <div>
              <h2 className="text-xl font-bold text-slate-900">工作台</h2>
              <p className="text-sm text-slate-500 mt-1">上传图片并配置去水印参数</p>
              <p className="text-xs text-slate-500 mt-2">生成成功后扣费 <span className="font-semibold text-slate-900">{costs?.REMOVE_WATERMARK ?? 8}</span> 积分</p>
            </div>

            {/* Upload Section */}
            <div className="space-y-3">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">资源文件</label>
              {!originalImage ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-all group"
                >
                  <i className="fas fa-image text-slate-300 text-3xl mb-4 group-hover:text-indigo-500 transition-colors"></i>
                  <p className="text-sm font-bold text-slate-600">点击上传</p>
                  <p className="text-xs text-slate-400 mt-1">PNG, JPG, WebP</p>
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
                </div>
              ) : (
                <div className="relative group">
                  <div className="aspect-video bg-slate-900 rounded-xl overflow-hidden shadow-sm relative">
                    <img src={originalImage} alt="Preview" className="w-full h-full object-contain" />
                    {mode === RemovalMode.MANUAL && (
                      <canvas
                        ref={canvasRef}
                        width={1000}
                        height={1000}
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        className="absolute inset-0 w-full h-full z-10 opacity-70 cursor-crosshair"
                      />
                    )}
                  </div>
                  <button 
                    onClick={() => { setOriginalImage(null); setOriginalMimeType('image/jpeg'); setResultImage(null); }}
                    className="absolute -top-2 -right-2 bg-red-500 text-white w-6 h-6 rounded-full text-xs shadow-lg hover:bg-red-600 transition flex items-center justify-center"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                  {mode === RemovalMode.MANUAL && (
                    <div className="flex items-center justify-between mt-2">
                      <button onClick={clearCanvas} className="text-xs font-bold text-indigo-600 hover:text-indigo-800">
                        <i className="fas fa-undo mr-1"></i> 撤销涂抹
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Mode Settings */}
            <div className="space-y-4">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">处理模式</label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                <button 
                  onClick={() => setMode(RemovalMode.AUTO)}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${mode === RemovalMode.AUTO ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
                >
                  智能自动
                </button>
                <button 
                  onClick={() => setMode(RemovalMode.MANUAL)}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${mode === RemovalMode.MANUAL ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
                >
                  手动圈选
                </button>
              </div>

              {mode === RemovalMode.MANUAL && (
                <div className="space-y-3 p-4 bg-indigo-50 rounded-xl border border-indigo-100 animate-in fade-in slide-in-from-top-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-indigo-700">画笔粗细</span>
                    <span className="text-xs font-black text-indigo-600">{brushSize}px</span>
                  </div>
                  <input 
                    type="range" min="10" max="100" value={brushSize} 
                    onChange={(e) => setBrushSize(parseInt(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                  <p className="text-[10px] text-indigo-400 leading-tight">请在左侧预览图中通过鼠标涂抹想要去除的水印区域。</p>
                </div>
              )}
            </div>

            {/* Action Area */}
            <div className="pt-4 border-t border-slate-100">
              <button 
                disabled={!originalImage || isProcessing}
                onClick={processImage}
                className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-3 ${
                  !originalImage || isProcessing 
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                  : 'bg-indigo-600 text-white shadow-xl shadow-indigo-200 hover:bg-indigo-700 hover:-translate-y-0.5'
                }`}
              >
                {isProcessing ? (
                  <>
                    <i className="fas fa-circle-notch animate-spin"></i>
                    正在处理...
                  </>
                ) : (
                  <>
                    <i className="fas fa-magic"></i>
                    一键祛除水印
                  </>
                )}
              </button>
              {error && <p className="text-red-500 text-[10px] mt-2 font-bold text-center animate-pulse">{error}</p>}
            </div>
          </div>

          <div className="mt-auto p-6 text-center border-t border-slate-50">
             <p className="text-[10px] text-slate-300 font-bold uppercase tracking-tighter">AI Powered Visual Engine v3.1</p>
          </div>
        </aside>

        {/* MAIN CANVAS: Result Display */}
        <section className="flex-grow bg-slate-200 relative overflow-hidden flex flex-col">
          {/* Toolbar */}
          <div className="bg-white/50 backdrop-blur-md border-b border-slate-200/50 px-6 py-3 flex justify-between items-center z-10">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">输出画布</h3>
            {resultImage && (
              <div className="flex gap-2">
                <button 
                  onClick={() => downloadImage(resultImage)}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-2"
                >
                  <i className="fas fa-download"></i> 高清导出
                </button>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-grow flex items-center justify-center p-8 md:p-12">
            <div className="relative w-full h-full max-w-5xl max-h-full flex items-center justify-center bg-slate-300 rounded-3xl shadow-inner border-2 border-slate-200 overflow-hidden pattern-dots">
              {isProcessing ? (
                <div className="flex flex-col items-center gap-6 animate-pulse">
                  <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center">
                    <i className="fas fa-sparkles text-white text-4xl animate-bounce"></i>
                  </div>
                  <div className="space-y-2 text-center">
                    <p className="text-white font-black text-lg uppercase tracking-widest">正在重构像素</p>
                    <p className="text-white/60 text-xs font-medium">神经网络正在根据周围背景完美修复图像...</p>
                  </div>
                </div>
              ) : resultImage ? (
                <div className="w-full h-full flex items-center justify-center p-4">
                  <img src={resultImage} alt="Final Output" className="max-w-full max-h-full object-contain rounded-xl shadow-2xl animate-in fade-in zoom-in duration-500" />
                </div>
              ) : (
                <div className="text-center space-y-4 opacity-30 select-none">
                  <i className="fas fa-images text-8xl text-slate-400"></i>
                  <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">等待输入</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      <style>{`
        .pattern-dots {
          background-image: radial-gradient(#94a3b8 0.5px, transparent 0.5px);
          background-size: 24px 24px;
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #4f46e5;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
      `}</style>
    </div>
  );
};

