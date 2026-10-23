/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { AppProps } from '../../../types';
import {
  generateContent,
  extractImageFromResponse,
  extractTextFromResponse,
  queryVeoVideoTask,
  submitVeoVideoTask,
  uploadAssetToCOSWithPresignedURL,
} from '../../../shared_services/geminiProxyService';
import { createTaskQueueItem, queryTaskQueueVideo, recordTaskManagerObject, updateTaskQueueItem } from '../../../services/taskManagerService';

import { 
  Upload, 
  Image as ImageIcon, 
  Sparkles, 
  Camera, 
  ChevronRight, 
  ChevronDown,
  ChevronUp,
  Download, 
  RefreshCw,
  Layers,
  MapPin,
  User,
  Maximize2,
  X,
  Zap,
  Monitor,
  Eraser,
  Paintbrush,
  Check,
  Undo2,
  ShoppingBag,
  History,
  Video,
  Play,
  Film
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Stage, Layer, Line } from 'react-konva';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---

const InpaintingEditor = ({ 
  image, 
  onSave, 
  onCancel,
  isLoading 
}: { 
  image: string, 
  onSave: (mask: string, prompt: string, refImage: string | null) => void, 
  onCancel: () => void,
  isLoading: boolean
}) => {
  const [lines, setLines] = useState<any[]>([]);
  const [brushSize, setBrushSize] = useState(30);
  const [isErasing, setIsErasing] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [refImage, setRefImage] = useState<string | null>(null);
  const stageRef = useRef<any>(null);
  const isDrawing = useRef(false);
  const refInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (containerRef.current) {
      const img = new Image();
      img.src = image;
      img.onload = () => {
        const container = containerRef.current!;
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        const imgRatio = img.width / img.height;
        const containerRatio = containerWidth / containerHeight;
        
        let width, height;
        if (imgRatio > containerRatio) {
          width = containerWidth;
          height = containerWidth / imgRatio;
        } else {
          height = containerHeight;
          width = containerHeight * imgRatio;
        }
        setDimensions({ width, height });
      };
    }
  }, [image]);

  const handleMouseDown = (e: any) => {
    isDrawing.current = true;
    const pos = e.target.getStage().getPointerPosition();
    setLines([...lines, { tool: isErasing ? 'eraser' : 'brush', points: [pos.x, pos.y], size: brushSize }]);
  };

  const handleMouseMove = (e: any) => {
    if (!isDrawing.current) return;
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    let lastLine = lines[lines.length - 1];
    lastLine.points = lastLine.points.concat([point.x, point.y]);
    lines.splice(lines.length - 1, 1, lastLine);
    setLines(lines.concat());
  };

  const handleMouseUp = () => {
    isDrawing.current = false;
  };

  const handleRefUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      optimizeUploadImage(file, { maxEdge: 1280, outputType: 'image/jpeg', quality: 0.82 })
        .then((optimized) => setRefImage(optimized))
        .catch(() => {
          const reader = new FileReader();
          reader.onloadend = () => setRefImage(reader.result as string);
          reader.readAsDataURL(file);
        });
    }
  };

  const handleSave = () => {
    if (!stageRef.current) return;
    
    // Create a temporary canvas to draw only the mask
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fill background with black (no mask)
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw lines in white (mask area)
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'white';

    lines.forEach(line => {
      ctx.lineWidth = line.size;
      ctx.globalCompositeOperation = line.tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.beginPath();
      ctx.moveTo(line.points[0], line.points[1]);
      for (let i = 2; i < line.points.length; i += 2) {
        ctx.lineTo(line.points[i], line.points[i+1]);
      }
      ctx.stroke();
    });

    onSave(canvas.toDataURL('image/png'), prompt, refImage);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-white/95 backdrop-blur-2xl flex flex-col items-center p-4 md:p-8"
    >
      <div className="w-full max-w-7xl flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center border border-black/10">
            <Paintbrush className="w-6 h-6 text-black" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[#1d1d1f]">局部修改模式</h2>
            <p className="text-sm text-black/40 uppercase tracking-widest font-bold">局部修改编辑器</p>
          </div>
        </div>
        <button 
          onClick={onCancel}
          className="w-12 h-12 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center border border-black/10 transition-all"
        >
          <X className="w-6 h-6 text-black" />
        </button>
      </div>

      <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-3 gap-12 h-[calc(100vh-200px)]">
        {/* Canvas Area */}
        <div className="lg:col-span-2 relative glass-card rounded-[3rem] overflow-hidden flex items-center justify-center bg-black/5" ref={containerRef}>
          {dimensions.width > 0 && (
            <div className="relative shadow-2xl" style={{ width: dimensions.width, height: dimensions.height }}>
               <img src={image} className="w-full h-full object-contain pointer-events-none" alt="Original" />
               <div className="absolute inset-0">
                  <Stage
                    width={dimensions.width}
                    height={dimensions.height}
                    onMouseDown={handleMouseDown}
                    onMousemove={handleMouseMove}
                    onMouseup={handleMouseUp}
                    ref={stageRef}
                  >
                    <Layer>
                      {lines.map((line, i) => (
                        <Line
                          key={i}
                          points={line.points}
                          stroke="#9333ea"
                          strokeWidth={line.size}
                          tension={0.5}
                          lineCap="round"
                          lineJoin="round"
                          globalCompositeOperation={
                            line.tool === 'eraser' ? 'destination-out' : 'source-over'
                          }
                          opacity={0.5}
                        />
                      ))}
                    </Layer>
                  </Stage>
               </div>
               
               {isLoading && (
                 <div className="absolute inset-0 z-50 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
                   <RefreshCw className="w-8 h-8 animate-spin text-black" />
                   <p className="text-sm font-bold tracking-widest uppercase">正在处理...</p>
                 </div>
               )}
            </div>
          )}

          {/* Canvas Controls */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 p-3 bg-white/80 backdrop-blur-3xl rounded-3xl border border-black/10 shadow-2xl">
            <button 
              onClick={() => setIsErasing(false)}
              className={cn("w-12 h-12 rounded-2xl transition-all flex items-center justify-center", !isErasing ? "bg-black text-white" : "text-black/40 hover:bg-black/5")}
            >
              <Paintbrush className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setIsErasing(true)}
              className={cn("w-12 h-12 rounded-2xl transition-all flex items-center justify-center", isErasing ? "bg-black text-white" : "text-black/40 hover:bg-black/5")}
            >
              <Eraser className="w-5 h-5" />
            </button>
            <div className="w-px h-8 bg-black/10 mx-2" />
            <input 
              type="range" 
              min="5" 
              max="100" 
              value={brushSize} 
              onChange={(e) => setBrushSize(parseInt(e.target.value))}
              className="w-32 accent-black"
            />
            <button 
              onClick={() => setLines([])}
              className="p-2 md:p-3 rounded-xl text-black/60 hover:bg-black/10 transition-all"
            >
              <RefreshCw className="w-4 h-4 md:w-5 md:h-5" />
            </button>
          </div>
        </div>

        {/* Sidebar Area */}
        <div className="flex flex-col gap-8">
          <div className="glass-card rounded-[2.5rem] p-8 space-y-8">
            <div>
              <label className="text-[12px] uppercase tracking-[0.2em] text-black/40 font-bold block mb-4">修改指令</label>
              <textarea 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="描述您想要修改的内容..."
                className="w-full h-32 bg-black/5 border border-black/10 rounded-2xl p-5 text-sm text-[#1d1d1f] placeholder:text-black/20 focus:outline-none focus:border-black/20 transition-all resize-none"
              />
            </div>

            <div>
              <label className="text-[12px] uppercase tracking-[0.2em] text-black/40 font-bold block mb-4">参考图 (可选)</label>
              <div 
                onClick={() => refInputRef.current?.click()}
                className={cn(
                  "aspect-video rounded-2xl border-2 border-dashed border-black/10 bg-black/5 flex flex-col items-center justify-center cursor-pointer hover:bg-black/10 transition-all overflow-hidden group",
                  refImage && "border-black/20"
                )}
              >
                {refImage ? (
                  <img src={refImage} className="w-full h-full object-cover" alt="Ref" />
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Upload className="w-6 h-6 text-black/20" />
                    <span className="text-[12px] text-black/40 font-bold tracking-widest uppercase">上传参考图</span>
                  </div>
                )}
              </div>
              <input type="file" ref={refInputRef} onChange={handleRefUpload} className="hidden" accept="image/*" />
            </div>
          </div>

          <button 
            onClick={handleSave}
            disabled={isLoading || !prompt}
            className="mt-auto w-full py-6 bg-black text-white rounded-[2rem] font-bold tracking-[0.2em] uppercase flex items-center justify-center gap-4 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl"
          >
            {isLoading ? <RefreshCw className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />}
            {isLoading ? "处理中..." : "应用修改"}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// --- Constants & Types ---

const SCENES = [
  { id: 'studio', name: '极简摄影棚', description: '干净、专业的摄影棚设置', prompt: '在一间极简的高端摄影棚内，模特身着服装，柔光箱照明，干净的背景' },
  { id: 'industrial', name: '工业水泥', description: '灰白斑驳墙面，低饱和极简风格', prompt: '模特穿着高跟鞋站在岩石上，背景是灰白色的斑驳水泥墙，低饱和度，构图简洁干净，微低视角，高端时尚摄影风格' },
  { id: 'paris', name: '巴黎街头', description: '欧式经典街道，晨曦微光，电影感', prompt: '模特走在经典的巴黎鹅卵石街道上，背景是奥斯曼风格建筑，柔和的晨光，电影氛围，高端街头时尚摄影' },
  { id: 'desert', name: '荒漠孤寂', description: '广袤沙丘，强对比光影，高级感', prompt: '模特站在广袤的沙丘上，晴朗的蓝天，戏剧性的高对比阳光和阴影，极简构图，高端时尚大片风格' },
  { id: 'brutalist', name: '极简建筑', description: '清水混凝土，几何线条，艺术感', prompt: '模特身处极简主义的粗野主义建筑背景中，清水混凝土墙面，锐利的几何线条，戏剧性的自然光，前卫时尚摄影' },
  { id: 'luxury', name: '奢华室内', description: '高奢酒店套房，暖调柔光，慵懒质感', prompt: '模特在豪华的高端酒店套房内，天鹅绒家具，温暖柔和的环境光，精致优雅的氛围，奢华生活方式摄影' },
  { id: 'night-oriental', name: '暗夜东方', description: '暗色渐变夜空，中式屋檐点缀', prompt: '模特站在岩石上，背景是带有微妙渐变效果的黑夜，极简的中式建筑屋檐作为背景装饰，构图简洁干净，微低视角，电影感光影' },
  { id: 'nature', name: '自然景观', description: '优美的户外环境', prompt: '模特在黄金时段优美的自然景观中，时尚大片摄影风格' },
  { id: 'custom', name: '自定义场景', description: '输入您想要的任何背景描述', prompt: '' },
];

const AGE_OPTIONS = [
  { id: '18-22', name: '18-22', prompt: '年龄在18-22岁之间' },
  { id: '22-25', name: '22-25', prompt: '年龄在22-25岁之间' },
  { id: '25-35', name: '25-35', prompt: '年龄在25-35岁之间' },
  { id: '35-40', name: '35-40', prompt: '年龄在35-40岁之间' },
];

const ETHNICITY_OPTIONS = [
  { id: 'chinese-american', name: '中美混血', prompt: '中美混血面孔' },
  { id: 'chinese', name: '中国', prompt: '中国面孔' },
  { id: 'western', name: '欧美/白人', prompt: '欧美/白人面孔' },
  { id: 'african', name: '非裔', prompt: '非裔面孔' },
];

const GENDER_OPTIONS = [
  { id: 'female', name: '女性', prompt: '女性' },
  { id: 'male', name: '男性', prompt: '男性' },
  { id: 'unisex', name: '中性', prompt: '中性' },
];

const HAIRSTYLE_OPTIONS = [
  { id: 'long-straight-black', name: '黑色长直发 (齐刘海)', prompt: '黑色长直发，带有齐刘海' },
  { id: 'short-black', name: '黑色短发 (齐刘海)', prompt: '黑色短发，带有齐刘海' },
  { id: 'bun-black', name: '黑色极简发髻', prompt: '黑色头发，梳成极简的发髻，中分' },
  { id: 'bun-brown', name: '棕色极简发髻', prompt: '棕色头发，梳成极简的发髻，中分' },
];

const ASPECT_RATIOS = [
  { id: 'ratio-1-1', name: '1:1', value: '1:1' },
  { id: 'ratio-3-4', name: '3:4', value: '3:4' },
  { id: 'ratio-4-3', name: '4:3', value: '4:3' },
  { id: 'ratio-16-9', name: '16:9', value: '16:9' },
  { id: 'ratio-9-16', name: '9:16', value: '9:16' },
];

// --- Components ---

interface HistoryItem {
  id: string;
  type: 'image' | 'video';
  url: string;
  timestamp: number;
}

function toSoraAspectRatio(ratio: string): '16:9' | '9:16' {
  const [w, h] = ratio.split(':').map((v) => Number(v));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return '16:9';
  }
  return w >= h ? '16:9' : '9:16';
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string | null;
      if (!result) {
        reject(new Error('图片读取失败'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

async function optimizeUploadImage(
  file: File,
  options: {
    maxEdge?: number;
    outputType?: 'image/jpeg' | 'image/png';
    quality?: number;
    minOptimizeBytes?: number;
  } = {}
): Promise<string> {
  const {
    maxEdge = 1600,
    outputType = 'image/jpeg',
    quality = 0.86,
    minOptimizeBytes = 900 * 1024,
  } = options;

  const original = await readFileAsDataUrl(file);
  if (file.size <= minOptimizeBytes) {
    return original;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const srcW = img.naturalWidth || img.width;
      const srcH = img.naturalHeight || img.height;
      if (!srcW || !srcH) {
        resolve(original);
        return;
      }

      const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
      const targetW = Math.max(1, Math.round(srcW * scale));
      const targetH = Math.max(1, Math.round(srcH * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(original);
        return;
      }

      // JPEG does not support alpha. Fill white to avoid black edges for transparent uploads.
      if (outputType === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetW, targetH);
      }
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const optimized = canvas.toDataURL(outputType, quality);
      if (optimized.length >= original.length) {
        resolve(original);
        return;
      }

      resolve(optimized);
    };
    img.onerror = () => resolve(original);
    img.src = original;
  });
}

function normalizeGenerationError(error: unknown): string {
  const msg = String((error as any)?.message || error || '生成过程中发生错误。');
  const lower = msg.toLowerCase();
  if (
    lower.includes('err_empty_response') ||
    lower.includes('failed to fetch') ||
    lower.includes('empty response') ||
    lower.includes('network')
  ) {
    return '网络连接中断（ERR_EMPTY_RESPONSE）。已自动重试；若仍失败，请减少参考图数量或压缩图片后重试。';
  }
  return msg;
}

function isTransientImageGenerationError(error: unknown): boolean {
  const msg = String((error as any)?.message || error || '').toLowerCase();
  return (
    msg.includes('err_empty_response') ||
    msg.includes('empty response') ||
    msg.includes('返回空响应') ||
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('no image') ||
    msg.includes('broken pipe') ||
    msg.includes('socket') ||
    msg.includes('connection') ||
    msg.includes('timeout')
  );
}

async function optimizeSoraReferenceImage(
  dataUrl: string,
  targetAspectRatio: '16:9' | '9:16'
): Promise<{ imageBytes: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const srcW = img.naturalWidth || img.width;
      const srcH = img.naturalHeight || img.height;
      if (!srcW || !srcH) {
        reject(new Error('参考图尺寸无效'));
        return;
      }

      const [targetRatioW, targetRatioH] = targetAspectRatio.split(':').map((v) => Number(v));
      if (!Number.isFinite(targetRatioW) || !Number.isFinite(targetRatioH) || targetRatioW <= 0 || targetRatioH <= 0) {
        reject(new Error('视频比例无效'));
        return;
      }

      // 统一先做成目标视频比例，避免服务端强制缩放时造成画面挤压变形。
      const targetW = targetAspectRatio === '16:9' ? 1280 : 720;
      const targetH = targetAspectRatio === '16:9' ? 720 : 1280;

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('无法处理参考图'));
        return;
      }

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, targetW, targetH);

      const scale = Math.min(targetW / srcW, targetH / srcH);
      const drawW = Math.max(1, Math.round(srcW * scale));
      const drawH = Math.max(1, Math.round(srcH * scale));
      const offsetX = Math.floor((targetW - drawW) / 2);
      const offsetY = Math.floor((targetH - drawH) / 2);
      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

      // JPEG 在保证质量的同时显著减少上传体积，降低请求超时风险。
      const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
      const commaIdx = optimizedDataUrl.indexOf(',');
      if (commaIdx === -1) {
        reject(new Error('参考图处理失败'));
        return;
      }

      resolve({
        imageBytes: optimizedDataUrl.slice(commaIdx + 1),
        mimeType: 'image/jpeg',
      });
    };
    img.onerror = () => reject(new Error('参考图加载失败'));
    img.src = dataUrl;
  });
}

