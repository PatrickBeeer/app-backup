import React, { useRef, useState } from 'react';
import { 
  Upload, 
  X, 
  Maximize2, 
  Download, 
  Image as ImageIcon,
  Loader2,
  Sparkles,
  RefreshCw,
  Square,
  Smartphone,
  Monitor
} from 'lucide-react';
import { motion } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { STYLE_PRESETS } from '../constants';
import { AspectRatio, Resolution } from '../types';
import { generateGeminiContent } from '../lib/backendApi';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface LightingStudioGeneratorProps {
  referenceImage: string | null;
  setReferenceImage: (img: string | null) => void;
  selectedStyle: string;
  setSelectedStyle: (style: string) => void;
  prompt: string;
  setPrompt: (prompt: string) => void;
  aspectRatio: AspectRatio;
  setAspectRatio: (ratio: AspectRatio) => void;
  resolution: Resolution;
  setResolution: (res: Resolution) => void;
  setShowFullImage: (img: string | null) => void;
  handleDownload: (img: string) => void;
}

export function LightingStudioGenerator({
  referenceImage,
  setReferenceImage,
  selectedStyle,
  setSelectedStyle,
  prompt,
  setPrompt,
  aspectRatio,
  setAspectRatio,
  resolution,
  setResolution,
  setShowFullImage,
  handleDownload
}: LightingStudioGeneratorProps) {
  const IMAGE_COST = 10;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [generatedImages, setGeneratedImages] = useState<(string | null)[]>([null, null]);
  const [generatingStates, setGeneratingStates] = useState<boolean[]>([false, false]);
  const [errorStates, setErrorStates] = useState<(string | null)[]>([null, null]);
  const [isStartLocked, setIsStartLocked] = useState(false);
  const canGenerate = Boolean(referenceImage);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setReferenceImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setReferenceImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const [lightState, setLightState] = useState<'ON' | 'OFF' | null>(null);

  const analyzeLightState = async (image: string) => {
    try {
      const result = await generateGeminiContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { data: image.split(',')[1], mimeType: 'image/png' } },
            { text: "Is the lamp in this image turned ON (emitting light) or OFF? Answer only 'ON' or 'OFF'." }
          ]
        }
      });
      const state = result.text.trim().toUpperCase();
      return state === 'ON' ? 'ON' : 'OFF';
    } catch (error) {
      console.error('Failed to analyze light state:', error);
      return 'ON'; // Default to ON
    }
  };

  const generateImageAtIndex = async (index: number, currentLightState: 'ON' | 'OFF') => {
    if (generatingStates[index] || !canGenerate) return;
    
    setGeneratingStates(prev => {
      const next = [...prev];
      next[index] = true;
      return next;
    });
    setErrorStates(prev => {
      const next = [...prev];
      next[index] = null;
      return next;
    });

    try {
      const style = STYLE_PRESETS.find(s => s.id === selectedStyle);

      let defaultScene = 'Cozy modern living room with warm wooden furniture and soft textiles';
      
      if (selectedStyle === 'minimalist-ceiling') {
        defaultScene = 'Pure seamless ceiling background, off-white or light gray, infinite space effect';
      } else if (selectedStyle === 'luxury-crystal') {
        defaultScene = 'Grand and spacious luxury living room with high ceilings and ornate details';
      }
      
      const isMinimalistCeiling = selectedStyle === 'minimalist-ceiling';
      
      const commonConsistencyDirective = `
        CONSISTENCY: The environment and lighting must remain highly consistent between Image 1 and Image 2.
      `;

      const typeSpecificPrompt = `
        E-COMMERCE MAIN IMAGE (HERO SHOT - SCENE ${index === 0 ? 'A' : 'B'}). 
        ${commonConsistencyDirective}
        The lamp should be in a TINY, MINIMALIST, COMPACT PROPORTION to the room. It should occupy approximately 1/40 to 1/35 of the total image area.
        Positioned in the UPPER-CENTER or CENTER of the frame.
        ${isMinimalistCeiling ? 'Pure minimalist architectural space or clean studio background.' : `The lamp must be SEAMLESSLY INTEGRATED into the following environment: ${prompt || defaultScene}.`}
        ${index === 1 ? 'Show a dramatically different camera angle from Image 1 (wide-angle perspective), while keeping lamp size and light state identical.' : ''}
      `;

      const fullPrompt = `
        E-commerce professional photography for lighting fixtures in a realistic studio or home setting. 
        The lamp is the absolute HERO of the shot but presented in a sophisticated, small scale.
        The lamp is TURNED ${currentLightState} ${currentLightState === 'ON' ? 'and GLOWING, providing the primary light source' : 'and NOT emitting any light'}.
        ${style?.prompt || ''} 
        ${typeSpecificPrompt}
        
        CRITICAL INSTRUCTIONS:
        1. NO TEXT: Absolutely no text, logos, or characters should appear in the image.
        2. REALISTIC SCALE: The lamp must have a TINY, REFINED SIZE relative to the room (approximately 1/40 to 1/35 of the total image height). It must NOT appear oversized or dominate the entire ceiling. The lamp should feel like a sophisticated accent in a large, spacious room.
        3. CEILING MOUNTED: The lamp MUST be securely mounted on the CEILING. It must NOT be floating in mid-air or mounted on a wall.
        4. CONSISTENT LIGHT STATE: The lamp MUST be ${currentLightState === 'ON' ? 'ON and illuminating the scene' : 'OFF and not emitting light'}. This state MUST be consistent across all shots.
        5. REALISTIC STUDIO LIGHTING: The environment must be lit like a professional photography studio or a real high-end interior. ${currentLightState === 'ON' ? 'The light must naturally illuminate the ceiling and the surrounding space with soft, realistic falloff.' : 'The scene should be lit by natural ambient light from windows or studio softboxes, while the lamp itself remains OFF.'}
        6. CEILING INTERACTION: ${currentLightState === 'ON' ? 'The light MUST create a soft, natural glow on the ceiling surface directly around the mounting point.' : 'The ceiling should have natural ambient shadows and highlights, with no light emitting from the lamp.'}
        7. NO HARSH CEILING SHADOWS: The ceiling above the lamp must be clean and free of harsh, patterned, or circular shadows.
        8. EXACT MOUNTING BASE: The mounting base (canopy) attached to the ceiling must match the shape, material, and design of the reference image EXACTLY.
        9. VISUAL ANALYSIS: Match the mounting hardware and LAMP ARM structure EXACTLY as shown in the reference image.
        10. Professional 8k resolution, cinematic lighting, photorealistic.
      `;

      const parts: any[] = [{ text: fullPrompt }];
      if (referenceImage) {
        parts.push({
          inlineData: {
            data: referenceImage.split(',')[1],
            mimeType: 'image/png'
          }
        });
      }

      const response = await generateGeminiContent({
        model: 'gemini-3.1-flash-image-preview',
        billing_task: 'image_gen',
        contents: { parts },
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
          const newImageUrl = `data:image/png;base64,${part.inlineData.data}`;
          setGeneratedImages(prev => {
            const next = [...prev];
            next[index] = newImageUrl;
            return next;
          });
          setIsStartLocked(false);
          foundImage = true;
          break;
        }
      }
      
      if (!foundImage) {
        throw new Error('未生成图片数据，请尝试调整描述词或重试');
      }
    } catch (error) {
      console.error(`Generation failed for image ${index}:`, error);
      const errorMessage = error instanceof Error ? error.message : '生成失败，请重试';
      const sanitizedError = errorMessage.replace(/gemini(-\d+\.\d+)?(-flash|-pro)?(-image-preview)?/gi, 'AI');
      setErrorStates(prev => {
        const next = [...prev];
        next[index] = sanitizedError;
        return next;
      });
    } finally {
      setGeneratingStates(prev => {
        const next = [...prev];
        next[index] = false;
        return next;
      });
    }
  };

  const startRendering = async () => {
    if (generatingStates.some(s => s) || !canGenerate) return;
    setIsStartLocked(true);

    setGeneratedImages([null, null]);
    
    // Determine light state once for consistency
    const state = await analyzeLightState(referenceImage);
    setLightState(state);

    // Generate both images in parallel for better performance and to avoid sequential state issues
    try {
      await Promise.all([
        generateImageAtIndex(0, state),
        generateImageAtIndex(1, state)
      ]);
    } finally {
      setIsStartLocked(false);
    }
  };

  const handleRegenerate = async (index: number) => {
    if (!canGenerate) return;
    
    let state = lightState;
    if (!state) {
      state = await analyzeLightState(referenceImage);
      setLightState(state);
    }
    
    await generateImageAtIndex(index, state);
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
              <Sparkles className="h-6 w-6" />
            </div>
            <span className="text-lg font-bold tracking-tight text-text-deep">灯具影棚配置</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-hide">
          {/* Reference Upload */}
          <section className="mb-10">
            <h3 className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-text-cool">产品参考上传</h3>
            <div 
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "group relative flex aspect-video cursor-pointer flex-col items-center justify-center rounded-[1.5rem] bg-white/40 transition-all hover:bg-white/60",
                referenceImage && "p-0"
              )}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleUpload} 
                className="hidden" 
                accept="image/*"
              />
              {referenceImage ? (
                <>
                  <img src={referenceImage} alt="Reference" referrerPolicy="no-referrer" className="h-full w-full rounded-[1.5rem] object-contain p-2" />
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
                  <Upload className="mb-2 h-6 w-6 text-text-cool group-hover:text-text-deep transition-colors" />
                  <p className="text-xs font-medium text-text-cool">点击或拖拽上传产品图</p>
                </>
              )}
            </div>
          </section>

          {/* Style Matrix */}
          <section className="mb-10">
            <h3 className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-text-cool">风格选择</h3>
            <div className="grid grid-cols-2 gap-3">
              {STYLE_PRESETS.map((style) => (
                <button
                  key={style.id}
                  onClick={() => setSelectedStyle(style.id)}
                  className={cn(
                    "rounded-2xl py-3 text-xs font-semibold transition-all",
                    selectedStyle === style.id 
                      ? "bg-black text-white shadow-lg scale-[1.02]" 
                      : "bg-white/40 text-text-cool hover:bg-white/60 hover:text-text-deep"
                  )}
                >
                  {style.name}
                </button>
              ))}
            </div>
          </section>

          {/* Text Prompt */}
          <section className="mb-10">
            <h3 className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-text-cool">自定义场景描述</h3>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述场景背景（如：极简客厅、大理石背景...）"
              className="h-28 w-full rounded-2xl bg-white/40 p-4 text-sm font-medium outline-none transition-all focus:bg-white/60 placeholder:text-text-cool/50"
            />
          </section>

          {/* Output Settings */}
          <section className="mb-10">
            <h3 className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-text-cool">输出规格配置</h3>
            
            <div className="mb-6">
              <p className="mb-3 text-[10px] font-bold text-text-cool/70">比例选择</p>
              <div className="flex gap-3">
                {[
                  { id: '1:1', icon: Square },
                  { id: '3:4', icon: Smartphone },
                  { id: '9:16', icon: Smartphone },
                  { id: '16:9', icon: Monitor },
                ].map((ratio) => (
                  <button
                    key={ratio.id}
                    onClick={() => setAspectRatio(ratio.id as AspectRatio)}
                    className={cn(
                      "flex flex-1 flex-col items-center justify-center rounded-2xl py-3 transition-all",
                      aspectRatio === ratio.id 
                        ? "bg-black text-white shadow-md" 
                        : "bg-white/40 text-text-cool hover:bg-white/60"
                    )}
                  >
                    <ratio.icon size={16} />
                    <span className="mt-1.5 text-[10px] font-bold">{ratio.id}</span>
                  </button>
                ))}
              </div>
            </div>

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

          {/* Lighting Logic Info */}
          <section className="mb-6 rounded-3xl bg-black/5 p-5 border border-white/20">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-3.5 w-3.5 text-black/40" />
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-cool">光影逻辑说明</h3>
            </div>
            <p className="text-[11px] leading-relaxed text-text-cool/80">
              系统采用“实景模拟+专业影棚补光”逻辑，特别针对吸顶灯优化了天花板的光影互动与环境漫反射，确保灯具在实际场景中的融合度与真实质感。
            </p>
          </section>
        </div>

        {/* Generate Button */}
        <div className="p-6">
          <button
            onClick={startRendering}
            disabled={isStartLocked || !canGenerate}
            className="group relative w-full overflow-hidden rounded-2xl bg-black py-5 font-bold text-white shadow-xl transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
          >
            <div className="relative z-10 flex items-center justify-center gap-3">
              {isStartLocked ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>批量生成中...</span>
                </>
              ) : !canGenerate ? (
                <>
                  <Sparkles className="h-5 w-5" />
                  <span>请先上传图片 ({IMAGE_COST * 2}积分)</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  <span>开始生成2张灯具图 ({IMAGE_COST * 2}积分)</span>
                </>
              )}
            </div>
          </button>
        </div>
      </motion.aside>

      {/* Main Viewport */}
      <main className="relative flex-1 overflow-y-auto scrollbar-hide bg-[#f0f2f5]">
        <div className="p-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            {[0, 1].map((index) => (
              <div key={index} className="flex flex-col gap-4">
                <div className="flex items-center justify-between px-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-text-cool">
                    {index === 0 ? '图 1：影棚 A' : '图 2：影棚 B'}
                  </span>
                  <button 
                    onClick={() => handleRegenerate(index)}
                    disabled={generatingStates.some(s => s) || !canGenerate}
                    className="flex items-center gap-1.5 rounded-full bg-white/60 px-3 py-1 text-[10px] font-bold text-text-deep backdrop-blur-md hover:bg-white transition-colors shadow-sm disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={cn(generatingStates[index] && "animate-spin")} />
                    <span>{generatingStates[index] ? '生成中...' : `${generatedImages[index] || errorStates[index] ? '重新生成' : '立即生成'} (${IMAGE_COST}积分)`}</span>
                  </button>
                </div>

                <div className={cn(
                  "glass-panel relative flex items-center justify-center overflow-hidden transition-all duration-500 bg-white/60 backdrop-blur-md border border-white/40 rounded-[2rem] shadow-xl",
                  aspectRatio === '1:1' ? 'aspect-square' : 
                  aspectRatio === '3:4' ? 'aspect-[3/4]' :
                  aspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-[16/9]',
                  generatingStates[index] && "opacity-80"
                )}>
                  {generatingStates[index] ? (
                    <div className="flex flex-col items-center">
                      <div className="relative h-24 w-24 overflow-hidden rounded-2xl bg-white/20">
                        <motion.div 
                          animate={{ top: ['0%', '100%', '0%'] }}
                          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                          className="absolute left-0 right-0 h-1 bg-accent-blue shadow-[0_0_15px_rgba(0,122,255,0.8)]"
                        />
                        <div className="flex h-full w-full items-center justify-center">
                          <Loader2 className="h-8 w-8 animate-spin text-accent-blue/20" />
                        </div>
                      </div>
                      <p className="mt-4 text-[10px] font-bold tracking-[0.2em] text-accent-blue animate-pulse">GENERATING...</p>
                    </div>
                  ) : errorStates[index] ? (
                    <div className="flex flex-col items-center p-6 text-center">
                      <X className="mb-2 h-8 w-8 text-red-400" />
                      <p className="text-[10px] font-medium text-red-500">{errorStates[index]}</p>
                      <button 
                        onClick={() => handleRegenerate(index)}
                        disabled={!canGenerate}
                        className="mt-4 rounded-xl bg-black px-4 py-2 text-[10px] font-bold text-white disabled:opacity-50"
                      >
                        重试 ({IMAGE_COST}积分)
                      </button>
                    </div>
                  ) : generatedImages[index] ? (
                    <div className="group relative h-full w-full">
                      <img 
                        src={generatedImages[index]!} 
                        alt={`Generated ${index}`} 
                        referrerPolicy="no-referrer"
                        className="h-full w-full cursor-zoom-in object-contain p-4"
                        onClick={() => setShowFullImage(generatedImages[index]!)}
                      />
                      <div className="absolute bottom-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleDownload(generatedImages[index]!)}
                          className="rounded-full bg-white/90 p-2 text-text-deep shadow-lg hover:bg-white"
                        >
                          <Download size={16} />
                        </button>
                        <button 
                          onClick={() => setShowFullImage(generatedImages[index]!)}
                          className="rounded-full bg-white/90 p-2 text-text-deep shadow-lg hover:bg-white"
                        >
                          <Maximize2 size={16} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-text-cool/40">
                      <ImageIcon size={32} />
                      <p className="mt-2 text-[10px] font-medium">等待生成</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
