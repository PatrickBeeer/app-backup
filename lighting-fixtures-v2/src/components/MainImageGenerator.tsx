import React, { useRef } from 'react';
import { 
  Upload, 
  X, 
  Maximize2, 
  Download, 
  ChevronLeft, 
  ChevronRight,
  Monitor,
  Smartphone,
  Square,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  RefreshCw
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

interface MainImageGeneratorProps {
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
  generatedImages: (string | null)[];
  setGeneratedImages: React.Dispatch<React.SetStateAction<(string | null)[]>>;
  generatingStates: boolean[];
  setGeneratingStates: React.Dispatch<React.SetStateAction<boolean[]>>;
  errorStates: (string | null)[];
  setErrorStates: React.Dispatch<React.SetStateAction<(string | null)[]>>;
  setShowFullImage: (img: string | null) => void;
  handleDownload: (img: string) => void;
}

export function MainImageGenerator({
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
  generatedImages,
  setGeneratedImages,
  generatingStates,
  setGeneratingStates,
  errorStates,
  setErrorStates,
  setShowFullImage,
  handleDownload
}: MainImageGeneratorProps) {
  const IMAGE_COST = 10;
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const generateImageAtIndex = async (index: number, visualReference?: string) => {
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
      let secondaryScene = 'Elegant dining area with a minimalist table and artistic wall decor';
      
      if (selectedStyle === 'minimalist-ceiling') {
        defaultScene = 'Pure seamless ceiling background, off-white or light gray, infinite space effect';
        secondaryScene = 'Modern architectural corridor with clean lines and geometric ceiling patterns';
      } else if (selectedStyle === 'luxury-crystal') {
        defaultScene = 'Grand and spacious luxury living room with high ceilings and ornate details';
        secondaryScene = 'Sophisticated master bedroom with plush velvet textures and gold accents';
      }
      
      const isMinimalistCeiling = selectedStyle === 'minimalist-ceiling';

      const commonConsistencyDirective = `
        CONSISTENCY: The environment and lighting must be consistent with the other images in this set.
        ${visualReference && index > 0 ? 'USE THE PROVIDED ROOM REFERENCE IMAGE as the primary source of truth for the room environment, floor materials, and wall colors.' : ''}
      `;
      
      let typeSpecificPrompt = '';
      if (index === 0) {
        typeSpecificPrompt = `
          E-COMMERCE MAIN IMAGE (HERO SHOT - SCENE A). 
          The lamp should be in a REALISTIC, SMALLER PROPORTION to the room. It should NOT be oversized. 
          CRITICAL: For ceiling lamps, they must appear as a natural architectural element, occupying approximately 1/12 to 1/10 of the frame. For other lamps, occupy 1/10 to 1/8.
          Positioned in the UPPER-CENTER or CENTER of the frame.
          ${isMinimalistCeiling ? 'Pure minimalist architectural space or clean studio background.' : `The lamp must be SEAMLESSLY INTEGRATED into the following environment: ${prompt || defaultScene}.`}
        `;
      } else if (index === 1) {
        typeSpecificPrompt = `
          E-COMMERCE LIFESTYLE SHOT (SCENE B). 
          ${commonConsistencyDirective}
          A LIFESTYLE SCENE in a room that matches the environment of Image 1 perfectly.
          Show a human model (e.g., a person reading, relaxing, or walking) in the room to show scale and atmosphere.
          The lamp should be in a SMALL, NATURAL PROPORTION to the room and the person. It should occupy approximately 1/15 to 1/12 of the total image area.
          ${isMinimalistCeiling ? 'A different architectural angle with a person in the space.' : `The lamp must be SEAMLESSLY INTEGRATED into the environment: ${prompt ? prompt + ' with a person in the scene' : secondaryScene + ' with a person present'}.`}
        `;
      } else if (index === 2) {
        typeSpecificPrompt = `
          CEILING MOUNTING & CANOPY DETAIL (CLOSE-UP). 
          ${commonConsistencyDirective}
          ${isMinimalistCeiling 
            ? 'Focus on the ultra-thin, low-profile mounting base. Show how it seamlessly sits against the clean ceiling surface. Emphasize the minimalist connection and high-quality finish of the mounting plate.'
            : 'Focus on the ceiling rose (canopy) where the lamp attaches to the ceiling. Show the clean installation, the texture of the metal/wood mounting plate, and the top of the main stem.'}
          NO TEXT, NO LETTERS, NO NUMBERS allowed in the image.
          Extreme close-up photography.
        `;
      } else if (index === 3) {
        typeSpecificPrompt = `
          LAMP HEAD & MATERIAL DETAIL (CLOSE-UP). 
          ${commonConsistencyDirective}
          Reference Style: Close-up of the main lamp body or a single lamp head.
          ${isMinimalistCeiling
            ? 'Focus on the smooth diffuser, the precision-engineered metal rim, and the clean lines of the minimalist design. Show the high-quality texture of the materials.'
            : 'Focus on the ribbed glass shade, the metal cap, and the decorative wooden element connecting to the arm.'}
          The lamp is glowing warmly from within.
          Extreme close-up, shallow depth of field.
        `;
      } else if (index === 4) {
        typeSpecificPrompt = `
          BRIGHTNESS COMPARISON LAYOUT: The image is divided into TWO EQUAL VERTICAL PANELS (left and right).
          ${commonConsistencyDirective}
          LEFT PANEL: A warm, bright version of the room environment from Image 1, beautifully illuminated by the lamp. The lighting effect is powerful, vibrant, and creates a cozy, inviting atmosphere.
          RIGHT PANEL: The EXACT SAME room environment at the EXACT SAME angle, but the lighting is significantly DARKER and COOLER with a grayish tone. The lamp here looks standard and has much lower brightness.
          STYLE: Real interior photography, high-end architectural visualization.
          COMPOSITION: No central dividing line, just two side-by-side photos.
          NO TEXT, NO ARROWS, NO OVERLAYS.
        `;
      }

      const fullPrompt = `
        E-commerce professional photography for lighting fixtures. 
        The lamp is the absolute HERO of the shot.
        ${index === 4 ? '' : 'The lamp is TURNED ON and GLOWING, providing the primary light source.'}
        ${style?.prompt || ''} 
        ${typeSpecificPrompt}
        
        CRITICAL INSTRUCTIONS:
        1. NO TEXT: Absolutely no text, logos, or characters should appear in the image.
        2. CEILING MOUNTED: The lamp MUST be securely mounted on the CEILING. It must NOT be floating in mid-air or mounted on a wall.
        3. NO CEILING SHADOWS: The ceiling above the lamp must be clean and free of harsh, patterned, or circular shadows. Use soft, diffused lighting.
        4. EXACT MOUNTING BASE: The mounting base (canopy) attached to the ceiling must match the shape, material, and design of the reference image EXACTLY.
        5. REDUCE WALL BLOOM: Minimize diffuse light, "bloom", or excessive glow on the walls. The walls should remain sharp and clean.
        6. VISUAL ANALYSIS: Match the mounting hardware and LAMP ARM structure EXACTLY as shown in the reference image.
        7. LIGHTING: ${index === 4 ? 'Show BOTH states (On and Off) as described.' : 'The lamp MUST be actively emitting light. Show realistic light throw and soft shadows on the ceiling surface.'}
        8. Professional 8k resolution, cinematic lighting, photorealistic.
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

      if (visualReference && index > 0) {
        parts.push({
          inlineData: {
            data: visualReference.split(',')[1],
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
          foundImage = true;
          return newImageUrl;
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
      return null;
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
    setErrorStates([null, null, null, null, null]);
    setGeneratedImages([null, null, null, null, null]);

    // Launch requests in order without waiting for earlier responses so all five start immediately.
    [0, 1, 2, 3, 4].forEach((index) => {
      void generateImageAtIndex(index);
    });
  };

  return (
    <>
      {/* Settings Sidebar (Generator Specific) */}
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
            <span className="text-lg font-bold tracking-tight text-text-deep">主图生成配置</span>
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
        </div>

        {/* Generate Button */}
        <div className="p-6">
          <button
            onClick={startRendering}
            disabled={generatingStates.some(s => s) || !canGenerate}
            className="group relative w-full overflow-hidden rounded-2xl bg-black py-5 font-bold text-white shadow-xl transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
          >
            <div className="relative z-10 flex items-center justify-center gap-3">
              {generatingStates.some(s => s) ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>批量生成中...</span>
                </>
              ) : !canGenerate ? (
                <>
                  <Sparkles className="h-5 w-5" />
                  <span>请先上传图片 ({IMAGE_COST * 5}积分)</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  <span>开始生成5张主图 ({IMAGE_COST * 5}积分)</span>
                </>
              )}
            </div>
          </button>
        </div>
      </motion.aside>

      {/* Main Viewport */}
      <main className="relative flex-1 overflow-y-auto scrollbar-hide bg-[#f0f2f5]">
        <div className="p-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="flex flex-col gap-4">
                <div className="flex items-center justify-between px-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-text-cool">
                    {index === 0 ? '图 1：主图 A' : 
                     index === 1 ? '图 2：主图 B' : 
                     index === 2 ? '图 3：核心卖点' : 
                     index === 3 ? '图 4：工艺细节' : '图 5：开关灯对比'}
                  </span>
                  {generatedImages[index] ? (
                    <button 
                      onClick={() => generateImageAtIndex(index)}
                      disabled={generatingStates[index] || !canGenerate}
                      className="flex items-center gap-1.5 rounded-full bg-white/60 px-3 py-1 text-[10px] font-bold text-text-deep backdrop-blur-md hover:bg-white transition-colors shadow-sm disabled:opacity-50"
                    >
                      <RefreshCw size={12} className={cn(generatingStates[index] && "animate-spin")} />
                      <span>{generatingStates[index] ? '生成中...' : `重新生成 (${IMAGE_COST}积分)`}</span>
                    </button>
                  ) : <div />}
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
                        onClick={() => generateImageAtIndex(index)}
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
