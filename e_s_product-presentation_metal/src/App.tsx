/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { 
  Upload, 
  Image as ImageIcon, 
  Sparkles, 
  Download, 
  RefreshCw,
  Layout,
  Check,
  X,
  Plus,
  Palette
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppProps } from '../../../types';
import { generateContent, extractImageFromResponse } from '../../../shared_services/geminiProxyService';

type ProductColor = '黑色' | '古铜金' | '银色' | '混合颜色';
type ImageSize = '1K' | '2K' | '4K';

const PRO_MODEL = 'gemini-3.1-flash-image-preview';
const MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2048;
const MAX_GENERATE_ATTEMPTS = 3;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

const parseImageDataUrl = (dataUrl: string): { data: string; mimeType: string } => {
  const [head, data] = dataUrl.split(',');
  const mimeType = head?.split(';')[0]?.split(':')[1] || 'image/png';
  return { data: data || '', mimeType };
};

const stripBase64 = (value: any): any => {
  if (Array.isArray(value)) {
    return value.map(stripBase64);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const output: Record<string, any> = {};
  for (const [key, val] of Object.entries(value)) {
    if (key === 'data' && typeof val === 'string') {
      output[key] = '[base64 omitted]';
      continue;
    }
    output[key] = stripBase64(val);
  }
  return output;
};

const estimateBase64Bytes = (base64Data: string): number => {
  const padding = (base64Data.match(/=+$/)?.[0]?.length || 0);
  return Math.floor((base64Data.length * 3) / 4) - padding;
};

const isPayloadTooLargeMessage = (message: string): boolean => {
  const lower = message.toLowerCase();
  return lower.includes('413') || lower.includes('request entity too large') || lower.includes('payload too large');
};

const payloadTooLargeErrorMessage = (): string =>
  '图片请求体过大（HTTP 413）。系统已尝试压缩图片，请进一步降低原图分辨率或裁剪后重试。';

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

const isRetriableGenerateFailure = (status: number, message: string): boolean => {
  if (status === 413) {
    return false;
  }

  const lower = String(message || '').toLowerCase();
  const nonRetriableFragments = [
    'payload too large',
    'request entity too large',
    'no matching key/model',
    'empty inlinedata',
    '请求参数错误',
  ];
  if (nonRetriableFragments.some((item) => lower.includes(item))) {
    return false;
  }

  if (RETRYABLE_STATUS_CODES.has(status)) {
    return true;
  }

  const retriableFragments = [
    'failed to fetch',
    'networkerror',
    'context deadline exceeded',
    'upstream request failed',
    'unexpected end of json input',
    'unable to process input image',
  ];
  return retriableFragments.some((item) => lower.includes(item));
};

const dataUrlToBlob = (dataUrl: string): Blob => {
  const [header, encoded] = dataUrl.split(',');
  if (!header || !encoded) {
    throw new Error('invalid data url');
  }

  const mimeType = header.match(/^data:(.*?);base64$/i)?.[1] || 'image/png';
  const binary = window.atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
};

const triggerFileDownload = (href: string, fileName: string, onAfterClick?: () => void): void => {
  const link = document.createElement('a');
  link.href = href;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  window.requestAnimationFrame(() => {
    link.click();
    // Removing the anchor immediately after click can cause flaky download behavior
    // in some browsers when users trigger consecutive downloads.
    window.setTimeout(() => {
      document.body.removeChild(link);
      onAfterClick?.();
    }, 200);
  });
};

const loadImageFromDataUrl = (dataUrl: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片解析失败'));
    img.src = dataUrl;
  });

const compressInlineImageData = async (base64Data: string, mimeType: string): Promise<{ data: string; mimeType: string }> => {
  if (!base64Data || estimateBase64Bytes(base64Data) <= MAX_INLINE_IMAGE_BYTES) {
    return { data: base64Data, mimeType };
  }

  const dataUrl = `data:${mimeType || 'image/jpeg'};base64,${base64Data}`;
  const img = await loadImageFromDataUrl(dataUrl);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(img.width, img.height));
  const targetW = Math.max(1, Math.round(img.width * scale));
  const targetH = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { data: base64Data, mimeType };
  }

  ctx.drawImage(img, 0, 0, targetW, targetH);
  const qualitySteps = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5];
  let bestData = base64Data;

  for (const quality of qualitySteps) {
    const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
    const compressedBase64 = compressedDataUrl.split(',')[1] || '';
    if (!compressedBase64) continue;
    bestData = compressedBase64;
    if (estimateBase64Bytes(compressedBase64) <= MAX_INLINE_IMAGE_BYTES) {
      return { data: compressedBase64, mimeType: 'image/jpeg' };
    }
  }

  return { data: bestData, mimeType: 'image/jpeg' };
};

