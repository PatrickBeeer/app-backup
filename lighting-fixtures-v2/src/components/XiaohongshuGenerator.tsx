import React, { useRef, useState, useEffect } from 'react';
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
  Monitor,
  Copy,
  Check
} from 'lucide-react';
import { motion } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { STYLE_PRESETS, EMOTIONAL_LABELS } from '../constants';
import { AspectRatio, Resolution } from '../types';
import { generateGeminiContent } from '../lib/backendApi';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface XiaohongshuGeneratorProps {
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

export function XiaohongshuGenerator({
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
}: XiaohongshuGeneratorProps) {
  const IMAGE_COST = 10;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [generatedImages, setGeneratedImages] = useState<(string | null)[]>([null, null, null, null, null]);
  const [generatingStates, setGeneratingStates] = useState<boolean[]>([false, false, false, false, false]);
  const [errorStates, setErrorStates] = useState<(string | null)[]>([null, null, null, null, null]);
  const [isStartLocked, setIsStartLocked] = useState(false);
  
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [copyData, setCopyData] = useState<{ titles: string[], body: string } | null>(null);
  const [isGeneratingCopy, setIsGeneratingCopy] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [lampType, setLampType] = useState<string | null>(null);
  const [masterScene, setMasterScene] = useState<string | null>(null);
  const [isDetectingType, setIsDetectingType] = useState(false);
  const canGenerate = Boolean(referenceImage);

  // Auto-recommend emotional labels based on style
  useEffect(() => {
    if (selectedStyle === 'mid-century') {
      setSelectedLabels(['cinematic', 'premium']);
    } else if (selectedStyle === 'cream-french') {
      setSelectedLabels(['healing', 'warm']);
    } else if (selectedStyle === 'minimalist-ceiling') {
      setSelectedLabels(['minimalist', 'premium']);
    } else if (selectedStyle === 'wabi-sabi') {
      setSelectedLabels(['solitude', 'healing']);
    }
  }, [selectedStyle]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setReferenceImage(event.target?.result as string);
        setLampType(null); // Reset lamp type on new upload
        setMasterScene(null);
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
        setLampType(null); // Reset lamp type on new upload
        setMasterScene(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const withRetry = async <T,>(fn: () => Promise<T>, retries = 3): Promise<T> => {
    let lastError: unknown;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        const isServerBusy = /503|overloaded|unavailable|temporarily/i.test(message);
        if (!isServerBusy || attempt === retries - 1) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
    throw lastError;
  };

  const detectLampType = async (image: string) => {
    setIsDetectingType(true);
    try {
      const [metadata, data = ''] = image.split(',', 2);
      const mimeType = metadata.match(/^data:([^;]+);base64$/i)?.[1] || 'image/jpeg';
      const response = await withRetry(() =>
        generateGeminiContent({
          model: "gemini-3-flash-preview",
          contents: {
            parts: [
              {
                inlineData: {
                  data,
                  mimeType
                }
              },
              {
                text: "Identify the type of lamp in this image. Choose ONLY one from: 'ceiling' (吸顶灯/吊灯), 'floor' (落地灯), 'table' (台灯), 'wall' (壁灯). Return ONLY the keyword."
              }
            ]
          },
        })
      );
      const detected = response.text?.trim().toLowerCase() || 'ceiling';
      setLampType(detected);
      return detected;
    } catch (error) {
      console.error('Failed to detect lamp type:', error);
      return 'ceiling';
    } finally {
      setIsDetectingType(false);
    }
  };

  const generateCopy = async () => {
    setIsGeneratingCopy(true);
    try {
      const labels = selectedLabels.map(id => EMOTIONAL_LABELS.find(l => l.id === id)?.name).join('、');
      const response = await withRetry(() =>
        generateGeminiContent({
          model: "gemini-3-flash-preview",
          config: {
            responseMimeType: "application/json",
          },
          contents: {
            parts: [
              {
                text: `请为一款高颜值灯具编写一段小红书风格的种草内容。
                产品特点：${prompt || '极简设计，氛围感十足，高品质光效'}
                情感标签：${labels || '无'}
                风格要求：语气亲切、多用表情符号、包含热门标签（如 #我的私藏好物 #灯具分享 #氛围感灯具 #家居美学）、分段清晰。

                请返回以下JSON格式：
                {
                  "titles": ["标题1 (标题党风格)", "标题2 (标题党风格)", "标题3 (标题党风格)"],
                  "body": "正文内容 (200-300字)"
                }`
              }
            ]
          },
        })
      );
      
      const data = JSON.parse(response.text || '{}');
      setCopyData(data);
    } catch (error) {
      console.error('Failed to generate copy:', error);
      setCopyData({ titles: ['生成失败'], body: '文案生成失败，请重试。' });
    } finally {
      setIsGeneratingCopy(false);
    }
  };

  const copyToClipboard = () => {
    if (!copyData) return;
    const fullText = `标题选项：\n${copyData.titles.join('\n')}\n\n正文：\n${copyData.body}`;
    navigator.clipboard.writeText(fullText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const generateImageAtIndex = async (
    index: number,
    detectedType?: string,
    sceneRefImage?: string,
    sceneDescription?: string,
  ) => {
    if (generatingStates[index] || !canGenerate) return;
    
    const currentLampType = detectedType || lampType || 'ceiling';
    const currentSceneDescription = sceneDescription || masterScene || '';
    
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
      const labels = selectedLabels.map(id => EMOTIONAL_LABELS.find(l => l.id === id)?.name).join('、');

      let typeSpecificPrompt = '';
      const mountingContext = 
        currentLampType === 'floor' ? 'standing on the floor next to a sofa or in a corner' :
        currentLampType === 'table' ? 'placed on a wooden desk or a bedside nightstand' :
        currentLampType === 'wall' ? 'mounted on a clean wall above a bed or in a hallway' :
        'mounted on the ceiling as a central light source';
      const sceneConsistencyPrompt = currentSceneDescription
        ? `
        SCENE CONSISTENCY: This image MUST use the same exact room environment described below.
        Room description: ${currentSceneDescription}
        Keep wall color, floor material, furniture style, and camera perspective highly consistent.
      `
        : '';

      if (index === 0) {
        typeSpecificPrompt = `
          XIAOHONGSHU COMPARISON LAYOUT: The image is divided into TWO EQUAL VERTICAL PANELS.
          LEFT PANEL: A dim, flat, uninspiring room with poor lighting.
          RIGHT PANEL: The EXACT SAME room, but beautifully illuminated by the ${currentLampType} lamp from the reference image. 
          The lamp is ${mountingContext}. The lamp should be in a REALISTIC, SMALLER PROPORTION to the room (occupying about 1/12 to 1/10 of the frame).
          The lighting is warm, vibrant, and creates a magical atmosphere.
          NO TEXT, NO ARROWS. Just a clear "Before vs After" visual comparison.
          Real home environment, cozy and lived-in.
        `;
      } else if (index === 1) {
        typeSpecificPrompt = `
          XIAOHONGSHU REALISTIC PERSPECTIVE SHOT (Image 2). 
          ${sceneConsistencyPrompt}
          An eye-level medium shot of the ${currentLampType} lamp ${mountingContext}. 
          The lamp must be in a NATURAL, SMALLER PROPORTION to the room (occupying about 1/12 to 1/10 of the frame). It should NOT be oversized.
          The camera angle is natural, as if taken by a person standing in the room. 
          Focus on the lamp's elegant integration with the surrounding decor. 
          The lighting should be soft and atmospheric. 
          Environment: ${prompt || style?.prompt || 'Cozy modern home'}.
          Emotional vibe: ${labels || 'warm and healing'}.
        `;
      } else if (index === 2) {
        typeSpecificPrompt = `
          XIAOHONGSHU DETAIL SHOT (Image 3). 
          ${sceneConsistencyPrompt}
          An extreme close-up focusing on the exquisite details and textures of the ${currentLampType} lamp (e.g., the material, the switch, the light source). 
          Macro photography style. 
          Beautiful bokeh in the background showing a hint of the ${mountingContext} area. 
          The light should look soft and premium.
        `;
      } else {
        typeSpecificPrompt = `
          XIAOHONGSHU REAL BUYER SHOW (Image ${index + 1}). 
          ${sceneConsistencyPrompt}
          The ${currentLampType} lamp is ${mountingContext} in a real, lived-in home environment. 
          The lamp should be in a SMALL, NATURAL PROPORTION (occupying about 1/15 to 1/12 of the frame) to look like a real user photo.
          The photography should look like it was taken by a smartphone but with good taste. 
          Natural lighting mixed with the lamp's warm glow. 
          Include realistic home details (e.g., a messy bookshelf, a coffee cup on a table, a cozy throw blanket).
          The lamp should be the focus but feel like a natural part of the home.
          Environment: ${prompt || style?.prompt || 'Cozy modern home'}.
          Emotional vibe: ${labels || 'warm and healing'}.
          NO STUDIO LIGHTING. NO PERFECT CATALOG LOOK.
        `;
      }

      const fullPrompt = `
        Xiaohongshu (Red) style social media photography for home decor. 
        The lamp from the reference image is the main product.
        ${typeSpecificPrompt}
        
        CRITICAL INSTRUCTIONS:
        1. NO TEXT: Absolutely no text, logos, or characters.
        2. REALISTIC: Must look like a real photo from a user's home, not a 3D render or studio shot.
        3. MOUNTING: The lamp must be correctly mounted based on its design in the reference image.
        4. ATMOSPHERE: Warm, inviting, and high-quality lighting.
        5. Professional 8k resolution but with a "smartphone photo" aesthetic.
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

      if (sceneRefImage && index > 0) {
        parts.push({
          inlineData: {
            data: sceneRefImage.split(',')[1],
            mimeType: 'image/png'
          }
        });
      }

      const response = await withRetry(() =>
        generateGeminiContent({
          model: 'gemini-3.1-flash-image-preview',
          billing_task: 'image_gen',
          contents: { parts },
          config: {
            imageConfig: {
              aspectRatio: aspectRatio,
              imageSize: resolution === '4K' ? '4K' : '2K'
            }
          }
        })
      );

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
    if (generatingStates.some(s => s) || isDetectingType || !canGenerate) return;
    setIsStartLocked(true);

    setGeneratedImages([null, null, null, null, null]);
    generateCopy();

    let currentType = lampType;
    if (!currentType) {
      currentType = await detectLampType(referenceImage);
    }

    let generatedMasterScene = masterScene;
    if (!generatedMasterScene) {
      try {
        const masterSceneResp = await withRetry(() =>
          generateGeminiContent({
            model: 'gemini-3-flash-preview',
            contents: {
              parts: [
                { inlineData: { data: referenceImage.split(',')[1], mimeType: 'image/png' } },
                {
                  text: `Analyze this room and describe the environment in detail for scene consistency across multiple Xiaohongshu images.
                  Include: room type, wall color, floor material, furniture style, camera perspective, and lighting mood.
                  Keep description concise but specific. Return only the scene description in English.`
                },
                { text: `User product/selling point context: ${prompt || 'high-end decorative lamp with warm ambiance'}` }
              ]
            }
          })
        );
        generatedMasterScene = masterSceneResp.text?.trim() || '';
        if (generatedMasterScene) {
          setMasterScene(generatedMasterScene);
        }
      } catch (error) {
        console.warn('Failed to generate master scene, fallback to independent prompts:', error);
      }
    }

    try {
      const firstImage = await generateImageAtIndex(0, currentType, undefined, generatedMasterScene);

      const remainingTasks = [1, 2, 3, 4].map((i) =>
        generateImageAtIndex(i, currentType, firstImage || undefined, generatedMasterScene)
      );
      await Promise.allSettled(remainingTasks);
    } finally {
      setIsStartLocked(false);
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
              <Sparkles className="h-6 w-6" />
            </div>
            <span className="text-lg font-bold tracking-tight text-text-deep">小红书种草配置</span>
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
                  {lampType && (
                    <div className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-[10px] font-bold text-white backdrop-blur-md">
                      识别为: {
                        lampType === 'ceiling' ? '吸顶灯/吊灯' :
                        lampType === 'floor' ? '落地灯' :
                        lampType === 'table' ? '台灯' :
                        lampType === 'wall' ? '壁灯' : '灯具'
                      }
                    </div>
                  )}
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setReferenceImage(null);
                      setLampType(null);
                      setMasterScene(null);
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
            <h3 className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-text-cool">家居风格</h3>
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

          {/* Emotional Labels */}
          <section className="mb-10">
            <h3 className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-text-cool">情感标签 (多选)</h3>
            <div className="flex flex-wrap gap-2">
              {EMOTIONAL_LABELS.map((label) => (
                <button
                  key={label.id}
                  onClick={() => {
                    setSelectedLabels(prev => 
                      prev.includes(label.id) 
                        ? prev.filter(id => id !== label.id)
                        : [...prev, label.id]
                    );
                  }}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-[10px] font-bold transition-all",
                    selectedLabels.includes(label.id)
                      ? "bg-black text-white shadow-md"
                      : "bg-white/40 text-text-cool hover:bg-white/60"
                  )}
                >
                  {label.name}
                </button>
              ))}
            </div>
          </section>

          {/* Text Prompt */}
          <section className="mb-10">
            <h3 className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-text-cool">产品卖点描述</h3>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述灯具的核心卖点（如：护眼光源、中古设计...）"
              className="h-28 w-full rounded-2xl bg-white/40 p-4 text-sm font-medium outline-none transition-all focus:bg-white/60 placeholder:text-text-cool/50"
            />
          </section>

          {/* Output Settings */}
          <section className="mb-10">
            <h3 className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-text-cool">输出规格</h3>
            
            <div className="mb-6">
              <p className="mb-3 text-[10px] font-bold text-text-cool/70">比例 (推荐 3:4)</p>
              <div className="flex gap-3">
                {[
                  { id: '1:1', icon: Square },
                  { id: '3:4', icon: Smartphone },
                  { id: '9:16', icon: Smartphone },
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
            disabled={isStartLocked || isDetectingType || !canGenerate}
            className="group relative w-full overflow-hidden rounded-2xl bg-black py-5 font-bold text-white shadow-xl transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
          >
            <div className="relative z-10 flex items-center justify-center gap-3">
              {isDetectingType ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>分析灯具类型中...</span>
                </>
              ) : isStartLocked ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>种草内容生成中...</span>
                </>
              ) : !canGenerate ? (
                <>
                  <Sparkles className="h-5 w-5" />
                  <span>请先上传图片 ({IMAGE_COST * 5}积分)</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  <span>一键生成种草全套 ({IMAGE_COST * 5}积分)</span>
                </>
              )}
            </div>
          </button>
        </div>
      </motion.aside>

      {/* Main Viewport */}
      <main className="relative flex-1 overflow-y-auto scrollbar-hide bg-[#f0f2f5]">
        <div className="p-8">
          {/* Copy Section */}
          <div className="mb-12">
            <div className="mb-4 flex items-center justify-between px-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-text-cool">爆款种草文案</span>
              <div className="flex gap-2">
                <button 
                  onClick={generateCopy}
                  disabled={isGeneratingCopy}
                  className="flex items-center gap-1.5 rounded-full bg-white/60 px-3 py-1 text-[10px] font-bold text-text-deep backdrop-blur-md hover:bg-white transition-colors shadow-sm disabled:opacity-50"
                >
                  <RefreshCw size={12} className={cn(isGeneratingCopy && "animate-spin")} />
                  <span>刷新文案</span>
                </button>
                <button 
                  onClick={copyToClipboard}
                  disabled={!copyData}
                  className="flex items-center gap-1.5 rounded-full bg-black px-3 py-1 text-[10px] font-bold text-white shadow-sm hover:bg-black/80 transition-colors disabled:opacity-50"
                >
                  {isCopied ? <Check size={12} /> : <Copy size={12} />}
                  <span>{isCopied ? '已复制' : '复制全套'}</span>
                </button>
              </div>
            </div>
            <div className="glass-panel min-h-[120px] bg-white/60 p-6 backdrop-blur-md rounded-[2rem] border border-white/40 shadow-xl">
              {isGeneratingCopy ? (
                <div className="flex h-24 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-text-cool" />
                </div>
              ) : copyData ? (
                <div className="space-y-6">
                  <div>
                    <h4 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-text-cool/60">标题党选项</h4>
                    <div className="space-y-2">
                      {copyData.titles.map((title, i) => (
                        <div key={i} className="flex items-start gap-3 rounded-xl bg-white/40 p-3 text-sm font-bold text-text-deep">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black text-[10px] text-white">{i + 1}</span>
                          {title}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-text-cool/60">正文内容</h4>
                    <p className="whitespace-pre-wrap text-sm font-medium leading-relaxed text-text-deep">
                      {copyData.body}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex h-24 items-center justify-center text-text-cool/40">
                  <p className="text-xs font-medium">点击“开始生成”获取爆款文案</p>
                </div>
              )}
            </div>
          </div>

          {/* Images Grid */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="flex flex-col gap-4">
                <div className="flex items-center justify-between px-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-text-cool">
                    {index === 0 ? '图 1：对比图 (Before/After)' : 
                     index === 1 ? '图 2：半空近景拍摄' :
                     index === 2 ? '图 3：灯具细节特写' :
                     `图 ${index + 1}：真实买家秀 ${index - 2}`}
                  </span>
                  <button 
                    onClick={() => generateImageAtIndex(index)}
                    disabled={generatingStates[index] || !canGenerate}
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
