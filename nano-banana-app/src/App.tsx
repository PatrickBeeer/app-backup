/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { Upload, Image as ImageIcon, Loader2, Sparkles, Download, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  extractImageFromResponse,
  extractTextFromResponse,
  generateContent,
} from '../../../services/geminiProxyService';

const TEXT_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const IMAGE_BILLING_TASK = 'image_gen';
const IMAGE_COST_POINTS = 10;
const IMAGE_BATCH_SIZE = 2;
const IMAGE_REQUEST_STAGGER_MS = 220;
const MAX_IMAGE_SEED = 2147483647;

const HUMAN_MODEL_HARD_CONSTRAINT = [
  'HUMAN PRESENCE (NON-NEGOTIABLE): The final output MUST include exactly one real adult human model wearing the product.',
  'The model body must be clearly visible (at least from head to knees), with face, torso, arms, and legs present.',
  'NEVER output product-only image, flat-lay, mannequin, hanger shot, packaging shot, or empty scene without a person.',
].join(' ');

const POSE_SEEDS = [
  { 
    id: 'straight', 
    label: '经典正站', 
    prompt: '纯净的浅灰色背景，高对比度。模特正面对称挺拔站立，手臂自然下垂。'
  },
  { 
    id: 'seated', 
    label: '慵懒坐姿', 
    prompt: '纯净的浅灰色背景，高对比度。模特坐在地上，单手撑地，一腿微曲，姿态慵懒而高级。'
  },
  { 
    id: 'side', 
    label: '微微侧身', 
    prompt: '纯净的浅灰色背景，高对比度。模特站立微侧身，展现美丽的S型曲线，展现轻盈呼吸感。'
  },
];

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [gender, setGender] = useState<'male' | 'female'>('female');
  const [category, setCategory] = useState<'intimates' | 'loungewear' | 'thermal'>('intimates');
  const [scenePrompt, setScenePrompt] = useState(POSE_SEEDS[0].prompt);
  const [activePoseId, setActivePoseId] = useState<string>('straight');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16');

  const [isGenerating, setIsGenerating] = useState(false);
  const [resultImages, setResultImages] = useState<string[]>([]);
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setPreviewUrl(URL.createObjectURL(selected));
      setResultImages([]);
      setActiveResultIndex(0);
      setError(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped && dropped.type.startsWith('image/')) {
      setFile(dropped);
      setPreviewUrl(URL.createObjectURL(dropped));
      setResultImages([]);
      setActiveResultIndex(0);
      setError(null);
    }
  };

  const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const buildImageSeed = (offset: number) => {
    return (Math.floor(Date.now() % MAX_IMAGE_SEED) + Math.max(0, offset)) % MAX_IMAGE_SEED;
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const generateImage = async () => {
    if (!file) return;

    setIsGenerating(true);
    setError(null);
    setResultImages([]);
    setActiveResultIndex(0);
    setCompletedCount(0);

    try {
      const base64Data = await fileToBase64(file);

      const genderStr = gender === 'male' 
        ? "High-fashion male model, extremely small head (9-head proportion), strong thick neck, very broad straight shoulders, lean and athletic build with defined but not bulky musculature, flat broad chest. Signature sleek and glossy short black bowl cut (mushroom hair), cut uniformly short to clearly expose half of the ears, bangs cut in a perfectly straight line stopping exactly at the bridge of the nose, covering the eyes but clearly exposing the nose, mouth, and strong jawline. Anonymous identity, emotionless mannequin-like neutral expression, warm tanned bronze skin tone, slightly olive complexion, highly realistic skin texture with natural pores, subtle skin imperfections, and slight body hair." 
        : "High-fashion female model, extremely small head (9-head proportion), very long slender neck, healthy and fit body type with natural curves, soft but firm flesh, visible waistline and healthy hips (subtle hourglass or pear shape), not overly skinny. Signature sleek and glossy short black bowl cut (mushroom hair), cut uniformly short to clearly expose half of the ears, bangs cut in a perfectly straight line stopping exactly at the bridge of the nose, covering the eyes but clearly exposing the nose, delicate mouth, and sharp jawline. Anonymous identity, emotionless mannequin-like neutral expression, healthy realistic skin with natural pores and slight glow.";

      let categoryStr = '';
      switch (category) {
        case 'intimates': categoryStr = 'form-fitting intimates / base layer underwear'; break;
        case 'loungewear': categoryStr = 'comfortable loungewear / pajamas'; break;
        case 'thermal': categoryStr = 'thermal base layer / winter tech-wear'; break;
      }

      const femaleIntimatesCoordination = (gender === 'female' && category === 'intimates') 
        ? " If the uploaded image is a bra or top, the model MUST wear matching panties in the exact same color and fabric to create a coordinated, harmonious set." 
        : "";

      const basePrompt = `Commercial fashion photography, Bananain (蕉内) brand style lookbook. 
      Model: ${genderStr}. 
      HAIRSTYLE OVERRIDE (CRITICAL): If the uploaded reference image contains a person's head, face, or hair, you MUST COMPLETELY IGNORE IT. You are FORBIDDEN from copying the original model's hairstyle. You MUST forcefully replace the head with the signature short sleek black bowl cut (mushroom hair) with straight bangs fully covering the eyes, and noticeably short sides that explicitly expose half of the ears. This hairstyle is non-negotiable.
      ${HUMAN_MODEL_HARD_CONSTRAINT}
      Outfit: Wearing the provided ${categoryStr}.${femaleIntimatesCoordination} ABSOLUTELY CRITICAL: The generated image MUST feature the EXACT SAME product as the uploaded image. Do not change the color, pattern, shape, logo, or any details of the uploaded clothing. The uploaded image is the absolute ground truth for the product design.
      User Custom Scene & Pose: ${scenePrompt}
      Aesthetic: Anti-sexy, highly geometric, focusing entirely on the product's tech and 'second-skin' comfort. High-tech fabric feel, seamless 'no-feel' concept. Studio lighting, sharp focus, photorealistic, 8k resolution, highly detailed, editorial fashion magazine quality.`;

      let finalPrompt = basePrompt;
      try {
        const promptResponse = await generateContent({
          model: TEXT_MODEL,
          task: 'text_gen',
          contents: {
            parts: [
              {
                text: 'Rewrite the following prompt for an image model. Preserve every hard constraint about product identity, hairstyle, and mandatory human presence. Return prompt text only.',
              },
              {
                text: basePrompt,
              },
            ],
          },
          systemInstruction: {
            parts: [
              {
                text: 'Do not add markdown or explanations. Output only the refined prompt text.',
              },
            ],
          },
        });
        const polished = extractTextFromResponse(promptResponse).trim();
        if (polished) {
          finalPrompt = polished;
        }
      } catch (promptError) {
        console.warn('Prompt refinement failed, fallback to base prompt.', promptError);
      }

      const jobs: Array<Promise<{ ok: boolean; message?: string }>> = [];

      for (let i = 0; i < IMAGE_BATCH_SIZE; i += 1) {
        if (i > 0) {
          await delay(IMAGE_REQUEST_STAGGER_MS);
        }

        const job = (async () => {
          try {
            const response = await generateContent({
              model: IMAGE_MODEL,
              task: 'image_gen',
              billing_task: IMAGE_BILLING_TASK,
              contents: {
                parts: [
                  {
                    inlineData: {
                      data: base64Data,
                      mimeType: file.type || 'image/png',
                    },
                  },
                  {
                    text: finalPrompt,
                  },
                ],
              },
              config: {
                imageConfig: {
                  aspectRatio: aspectRatio,
                },
                seed: buildImageSeed(i + 1),
              },
            });

            const imageUrl = extractImageFromResponse(response);
            if (!imageUrl) {
              return { ok: false, message: `第 ${i + 1} 张图片返回为空。` };
            }

            setResultImages((prev) => {
              if (prev.includes(imageUrl)) {
                return prev;
              }
              const next = [...prev, imageUrl];
              if (prev.length === 0) {
                setActiveResultIndex(0);
              }
              return next;
            });

            return { ok: true };
          } catch (err: any) {
            return { ok: false, message: err?.message || `第 ${i + 1} 张图片生成失败。` };
          } finally {
            setCompletedCount((count) => count + 1);
          }
        })();

        jobs.push(job);
      }

      const results = await Promise.all(jobs);
      const successCount = results.filter((item) => item.ok).length;
      const failures = results.filter((item) => !item.ok);

      if (successCount === 0) {
        throw new Error(failures[0]?.message || '未能生成图片，请重试。');
      }

      if (failures.length > 0) {
        setError(`已返回 ${successCount} 张，失败 ${failures.length} 张。系统已优先展示最先返回结果。`);
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || '生成过程中发生错误');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    const activeImage = resultImages[activeResultIndex] || resultImages[0] || null;
    if (!activeImage) return;
    const a = document.createElement('a');
    a.href = activeImage;
    a.download = `bananain-model-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const activeImage = resultImages[activeResultIndex] || resultImages[0] || null;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#E6FF00] flex items-center justify-center font-bold text-xl tracking-tighter text-black rounded-sm">B</div>
          <h1 className="text-xl font-bold tracking-tight text-black">
            蕉内 Bananain <span className="text-gray-400 font-normal ml-2 text-lg">| AI 视觉引擎</span>
          </h1>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
        {/* Left: Controls (5 cols) */}
        <div className="lg:col-span-5 space-y-6 lg:space-y-8">
          
          {/* Upload Section */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-black">
              <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-sm">1</span>
              上传产品图
            </h2>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => !previewUrl && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                previewUrl 
                  ? 'border-gray-200 bg-gray-50' 
                  : 'border-gray-300 hover:border-[#E6FF00] hover:bg-[#FAFFCC]/20 cursor-pointer'
              }`}
            >
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
              {previewUrl ? (
                <div className="relative inline-block">
                  <img src={previewUrl} alt="Preview" className="max-h-48 rounded-lg mx-auto shadow-sm object-contain" />
                  <button
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setFile(null); 
                      setPreviewUrl(null); 
                      setResultImages([]);
                      setActiveResultIndex(0);
                      setCompletedCount(0);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="absolute -top-3 -right-3 bg-white text-black rounded-full p-1.5 shadow-md hover:bg-gray-100 border border-gray-100"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-gray-500">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3 text-black">
                    <Upload size={20} />
                  </div>
                  <p className="font-medium text-gray-700">点击或拖拽上传产品图片</p>
                  <p className="text-sm mt-1">支持 JPG, PNG 格式，建议白底图</p>
                </div>
              )}
            </div>
          </div>

          {/* Options Section */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2 text-black">
              <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-sm">2</span>
              设定生成参数
            </h2>

            <div className="space-y-6">
              {/* Gender */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">模特性别</label>
                <div className="grid grid-cols-2 gap-3">
                  {(['female', 'male'] as const).map((g) => (
                    <button
                      key={g}
                      onClick={() => setGender(g)}
                      className={`py-3 px-4 rounded-xl border text-sm font-medium transition-all ${
                        gender === g 
                          ? 'border-black bg-black text-white' 
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {g === 'female' ? '女士 Women' : '男士 Men'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">产品类型</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'intimates', label: '贴身内衣' },
                    { id: 'loungewear', label: '家居服' },
                    { id: 'thermal', label: '保暖内衣' }
                  ].map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCategory(c.id as any)}
                      className={`py-3 px-2 rounded-xl border text-sm font-medium transition-all ${
                        category === c.id 
                          ? 'border-black bg-black text-white' 
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pose Selection & Advanced Prompt */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">场景与动作修饰</label>
                <div className="space-y-4">
                  {/* Preset Tags */}
                  <div className="flex flex-wrap gap-2">
                    {POSE_SEEDS.map((seed) => (
                      <button
                        key={seed.id}
                        onClick={() => {
                          setActivePoseId(seed.id);
                          setScenePrompt(seed.prompt);
                        }}
                        className={`text-sm font-medium px-4 py-2 rounded-xl border transition-all ${
                          activePoseId === seed.id
                            ? 'border-black bg-black text-white'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {seed.label}
                      </button>
                    ))}
                  </div>

                  {/* Advanced Toggle */}
                  <button
                    onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                    className="text-xs text-gray-500 hover:text-black font-medium flex items-center gap-1 transition-colors"
                  >
                    {isAdvancedOpen ? '收起高级编辑框' : '没找到想要的？开启高级编辑框自定义'}
                    <motion.div
                      animate={{ rotate: isAdvancedOpen ? 180 : 0 }}
                      className="inline-block"
                    >
                      ↓
                    </motion.div>
                  </button>

                  {/* Advanced Textarea */}
                  <AnimatePresence>
                    {isAdvancedOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <textarea
                          value={scenePrompt}
                          onChange={(e) => {
                            setScenePrompt(e.target.value);
                            setActivePoseId(''); // Clear active state if manual edit
                          }}
                          rows={3}
                          placeholder="例如：模特坐在地上，双手向后撑地，暗黑科技风格背景..."
                          className="w-full mt-2 p-4 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#E6FF00] focus:border-transparent transition-all resize-none"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Aspect Ratio */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">图片比例</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: '9:16', label: '9:16 (竖屏海报)' },
                    { id: '16:9', label: '16:9 (横屏大片)' }
                  ].map((ratio) => (
                    <button
                      key={ratio.id}
                      onClick={() => setAspectRatio(ratio.id as any)}
                      className={`py-3 px-4 rounded-xl border text-sm font-medium transition-all ${
                        aspectRatio === ratio.id 
                          ? 'border-black bg-black text-white' 
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {ratio.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={generateImage}
            disabled={!file || isGenerating}
            className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all ${
              !file 
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                : isGenerating 
                  ? 'bg-black text-[#E6FF00]' 
                  : 'bg-[#E6FF00] text-black hover:bg-[#D4EB00] shadow-[0_4px_20px_rgba(230,255,0,0.3)]'
            }`}
          >
            {isGenerating ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                正在生成第 {Math.min(completedCount + 1, IMAGE_BATCH_SIZE)} / {IMAGE_BATCH_SIZE} 张...
              </>
            ) : (
              <>
                <Sparkles size={20} />
                生成 {IMAGE_BATCH_SIZE} 张专属模特图
              </>
            )}
          </button>
          <p className="text-center text-sm text-gray-500">
            计费标准：{IMAGE_COST_POINTS} 点 / 张（共 {IMAGE_BATCH_SIZE} 张，合计 {IMAGE_COST_POINTS * IMAGE_BATCH_SIZE} 点）
          </p>
        </div>

        {/* Right: Result (7 cols) */}
        <div className="lg:col-span-7">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden h-full min-h-[500px] lg:min-h-[700px] flex flex-col relative">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                <ImageIcon size={16} />
                生成结果
              </h2>
              {activeImage && (
                <button 
                  onClick={handleDownload}
                  className="text-sm font-medium text-black bg-[#E6FF00] px-4 py-1.5 rounded-full hover:bg-[#D4EB00] transition-colors flex items-center gap-1"
                >
                  <Download size={14} />
                  下载高清图
                </button>
              )}
            </div>

            <div className="flex-1 p-6 flex items-center justify-center bg-[#F5F5F7] relative">
              <AnimatePresence mode="wait">
                {activeImage ? (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full h-full flex items-center justify-center"
                  >
                    <img 
                      src={activeImage} 
                      alt="Generated Model" 
                      className="max-w-full max-h-full object-contain rounded-lg shadow-lg" 
                    />
                  </motion.div>
                ) : isGenerating ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center"
                  >
                    <div className="w-24 h-24 relative mb-6">
                      <div className="absolute inset-0 border-4 border-gray-200 rounded-full"></div>
                      <div className="absolute inset-0 border-4 border-[#E6FF00] rounded-full border-t-transparent animate-spin"></div>
                      <div className="absolute inset-0 flex items-center justify-center font-bold text-2xl text-black">B</div>
                    </div>
                    <p className="text-gray-500 font-medium animate-pulse">AI 正在解析产品结构与品牌美学...</p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center text-gray-400"
                  >
                    <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                      <ImageIcon size={32} className="text-gray-400" />
                    </div>
                    <p>上传产品图并点击生成，预览模特上身效果</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {resultImages.length > 1 && (
                <div className="absolute bottom-6 left-6 right-6 flex justify-center gap-2">
                  {resultImages.map((url, index) => (
                    <button
                      key={`${url}-${index}`}
                      onClick={() => setActiveResultIndex(index)}
                      className={`h-14 w-14 overflow-hidden rounded-lg border-2 transition-all ${
                        activeResultIndex === index ? 'border-[#E6FF00] shadow-md' : 'border-white/70 hover:border-gray-300'
                      }`}
                    >
                      <img src={url} alt={`Result ${index + 1}`} className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              {isGenerating && activeImage && (
                <div className="absolute top-6 left-6 rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white">
                  已返回 {Math.min(resultImages.length, IMAGE_BATCH_SIZE)} / {IMAGE_BATCH_SIZE}
                </div>
              )}

              {error && (
                <div className="absolute bottom-6 left-6 right-6 bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 flex items-start gap-3 shadow-lg">
                  <div className="mt-0.5"><X size={16} /></div>
                  <div>
                    <h4 className="font-bold text-sm">生成失败</h4>
                    <p className="text-sm mt-1 opacity-90">{error}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