const DEFAULT_IMAGE_COST = 20;
const DEFAULT_VIDEO_COST = 25;
const APP_ID = 'fashion-branding_sa';
const VEO_VIDEO_MODEL = 'veo_3_1';
const VEO_VIDEO_ENGINE = 'veo31';
const VEO_VIDEO_SIZE_BY_RATIO = {
  '16:9': '1080x720',
  '9:16': '720x1080',
} as const;
const VIDU_VIDEO_MODEL = 'vidu-q3-pro-1080p';
const VIDU_VIDEO_ENGINE = 'vidu';
const VIDU_VIDEO_SIZE_BY_RATIO = {
  '16:9': '1920x1080',
  '9:16': '1080x1920',
} as const;
const GROK_VIDEO_MODEL = 'grok-video-3-pro';
const GROK_VIDEO_ENGINE = 'grokv3';
const GROK_VIDEO_SIZE = '1080x1080';
const ENABLE_VIDU_VIDEO_LOGIC = false;
const ENABLE_GROK_VIDEO_LOGIC = false;
const ACTIVE_VIDEO_MODEL = VEO_VIDEO_MODEL;
const ACTIVE_VIDEO_ENGINE = VEO_VIDEO_ENGINE;
const VIDEO_SUBMIT_MAX_RETRIES = 3;
const ENABLE_VIDEO_GEN = false;

function resolveConfiguredImageCost(costs: AppProps['costs'] | undefined): number {
  const candidates = [costs?.shot_image, costs?.image_gen, costs?.GENERATE_IMAGE];
  for (const candidate of candidates) {
    const amount = Number(candidate);
    if (Number.isFinite(amount) && amount > 0) {
      return amount;
    }
  }
  return DEFAULT_IMAGE_COST;
}

function resolveConfiguredVideoCost(costs: AppProps['costs'] | undefined): number {
  const candidates = [costs?.video_gen, costs?.grok_video_gen, costs?.GENERATE_VIDEO];
  for (const candidate of candidates) {
    const amount = Number(candidate);
    if (Number.isFinite(amount) && amount > 0) {
      return amount;
    }
  }
  return DEFAULT_VIDEO_COST;
}

