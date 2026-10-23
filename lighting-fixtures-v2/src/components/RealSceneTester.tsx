import React, { useRef, useState, useEffect } from 'react';
import { 
  Upload, 
  X, 
  Download, 
  Loader2,
  Sparkles,
  Home,
  Lightbulb,
  Maximize2,
  Box,
  Monitor,
  Smartphone,
  Square,
  AlertCircle
} from 'lucide-react';
import { motion } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { AspectRatio, Resolution } from '../types';
import { generateGeminiContent } from '../lib/backendApi';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface RealSceneTesterProps {
  referenceImage: string | null;
  setReferenceImage: (img: string | null) => void;
  setShowFullImage: (img: string | null) => void;
  handleDownload: (img: string) => void;
}

export function RealSceneTester({
  referenceImage,
  setReferenceImage,
  setShowFullImage,
  handleDownload,
}: RealSceneTesterProps) {
  const IMAGE_COST = 10;
  const roomInputRef = useRef<HTMLInputElement>(null);
  const lampInputRef = useRef<HTMLInputElement>(null);
  
  const [roomImage, setRoomImage] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [resolution, setResolution] = useState<Resolution>('2K');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [diagnosisReport, setDiagnosisReport] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getClosestAspectRatio = (width: number, height: number): AspectRatio => {
    const ratio = width / height;
    const supported: { label: AspectRatio; value: number }[] = [
      { label: '1:1', value: 1 },
      { label: '3:4', value: 3 / 4 },
      { label: '4:3', value: 4 / 3 },
      { label: '9:16', value: 9 / 16 },
      { label: '16:9', value: 16 / 9 },
    ];
    
    let closest = supported[0];
    let minDiff = Math.abs(ratio - closest.value);
    
    for (let i = 1; i < supported.length; i++) {
      const diff = Math.abs(ratio - supported[i].value);
      if (diff < minDiff) {
        minDiff = diff;
        closest = supported[i];
      }
    }
    
    return closest.label;
  };

  const handleRoomUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const imageData = event.target?.result as string;
        setRoomImage(imageData);
        
        // Detect aspect ratio
        const img = new Image();
        img.onload = () => {
          const detectedRatio = getClosestAspectRatio(img.naturalWidth, img.naturalHeight);
          setAspectRatio(detectedRatio);
        };
        img.src = imageData;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLampUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setReferenceImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const startTesting = async () => {
    if (!roomImage || !referenceImage) {
      setError('请同时上传房间实景图和灯具产品图');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedImage(null);

    try {
      const prompt = `Please place the lamp from the second image into the room shown in the first image. 
      The lamp should be positioned naturally (e.g., if it's a ceiling lamp, place it on the ceiling; if it's a floor lamp, place it on the floor). 
      CRITICAL: The lamp must be in a REALISTIC, SMALLER PROPORTION to the room (occupying about 1/12 to 1/10 of the frame). It should NOT be oversized.
      Ensure the lighting from the lamp matches the room's environment, creating realistic shadows and highlights. 
      Maintain a clean, straight-on professional architectural photography perspective.
      The final result should look like a real photograph of the lamp installed in that specific room. 
      High-end, photorealistic, 8k resolution.`;

      const roomBase64 = roomImage.split(',')[1];
      const roomMimeType = roomImage.split(',')[0].split(':')[1].split(';')[0];
      
      const lampBase64 = referenceImage.split(',')[1];
      const lampMimeType = referenceImage.split(',')[0].split(':')[1].split(';')[0];

      const response = await generateGeminiContent({
        model: 'gemini-3.1-flash-image-preview',
        billing_task: 'image_gen',
        contents: {
          parts: [
            { inlineData: { data: roomBase64, mimeType: roomMimeType } },
            { inlineData: { data: lampBase64, mimeType: lampMimeType } },
            { text: prompt }
          ]
        },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio,
            imageSize: resolution === '4K' ? '4K' : '2K'
          }
        }
      });

      let foundImage = false;
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          setGeneratedImage(`data:image/png;base64,${part.inlineData.data}`);
          foundImage = true;
          break;
        }
      }

      if (!foundImage) {
        throw new Error('未能生成图片，请重试');
      }
    } catch (err) {
      console.error('Real scene testing error:', err);
      const errorMessage = err instanceof Error ? err.message : '生成失败，请稍后重试';
      const sanitizedError = errorMessage.replace(/gemini(-\d+\.\d+)?(-flash|-pro)?(-image-preview)?/gi, 'AI');
      setError(sanitizedError);
    } finally {
      setIsGenerating(false);
    }
  };

  const generateDiagnosisReport = async () => {
    if (!generatedImage) return;
    setIsGeneratingReport(true);
    setDiagnosisReport(null);

    try {
      const prompt = `请根据这张灯具实景融合后的图片，生成一份极简的专业灯光诊断报告。
      要求包含以下三个部分，语言专业且富有洞察力：
      1. 诊断报告：(标题)
      2. 整体评价：(评价亮度和整体照度是否达标)
      3. 风险提醒：(指出可能存在的暗角、眩光或阴影问题，并给出建议)
      4. 健康建议：(从显色性、护眼或氛围感角度给出建议)
      请直接返回文本内容，不要包含 Markdown 格式。`;

      const base64Data = generatedImage.split(',')[1];
      const mimeType = generatedImage.split(',')[0].split(':')[1].split(';')[0];

      const result = await generateGeminiContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { data: base64Data, mimeType: mimeType } },
            { text: prompt }
          ]
        }
      });

      setDiagnosisReport(result.text);
    } catch (err) {
      console.error('Error generating report:', err);
      setDiagnosisReport('报告生成失败，请重试。');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  return (
    <>
      {/* Settings Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: 380, opacity: 1 }}
        className="glass-panel relative z-20 flex flex-col overflow-hidden border-r border-white/40 bg-white/40"
      >
        <div className="flex h-20 items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-black text-white">
              <Home className="h-6 w-6" />
            </div>
            <span className="text-lg font-bold tracking-tight text-text-deep">实景试灯</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-hide">

          {/* Lamp Upload (Now Step 1) */}
          <section className="mb-8">
            <h3 className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-text-cool">1. 选择灯具产品</h3>
            <div 
              onClick={() => lampInputRef.current?.click()}
              className={cn(
                "group relative flex aspect-video cursor-pointer flex-col items-center justify-center rounded-[1.5rem] bg-white/40 transition-all hover:bg-white/60 overflow-hidden",
                referenceImage && "p-0"
              )}
            >
              <input 
                type="file" 
                ref={lampInputRef} 
                onChange={handleLampUpload} 
                className="hidden" 
                accept="image/*"
              />
              {referenceImage ? (
                <>
                  <img src={referenceImage} alt="Lamp" referrerPolicy="no-referrer" className="h-full w-full object-contain p-4" />
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setReferenceImage(null);
                    }}
                    className="absolute top-3 right-3 rounded-full bg-black/80 p-2 text-white hover:bg-red-500 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </>
              ) : (
                <>
                  <Lightbulb className="mb-2 h-6 w-6 text-text-cool group-hover:text-text-deep transition-colors" />
                  <p className="text-xs font-medium text-text-cool text-center px-4">点击上传灯具白底图/产品图</p>
                </>
              )}
            </div>
          </section>

          {/* Room Upload (Now Step 2) */}
          <section className="mb-8">
            <h3 className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-text-cool">2. 上传您的房间实景</h3>
            <div 
              onClick={() => roomInputRef.current?.click()}
              className={cn(
                "group relative flex aspect-video cursor-pointer flex-col items-center justify-center rounded-[1.5rem] bg-white/40 transition-all hover:bg-white/60 overflow-hidden",
                roomImage && "p-0"
              )}
            >
              <input 
                type="file" 
                ref={roomInputRef} 
                onChange={handleRoomUpload} 
                className="hidden" 
                accept="image/*"
              />
              {roomImage ? (
                <>
                  <img src={roomImage} alt="Room" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setRoomImage(null);
                    }}
                    className="absolute top-3 right-3 rounded-full bg-black/80 p-2 text-white hover:bg-red-500 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </>
              ) : (
                <>
                  <Upload className="mb-2 h-6 w-6 text-text-cool group-hover:text-text-deep transition-colors" />
                  <p className="text-xs font-medium text-text-cool text-center px-4">点击上传客厅/卧室实景图</p>
                </>
              )}
            </div>
          </section>

          {/* Options */}
          <section className="mb-10">
            <h3 className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-text-cool">生成选项</h3>
            
            <div>
              <p className="mb-3 text-[10px] font-bold text-text-cool/70">清晰度切换</p>
              <div className="flex rounded-2xl bg-white/40 p-1.5">
                {['2K', '4K'].map((res) => (
                  <button
                    key={res}
                    onClick={() => setResolution(res as Resolution)}
                    className={cn(
                      "flex-1 rounded-xl py-2 text-xs font-bold transition-all",
                      resolution === res 
                        ? "bg-black text-white shadow-sm" 
                        : "text-text-cool hover:text-text-deep"
                    )}
                  >
                    {res === '2K' ? '高清 2K' : '超清 4K'}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {error && (
            <div className="mb-6 flex items-start gap-3 rounded-2xl bg-red-50 p-4 border border-red-100">
              <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
              <p className="text-xs font-medium text-red-600 leading-relaxed">{error}</p>
            </div>
          )}
        </div>

        {/* Generate Button */}
        <div className="p-6">
          <button
            onClick={startTesting}
            disabled={isGenerating || !roomImage || !referenceImage}
            className="group relative w-full overflow-hidden rounded-2xl bg-black py-5 font-bold text-white shadow-xl transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
          >
            <div className="relative z-10 flex items-center justify-center gap-3">
              {isGenerating ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>实景融合中...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  <span>一键生成实景图 ({IMAGE_COST}积分)</span>
                </>
              )}
            </div>
          </button>
        </div>
      </motion.aside>

      {/* Main Viewport */}
      <main className="relative flex-1 overflow-y-auto scrollbar-hide bg-[#f0f2f5]">
        <div className="flex h-full flex-col items-center justify-center p-8">
          <div className={cn(
            "glass-panel relative flex w-full max-w-2xl items-center justify-center overflow-hidden transition-all duration-500 bg-white/60 backdrop-blur-md border border-white/40 rounded-[2.5rem] shadow-2xl",
            aspectRatio === '1:1' ? 'aspect-square' : 
            aspectRatio === '3:4' ? 'aspect-[3/4]' :
            aspectRatio === '4:3' ? 'aspect-[4/3]' :
            aspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-[16/9]'
          )}>
            {isGenerating ? (
              <div className="flex flex-col items-center px-12 text-center">
                <div className="relative h-32 w-32 overflow-hidden rounded-3xl bg-white/20">
                  <motion.div 
                    animate={{ top: ['0%', '100%', '0%'] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="absolute left-0 right-0 h-1 bg-black shadow-[0_0_20px_rgba(0,0,0,1)]"
                  />
                  <div className="flex h-full w-full items-center justify-center">
                    <Loader2 className="h-10 w-10 animate-spin text-black/10" />
                  </div>
                </div>
                <p className="mt-8 text-xs font-bold tracking-[0.2em] text-black animate-pulse">
                  INTEGRATING LAMP...
                </p>
                <p className="mt-4 max-w-xs text-[10px] font-medium text-text-cool leading-relaxed">
                  正在通过 AI 将灯具完美融合进您的房间实景，匹配光影与透视关系...
                </p>
              </div>
            ) : generatedImage ? (
              <div className="group relative h-full w-full">
                <img 
                  src={generatedImage} 
                  alt="Generated result" 
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setShowFullImage(generatedImage)}
                      className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-black shadow-xl transition-all hover:scale-110"
                    >
                      <Maximize2 size={20} />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center text-text-cool/30">
                <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-black/5">
                  <Home size={48} />
                </div>
                <p className="text-sm font-bold tracking-tight">等待上传实景图与灯具</p>
                <p className="mt-2 text-[10px] font-medium text-center px-12">上传完成后，AI 将为您展示灯具安装在您家中的真实效果</p>
              </div>
            )}
          </div>

          {/* AI Diagnosis Report & Download Buttons (Below Image) */}
          {generatedImage && (
            <div className="mt-8 flex w-full max-w-2xl flex-col gap-4">
              <div className="flex items-center gap-3">
                {!diagnosisReport && (
                  <button 
                    onClick={generateDiagnosisReport}
                    disabled={isGeneratingReport}
                    className="flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-xs font-bold text-black shadow-xl transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                  >
                    {isGeneratingReport ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>正在分析光照环境...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 text-amber-500" />
                        <span>生成诊断报告</span>
                      </>
                    )}
                  </button>
                )}
                <button 
                  onClick={() => handleDownload(generatedImage)}
                  className="flex items-center gap-2 rounded-2xl bg-black px-6 py-3 text-xs font-bold text-white shadow-xl transition-all hover:scale-105 active:scale-95"
                >
                  <Download size={16} />
                  <span>下载图片</span>
                </button>
              </div>

              {diagnosisReport && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-3xl bg-white/90 p-6 shadow-2xl backdrop-blur-xl border border-white/40"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-amber-500" />
                      <span className="text-xs font-bold tracking-wider text-black">AI 智能诊断报告</span>
                    </div>
                    <button 
                      onClick={() => setDiagnosisReport(null)}
                      className="rounded-full p-1 hover:bg-black/5 transition-colors"
                    >
                      <X size={14} className="text-text-cool" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    {diagnosisReport.split('\n').map((line, i) => {
                      if (!line.trim()) return null;
                      const [label, ...rest] = line.split('：');
                      return (
                        <div key={i} className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">{label}</span>
                          <p className="text-xs leading-relaxed text-text-deep">{rest.join('：')}</p>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
