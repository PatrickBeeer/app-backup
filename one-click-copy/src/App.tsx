import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Download,
  Eraser,
  Image as ImageIcon,
  Loader2,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { editCompositeAsset, generateCompositeAsset } from './services/geminiService';

type JobStatus = 'loading' | 'success' | 'error';
type Point = { x: number; y: number };

interface GeneratedImage {
  id: string;
  originalRef: string;
  result: string;
  status: JobStatus;
  title?: string;
  tagline?: string;
  error?: string;
}

interface BrushStep {
  id: number;
  instruction: string;
  path: Point[];
}

const aspectRatios = ['1:1', '4:5', '3:4', '16:9', '9:16'];
const imageSizes = ['2K'];

const readFilesAsDataUrls = async (files: FileList | null) => {
  if (!files) return [] as string[];

  return Promise.all(
    Array.from(files).map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        }),
    ),
  );
};

const makeId = () => Math.random().toString(36).slice(2, 10);

export default function App() {
  const [refImages, setRefImages] = useState<string[]>([]);
  const [productImages, setProductImages] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('2K');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [brushSize, setBrushSize] = useState(42);
  const [steps, setSteps] = useState<BrushStep[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewImageRef = useRef<HTMLImageElement>(null);
  const drawingRef = useRef(false);
  const currentPathRef = useRef<Point[]>([]);

  const canGenerate = refImages.length > 0 && productImages.length > 0 && !isGenerating;
  const finishedCount = useMemo(() => results.filter((item) => item.status === 'success').length, [results]);

  const resetEditorState = useCallback(() => {
    drawingRef.current = false;
    currentPathRef.current = [];
    setSteps([]);
    setShowEditor(false);

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  const closePreview = useCallback(() => {
    setSelectedImage(null);
    resetEditorState();
  }, [resetEditorState]);

  const openPreview = useCallback(
    (image: GeneratedImage) => {
      setSelectedImage(image);
      resetEditorState();
    },
    [resetEditorState],
  );

  const uploadReferences = useCallback(async (files: FileList | null) => {
    const images = await readFilesAsDataUrls(files);
    setRefImages((current) => [...current, ...images]);
  }, []);

  const uploadProducts = useCallback(async (files: FileList | null) => {
    const images = await readFilesAsDataUrls(files);
    setProductImages((current) => [...current, ...images]);
  }, []);

  const syncCanvasDimensions = useCallback(() => {
    const canvas = canvasRef.current;
    const image = previewImageRef.current;
    if (!canvas || !image) return;

    const width = image.naturalWidth || 1000;
    const height = image.naturalHeight || 1000;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
  }, []);

  const redrawCanvas = useCallback(
    (nextSteps: BrushStep[], livePath?: Point[]) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      nextSteps.forEach((step, index) => {
        if (step.path.length < 2) return;

        ctx.strokeStyle = 'rgba(0, 122, 255, 0.42)';
        ctx.lineWidth = brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(step.path[0].x, step.path[0].y);
        step.path.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
        ctx.stroke();

        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(step.path[0].x, step.path[0].y, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '700 28px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(index + 1), step.path[0].x, step.path[0].y);
      });

      if (livePath && livePath.length > 1) {
        ctx.strokeStyle = 'rgba(0, 122, 255, 0.42)';
        ctx.lineWidth = brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(livePath[0].x, livePath[0].y);
        livePath.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
        ctx.stroke();
      }
    },
    [brushSize],
  );

  useEffect(() => {
    if (!showEditor) return;
    syncCanvasDimensions();
    redrawCanvas(steps, currentPathRef.current);
  }, [showEditor, steps, brushSize, redrawCanvas, syncCanvasDimensions]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const startDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pointFromEvent(event);
    if (!point) return;
    drawingRef.current = true;
    currentPathRef.current = [point];
  };

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const point = pointFromEvent(event);
    if (!point) return;

    const nextPath = [...currentPathRef.current, point];
    currentPathRef.current = nextPath;
    redrawCanvas(steps, nextPath);
  };

  const stopDrawing = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;

    const finalPath = currentPathRef.current;
    if (finalPath.length > 1) {
      setSteps((current) => {
        const nextSteps = [...current, { id: Date.now(), instruction: '', path: finalPath }];
        redrawCanvas(nextSteps);
        return nextSteps;
      });
    }

    currentPathRef.current = [];
  };

  const buildMask = () => {
    if (steps.length === 0) return null;

    const canvas = canvasRef.current;
    const mask = document.createElement('canvas');
    mask.width = canvas?.width || previewImageRef.current?.naturalWidth || 1000;
    mask.height = canvas?.height || previewImageRef.current?.naturalHeight || 1000;

    const ctx = mask.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, mask.width, mask.height);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    steps.forEach((step) => {
      if (step.path.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(step.path[0].x, step.path[0].y);
      step.path.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      ctx.stroke();
    });

    return mask.toDataURL('image/png');
  };

  const generateAll = async () => {
    if (!canGenerate) return;

    const queued = refImages.map((ref) => ({
      id: makeId(),
      originalRef: ref,
      result: '',
      status: 'loading' as JobStatus,
    }));

    setResults(queued);
    setIsGenerating(true);

    for (const [index, item] of queued.entries()) {
      try {
        const data = await generateCompositeAsset({
          referenceImage: refImages[index],
          productImages,
          prompt,
          aspectRatio,
          imageSize: size as '1K' | '2K',
          productConsistency: true,
        });

        setResults((current) =>
          current.map((result) =>
            result.id === item.id
              ? {
                  ...result,
                  result: data.imageUrl,
                  status: 'success',
                  title: data.title || 'AI 复刻图',
                  tagline: data.tagline || '已完成产品与参考风格融合',
                }
              : result,
          ),
        );
      } catch (error) {
        setResults((current) =>
          current.map((result) =>
            result.id === item.id
              ? {
                  ...result,
                  status: 'error',
                  error: error instanceof Error ? error.message : '生成失败，请稍后重试',
                }
              : result,
          ),
        );
      }
    }

    setIsGenerating(false);
  };

  const editSelectedImage = async () => {
    if (!selectedImage || steps.length === 0) return;

    const instructions = steps
      .map((step, index) => `${index + 1}. ${step.instruction || '将该标注区域中的文字自然替换为新的中文文案'}`)
      .join('\n');

    setIsEditing(true);
    try {
      const data = await editCompositeAsset({
        image: selectedImage.result,
        editPrompt: instructions,
        maskImage: buildMask(),
        productConsistency: true,
      });

      const updated = {
        ...selectedImage,
        result: data.imageUrl,
        title: data.title || selectedImage.title,
        tagline: data.tagline || selectedImage.tagline,
      };

      setSelectedImage(updated);
      setResults((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      resetEditorState();
    } catch (error) {
      console.error('Edit failed:', error);
    } finally {
      setIsEditing(false);
    }
  };

  const downloadImage = async (url: string) => {
    try {
      const blob = await fetch(url).then((response) => response.blob());
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `one-click-copy-${Date.now()}.png`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  return (
    <main className="min-h-screen bg-[#f0f2f5] px-4 py-5 text-black sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-5">
        <header className="glass-panel flex items-center justify-between gap-4 px-5 py-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[1.35rem] bg-black text-white shadow-[0_16px_34px_rgba(0,0,0,0.18)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-black tracking-tight text-black">一键复刻</h1>
            </div>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <Metric label="参考" value={refImages.length} />
            <Metric label="产品" value={productImages.length} />
            <Metric label="完成" value={`${finishedCount}/${results.length || 0}`} />
          </div>
        </header>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="glass-panel overflow-hidden">
            <PanelHeader title="素材与参数" />

            <div className="space-y-7 p-5">
              <AssetBlock
                icon={<ImageIcon className="h-4 w-4 text-ios-blue" />}
                title="参考设计"
                count={refImages.length}
                uploadLabel="添加参考"
                onUpload={uploadReferences}
              >
                {refImages.map((image, index) => (
                  <AssetThumb
                    key={`${image}-${index}`}
                    image={image}
                    onRemove={() => setRefImages((list) => list.filter((_, i) => i !== index))}
                  />
                ))}
              </AssetBlock>

              <Divider />

              <AssetBlock
                icon={<Palette className="h-4 w-4 text-amber-500" />}
                title="产品实拍"
                count={productImages.length}
                uploadLabel="添加产品"
                onUpload={uploadProducts}
              >
                {productImages.map((image, index) => (
                  <AssetThumb
                    key={`${image}-${index}`}
                    image={image}
                    contain
                    onRemove={() => setProductImages((list) => list.filter((_, i) => i !== index))}
                  />
                ))}
              </AssetBlock>

              <Divider />

              <section>
                <SectionLabel icon={<Pencil className="h-4 w-4 text-ios-blue" />} title="生成设置" />
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="极简工作室，柔和自然光，保留原参考图版式和高级电商质感..."
                  className="ios-input mt-4 min-h-28 w-full resize-none p-4 text-sm leading-6 text-black outline-none placeholder:text-gray-400"
                />

                <div className="mt-5 space-y-5">
                  <ControlGroup label="画面比例" values={aspectRatios} active={aspectRatio} onChange={setAspectRatio} />
                  <ControlGroup label="输出尺寸" values={imageSizes} active={size} onChange={setSize} />
                </div>
              </section>

              <div className="pt-1">
                <button
                  onClick={generateAll}
                  disabled={!canGenerate}
                  className="ios-btn-primary flex h-14 w-full items-center justify-center gap-2 px-5 text-sm font-black disabled:scale-100 disabled:bg-gray-300 disabled:shadow-none"
                >
                  {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-amber-300" />}
                  开始复刻
                </button>
              </div>
            </div>
          </aside>

          <section className="glass-panel min-h-[720px] overflow-hidden">
            <div className="flex flex-col justify-between gap-4 border-b border-white/40 px-5 py-5 md:flex-row md:items-center">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-black">复刻画布</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill active={refImages.length > 0} label="参考图" />
                <StatusPill active={productImages.length > 0} label="产品图" />
                <StatusPill active={results.length > 0} label="结果集" />
              </div>
            </div>

            <div className="p-5 md:p-6">
              {results.length === 0 ? (
                <EmptyCanvas />
              ) : (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3">
                  {results.map((item) => (
                    <ResultCard
                      key={item.id}
                      item={item}
                      onOpen={() => {
                        if (item.status === 'success') {
                          openPreview(item);
                        }
                      }}
                      onDownload={() => item.result && downloadImage(item.result)}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      <AnimatePresence>
        {selectedImage && (
          <motion.div
            className="fixed inset-0 z-[90] grid place-items-center bg-black/18 p-4 backdrop-blur-2xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="grid h-[92vh] w-full max-w-7xl grid-cols-1 overflow-hidden rounded-[2rem] border border-white/50 bg-white/70 shadow-[0_44px_120px_rgba(40,67,111,0.22)] backdrop-blur-2xl lg:grid-cols-[minmax(0,1fr)_380px]"
              initial={{ y: 24, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 24, scale: 0.98 }}
            >
              <div className="relative flex min-h-0 flex-col bg-white/25 p-4 lg:p-8">
                <button
                  className="absolute left-6 top-6 z-10 rounded-2xl bg-white/70 p-3 text-gray-500 shadow-[0_16px_40px_rgba(40,67,111,0.10)] backdrop-blur-md transition hover:scale-105 hover:text-black"
                  onClick={closePreview}
                  aria-label="关闭预览"
                >
                  <X className="h-5 w-5" />
                </button>

                {showEditor && (
                  <p className="mb-4 text-center text-sm font-medium text-gray-500">* 请在图片上绘制出文字区域，再在右侧输入新的文案内容</p>
                )}

                <div className="grid min-h-0 flex-1 place-items-center">
                  <div className="relative inline-block overflow-hidden rounded-[1.5rem] bg-white/70 shadow-[0_32px_80px_rgba(40,67,111,0.18)]">
                    <img
                      ref={previewImageRef}
                      src={selectedImage.result}
                      alt="生成结果预览"
                      className="block max-h-[78vh] max-w-full object-contain"
                      onLoad={() => {
                        if (showEditor) {
                          syncCanvasDimensions();
                          redrawCanvas(steps, currentPathRef.current);
                        }
                      }}
                    />
                    {showEditor && (
                      <canvas
                        ref={canvasRef}
                        onPointerDown={startDrawing}
                        onPointerMove={draw}
                        onPointerUp={stopDrawing}
                        onPointerLeave={stopDrawing}
                        className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
                      />
                    )}
                  </div>
                </div>
              </div>

              <aside className="flex min-h-0 flex-col border-l border-white/50 bg-white/55 backdrop-blur-xl">
                <PanelHeader title="修改文字" />
                <div className="px-6 pt-4">
                  <p className="text-sm font-medium text-gray-500">点击图片绘制修改区域</p>
                </div>

                <div className="flex-1 space-y-6 overflow-auto p-6">
                  <div className="grid grid-cols-3 gap-2">
                    <IconButton
                      active={showEditor}
                      label="画笔"
                      onClick={() => {
                        setShowEditor((value) => {
                          const next = !value;
                          if (!next) {
                            drawingRef.current = false;
                            currentPathRef.current = [];
                          }
                          return next;
                        });
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      label="清除"
                      onClick={() => {
                        drawingRef.current = false;
                        currentPathRef.current = [];
                        setSteps([]);
                        redrawCanvas([]);
                      }}
                    >
                      <Eraser className="h-4 w-4" />
                    </IconButton>
                    <IconButton label="下载" onClick={() => downloadImage(selectedImage.result)}>
                      <Download className="h-4 w-4" />
                    </IconButton>
                  </div>

                  <div>
                    <label className="mb-3 block text-[10px] font-black tracking-[0.24em] text-gray-500">画笔大小</label>
                    <input
                      type="range"
                      min="12"
                      max="140"
                      value={brushSize}
                      onChange={(event) => setBrushSize(Number(event.target.value))}
                      className="w-full accent-black"
                    />
                  </div>

                  <div className="space-y-3">
                    {steps.length === 0 ? (
                      <div className="rounded-[1.5rem] border border-dashed border-white/70 bg-white/40 p-7 text-center text-sm font-medium leading-6 text-gray-500">
                        用画笔涂抹左侧图片中的文字区域，再在下方输入新的文案内容。
                      </div>
                    ) : (
                      steps.map((step, index) => (
                        <div key={step.id} className="flex gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-black text-sm font-black text-white">
                            {index + 1}
                          </span>
                          <input
                            value={step.instruction}
                            onChange={(event) =>
                              setSteps((current) =>
                                current.map((item) => (item.id === step.id ? { ...item, instruction: event.target.value } : item)),
                              )
                            }
                            placeholder="输入要替换成的新文案"
                            className="ios-input min-w-0 flex-1 px-4 text-sm outline-none"
                          />
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="border-t border-white/50 p-6">
                  <button
                    onClick={editSelectedImage}
                    disabled={isEditing || steps.length === 0}
                    className="ios-btn-primary flex h-13 w-full items-center justify-center gap-2 text-sm font-black disabled:scale-100 disabled:bg-gray-300 disabled:shadow-none"
                  >
                    {isEditing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    应用修改
                  </button>
                </div>
              </aside>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function PanelHeader({ title }: { title: string }) {
  return (
    <div className="border-b border-white/40 px-5 py-5">
      <h2 className="text-xl font-black tracking-tight text-black">{title}</h2>
    </div>
  );
}

function SectionLabel({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-base font-black tracking-tight text-black">
        {icon}
        {title}
      </h3>
    </div>
  );
}

function AssetBlock({
  icon,
  title,
  count,
  uploadLabel,
  onUpload,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  uploadLabel: string;
  onUpload: (files: FileList | null) => void;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <SectionLabel icon={icon} title={title} />
        <span className="rounded-full bg-white/45 px-3 py-1 text-xs font-black text-gray-500">{count} 张</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {children}
        <UploadTile label={uploadLabel} onChange={onUpload} />
      </div>
    </section>
  );
}

function UploadTile({ label, onChange }: { label: string; onChange: (files: FileList | null) => void }) {
  return (
    <label className="grid aspect-square cursor-pointer place-items-center rounded-[1.25rem] border border-dashed border-white/75 bg-white/35 text-center shadow-inner transition hover:scale-[1.02] hover:bg-white/55">
      <span className="flex flex-col items-center gap-2 text-xs font-black text-gray-500">
        <Plus className="h-5 w-5 text-ios-blue" />
        {label}
      </span>
      <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => onChange(event.target.files)} />
    </label>
  );
}

function AssetThumb({ image, contain, onRemove }: { image: string; contain?: boolean; onRemove: () => void }) {
  return (
    <div className="group relative aspect-square overflow-hidden rounded-[1.25rem] bg-white/35 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.65),0_14px_32px_rgba(40,67,111,0.08)]">
      <img src={image} alt="上传素材缩略图" className={`h-full w-full ${contain ? 'object-contain p-2' : 'object-cover'}`} />
      <button
        onClick={onRemove}
        className="absolute right-2 top-2 rounded-xl bg-white/85 p-1.5 text-red-500 opacity-0 shadow-sm backdrop-blur-md transition hover:bg-red-500 hover:text-white group-hover:opacity-100"
        aria-label="删除图片"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-white/45" />;
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/38 px-4 py-2 text-center backdrop-blur-md">
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-500">{label}</p>
      <p className="text-sm font-black text-black">{value}</p>
    </div>
  );
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-black ${
        active ? 'bg-black text-white shadow-[0_12px_26px_rgba(0,0,0,0.16)]' : 'bg-white/42 text-gray-500'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-ios-blue' : 'bg-gray-300'}`} />
      {label}
    </span>
  );
}

function EmptyCanvas() {
  return (
    <div className="grid min-h-[560px] place-items-center rounded-[2rem] bg-white/28 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.58)] backdrop-blur-md">
      <div className="max-w-sm px-6 text-center">
        <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-[1.5rem] bg-white/65 shadow-[0_20px_48px_rgba(40,67,111,0.12)]">
          <Upload className="h-7 w-7 text-gray-400" />
        </div>
        <h3 className="text-lg font-black tracking-tight text-black">等待素材就绪</h3>
        <p className="mt-2 text-sm font-medium leading-6 text-gray-500">
          上传参考设计和产品实拍后，系统会为每张参考图生成一张可下载的复刻结果。
        </p>
      </div>
    </div>
  );
}

function ControlGroup({
  label,
  values,
  active,
  onChange,
}: {
  label: string;
  values: string[];
  active: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.24em] text-gray-500">{label}</label>
      <div className={`grid gap-1 rounded-2xl bg-white/30 p-1 backdrop-blur-md ${values.length > 3 ? 'grid-cols-5' : 'grid-cols-1'}`}>
        {values.map((value) => (
          <button
            key={value}
            onClick={() => onChange(value)}
            className={`h-10 rounded-xl text-xs font-black transition ${
              active === value ? 'bg-black text-white shadow-[0_12px_28px_rgba(0,0,0,0.18)]' : 'text-gray-500 hover:bg-white/55 hover:text-black'
            }`}
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultCard({
  item,
  onOpen,
  onDownload,
}: {
  item: GeneratedImage;
  onOpen: () => void;
  onDownload: () => void;
}) {
  const isReady = item.status === 'success';

  return (
    <motion.article
      layout
      className="group relative overflow-hidden rounded-[1.75rem] bg-white/48 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.58),0_22px_56px_rgba(40,67,111,0.11)] backdrop-blur-xl"
    >
      <button onClick={onOpen} disabled={!isReady} className="group relative block aspect-square w-full overflow-hidden bg-white/35 text-left">
        {item.status === 'loading' && (
          <div className="grid h-full place-items-center">
            <Loader2 className="h-8 w-8 animate-spin text-ios-blue" />
          </div>
        )}
        {item.status === 'error' && (
          <div className="grid h-full place-items-center p-6 text-center text-sm font-bold text-red-500">{item.error}</div>
        )}
        {isReady && (
          <>
            <img src={item.result} alt={item.title || '生成结果'} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
            <span className="absolute inset-0 bg-black/0 transition group-hover:bg-black/10" />
          </>
        )}
      </button>
      {isReady && (
        <div className="px-5 pt-4 text-center">
          <p className="text-[11px] font-black text-gray-500">点击图片进行修改</p>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-5 opacity-0 transition group-hover:opacity-100">
        <button
          onClick={(event) => {
            event.stopPropagation();
            onDownload();
          }}
          disabled={!isReady}
          className="pointer-events-auto flex h-11 items-center justify-center gap-2 rounded-2xl bg-white/90 px-5 text-xs font-black text-black shadow-[0_14px_30px_rgba(0,0,0,0.16)] backdrop-blur-md transition hover:scale-[1.02] disabled:text-gray-300"
        >
          <Download className="h-3.5 w-3.5" />
          下载
        </button>
      </div>
    </motion.article>
  );
}

function IconButton({
  children,
  label,
  active,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-11 items-center justify-center gap-2 rounded-2xl text-xs font-black transition hover:scale-[1.02] ${
        active ? 'bg-black text-white shadow-[0_14px_32px_rgba(0,0,0,0.18)]' : 'bg-white/45 text-gray-600 hover:bg-white/65 hover:text-black'
      }`}
    >
      {children}
      {label}
    </button>
  );
}