function resolveFashionVideoBillingTask(costs: AppProps['costs'] | undefined, durationSeconds: number): string {
  if (
    ENABLE_GROK_VIDEO_LOGIC &&
    durationSeconds >= 8 &&
    Number.isFinite(Number(costs?.grok_video_gen)) &&
    Number(costs?.grok_video_gen) > 0
  ) {
    return 'grok_video_gen';
  }
  if (Number.isFinite(Number(costs?.video_gen)) && Number(costs?.video_gen) >= 0) {
    return 'video_gen';
  }
  return 'video_gen';
}

function resolveFashionVideoExecution(ratio: string): {
  model: string;
  engine: string;
  aspectRatio: '16:9' | '9:16';
  size: string;
} {
  const aspectRatio = toSoraAspectRatio(ratio);
  if (ACTIVE_VIDEO_MODEL === VEO_VIDEO_MODEL) {
    return {
      model: ACTIVE_VIDEO_MODEL,
      engine: ACTIVE_VIDEO_ENGINE,
      aspectRatio,
      size: VEO_VIDEO_SIZE_BY_RATIO[aspectRatio],
    };
  }

  if (ENABLE_VIDU_VIDEO_LOGIC && ACTIVE_VIDEO_MODEL === VIDU_VIDEO_MODEL) {
    return {
      model: ACTIVE_VIDEO_MODEL,
      engine: ACTIVE_VIDEO_ENGINE,
      aspectRatio,
      size: VIDU_VIDEO_SIZE_BY_RATIO[aspectRatio],
    };
  }

  return {
    model: ACTIVE_VIDEO_MODEL,
    engine: ACTIVE_VIDEO_ENGINE,
    aspectRatio,
    size: GROK_VIDEO_SIZE,
  };
}

type QueueStatus = 'queued' | 'running' | 'finished' | 'failed';

function normalizeTaskQueueStatus(status: string, videoUrl?: string | null): QueueStatus {
  const normalized = String(status || '').trim().toLowerCase();
  if (videoUrl) {
    return 'finished';
  }
  if (normalized === 'failed' || normalized === 'error' || normalized === 'cancelled') {
    return 'failed';
  }
  if (normalized === 'running' || normalized === 'processing' || normalized === 'in_progress') {
    return 'running';
  }
  return 'queued';
}

function isTerminalVideoTaskStatus(status: string): boolean {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'failed' || normalized === 'error' || normalized === 'cancelled' || normalized === 'completed' || normalized === 'success' || normalized === 'succeeded';
}

function isTransientVideoTaskNotFoundError(error: unknown): boolean {
  const message = String((error as any)?.message || '').trim().toLowerCase();
  return message.includes('task_not_exist') || message.includes('task not exist') || message.includes('task_not_ex');
}

function isAppPricingRuleNotFoundError(error: unknown): boolean {
  const message = String((error as any)?.message || '').trim().toLowerCase();
  return message.includes('app pricing rule not found');
}

function isUnsupportedVideoSizeError(error: unknown): boolean {
  const message = String((error as any)?.message || '').trim().toLowerCase();
  return message.includes('size must be') && (message.includes('720p/1080p') || message.includes('supported resolution'));
}

function isTransientVideoSubmitError(error: unknown): boolean {
  if (isAppPricingRuleNotFoundError(error) || isUnsupportedVideoSizeError(error)) {
    return false;
  }

  const message = String((error as any)?.message || '').trim().toLowerCase();
  return (
    message.includes('status=502') ||
    message.includes('bad gateway') ||
    message.includes('status=503') ||
    message.includes('status=504') ||
    message.includes('gateway timeout') ||
    message.includes('upstream request failed') ||
    message.includes('all mapped keys failed') ||
    message.includes('timeout') ||
    message.includes('failed to fetch')
  );
}

async function assetUrlToBlob(assetUrl: string): Promise<Blob> {
  const response = await fetch(assetUrl);
  if (!response.ok) {
    throw new Error(`asset fetch failed: HTTP ${response.status}`);
  }
  return response.blob();
}