const optimizePartsInlineImages = async (parts: any[]): Promise<any[]> => {
  const out: any[] = [];
  for (const part of parts) {
    const inlineData = part?.inlineData;
    if (!inlineData?.data || typeof inlineData.data !== 'string') {
      out.push(part);
      continue;
    }

    const optimized = await compressInlineImageData(inlineData.data, inlineData.mimeType || 'image/jpeg');
    out.push({
      ...part,
      inlineData: {
        ...inlineData,
        data: optimized.data,
        mimeType: optimized.mimeType,
      },
    });
  }
  return out;
};

const generateViaProxy = async (
  parts: any[],
  modelId: string,
  aspectRatio: '1:1' | '3:4' | '9:16',
  imageSize: ImageSize
): Promise<string> => {
  const optimizedParts = await optimizePartsInlineImages(parts);
  const requestBody = {
    model: modelId,
    task: 'image_gen' as const,
    contents: { parts: optimizedParts },
    config: { imageConfig: { aspectRatio, imageSize } },
  };
  console.log('[e_s_product-presentation_metal] Gemini request:', stripBase64(requestBody));

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_GENERATE_ATTEMPTS; attempt += 1) {
    try {
      const response = await generateContent(requestBody);
      console.log('[e_s_product-presentation_metal] Gemini response:', stripBase64(response));

      const imageDataUrl = extractImageFromResponse(response);
      if (!imageDataUrl) {
        throw new Error('未收到图片结果，请重试');
      }
      return imageDataUrl;
    } catch (error: any) {
      const message = String(error?.message || '请求失败');
      if (isPayloadTooLargeMessage(message)) {
        throw new Error(payloadTooLargeErrorMessage());
      }

      const shouldRetry = attempt < MAX_GENERATE_ATTEMPTS && isRetriableGenerateFailure(0, message);
      if (shouldRetry) {
        console.warn(`[e_s_product-presentation_metal] fetch error, retrying ${attempt}/${MAX_GENERATE_ATTEMPTS}: ${message}`);
        await wait(600 * attempt);
        continue;
      }
      lastError = error instanceof Error ? error : new Error(message);
      break;
    }
  }

  throw lastError || new Error('生成失败，请稍后重试');
};

const COLOR_OPTIONS: { id: ProductColor; name: string; colorClass: string }[] = [
  { id: '黑色', name: '黑色', colorClass: 'bg-black' },
  { id: '古铜金', name: '古铜金', colorClass: 'bg-[#B8860B]' },
  { id: '银色', name: '银色', colorClass: 'bg-[#C0C0C0]' },
  { id: '混合颜色', name: '混合颜色', colorClass: 'bg-gradient-to-tr from-black via-[#B8860B] to-[#C0C0C0]' },
];