export default function App({ platform, costs }: AppProps) {
  const imageGenerationCost = resolveConfiguredImageCost(costs);
  const videoGenerationCost = resolveConfiguredVideoCost(costs);
  const [image, setImage] = useState<string | null>(null);
  const [detailImages, setDetailImages] = useState<(string | null)[]>([null, null, null]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultImages, setResultImages] = useState<string[]>([]);
  const [selectedResultIndex, setSelectedResultIndex] = useState<number>(0);
  const resultImage = resultImages[selectedResultIndex] || null;
  const [hdResults, setHdResults] = useState<Record<string, string>>({});
  const [currentSize, setCurrentSize] = useState('2K');
  const [selectedScene, setSelectedScene] = useState(SCENES[3]);
  const [customScene, setCustomScene] = useState('');
  const [selectedAge, setSelectedAge] = useState(AGE_OPTIONS[1]);
  const [selectedEthnicity, setSelectedEthnicity] = useState(ETHNICITY_OPTIONS[0]);
  const [selectedGender, setSelectedGender] = useState(GENDER_OPTIONS[0]);
  const [selectedHairStyle, setSelectedHairStyle] = useState<typeof HAIRSTYLE_OPTIONS[0] | null>(null);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState(ASPECT_RATIOS[0]);
  const [accessoryImages, setAccessoryImages] = useState<(string | null)[]>([null, null, null]);
  const [error, setError] = useState<string | null>(null);
  const [showZoom, setShowZoom] = useState<string | null>(null);
  const [isSceneExpanded, setIsSceneExpanded] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isVideoGenerating, setIsVideoGenerating] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [videoProgress, setVideoProgress] = useState<string>("");
  const [latestVideoTaskId, setLatestVideoTaskId] = useState<string>("");
  const [persistedPreviewUrl, setPersistedPreviewUrl] = useState<string | null>(null);
  const [queueNotice, setQueueNotice] = useState<string | null>(null);
  const [pendingVideoTaskId, setPendingVideoTaskId] = useState<string | null>(null);
  const [pendingVideoTaskStatus, setPendingVideoTaskStatus] = useState<string | null>(null);
  const [pendingQueueTaskId, setPendingQueueTaskId] = useState<number | null>(null);
  const [videoCustomPrompt, setVideoCustomPrompt] = useState<string>("");
  const [isEditingVideoPrompt, setIsEditingVideoPrompt] = useState(false);
  const expectedImageCount = 2;
  const pendingImageCount = Math.max(0, expectedImageCount - resultImages.length);
  const showPendingImageSpinner = isGenerating && resultImages.length > 0 && pendingImageCount > 0;
  const showVideoGenButton = ENABLE_VIDEO_GEN && Boolean(resultImage);
  const activeVideoConfig = resolveFashionVideoExecution(selectedAspectRatio.value);
  
  // Local Modification State
  const [isModifying, setIsModifying] = useState(false);
  const [modificationPrompt, setModificationPrompt] = useState("");
  const [modificationRefImage, setModificationRefImage] = useState<string | null>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [brushSize, setBrushSize] = useState(20);
  const [isErasing, setIsErasing] = useState(false);
  const [isModifyingLoading, setIsModifyingLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const detailInputRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  const accessoryInputRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  const reportTaskQueuePersistenceFailure = (contextLabel: string, reason: unknown) => {
    console.error(`[${APP_ID}] ${contextLabel} task persistence failed`, reason);
    setQueueNotice(`${contextLabel}已完成，但写入任务面板失败。`);
  };

  const persistGeneratedImageTask = async (imageDataUrl: string, index: number) => {
    const taskName = `时尚拍摄图 ${index + 1}`;
    const blob = await assetUrlToBlob(imageDataUrl);
    const upload = await uploadAssetToCOSWithPresignedURL(blob, {
      fileName: `fashion-branding-${Date.now()}-${index + 1}.png`,
      objectPath: `standalone/${APP_ID}/generated_images`,
      appID: APP_ID,
      camAppID: APP_ID,
      contentType: blob.type || 'image/png',
    });

    const persistedURL =
      String(upload.url || '').trim() ||
      String(upload.signed_url || '').trim() ||
      String(upload.public_url || '').trim() ||
      imageDataUrl;
    if (index === 0) {
      setPersistedPreviewUrl(persistedURL);
    }

    let objectRecord: Awaited<ReturnType<typeof recordTaskManagerObject>> | null = null;
    if (String(upload.bucket_name || '').trim() && String(upload.object_key || '').trim()) {
      try {
        objectRecord = await recordTaskManagerObject({
          bucket_name: String(upload.bucket_name || '').trim(),
          region: String(upload.region || '').trim(),
          object_key: String(upload.object_key || '').trim(),
          url: persistedURL,
          size_bytes: blob.size,
          mime_type: blob.type || 'image/png',
        });
      } catch (recordError) {
        console.warn(`[${APP_ID}] image object record failed, continue task creation`, recordError);
      }
    }

    try {
      await createTaskQueueItem({
        source_app_id: APP_ID,
        item_type: 'image_link',
        status: 'finished',
        payload: {
          title: taskName,
          name: taskName,
          image_url: persistedURL,
          url: persistedURL,
          object_id: objectRecord?.object_id,
          object_key: upload.object_key,
          bucket: upload.bucket_name,
          region: upload.region,
          mime_type: blob.type || 'image/png',
          size_bytes: blob.size,
          aspect_ratio: selectedAspectRatio.value,
          scene: selectedScene.name,
        },
      });
    } catch (error) {
      await createTaskQueueItem({
        source_app_id: APP_ID,
        item_type: 'image_link',
        status: 'finished',
        payload: {
          title: taskName,
          name: taskName,
          image_url: persistedURL,
          url: persistedURL,
          aspect_ratio: selectedAspectRatio.value,
          scene: selectedScene.name,
        },
      });
      console.warn(`[${APP_ID}] image task persisted with minimal payload`, error);
    }
  };

  const persistVideoTask = async (generation: { taskId: string | null; status: string; videoUrl: string | null }) => {
    const taskName = '时尚视频生成';
    return createTaskQueueItem({
      source_app_id: APP_ID,
      item_type: 'video_task',
      status: normalizeTaskQueueStatus(generation.status, generation.videoUrl),
      payload: {
        title: taskName,
        name: taskName,
        task_id: generation.taskId,
        taskId: generation.taskId,
        query_status: generation.status,
        model: activeVideoConfig.model,
        engine: activeVideoConfig.engine,
        video_url: generation.videoUrl,
        videoUrl: generation.videoUrl,
        prompt: videoCustomPrompt,
        duration_seconds: 8,
        preview_url: persistedPreviewUrl || resultImage,
        aspect_ratio: activeVideoConfig.aspectRatio,
        scene: selectedScene.name,
      },
    });
  };

  const buildVideoTaskPayload = (taskId: string | null, status: string, videoUrl: string | null) => ({
    title: '时尚视频生成',
    name: '时尚视频生成',
    task_id: taskId,
    taskId: taskId,
    query_status: status,
    model: activeVideoConfig.model,
    engine: activeVideoConfig.engine,
    video_url: videoUrl,
    videoUrl: videoUrl,
    prompt: videoCustomPrompt,
    duration_seconds: 8,
    preview_url: persistedPreviewUrl || resultImage,
    aspect_ratio: activeVideoConfig.aspectRatio,
    scene: selectedScene.name,
  });

  const handleLocalModification = async (mask: string, prompt: string, refImage: string | null) => {
    if (!resultImage) return;
    setIsModifyingLoading(true);
    setError(null);

    try {
      // Prepare parts
      const parts: any[] = [
        {
          inlineData: {
            data: resultImage.split(',')[1],
            mimeType: resultImage.split(';')[0].split(':')[1],
          },
        },
        {
          inlineData: {
            data: mask.split(',')[1],
            mimeType: mask.split(';')[0].split(':')[1],
          },
        },
        {
          text: `我提供了一张原始时尚图像和一张蒙版图像（绿色区域）。
          请根据以下指令修改蒙版指示的区域： "${prompt}"。
          ${refImage ? "我还提供了一张参考图，用于修改的风格/内容。" : ""}
          保持图像的其他部分完全不变。维持专业的时尚摄影质量。
          严禁在图像中包含任何水印、徽标、文字或叠加层。`
        }
      ];

      if (refImage) {
        parts.push({
          inlineData: {
            data: refImage.split(',')[1],
            mimeType: refImage.split(';')[0].split(':')[1],
          },
        });
      }

      const response = await generateContent({
        model: 'gemini-3.1-flash-image-preview',
        task: 'image_gen',
        billing_task: 'image_gen',
        contents: { parts },
      });
      const newImage = extractImageFromResponse(response);
      if (!newImage) {
        throw new Error('修改失败，请重试。');
      }
      setResultImages(prev => {
        const next = [...prev];
        next[selectedResultIndex] = newImage;
        return next;
      });
      setIsModifying(false);
    } catch (err: any) {
      console.error(err);
      setError(normalizeGenerationError(err));
    } finally {
      setIsModifyingLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, setter?: (val: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      optimizeUploadImage(file, { maxEdge: 1800, outputType: 'image/jpeg', quality: 0.86 })
        .then((result) => {
          if (setter) {
            setter(result);
          } else {
            setImage(result);
            setResultImages([]);
            setSelectedResultIndex(0);
            setError(null);
            setPersistedPreviewUrl(null);
            setQueueNotice(null);
            setPendingVideoTaskId(null);
            setPendingVideoTaskStatus(null);
            setPendingQueueTaskId(null);
            setLatestVideoTaskId('');
            setVideoProgress('');
          }
        })
        .catch((err) => {
          console.error('主图优化失败，回退原图:', err);
          readFileAsDataUrl(file).then((result) => {
            if (setter) {
              setter(result);
            } else {
              setImage(result);
              setResultImages([]);
              setSelectedResultIndex(0);
              setError(null);
              setPersistedPreviewUrl(null);
              setQueueNotice(null);
              setPendingVideoTaskId(null);
              setPendingVideoTaskStatus(null);
              setPendingQueueTaskId(null);
              setLatestVideoTaskId('');
              setVideoProgress('');
            }
          });
        });
    }
  };

  const handleDetailUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      optimizeUploadImage(file, { maxEdge: 1400, outputType: 'image/jpeg', quality: 0.82 })
        .then((optimized) => {
          const newDetails = [...detailImages];
          newDetails[index] = optimized;
          setDetailImages(newDetails);
        })
        .catch((err) => {
          console.error('细节图优化失败，回退原图:', err);
          readFileAsDataUrl(file).then((raw) => {
            const newDetails = [...detailImages];
            newDetails[index] = raw;
            setDetailImages(newDetails);
          });
        });
    }
  };

  const handleAccessoryUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      optimizeUploadImage(file, { maxEdge: 1400, outputType: 'image/jpeg', quality: 0.82 })
        .then((optimized) => {
          const newAccessories = [...accessoryImages];
          newAccessories[index] = optimized;
          setAccessoryImages(newAccessories);
        })
        .catch((err) => {
          console.error('配饰图优化失败，回退原图:', err);
          readFileAsDataUrl(file).then((raw) => {
            const newAccessories = [...accessoryImages];
            newAccessories[index] = raw;
            setAccessoryImages(newAccessories);
          });
        });
    }
  };

  const generateFashionShoot = async (size: string = '1K') => {
    if (!image) return;

    const totalImageCost = imageGenerationCost;
    if (!platform.checkBalance(totalImageCost)) {
      return;
    }

    setIsGenerating(true);
    setError(null);
    setResultImages([]);
    setSelectedResultIndex(0);

    try {
      // Extract base64 data for main image
      const base64Data = image.split(',')[1];
      const mimeType = image.split(';')[0].split(':')[1];

      // Prepare parts for Gemini
      const parts: any[] = [
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType,
          },
        },
      ];

      // Add detail images as context
      detailImages.forEach((detail) => {
        if (detail) {
          const dBase64 = detail.split(',')[1];
          const dMime = detail.split(';')[0].split(':')[1];
          parts.push({
            inlineData: {
              data: dBase64,
              mimeType: dMime,
            },
          });
        }
      });

      // Add accessory images as context
      accessoryImages.forEach((acc) => {
        if (acc) {
          const aBase64 = acc.split(',')[1];
          const aMime = acc.split(';')[0].split(':')[1];
          parts.push({
            inlineData: {
              data: aBase64,
              mimeType: aMime,
            },
          });
        }
      });

      const modelDescription = `一位专业的${selectedGender.prompt}时尚模特，${selectedEthnicity.prompt}，${selectedAge.prompt}`;
      const scenePrompt = selectedScene.id === 'custom' ? customScene : selectedScene.prompt;
      
      const hairStylePrompt = selectedHairStyle ? `模特的发型应该是${selectedHairStyle.prompt}。` : "";

      const accessoryPrompt = accessoryImages.some(a => a !== null) 
        ? "模特还应搭配提供的配饰（珠宝、手袋或鞋子）以完成整体造型。"
        : "";

      const prompt = `你是一位世界级的时尚摄影师。我提供了一张服装产品的主图、细节图和配饰图。
      
      任务：生成一张专业的时尚大片，由${modelDescription}穿着这张照片中完全相同的服装。
      ${hairStylePrompt}
      场景：${scenePrompt}。
      ${accessoryPrompt}
      
      要求：
      1. 上传照片中的服装必须是核心焦点。
      2. 利用细节图确保服装的颜色、纹理、面料细节和图案被完美还原。
      3. 模特的姿势应自然且具有高端时尚感（社论风格）。
      4. 光影必须与所选场景完美匹配。
      5. 最终结果必须看起来像真实的、高预算的奢侈服装品牌商业摄影。
      6. 确保服装在模特身上的贴合度真实且美观。
      7. 严禁在图像中包含任何水印、徽标、文字或叠加层。最终图像必须干净且专业。`;

      parts.push({ text: prompt });

      const generateSingleImage = async (seed: number) => {
        const maxAttempts = 3;
        let lastError: unknown = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const response = await generateContent({
              model: 'gemini-3.1-flash-image-preview',
              task: 'image_gen',
              billing_task: 'image_gen',
              contents: { parts },
              config: {
                seed,
                imageConfig: {
                  imageSize: size as any,
                  aspectRatio: selectedAspectRatio.value as any
                }
              }
            });

            const generated = extractImageFromResponse(response);
            if (!generated) {
              let detail = '';
              try {
                const text = extractTextFromResponse(response);
                if (text) {
                  detail = text.slice(0, 180);
                }
              } catch {
                // Ignore parse failures and fallback to generic transient error.
              }
              throw new Error(detail ? `empty response: ${detail}` : 'empty response: no image returned');
            }
            return generated;
          } catch (error) {
            lastError = error;
            if (!isTransientImageGenerationError(error) || attempt === maxAttempts) {
              throw error;
            }
            await sleep(1200 * attempt);
          }
        }

        throw lastError || new Error('empty response: image generation returned no usable result after retries');
      };

      // Avoid two heavy parallel image-generation requests that can trigger empty-response/network resets.
      const seedBase = Math.floor(Math.random() * 1_000_000);
      const results: string[] = [];
      for (let i = 0; i < 2; i++) {
        const generated = await generateSingleImage(seedBase + i);
        results.push(generated);
        setResultImages(prev => [...prev, generated]);
        if (i === 0) {
          setSelectedResultIndex(0);
          setHdResults(prev => ({ ...prev, [size]: generated }));
        }
      }
      await platform.refreshCredits?.();
      
      const newHistoryItems: HistoryItem[] = results.map(url => ({
        id: Math.random().toString(36).substr(2, 9),
        type: 'image',
        url,
        timestamp: Date.now()
      }));
      setHistory(prev => [...newHistoryItems, ...prev]);

      results.forEach((url, index) => {
        void persistGeneratedImageTask(url, index).catch((persistError) => {
          reportTaskQueuePersistenceFailure('海报生成', persistError);
        });
      });
    } catch (err: any) {
      console.error(err);
      setError(normalizeGenerationError(err));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleVideoGenerationClick = () => {
    if (!resultImage) return;
    
    // Pre-generate the prompt based on current settings
    const scenePrompt = selectedScene.id === 'custom' ? customScene : selectedScene.prompt;
    const modelDesc = `${selectedAge.prompt} ${selectedEthnicity.prompt} ${selectedGender.prompt}${selectedHairStyle ? `，发型为${selectedHairStyle.prompt}` : ''}`;
    const defaultPrompt = `一段电影感的高端奢华时尚大片视频。场景：${scenePrompt}。主角是一位${modelDesc}的模特。摄像机进行缓慢、精致的电影感追踪拍摄，带有微妙的视差效果。光影经过精心打造，呈现专业时尚社论风格。整体氛围高端时尚、优雅且令人向往，典型的顶级奢侈品牌影片质感。超写实纹理，4K细节，流畅的动态效果，大师级品质。`;
    
    setVideoCustomPrompt(defaultPrompt);
    setIsEditingVideoPrompt(true);
  };

  const generateFashionVideo = async () => {
    if (!resultImage) return;
    setIsEditingVideoPrompt(false);

    if (!platform.checkBalance(videoGenerationCost)) {
      return;
    }

    setIsVideoGenerating(true);
    setVideoProgress("正在初始化视频生成...");
    setError(null);
    setQueueNotice(null);
    setPendingVideoTaskId(null);
    setPendingVideoTaskStatus(null);
    setPendingQueueTaskId(null);
    let persistedVideoTaskID: number | null = null;

    try {
      const targetVideoRatio = activeVideoConfig.aspectRatio;
      const optimizedRef = await optimizeSoraReferenceImage(resultImage, targetVideoRatio);
      const durationSeconds = 8;
      const preferredBillingTask = resolveFashionVideoBillingTask(costs, durationSeconds);
      const billingTaskCandidates = preferredBillingTask === 'video_gen'
        ? ['video_gen']
        : [preferredBillingTask, 'video_gen'];

      setVideoProgress("正在上传参考图并分析风格...");

      let task: Awaited<ReturnType<typeof submitVeoVideoTask>> | null = null;
      let submitError: unknown = null;
      for (let i = 0; i < billingTaskCandidates.length; i += 1) {
        const billingTask = billingTaskCandidates[i];
        for (let attempt = 1; attempt <= VIDEO_SUBMIT_MAX_RETRIES; attempt += 1) {
          try {
            task = await submitVeoVideoTask({
              prompt: videoCustomPrompt,
              model: activeVideoConfig.model,
              task: 'video_gen_submit',
              billing_task: billingTask,
              image: {
                imageBytes: optimizedRef.imageBytes,
                mimeType: optimizedRef.mimeType,
              },
              config: {
                aspectRatio: targetVideoRatio,
                durationSeconds,
                size: activeVideoConfig.size,
              }
            });
            break;
          } catch (error) {
            submitError = error;
            const canTryFallback = i < billingTaskCandidates.length - 1 && isAppPricingRuleNotFoundError(error);
            if (canTryFallback) {
              setVideoProgress('当前计费规则未就绪，正在切换兼容计费通道...');
              break;
            }

            const canRetryTransient = attempt < VIDEO_SUBMIT_MAX_RETRIES && isTransientVideoSubmitError(error);
            if (canRetryTransient) {
              setVideoProgress(`视频服务暂时繁忙，正在重试提交（${attempt}/${VIDEO_SUBMIT_MAX_RETRIES - 1}）...`);
              await sleep(1200 * attempt);
              continue;
            }

            throw error;
          }
        }

        if (task) {
          break;
        }
      }

      if (!task) {
        throw (submitError || new Error('视频任务提交失败'));
      }

      if (task.taskId) {
        setLatestVideoTaskId(task.taskId);
      }

      try {
        const persistedTask = await persistVideoTask({
          taskId: task.taskId || null,
          status: task.status || 'queued',
          videoUrl: task.videoUrl || null,
        });
        persistedVideoTaskID = persistedTask.id;
        setPendingQueueTaskId(persistedTask.id);
      } catch (persistError) {
        reportTaskQueuePersistenceFailure('视频生成', persistError);
      }

      await platform.refreshCredits?.();

      if (task.videoUrl) {
        setVideoProgress("正在准备您的时尚短片...");
        setGeneratedVideoUrl(task.videoUrl);
        setPendingVideoTaskId(null);
        setPendingVideoTaskStatus(null);
        setPendingQueueTaskId(null);
        setQueueNotice('视频任务已完成，成片已加载。');

        if (persistedVideoTaskID !== null) {
          try {
            await updateTaskQueueItem(persistedVideoTaskID, {
              status: 'finished',
              completed_at: new Date().toISOString(),
              payload: buildVideoTaskPayload(task.taskId || null, task.status || 'completed', task.videoUrl),
            });
          } catch (updateError) {
            reportTaskQueuePersistenceFailure('视频完成状态更新', updateError);
          }
        }

        const newHistoryItem: HistoryItem = {
          id: Math.random().toString(36).substr(2, 9),
          type: 'video',
          url: task.videoUrl,
          timestamp: Date.now()
        };
        setHistory(prev => [newHistoryItem, ...prev]);
        return;
      }

      if (!task.taskId) {
        throw new Error('视频任务提交成功但未返回 taskId');
      }

      setPendingVideoTaskId(task.taskId);
      setPendingVideoTaskStatus(task.status || 'queued');
      setVideoProgress(`任务已提交，正在后台生成中... 任务ID：${task.taskId}`);
      setQueueNotice(`视频任务已提交，后台生成中。任务ID：${task.taskId}。可稍后在任务面板查询进度。`);
    } catch (err: any) {
      console.error(err);
      if (persistedVideoTaskID !== null) {
        try {
          await updateTaskQueueItem(persistedVideoTaskID, {
            status: 'failed',
            last_error: String(err?.message || '视频生成失败'),
          });
        } catch (updateError) {
          reportTaskQueuePersistenceFailure('视频失败状态更新', updateError);
        }
      }
      setError(err.message || "视频生成失败，请重试。");
    } finally {
      setIsVideoGenerating(false);
    }
  };

  useEffect(() => {
    if (!pendingVideoTaskId || generatedVideoUrl || isVideoGenerating) {
      return;
    }
    if (isTerminalVideoTaskStatus(pendingVideoTaskStatus || '')) {
      return;
    }

    let cancelled = false;
    const timerID = window.setTimeout(() => {
      void (async () => {
        try {
          if (pendingQueueTaskId !== null) {
            const queryResult = await queryTaskQueueVideo(pendingQueueTaskId);
            if (cancelled) {
              return;
            }

            const queryTaskID = String(queryResult.query.taskId || pendingVideoTaskId).trim();
            const queryStatus = String(queryResult.query.status || '').trim() || 'unknown';
            const videoUrl = queryResult.query.videoUrl;
            const queryError = String(queryResult.query.error || '').trim();

            if (queryTaskID) {
              setLatestVideoTaskId(queryTaskID);
            }
            setPendingVideoTaskStatus(queryStatus);

            if (videoUrl) {
              setGeneratedVideoUrl(videoUrl);
              setPendingVideoTaskId(null);
              setPendingVideoTaskStatus(null);
              setPendingQueueTaskId(null);
              setQueueNotice('视频任务已完成，成片已加载。');
              setVideoProgress('视频任务已完成。');

              const newHistoryItem: HistoryItem = {
                id: Math.random().toString(36).substr(2, 9),
                type: 'video',
                url: videoUrl,
                timestamp: Date.now(),
              };
              setHistory(prev => [newHistoryItem, ...prev]);

              try {
                await updateTaskQueueItem(queryResult.task.id, {
                  status: 'finished',
                  completed_at: new Date().toISOString(),
                  payload: buildVideoTaskPayload(queryTaskID || pendingVideoTaskId, queryStatus || 'completed', videoUrl),
                });
              } catch (updateError) {
                if (!cancelled) {
                  reportTaskQueuePersistenceFailure('视频完成状态更新', updateError);
                }
              }
              return;
            }

            const normalizedStatus = queryStatus.toLowerCase();
            if (normalizedStatus === 'failed' || normalizedStatus === 'error' || normalizedStatus === 'cancelled' || (queryError && isTerminalVideoTaskStatus(queryStatus))) {
              const failureMessage = queryError || `视频生成失败（${queryStatus}）`;
              setPendingVideoTaskId(null);
              setPendingVideoTaskStatus('failed');
              setPendingQueueTaskId(null);
              setQueueNotice(null);
              setVideoProgress(failureMessage);
              setError(failureMessage);

              try {
                await updateTaskQueueItem(queryResult.task.id, {
                  status: 'failed',
                  last_error: failureMessage,
                });
              } catch (updateError) {
                if (!cancelled) {
                  reportTaskQueuePersistenceFailure('视频失败状态更新', updateError);
                }
              }
              return;
            }

            setVideoProgress(`任务正在处理中... 任务ID：${queryTaskID || pendingVideoTaskId}`);
            setQueueNotice(
              queryTaskID
                ? `视频任务已提交，后台生成中。任务ID：${queryTaskID}。可稍后在任务面板查询进度。`
                : '视频任务已提交，后台生成中。可稍后在任务面板查询进度。'
            );
            return;
          }

          const fallbackResult = await queryVeoVideoTask(pendingVideoTaskId, activeVideoConfig.model);
          if (cancelled) {
            return;
          }

          const fallbackStatus = String(fallbackResult.status || '').trim() || 'unknown';
          const fallbackVideoUrl = String(fallbackResult.videoUrl || '').trim() || null;
          setPendingVideoTaskStatus(fallbackStatus);

          if (fallbackVideoUrl) {
            setGeneratedVideoUrl(fallbackVideoUrl);
            setPendingVideoTaskId(null);
            setPendingVideoTaskStatus(null);
            setQueueNotice('视频任务已完成，成片已加载。');
            setVideoProgress('视频任务已完成。');

            const newHistoryItem: HistoryItem = {
              id: Math.random().toString(36).substr(2, 9),
              type: 'video',
              url: fallbackVideoUrl,
              timestamp: Date.now(),
            };
            setHistory(prev => [newHistoryItem, ...prev]);
            return;
          }

          const normalizedFallbackStatus = fallbackStatus.toLowerCase();
          if (normalizedFallbackStatus === 'failed' || normalizedFallbackStatus === 'error' || normalizedFallbackStatus === 'cancelled') {
            const fallbackMessage = `视频生成失败（${fallbackStatus}）`;
            setPendingVideoTaskId(null);
            setPendingVideoTaskStatus('failed');
            setQueueNotice(null);
            setVideoProgress(fallbackMessage);
            setError(fallbackMessage);
            return;
          }

          setVideoProgress(`任务正在处理中... 任务ID：${pendingVideoTaskId}`);
        } catch (queryError) {
          if (cancelled) {
            return;
          }
          if (isTransientVideoTaskNotFoundError(queryError)) {
            setVideoProgress(`任务正在排队... 任务ID：${pendingVideoTaskId}`);
            return;
          }

          const message = String((queryError as any)?.message || '视频任务查询失败').trim() || '视频任务查询失败';
          setPendingVideoTaskId(null);
          setPendingVideoTaskStatus('failed');
          if (pendingQueueTaskId !== null) {
            setPendingQueueTaskId(null);
          }
          setQueueNotice(null);
          setVideoProgress(message);
          setError(message);

          if (pendingQueueTaskId !== null) {
            try {
              await updateTaskQueueItem(pendingQueueTaskId, {
                status: 'failed',
                last_error: message,
              });
            } catch (updateError) {
              if (!cancelled) {
                reportTaskQueuePersistenceFailure('视频失败状态更新', updateError);
              }
            }
          }
        }
      })();
    }, 8000);

    return () => {
      cancelled = true;
      window.clearTimeout(timerID);
    };
  }, [pendingQueueTaskId, pendingVideoTaskId, pendingVideoTaskStatus, generatedVideoUrl, isVideoGenerating, videoCustomPrompt, persistedPreviewUrl, resultImage, selectedAspectRatio.value, selectedScene.name]);

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] font-sans selection:bg-black/10 overflow-x-hidden flex flex-col">
      {/* Workspace Navigation */}
      <nav className="relative z-50 w-full bg-white shrink-0">
        <div className="max-w-[1400px] mx-auto px-16 md:px-32 py-8 flex justify-between items-center">
          <div className="flex items-center gap-8 group cursor-pointer">
            <div className="w-14 h-14 bg-black rounded-2xl flex items-center justify-center">
              <span className="text-white font-display font-bold text-2xl">F</span>
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-display font-black tracking-tight">Fashion BRAND</span>
              <span className="text-sm tracking-widest text-black/40">AI 视觉影棚</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-1 w-full max-w-[1400px] mx-auto flex relative z-10 px-16 md:px-32 py-8 gap-16">
        {/* Left Column: Controls (Sidebar) */}
        <div className="w-[380px] shrink-0 space-y-16 pr-6">
            <section className="space-y-12">
              <div className="relative">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <span className="mag-label mb-1 block">Step 01</span>
                    <h3 className="text-xl mag-title">产品素材</h3>
                  </div>
                  <Upload className="w-4 h-4 text-black/20" />
                </div>
                
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "aspect-[3/4] rounded-[1.5rem] bg-black/[0.02] flex flex-col items-center justify-center cursor-pointer hover:bg-black/[0.04] transition-all duration-500 overflow-hidden group relative border border-black/[0.05]",
                    image && "border-black/10"
                  )}
                >
                  {image ? (
                    <img src={image} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt="Clothing" />
                  ) : (
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-14 h-14 rounded-full bg-black/[0.02] flex items-center justify-center border border-black/[0.05]">
                        <Camera className="w-6 h-6 text-black/20" />
                      </div>
                      <span className="mag-label text-[10px]">上传主图</span>
                    </div>
                  )}
                </div>
                <input type="file" ref={fileInputRef} onChange={(e) => handleImageUpload(e, setImage)} className="hidden" accept="image/*" />

                <div className="grid grid-cols-3 gap-3 mt-4">
                  {detailImages.map((img, idx) => (
                    <div 
                      key={idx}
                      onClick={() => detailInputRefs[idx].current?.click()}
                      className="aspect-square rounded-xl bg-black/[0.02] flex items-center justify-center cursor-pointer hover:bg-black/[0.04] transition-all overflow-hidden border border-black/[0.05]"
                    >
                      {img ? (
                        <img src={img} className="w-full h-full object-cover" alt={`Detail ${idx}`} />
                      ) : (
                        <Upload className="w-3 h-3 text-black/20" />
                      )}
                      <input 
                        type="file" 
                        ref={detailInputRefs[idx]} 
                        onChange={(e) => handleImageUpload(e, (val) => {
                          const newDetails = [...detailImages];
                          newDetails[idx] = val;
                          setDetailImages(newDetails);
                        })} 
                        className="hidden" 
                        accept="image/*" 
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-12 border-t border-black/[0.05]">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <span className="mag-label mb-1 block">Step 02</span>
                    <h3 className="text-xl mag-title">配饰搭配</h3>
                  </div>
                  <ShoppingBag className="w-4 h-4 text-black/20" />
                </div>
                
                <div className="grid grid-cols-3 gap-3">
                  {accessoryImages.map((img, idx) => (
                    <div 
                      key={idx}
                      onClick={() => accessoryInputRefs[idx].current?.click()}
                      className="aspect-square rounded-xl bg-black/[0.02] flex flex-col items-center justify-center cursor-pointer hover:bg-black/[0.04] transition-all duration-500 overflow-hidden group relative border border-black/[0.05]"
                    >
                      {img ? (
                        <img src={img} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt={`Accessory ${idx}`} />
                      ) : (
                        <Upload className="w-3 h-3 text-black/20" />
                      )}
                      <input 
                        type="file" 
                        ref={accessoryInputRefs[idx]} 
                        onChange={(e) => handleImageUpload(e, (val) => {
                          const newAcc = [...accessoryImages];
                          newAcc[idx] = val;
                          setAccessoryImages(newAcc);
                        })} 
                        className="hidden" 
                        accept="image/*" 
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-12 border-t border-black/[0.05]">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <span className="mag-label mb-1 block">Step 03</span>
                    <h3 className="text-xl mag-title">模特设置</h3>
                  </div>
                  <User className="w-4 h-4 text-black/20" />
                </div>
                
                <div className="space-y-8">
                  <div>
                    <label className="mag-label mb-4 block">性别</label>
                    <div className="grid grid-cols-3 gap-2">
                      {GENDER_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => setSelectedGender(opt)}
                          className={cn(
                            "py-2.5 rounded-xl text-[10px] font-bold tracking-widest uppercase transition-all duration-300",
                            selectedGender.id === opt.id 
                              ? "bg-black text-white" 
                              : "bg-black/[0.03] text-black/40 hover:bg-black/[0.06]"
                          )}
                        >
                          {opt.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mag-label mb-4 block">人种</label>
                    <div className="grid grid-cols-2 gap-2">
                      {ETHNICITY_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => setSelectedEthnicity(opt)}
                          className={cn(
                            "py-2.5 rounded-xl text-[10px] font-bold tracking-widest uppercase transition-all duration-300",
                            selectedEthnicity.id === opt.id 
                              ? "bg-black text-white" 
                              : "bg-black/[0.03] text-black/40 hover:bg-black/[0.06]"
                          )}
                        >
                          {opt.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mag-label mb-4 block">年龄范围</label>
                    <div className="grid grid-cols-4 gap-2">
                      {AGE_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => setSelectedAge(opt)}
                          className={cn(
                            "py-2.5 rounded-xl text-[10px] font-bold tracking-widest uppercase transition-all duration-300",
                            selectedAge.id === opt.id 
                              ? "bg-black text-white" 
                              : "bg-black/[0.03] text-black/40 hover:bg-black/[0.06]"
                          )}
                        >
                          {opt.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-12 border-t border-black/[0.05]">
                <div 
                  className="flex items-center justify-between cursor-pointer group"
                  onClick={() => setIsSceneExpanded(!isSceneExpanded)}
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="mag-label mb-1 block">Step 04</span>
                      <h3 className="text-xl mag-title flex items-center gap-3">
                        拍摄主题
                        {!isSceneExpanded && (
                          <span className="text-[9px] font-sans font-bold text-black/30 tracking-widest uppercase ml-2 px-2 py-0.5 bg-black/[0.03] rounded-full">
                            {selectedScene.name}
                          </span>
                        )}
                      </h3>
                    </div>
                  </div>
                  <ChevronDown className={cn("w-4 h-4 text-black/20 transition-transform duration-300 group-hover:text-black/40", isSceneExpanded && "rotate-180")} />
                </div>
                
                <AnimatePresence>
                  {isSceneExpanded && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-8 space-y-2">
                        {SCENES.map((scene) => (
                          <button
                            key={scene.id}
                            onClick={() => setSelectedScene(scene)}
                            className={cn(
                              "w-full p-4 rounded-xl flex items-center gap-4 transition-all duration-300 text-left border",
                              selectedScene.id === scene.id 
                                ? "bg-black text-white border-black" 
                                : "bg-transparent border-transparent hover:bg-black/[0.03]"
                            )}
                          >
                            <div className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all",
                              selectedScene.id === scene.id ? "bg-white/20 text-white" : "bg-black/[0.03] text-black/20"
                            )}>
                              <Camera className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-1">
                              <h4 className="text-[13px] font-bold tracking-tight">{scene.name}</h4>
                              <p className={cn(
                                "text-[10px] mt-0.5",
                                selectedScene.id === scene.id ? "text-white/60" : "text-black/40"
                              )}>{scene.description}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="pt-12 border-t border-black/[0.05]">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <span className="mag-label mb-1 block">Step 05</span>
                    <h3 className="text-xl mag-title">画幅比例</h3>
                  </div>
                  <Monitor className="w-4 h-4 text-black/20" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {ASPECT_RATIOS.map((ratio) => (
                    <button
                      key={ratio.id}
                      onClick={() => setSelectedAspectRatio(ratio)}
                      className={cn(
                        "relative h-28 rounded-xl border transition-all duration-300 flex flex-col items-center justify-center gap-3",
                        selectedAspectRatio.id === ratio.id 
                          ? "bg-black border-black text-white" 
                          : "bg-black/[0.02] border-transparent text-black/40 hover:bg-black/[0.04]"
                      )}
                    >
                      <div className={cn(
                        "border-[1.5px] rounded-sm",
                        ratio.value === '1:1' && "w-3.5 h-3.5",
                        ratio.value === '3:4' && "w-2.5 h-3.5",
                        ratio.value === '4:3' && "w-3.5 h-2.5",
                        ratio.value === '16:9' && "w-4.5 h-2.5",
                        ratio.value === '9:16' && "w-2.5 h-4.5",
                        selectedAspectRatio.id === ratio.id ? "border-white" : "border-black/20"
                      )} />
                      <span className="text-[12px] font-bold">{ratio.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-12 border-t border-black/[0.05]">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <span className="mag-label mb-1 block">Step 06</span>
                    <h3 className="text-xl mag-title">清晰度</h3>
                  </div>
                  <Zap className="w-4 h-4 text-black/20" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {['2K', '4K'].map((size) => (
                    <button
                      key={size}
                      onClick={() => setCurrentSize(size)}
                      className={cn(
                        "py-3 rounded-xl text-[10px] font-bold tracking-widest uppercase transition-all duration-300",
                        currentSize === size 
                          ? "bg-black text-white" 
                          : "bg-black/[0.03] text-black/40 hover:bg-black/[0.06]"
                      )}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <button
                disabled={!image || isGenerating}
                onClick={() => generateFashionShoot(currentSize)}
                className={cn(
                  "w-full py-6 rounded-xl font-display font-bold text-lg tracking-[0.2em] uppercase transition-all duration-500 relative overflow-hidden",
                  !image || isGenerating 
                    ? "bg-black/5 text-black/10 cursor-not-allowed" 
                    : "bg-black text-white hover:bg-neutral-800 active:scale-[0.98]"
                )}
              >
                {isGenerating ? "正在生成..." : `开始拍摄（${imageGenerationCost} 积分）`}
              </button>
            </section>
        </div>

        {/* Right Column: Preview & History */}
        <div className="flex-1 space-y-20 pb-20">
          <div className="relative h-[800px] flex flex-col group">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] glow-purple opacity-[0.02] blur-[120px] pointer-events-none" />
            
            <div className="flex-1 relative rounded-[2.5rem] overflow-hidden bg-black/[0.01] border border-black/[0.05]">
              <AnimatePresence mode="wait">
                {resultImage ? (
                  <motion.div 
                    key="result"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.8 }}
                    className="w-full h-full relative group flex flex-col"
                  >
                    <div className="flex-1 relative overflow-hidden bg-black/[0.02] flex items-center justify-center">
                      <img 
                        src={resultImage} 
                        alt="Result" 
                        className="max-w-full max-h-full object-contain transition-transform duration-[2s] group-hover:scale-105"
                        referrerPolicy="no-referrer"
                      />

                      {showPendingImageSpinner && (
                        <div className="absolute top-6 right-6 z-30 flex items-center gap-3 rounded-full bg-white/90 px-4 py-2 shadow-lg border border-black/10">
                          <RefreshCw className="w-4 h-4 animate-spin text-black/70" />
                          <span className="text-[11px] font-bold tracking-wide text-black/70">正在生成第2张...</span>
                        </div>
                      )}
                      
                      {/* Video Generation Loading Overlay */}
                      <AnimatePresence>
                        {isVideoGenerating && (
                          <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-40 bg-white/80 backdrop-blur-md flex flex-col items-center justify-center p-12 text-center"
                          >
                            <div className="relative mb-8">
                              <div className="w-32 h-32 border-4 border-black/5 border-t-black rounded-full animate-spin" />
                              <Film className="absolute inset-0 m-auto w-10 h-10 text-black animate-pulse" />
                            </div>
                            <h3 className="text-2xl mag-title mb-4">正在制作时尚短片...</h3>
                            <p className="text-sm text-black/40 max-w-xs leading-relaxed font-medium">
                              {videoProgress}
                            </p>
                            {latestVideoTaskId && (
                              <div className="mt-4 rounded-full border border-black/10 bg-white/70 px-4 py-2 text-[11px] font-bold tracking-wide text-black/60">
                                任务ID：{latestVideoTaskId}
                              </div>
                            )}
                            <div className="mt-12 flex gap-2">
                              {[0, 1, 2].map((i) => (
                                <motion.div
                                  key={i}
                                  animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                                  transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.2 }}
                                  className="w-2 h-2 rounded-full bg-black"
                                />
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-all duration-700 flex items-center justify-center gap-8 backdrop-blur-sm">
                        <button 
                          onClick={() => setIsModifying(true)}
                          className="w-20 h-20 bg-white/20 text-white rounded-full hover:bg-white hover:text-black transition-all duration-500 transform hover:scale-110 flex items-center justify-center border border-white/30 shadow-2xl group/btn"
                          title="局部修改"
                        >
                          <Paintbrush className="w-7 h-7 transition-transform duration-500 group-hover/btn:rotate-12" />
                        </button>
                        <button 
                          onClick={() => setShowZoom(resultImage)}
                          className="w-20 h-20 bg-white/20 text-white rounded-full hover:bg-white hover:text-black transition-all duration-500 transform hover:scale-110 flex items-center justify-center border border-white/30 shadow-2xl group/btn"
                        >
                          <Maximize2 className="w-7 h-7 transition-transform duration-500 group-hover/btn:scale-110" />
                        </button>
                        <button 
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = resultImage;
                            link.download = `fashion-ai-${Date.now()}.png`;
                            link.click();
                          }}
                          className="w-20 h-20 bg-white/20 text-white rounded-full hover:bg-white hover:text-black transition-all duration-500 transform hover:scale-110 flex items-center justify-center border border-white/30 shadow-2xl group/btn"
                        >
                          <Download className="w-7 h-7 transition-transform duration-500 group-hover/btn:translate-y-1" />
                        </button>
                        {showVideoGenButton && (
                          <button 
                            onClick={handleVideoGenerationClick}
                            disabled={isVideoGenerating}
                            className={cn(
                              "w-20 h-20 bg-white/20 text-white rounded-full hover:bg-white hover:text-black transition-all duration-500 transform hover:scale-110 flex items-center justify-center border border-white/30 shadow-2xl group/btn",
                              isVideoGenerating && "animate-pulse cursor-not-allowed"
                            )}
                            title={`生成时尚短片（${videoGenerationCost} 积分/次）`}
                          >
                            {isVideoGenerating ? (
                              <RefreshCw className="w-7 h-7 animate-spin" />
                            ) : (
                              <Video className="w-7 h-7 transition-transform duration-500 group-hover/btn:scale-110" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Multiple Results Selector - Editorial Contact Sheet Style */}
                    {(resultImages.length > 1 || showPendingImageSpinner) && (
                      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex gap-6 z-30 px-6 py-4 bg-white/60 backdrop-blur-2xl rounded-2xl border border-black/10 shadow-[0_10px_40px_rgba(0,0,0,0.05)]">
                        {resultImages.map((img, idx) => (
                          <button
                            key={idx}
                            onClick={() => setSelectedResultIndex(idx)}
                            className="group/thumb relative flex flex-col items-center gap-2"
                          >
                            <span className={cn(
                              "text-[9px] tracking-[0.2em] uppercase font-bold transition-all duration-500",
                              selectedResultIndex === idx ? "text-black opacity-100" : "text-black/40 group-hover/thumb:text-black/60"
                            )}>
                              Shot 0{idx + 1}
                            </span>
                            <div className={cn(
                              "w-12 h-16 rounded-lg overflow-hidden transition-all duration-700 relative",
                              selectedResultIndex === idx 
                                ? "ring-2 ring-black ring-offset-2 ring-offset-white/50 scale-105" 
                                : "opacity-40 grayscale group-hover/thumb:opacity-100 group-hover/thumb:grayscale-0"
                            )}>
                              <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            </div>
                          </button>
                        ))}
                        {showPendingImageSpinner && (
                          <div className="group/thumb relative flex flex-col items-center gap-2 opacity-70">
                            <span className="text-[9px] tracking-[0.2em] uppercase font-bold text-black/40">
                              Shot 02
                            </span>
                            <div className="w-12 h-16 rounded-lg overflow-hidden border border-black/10 bg-white/60 flex items-center justify-center">
                              <RefreshCw className="w-4 h-4 text-black/50 animate-spin" />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                  </motion.div>
                ) : isGenerating ? (
                  <motion.div 
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-12"
                  >
                    <div className="relative">
                      <div className="w-40 h-40 border-[6px] border-black/5 border-t-black rounded-full animate-spin" />
                      <Sparkles className="absolute inset-0 m-auto w-12 h-12 text-black animate-pulse" />
                    </div>
                    <div className="text-center space-y-4">
                      <h3 className="text-3xl mag-title">正在塑造您的愿景...</h3>
                      <p className="text-sm text-black/60 max-w-xs leading-relaxed">正在以 {currentSize} 分辨率生成您的时尚杰作。</p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 flex flex-col items-center justify-center p-20 text-center"
                  >
                    <div className="w-40 h-40 rounded-full bg-black/[0.02] flex items-center justify-center border border-black/[0.05] mb-12 relative group">
                      <div className="absolute inset-0 glow-purple opacity-[0.03] group-hover:opacity-10 transition-opacity duration-700 animate-pulse" />
                      <Sparkles className="w-16 h-16 text-black/40 group-hover:text-black/70 transition-colors duration-700" />
                    </div>
                    <h3 className="text-4xl mag-title mb-6">准备好拍摄了吗？</h3>
                    <p className="text-black/60 max-w-md text-sm leading-relaxed font-medium">
                      在左侧上传服装照片并设置模特特征，AI 将为您打造奢华时尚大片。
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {(queueNotice || (pendingVideoTaskId && !generatedVideoUrl)) && (
            <div className="rounded-2xl border border-black/10 bg-white/70 px-6 py-4 text-sm text-black/70 shadow-sm">
              <div className="font-bold text-black/75">视频任务状态</div>
              <div className="mt-1 leading-relaxed">{queueNotice || '视频任务已提交，后台生成中，可稍后在任务面板查看。'}</div>
              {latestVideoTaskId && (
                <div className="mt-2 text-[11px] tracking-wide text-black/55">任务ID：{latestVideoTaskId}</div>
              )}
            </div>
          )}

          {/* History Gallery */}
          {history.length > 0 && (
            <section className="space-y-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-black/5 flex items-center justify-center border border-black/10">
                    <History className="w-5 h-5 text-black/70" />
                  </div>
                  <h3 className="text-xl mag-title">历史记录</h3>
                </div>
                <span className="text-[12px] uppercase tracking-[0.2em] text-black/60 font-bold">
                  {history.length} 个作品
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {history.map((item, idx) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: idx * 0.05 }}
                    className="group/history relative aspect-[3/4] rounded-3xl overflow-hidden border border-black/10 bg-black/5 cursor-pointer"
                    onClick={() => {
                      if (item.type === 'image') {
                        setResultImages([item.url]);
                        setSelectedResultIndex(0);
                        setGeneratedVideoUrl(null);
                      } else {
                        setGeneratedVideoUrl(item.url);
                      }
                    }}
                  >
                    {item.type === 'image' ? (
                      <img src={item.url} className="w-full h-full object-cover transition-transform duration-700 group-hover/history:scale-110" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full relative">
                        <video src={item.url} className="w-full h-full object-cover transition-transform duration-700 group-hover/history:scale-110" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <Video className="w-8 h-8 text-white/70" />
                        </div>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/history:opacity-100 transition-opacity flex items-center justify-center gap-3">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (item.type === 'image') {
                            setShowZoom(item.url);
                          }
                        }}
                        className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center hover:bg-white hover:text-black transition-all"
                      >
                        {item.type === 'image' ? <Maximize2 className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          const link = document.createElement('a');
                          link.href = item.url;
                          link.download = `fashion-ai-history-${item.id}.${item.type === 'image' ? 'png' : 'mp4'}`;
                          link.click();
                        }}
                        className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center hover:bg-white hover:text-black transition-all"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {isModifying && resultImage && (
          <InpaintingEditor 
            image={resultImage}
            onCancel={() => setIsModifying(false)}
            onSave={handleLocalModification}
            isLoading={isModifyingLoading}
          />
        )}
        
        {isEditingVideoPrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-white/80 backdrop-blur-xl flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="max-w-2xl w-full bg-white rounded-[2.5rem] border border-black/10 overflow-hidden shadow-2xl"
            >
              <div className="p-10 space-y-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-black/5 flex items-center justify-center border border-black/10">
                      <Film className="w-6 h-6 text-black" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-[0.3em] text-black/40 font-bold block mb-1">Video Campaign</span>
                      <h3 className="text-2xl mag-title">定制视频提示词</h3>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsEditingVideoPrompt(false)}
                    className="p-2 text-black/40 hover:text-black transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="space-y-4">
                  <label className="text-[12px] uppercase tracking-[0.2em] text-black/60 font-bold block">视频创意指令</label>
                  <textarea 
                    value={videoCustomPrompt}
                    onChange={(e) => setVideoCustomPrompt(e.target.value)}
                    placeholder="描述您想要的视频画面、运镜和氛围..."
                    className="w-full h-48 bg-black/5 border border-black/10 rounded-3xl p-6 text-sm text-black placeholder:text-black/20 focus:outline-none focus:border-black/30 transition-all resize-none leading-relaxed"
                  />
                  <p className="text-[10px] text-black/40 italic">
                    提示：您可以描述镜头运动（如 Zoom in, Pan, Tracking）、光影变化以及模特的动作。
                  </p>
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => setIsEditingVideoPrompt(false)}
                    className="flex-1 py-5 bg-black/5 text-black rounded-2xl font-bold tracking-widest uppercase hover:bg-black/10 transition-all border border-black/10"
                  >
                    取消
                  </button>
                  <button 
                    onClick={generateFashionVideo}
                    className="flex-1 py-5 bg-black text-white rounded-2xl font-bold tracking-widest uppercase hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_10px_30px_rgba(0,0,0,0.1)] flex items-center justify-center gap-3"
                  >
                    <Sparkles className="w-5 h-5" />
                    {`开始生成视频（${videoGenerationCost} 积分/次）`}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showZoom && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-white/95 backdrop-blur-xl flex items-center justify-center p-4 md:p-12"
            onClick={() => setShowZoom(null)}
          >
            <button 
              className="absolute top-8 right-8 p-4 text-black/80 hover:text-black transition-colors"
              onClick={() => setShowZoom(null)}
            >
              <X className="w-8 h-8" />
            </button>
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={showZoom}
              alt="Zoomed"
              className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
              referrerPolicy="no-referrer"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="absolute bottom-12 flex gap-4">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  const link = document.createElement('a');
                  link.href = showZoom;
                  link.download = `fashion-ai-zoom-${Date.now()}.png`;
                  link.click();
                }}
                className="px-8 py-4 bg-black text-white rounded-full font-bold flex items-center gap-2 hover:bg-neutral-800 transition-all"
              >
                <Download className="w-5 h-5" />
                下载高清图片
              </button>
            </div>
          </motion.div>
        )}

        {generatedVideoUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-white/95 backdrop-blur-xl flex items-center justify-center p-4 md:p-12"
            onClick={() => setGeneratedVideoUrl(null)}
          >
            <button 
              className="absolute top-8 right-8 p-4 text-black/80 hover:text-black transition-colors"
              onClick={() => setGeneratedVideoUrl(null)}
            >
              <X className="w-8 h-8" />
            </button>
            <div className="relative max-w-5xl w-full max-h-[82vh] rounded-3xl overflow-hidden shadow-2xl border border-black/10 bg-black flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
              <video 
                src={generatedVideoUrl} 
                controls 
                autoPlay 
                loop 
                className="w-full h-auto max-h-[82vh] object-contain"
              />
              <div className="absolute top-6 left-6 flex items-center gap-3 px-4 py-2 bg-white/60 backdrop-blur-md rounded-full border border-black/10">
                <Film className="w-4 h-4 text-black" />
                <span className="text-[12px] font-bold tracking-widest uppercase text-black">AI 时尚短片</span>
              </div>
            </div>
            <div className="absolute bottom-12 flex gap-4">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  const link = document.createElement('a');
                  link.href = generatedVideoUrl;
                  link.download = `fashion-ai-video-${Date.now()}.mp4`;
                  link.click();
                }}
                className="px-8 py-4 bg-black text-white rounded-full font-bold flex items-center gap-2 hover:bg-neutral-800 transition-all shadow-xl"
              >
                <Download className="w-5 h-5" />
                下载时尚短片
              </button>
              <button 
                onClick={() => setGeneratedVideoUrl(null)}
                className="px-8 py-4 bg-black/10 text-black rounded-full font-bold hover:bg-black/20 transition-all backdrop-blur-md border border-black/10"
              >
                返回工作台
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="border-t border-black/5 py-6 px-16 md:px-32 shrink-0 bg-white/40 backdrop-blur-md">
        <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-black" />
            <span className="font-bold tracking-tight">Fashion BRAND</span>
          </div>
          {/* Copyright and links removed */}
        </div>
      </footer>
    </div>
  );
}