export default function App({ platform, costs }: AppProps) {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [colorStandards, setColorStandards] = useState<{
    黑色: string | null;
    古铜金: string | null;
    银色: string | null;
  }>({
    黑色: null,
    古铜金: null,
    银色: null,
  });
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedColor, setSelectedColor] = useState<ProductColor>('银色');
  const [objectStyling, setObjectStyling] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<"1:1" | "3:4" | "9:16">("1:1");
  const [imageSize, setImageSize] = useState<ImageSize>('1K');
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const refImageInputRef = useRef<HTMLInputElement>(null);
  const colorStandardRefs = {
    黑色: useRef<HTMLInputElement>(null),
    古铜金: useRef<HTMLInputElement>(null),
    银色: useRef<HTMLInputElement>(null),
  };

  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingRef, setIsDraggingRef] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent, type: 'product' | 'reference' | ProductColor) => {
    let file: File | undefined;
    
    if (e.target && 'files' in e.target && e.target.files) {
      file = e.target.files[0];
    } else if ('dataTransfer' in e) {
      file = (e as React.DragEvent).dataTransfer.files[0];
    }

    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (type === 'product') {
          setOriginalImage(result);
          setGeneratedImages([]);
        } else if (type === 'reference') {
          setReferenceImage(result);
        } else if (type === '黑色' || type === '古铜金' || type === '银色') {
          setColorStandards(prev => ({ ...prev, [type]: result }));
        }
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const onDragOver = (e: React.DragEvent, type: string) => {
    e.preventDefault();
    if (type === 'product') setIsDragging(true);
    else if (type === 'reference') setIsDraggingRef(true);
  };

  const onDragLeave = (type: string) => {
    if (type === 'product') setIsDragging(false);
    else if (type === 'reference') setIsDraggingRef(false);
  };

  const onDrop = (e: React.DragEvent, type: any) => {
    e.preventDefault();
    if (type === 'product') setIsDragging(false);
    else if (type === 'reference') setIsDraggingRef(false);
    handleFileUpload(e, type);
  };

  const generateScene = async () => {
    if (!originalImage) {
      setError("请先上传商品图片");
      return;
    }

    const unitCost = (costs as any).GENERATE_IMAGE_PRO ?? 8;
    const actionType = 'GENERATE_IMAGE_PRO';
    const modelId = PRO_MODEL;

    if (!platform.checkBalance(unitCost)) {
      return;
    }

    // Check if required color standard is uploaded
    if (selectedColor === '混合颜色') {
      if (!colorStandards.黑色 && !colorStandards.古铜金 && !colorStandards.银色) {
        setError("请至少上传一个颜色标准图（黑色、古铜金或银色）");
        return;
      }
    } else if (!colorStandards[selectedColor as keyof typeof colorStandards]) {
      setError(`请先上传“${selectedColor}”的颜色标准图`);
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedImages([]);

    try {
      const product = parseImageDataUrl(originalImage);

      // Build parts with very explicit labeling and instructions
      const baseParts: any[] = [
        { text: "### ROLE: Professional Product Photographer & Master AI Artist" },
        { text: "### MISSION: Transform a plain white-background product image into a high-end commercial scene." },
        
        { text: "### SOURCE_PRODUCT (The product to extract and use):" },
        {
          inlineData: {
            data: product.data,
            mimeType: product.mimeType,
          },
        }
      ];

      if (referenceImage) {
        const ref = parseImageDataUrl(referenceImage);
        baseParts.push({ text: "### REFERENCE_SCENE (The environment, lighting, and style to replicate):" });
        baseParts.push({
          inlineData: {
            data: ref.data,
            mimeType: ref.mimeType,
          },
        });
      }

      // Add color standards with explicit labeling
      const relevantStandards: string[] = [];
      if (selectedColor === '混合颜色') {
        if (colorStandards.黑色) relevantStandards.push('黑色');
        if (colorStandards.古铜金) relevantStandards.push('古铜金');
        if (colorStandards.银色) relevantStandards.push('银色');
      } else if (colorStandards[selectedColor]) {
        relevantStandards.push(selectedColor);
      }

      relevantStandards.forEach((color) => {
        const standard = colorStandards[color as keyof typeof colorStandards];
        if (standard) {
          const parsed = parseImageDataUrl(standard);
          baseParts.push({ text: `### COLOR_STANDARD for ${color} (Reference for material texture and metallic color):` });
          baseParts.push({
            inlineData: {
              data: parsed.data,
              mimeType: parsed.mimeType,
            },
          });
        }
      });

      const prompt = `
        ### MANDATORY RULES (STRICT ADHERENCE REQUIRED):

        1. **RULE 1: PRODUCT SHAPE INTEGRITY (NO DEFORMATION)**: 
           - **STRICT BASELINE**: The 'SOURCE_PRODUCT' image is the absolute baseline for shape.
           - **NO CHANGES**: You MUST preserve the EXACT silhouette, contours, geometry, and physical shape of the products. 
           - **NO BEAUTIFICATION**: Do not smooth, round, or alter the edges or form. 
           - **NO MOVEMENT**: Maintain the EXACT spatial arrangement and orientation of all products.
           - **PRESERVE TEXT**: All logos, fonts, and graphics on the product must remain 100% identical.

        2. **RULE 2: COLOR STANDARD AS SOLE COLOR SOURCE**: 
           - **SOLE SOURCE**: Use 'COLOR_STANDARD' images as the ONLY reference for the product's target color, metallic finish, and material texture.
           - **STRICTLY FORBIDDEN**: DO NOT extract, copy, or hallucinate any objects, shapes, props, or assets from the 'COLOR_STANDARD' images. Only use the abstract color and material properties.
           - ${selectedColor === '混合颜色' 
              ? "MIXED COLORS MODE: Assign a DIFFERENT color (Black, Bronze Gold, or Silver) to EACH individual product based on the provided standards." 
              : `SINGLE COLOR MODE: Apply the '${selectedColor}' color/material from the standard to ALL products.`}

        3. **RULE 3: REFERENCE SCENE FOR STYLE ONLY**: 
           - **STYLE ONLY**: Use 'REFERENCE_SCENE' ONLY to replicate the photography style, lighting direction, shadows, depth of field, and overall aesthetic vibe.
           - **STRICTLY FORBIDDEN**: DO NOT include any physical objects, furniture, props, or **TEXT/LOGOS** from 'REFERENCE_SCENE'. 
           - **NO TEXT GENERATION**: Do not generate any text, words, or characters in the background or environment. The background must be clean and free of any text from the reference image.

        ### MATERIAL SPECIFICATION:
        - Target Material: ${objectStyling || 'Fine metallic sandblasted texture (细腻金属喷砂质感)'} with refined metallic luster.
        - **STRICT TEXTURE REQUIREMENT**: The texture must be a **FINE SANDBLASTED FINISH (喷砂质感)**. 
        - **FORBIDDEN TEXTURE**: DO NOT use a "brushed" (拉丝) or "hairline" texture. Ensure the surface is smooth and matte with a fine grain, not linear scratches.
        - Integration: Ensure perfect contact shadows and environmental reflections so the products look naturally integrated into the new background.

        ### EXECUTION STEPS:
        - Step 1: Extract products from 'SOURCE_PRODUCT' with 100% shape accuracy.
        - Step 2: Apply color/material from 'COLOR_STANDARD' (and ONLY from there).
        - Step 3: Generate a new background and lighting setup that replicates the *style* of 'REFERENCE_SCENE' without copying its objects or **TEXT**.
        - Step 4: Render the final 8K high-end commercial photograph.

        ${customPrompt ? `### ADDITIONAL USER REQUEST:\n${customPrompt}` : ''}

        ### FINAL OUTPUT:
        An 8K resolution, high-end commercial studio photograph. The product shape is 100% identical to 'SOURCE_PRODUCT', the color is derived SOLELY from 'COLOR_STANDARD', and the photography style is inspired by 'REFERENCE_SCENE' (WITHOUT any text or objects from it).
      `;

      const image = await generateViaProxy([...baseParts, { text: prompt }], modelId, aspectRatio, imageSize);
      const newImages: string[] = [image];

      if (newImages.length === 0) {
        throw new Error("未能生成图片，请重试。");
      }
      setGeneratedImages(newImages);
      await platform.refreshCredits?.();
    } catch (err: any) {
      console.error("Generation Error:", err);
      setError(err?.message || '生成过程中出现错误');
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadImage = async (img: string, index: number) => {
    if (!img) {
      setError('当前没有可下载的图片');
      return;
    }

    setError(null);
    const fileName = `ai-product-scene-${index + 1}-${Date.now()}.png`;

    try {
      if (img.startsWith('data:')) {
        const normalizedDataUrl = img.replace(/\s+/g, '');
        let blob: Blob;
        try {
          blob = await fetch(normalizedDataUrl).then((res) => res.blob());
        } catch {
          blob = dataUrlToBlob(normalizedDataUrl);
        }

        const objectUrl = URL.createObjectURL(blob);
        triggerFileDownload(objectUrl, fileName, () => {
          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        });
        return;
      }

      triggerFileDownload(img, fileName);
    } catch (err) {
      console.error('download image failed:', err);
      setError('下载失败，请重试或右键图片另存为');
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F] font-sans selection:bg-blue-100">
      <main className="flex h-[calc(100vh-64px)] overflow-hidden">
        {/* Left Sidebar: Upload & Params */}
        <aside className="w-96 border-r border-black/5 bg-white overflow-y-auto p-6 flex flex-col gap-8">
          {/* Upload Section */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
              <Upload className="w-3 h-3" /> 1. 上传商品图
            </h2>
            <div 
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => onDragOver(e, 'product')}
              onDragLeave={() => onDragLeave('product')}
              onDrop={(e) => onDrop(e, 'product')}
              className={`
                relative aspect-square rounded-2xl border-2 border-dashed transition-all cursor-pointer overflow-hidden
                ${originalImage ? 'border-transparent' : 'border-gray-200 hover:border-black/20 hover:bg-gray-50'}
                ${isDragging ? 'border-blue-500 bg-blue-50' : ''}
              `}
            >
              {originalImage ? (
                <>
                  <img src={originalImage} alt="Original" className="w-full h-full object-contain p-4" referrerPolicy="no-referrer" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                    <p className="text-white text-xs font-medium">更换图片</p>
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                    <Plus className="text-gray-400 w-6 h-6" />
                  </div>
                  <p className="text-sm font-medium text-gray-600">点击或拖拽上传</p>
                  <p className="text-xs text-gray-400 mt-1">支持 PNG, JPG (建议白底图)</p>
                </div>
              )}
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={(e) => handleFileUpload(e, 'product')} 
                accept="image/*" 
                className="hidden" 
              />
            </div>
          </section>

          {/* Reference Image Section */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
              <ImageIcon className="w-3 h-3" /> 2. 上传参考图 (风格指南)
            </h2>
            <div 
              onClick={() => refImageInputRef.current?.click()}
              onDragOver={(e) => onDragOver(e, 'reference')}
              onDragLeave={() => onDragLeave('reference')}
              onDrop={(e) => onDrop(e, 'reference')}
              className={`
                relative aspect-video rounded-2xl border-2 border-dashed transition-all cursor-pointer overflow-hidden
                ${referenceImage ? 'border-transparent' : 'border-gray-200 hover:border-black/20 hover:bg-gray-50'}
                ${isDraggingRef ? 'border-blue-500 bg-blue-50' : ''}
              `}
            >
              {referenceImage ? (
                <>
                  <img src={referenceImage} alt="Reference" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                    <p className="text-white text-xs font-medium">更换参考图</p>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setReferenceImage(null); }}
                    className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                  <p className="text-xs font-medium text-gray-600">上传参考图以模仿其背景和灯光</p>
                  <p className="text-[10px] text-gray-400 mt-1">(可选)</p>
                </div>
              )}
              <input 
                type="file" 
                ref={refImageInputRef} 
                onChange={(e) => handleFileUpload(e, 'reference')} 
                accept="image/*" 
                className="hidden" 
              />
            </div>
          </section>

          {/* Color Standards Upload */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
              <Palette className="w-3 h-3" /> 3. 设定颜色标准 (必填)
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {(['黑色', '古铜金', '银色'] as const).map((color) => (
                <div key={color} className="flex flex-col gap-1">
                  <div 
                    onClick={() => colorStandardRefs[color].current?.click()}
                    className={`
                      relative aspect-square rounded-xl border-2 border-dashed transition-all cursor-pointer overflow-hidden flex items-center justify-center
                      ${colorStandards[color] ? 'border-transparent' : 'border-gray-200 hover:border-black/20 hover:bg-gray-50'}
                    `}
                  >
                    {colorStandards[color] ? (
                      <img src={colorStandards[color]!} alt={color} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <Plus className="text-gray-300 w-4 h-4" />
                    )}
                    <input 
                      type="file" 
                      ref={colorStandardRefs[color]} 
                      onChange={(e) => handleFileUpload(e, color)} 
                      accept="image/*" 
                      className="hidden" 
                    />
                  </div>
                  <span className="text-[10px] text-center text-gray-500">{color}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-2">上传对应颜色的实际效果图，AI 将以此为准。</p>
          </section>

          {/* Color Selection */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
              <Check className="w-3 h-3" /> 4. 选择生成颜色
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {COLOR_OPTIONS.map((color) => (
                <button
                  key={color.id}
                  onClick={() => setSelectedColor(color.id)}
                  className={`
                    flex items-center gap-2 p-2 rounded-xl text-xs font-medium transition-all border
                    ${selectedColor === color.id 
                      ? 'bg-black text-white border-black shadow-sm' 
                      : 'bg-white text-gray-600 border-gray-200 hover:border-black/20'}
                  `}
                >
                  <div className={`w-4 h-4 rounded-full border border-black/10 ${color.colorClass}`} />
                  {color.name}
                </button>
              ))}
            </div>
          </section>

          {/* Aspect Ratio */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
              <Layout className="w-3 h-3" /> 5. 输出比例
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {(["1:1", "3:4", "9:16"] as const).map((ratio) => (
                <button
                  key={ratio}
                  onClick={() => setAspectRatio(ratio)}
                  className={`
                    py-2 rounded-xl text-xs font-medium transition-all border
                    ${aspectRatio === ratio 
                      ? 'bg-black text-white border-black shadow-sm' 
                      : 'bg-white text-gray-600 border-gray-200 hover:border-black/20'}
                  `}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </section>

          {/* Image Size */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
              <Sparkles className="w-3 h-3" /> 6. 输出分辨率
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {(["1K", "2K", "4K"] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => setImageSize(size)}
                  className={`
                    py-2 rounded-xl text-xs font-medium transition-all border
                    ${imageSize === size 
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                      : 'bg-white text-gray-600 border-gray-200 hover:border-black/20'}
                  `}
                >
                  {size}
                </button>
              ))}
            </div>
          </section>

          {/* Object Styling */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
              <Palette className="w-3 h-3" /> 7. 物体材质/表面处理 (可选)
            </h2>
            <div className="flex flex-wrap gap-2 mb-3">
              {['细腻喷砂', '磨砂金属', '抛光陶瓷', '拉丝铝', '丝绒质感', '透明玻璃'].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setObjectStyling(preset)}
                  className={`
                    px-2 py-1 rounded-lg text-[10px] font-medium transition-all border
                    ${objectStyling === preset 
                      ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-sm' 
                      : 'bg-white text-gray-500 border-gray-200 hover:border-black/20'}
                  `}
                >
                  {preset}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={objectStyling}
              onChange={(e) => setObjectStyling(e.target.value)}
              placeholder="例如：细腻喷砂、亮面陶瓷、柔软丝绒..."
              className="w-full p-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black/20 transition-all"
            />
          </section>

          {/* Custom Prompt */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
              <Sparkles className="w-3 h-3" /> 8. 自定义描述 (可选)
            </h2>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="例如：阳光透过百叶窗，水波纹背景..."
              className="w-full h-24 p-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black/20 transition-all resize-none"
            />
          </section>

          {/* Generate Button */}
          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={generateScene}
              disabled={!originalImage || isGenerating}
              className={`
                w-full py-4 rounded-2xl font-semibold text-white transition-all flex items-center justify-center gap-2 shadow-lg
                ${!originalImage || isGenerating
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:scale-[1.02] active:scale-[0.98]'}
              `}
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>生成中...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  <span>生成场景图 10积分</span>
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2">
              <X className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}
        </aside>

        {/* Middle: Preview Area */}
        <section className="flex-1 bg-[#F5F5F7] p-8 overflow-y-auto">
          <AnimatePresence mode="wait">
            {!originalImage && generatedImages.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto"
              >
                <div className="w-20 h-20 bg-white rounded-3xl shadow-sm flex items-center justify-center mx-auto mb-6">
                  <ImageIcon className="text-gray-300 w-10 h-10" />
                </div>
                <h3 className="text-xl font-semibold mb-2">准备好生成大片了吗？</h3>
                <p className="text-gray-500 text-sm leading-relaxed">
                  上传一张商品图，AI 将为您生成高清场景图：
                  <br />严格遵循参考图风格，实现像素级还原。
                </p>
              </motion.div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full max-w-4xl mx-auto w-full">
                {/* Generated Preview */}
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col gap-4 w-full max-w-2xl"
                >
                  <div className="flex items-center justify-between px-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-400">生成的场景图</span>
                    {generatedImages[0] && (
                      <button 
                        onClick={() => downloadImage(generatedImages[0], 0)}
                        className="p-2 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2 px-6 py-2.5 transform hover:scale-105 active:scale-95"
                      >
                        <Download className="w-4 h-4" />
                        <span className="text-sm font-bold">下载高清图</span>
                      </button>
                    )}
                  </div>
                  <div className={`
                    relative bg-white rounded-3xl shadow-2xl overflow-hidden transition-all duration-500 w-full
                    ${aspectRatio === '1:1' ? 'aspect-square' : aspectRatio === '3:4' ? 'aspect-[3/4]' : 'aspect-[9/16]'}
                  `}>
                    {isGenerating ? (
                      <div className="absolute inset-0 bg-white flex flex-col items-center justify-center gap-4">
                        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
                        <p className="text-xs text-gray-400">正在构建场景...</p>
                      </div>
                    ) : (
                      <div className="group relative w-full h-full">
                        <img 
                          src={generatedImages[0] || originalImage || ''} 
                          alt="Preview" 
                          className={`w-full h-full ${generatedImages[0] ? 'object-cover' : 'object-contain p-8'}`} 
                          referrerPolicy="no-referrer" 
                        />
                        {generatedImages[0] && (
                          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button 
                              onClick={() => downloadImage(generatedImages[0], 0)}
                              className="bg-white/90 backdrop-blur-md text-black px-6 py-3 rounded-full font-bold shadow-xl hover:bg-white transition-all transform hover:scale-105 flex items-center gap-2"
                            >
                              <Download className="w-5 h-5" />
                              下载高清大图
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </section>
      </main>
    </div>
  );
}
