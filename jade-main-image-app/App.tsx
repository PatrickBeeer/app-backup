import React, { useCallback, useMemo, useRef, useState } from 'react';
import { AppProps } from '../../types';
import {
  AspectRatio,
  Audience,
  GenModel,
  IdentityLock,
  ImageInput,
  Occupancy,
  Quality,
  SCENE_IDS,
  SceneId,
  Settings,
} from './types';
import {
  audienceHints,
  buildIdentityLock,
  generateScene,
  loadStyleReference,
  previousFromBase64,
  scenes,
} from './services/jadeImageService';
import { base64ToObjectUrl, fileToImageInput } from './services/imageProcessing';
import { downloadObjectUrl } from './services/download';

const COST_PER_IMAGE = 10;

const RATIO_OPTIONS: { id: AspectRatio; label: string }[] = [
  { id: '3:4', label: '3:4' },
  { id: '1:1', label: '1:1' },
  { id: '9:16', label: '9:16' },
  { id: '16:9', label: '16:9' },
];

const QUALITY_OPTIONS: { id: Quality; label: string }[] = [
  { id: '1K', label: '1K' },
  { id: '4K', label: '4K' },
];

const MODEL_OPTIONS: { id: GenModel; label: string; hint: string }[] = [
  { id: 'gemini', label: 'Gemini 3.1', hint: '默认使用 Gemini 3.1 Flash Image 图生图。' },
  { id: 'gptimage', label: 'GPT Image 2', hint: 'GPT Image 2 为备用模型，经 BFF 调用，密钥不暴露前端。' },
];

const AUDIENCE_OPTIONS: { id: Audience; label: string }[] = [
  { id: 'young_woman', label: '年轻女性' },
  { id: 'mature_woman', label: '成熟女性' },
  { id: 'young_man', label: '年轻男性' },
  { id: 'mature_man', label: '成熟男性' },
  { id: 'no_model', label: '不露人物' },
];

const OCCUPANCY_OPTIONS: { id: Occupancy; label: string }[] = [
  { id: 'small', label: '较小' },
  { id: 'standard', label: '标准' },
  { id: 'large', label: '较大' },
];

type LockState = 'idle' | 'loading' | 'ok' | 'warn' | 'fail';

const SceneTitle: Record<SceneId, string> = {
  '01': '黑色主图',
  '02': '种水细节特写',
  '03': '金扣/工艺细节',
  '04': '轻场景拍摄',
  '05': '人物佩戴主图',
};

function Seg<T extends string>({
  value,
  options,
  onChange,
  wrap = false,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
  wrap?: boolean;
}) {
  return (
    <div className={`flex gap-1 p-1 rounded-xl bg-stone-100 ${wrap ? 'flex-wrap' : ''}`}>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`flex-1 text-center px-2 py-2 rounded-lg text-sm font-medium transition ${
            value === opt.id
              ? 'bg-[#5145cd] text-white font-bold shadow-md shadow-indigo-300/40'
              : 'text-stone-600 hover:text-[#5145cd]'
          } ${wrap ? 'min-w-[88px] flex-[1_1_28%]' : ''}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const IconLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center gap-1.5 text-[13px] text-stone-600 font-semibold mt-3.5 mb-2">
    {children}
  </div>
);

export const JadeMainImageApp: React.FC<AppProps> = ({ platform, costs }) => {
  const perCost = costs.GENERATE_IMAGE ?? COST_PER_IMAGE;
  const [images, setImages] = useState<ImageInput[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [lock, setLock] = useState<IdentityLock | null>(null);
  const [lockState, setLockState] = useState<LockState>('idle');
  const [sceneUrls, setSceneUrls] = useState<Record<string, string>>({});
  const [sceneBase64s, setSceneBase64s] = useState<Record<string, string>>({});
  const [occupancies, setOccupancies] = useState<Record<string, Occupancy>>({});
  const [scenePrompts, setScenePrompts] = useState<Record<string, string>>({});
  const [sceneErrors, setSceneErrors] = useState<Record<string, string>>({});
  const [loadingScenes, setLoadingScenes] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');
  const [modal, setModal] = useState<{ url: string; title: string } | null>(null);
  const [settings, setSettings] = useState<Settings>({
    size: '1:1',
    quality: '1K',
    model: 'gemini',
    audience: 'young_woman',
    extra_prompt: '',
    dimensions: {},
  });
  const [dimWidth, setDimWidth] = useState('');
  const [dimHeight, setDimHeight] = useState('');
  const [dimDepth, setDimDepth] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewObjectUrls = useRef<string[]>([]);
  const sceneObjectUrls = useRef<string[]>([]);
  const clearObjectUrls = (bucket: React.MutableRefObject<string[]>) => {
    for (const url of bucket.current) URL.revokeObjectURL(url);
    bucket.current = [];
  };

  const resetAll = useCallback(() => {
    clearObjectUrls(previewObjectUrls);
    clearObjectUrls(sceneObjectUrls);
    setImages([]);
    setPreviewUrl('');
    setLock(null);
    setLockState('idle');
    setSceneUrls({});
    setSceneBase64s({});
    setOccupancies({});
    setScenePrompts({});
    setSceneErrors({});
    setProgress({ done: 0, total: 0 });
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    setError('');
    const selected = Array.from(files).slice(0, 6);
    if (selected.length === 0) return;
    try {
      const parsed = await Promise.all(selected.map(fileToImageInput));
      clearObjectUrls(previewObjectUrls);
      clearObjectUrls(sceneObjectUrls);
      setImages(parsed);
      setPreviewUrl(`data:${parsed[0].mime || 'image/png'};base64,${parsed[0].image}`);
      setSceneUrls({});
      setSceneBase64s({});
      setOccupancies({});
      setScenePrompts({});
      setSceneErrors({});
      setLock(null);
      setLockState('loading');
      try {
        const built = await buildIdentityLock(parsed[0], parsed.slice(1));
        setLock(built);
        setLockState('ok');
      } catch {
        setLockState('fail');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const resolvedSettings = useMemo<Settings>(() => {
    const w = Number(dimWidth);
    const h = Number(dimHeight);
    const d = Number(dimDepth);
    const dimensions =
      [w, h, d].every((v) => Number.isFinite(v) && v > 0 && v <= 1000) ? { width: w, height: h, depth: d } : {};
    return { ...settings, dimensions };
  }, [settings, dimWidth, dimHeight, dimDepth]);

  const generateScenes = useCallback(
    async (sceneIds: SceneId[]) => {
      if (images.length === 0) {
        setError('请先上传图片');
        return;
      }
      setError('');

      // Ensure the identity lock is ready (built on upload, but re-build if missing).
      let lockVal = lock;
      if (!lockVal) {
        setLockState('loading');
        try {
          lockVal = await buildIdentityLock(images[0], images.slice(1));
          setLock(lockVal);
          setLockState('ok');
        } catch {
          setLockState('fail');
          setError('产品身份锁建立失败，请重传图片或稍后再试');
          return;
        }
      }

      // Credit check — app-manager reserves `image_gen` credits per call.
      await platform.refreshCredits?.();
      const totalCost = perCost * sceneIds.length;
      if (!platform.checkBalance(totalCost)) {
        platform.showRecharge();
        return;
      }

      setLoadingScenes((prev) => {
        const next = new Set(prev);
        for (const id of sceneIds) next.add(id);
        return next;
      });
      setProgress({ done: 0, total: sceneIds.length });

      const styleRef = sceneIds.includes('01') ? await loadStyleReference() : null;

      for (const sceneId of sceneIds) {
        const scene = scenes.find((s) => s.id === sceneId)!;
        const occupancy = occupancies[sceneId] || 'standard';
        const previousBase64 = sceneBase64s[sceneId];
        const previous = previousBase64 ? await previousFromBase64(previousBase64) : null;
        try {
          const { base64 } = await generateScene({
            scene,
            mainImage: images[0],
            productImages: images.slice(1),
            lock: lockVal,
            settings: resolvedSettings,
            occupancy,
            scenePrompt: scenePrompts[sceneId],
            previous,
            styleRef,
          });
          const url = base64ToObjectUrl(base64);
          sceneObjectUrls.current.push(url);
          setSceneUrls((prev) => ({ ...prev, [sceneId]: url }));
          setSceneBase64s((prev) => ({ ...prev, [sceneId]: base64 }));
          setSceneErrors((prev) => {
            const next = { ...prev };
            delete next[sceneId];
            return next;
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setSceneErrors((prev) => ({ ...prev, [sceneId]: msg }));
        }
        setProgress((p) => ({ ...p, done: p.done + 1 }));
        setLoadingScenes((prev) => {
          const next = new Set(prev);
          next.delete(sceneId);
          return next;
        });
      }
    },
    [images, lock, occupancies, sceneBase64s, scenePrompts, resolvedSettings, platform, costs]
  );

  const anyLoading = loadingScenes.size > 0;
  const hasImages = images.length > 0;
  const modelHint = MODEL_OPTIONS.find((m) => m.id === settings.model)?.hint || '';
  const audHint = audienceHints[settings.audience] || '';

  return (
    <div className="min-h-screen pb-16">
      {/* Top bar */}
      <header className="bg-white border-b border-stone-200 shadow-sm">
        <div className="max-w-[1360px] mx-auto px-6 py-3.5 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-gradient-to-br from-emerald-100 to-emerald-200 border border-emerald-200">
            <svg viewBox="0 0 24 24" fill="none" stroke="#2e9e63" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
              <path d="M7 4h10l4 6-9 11L3 10z" />
              <path d="M3 10h18" />
              <path d="M12 21L8 10l4-6 4 6z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight">翡翠主图影棚</h1>
            <div className="text-xs text-stone-500 tracking-widest">AI 视觉工作室</div>
          </div>
          <div className="ml-auto text-sm text-stone-500">
            点数：<span className="font-semibold text-stone-700">{platform.credits}</span>
          </div>
        </div>
      </header>

      <div className="max-w-[1360px] mx-auto flex gap-5 items-start px-6 pt-5">
        {/* Left: controls */}
        <aside className="w-[400px] flex-none sticky top-5 max-h-[calc(100vh-130px)] overflow-auto rounded-2xl">
          <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-6">
            {/* Upload */}
            <section className="mb-5">
              <div className="flex items-center gap-2.5 mb-3.5">
                <span className={`w-6 h-6 rounded-full text-xs font-bold text-white flex items-center justify-center ${hasImages ? 'bg-emerald-500' : 'bg-[#5145cd]'}`}>1</span>
                <b className="text-base font-bold">上传翡翠产品参考图</b>
              </div>
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={`border-[1.5px] border-dashed rounded-xl text-center cursor-pointer transition py-7 px-5 ${dragging ? 'border-[#5145cd] bg-indigo-50' : 'border-stone-300 bg-stone-50 hover:border-[#5145cd] hover:bg-indigo-50'}`}
              >
                <div className="w-12 h-12 mx-auto mb-3 rounded-full border-[1.5px] border-indigo-300 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#5145cd" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                    <path d="M12 16V4M7 9l5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
                  </svg>
                </div>
                <div className="text-sm font-bold mb-1.5">点击上传翡翠产品图</div>
                <div className="text-[12.5px] text-stone-500">
                  可上传多角度参考 · JPG / PNG / WEBP · {images.length}/6
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => e.target.files && handleFiles(e.target.files)}
                />
              </div>
              <div className="flex items-center gap-1.5 text-xs text-stone-500 mt-3">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                  <circle cx="9" cy="9" r="1.6" />
                  <path d="M5 19l5.5-6 4 4.5L17 15l3 4" />
                </svg>
                第一张作为主图，后续图片用于锁定侧面、金扣和雕刻细节；建议上传同一件产品的清晰多角度原图
              </div>

              {hasImages && (
                <div className="flex items-center gap-3 mt-3.5">
                  <img src={previewUrl} alt="预览" className="w-22 h-22 object-cover rounded-xl border border-stone-200 bg-stone-100" style={{ width: 88, height: 88 }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate">
                      {images.length === 1 ? images[0].name : `${images[0].name} 等 ${images.length} 张参考图`}
                    </div>
                    <div className={`text-xs mt-1 flex items-center gap-1.5 ${lockState === 'ok' ? 'text-emerald-600' : lockState === 'fail' ? 'text-red-500' : 'text-stone-500'}`}>
                      {lockState === 'loading' && <span className="inline-block w-3 h-3 border-2 border-indigo-200 border-t-[#5145cd] rounded-full spin" />}
                      {lockState === 'ok' && '✓ 产品身份已锁定'}
                      {lockState === 'fail' && '✗ 图片身份锁建立失败'}
                      {lockState === 'idle' && ''}
                    </div>
                  </div>
                  <button onClick={resetAll} className="px-3.5 py-2 text-xs bg-white text-stone-600 border border-stone-200 rounded-xl hover:bg-stone-50">重传</button>
                </div>
              )}

              {hasImages && (
                <div className="flex gap-2 flex-wrap mt-2.5">
                  {images.map((img, i) => (
                    <img
                      key={i}
                      src={`data:${img.mime || 'image/png'};base64,${img.image}`}
                      alt={`${i === 0 ? '主图' : '参考图'}${i + 1}`}
                      className="w-12 h-12 border border-stone-200 rounded-md object-cover bg-stone-100"
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Settings */}
            <section className="mb-5">
              <div className="flex items-center gap-2.5 mb-3.5">
                <span className="w-6 h-6 rounded-full bg-[#5145cd] text-white text-xs font-bold flex items-center justify-center">2</span>
                <b className="text-base font-bold">选择画幅并生成</b>
              </div>

              <IconLabel>画幅比例</IconLabel>
              <Seg value={settings.size} options={RATIO_OPTIONS} onChange={(size) => setSettings((s) => ({ ...s, size }))} />

              <IconLabel>输出清晰度</IconLabel>
              <Seg value={settings.quality} options={QUALITY_OPTIONS} onChange={(quality) => setSettings((s) => ({ ...s, quality }))} />

              <IconLabel>生成模型</IconLabel>
              <Seg value={settings.model} options={MODEL_OPTIONS} onChange={(model) => setSettings((s) => ({ ...s, model }))} />
              <div className="text-xs text-stone-500 mt-2 text-left">{modelHint}</div>

              <IconLabel>目标人群（不同人群 → 不同风格）</IconLabel>
              <Seg value={settings.audience} options={AUDIENCE_OPTIONS} onChange={(audience) => setSettings((s) => ({ ...s, audience }))} wrap />
              <div className="text-xs text-stone-500 mt-2 text-left">{audHint}</div>

              <IconLabel>产品尺寸（毫米，可选）</IconLabel>
              <div className="grid grid-cols-3 gap-2">
                <label className="grid gap-1.5 text-[11.5px] text-stone-500">
                  宽度
                  <input type="number" min="0.1" max="1000" step="0.1" value={dimWidth} onChange={(e) => setDimWidth(e.target.value)} placeholder="宽 mm" className="px-2.5 py-2 border border-stone-200 rounded-lg bg-stone-50 text-stone-800 outline-none focus:border-[#5145cd] focus:bg-white" />
                </label>
                <label className="grid gap-1.5 text-[11.5px] text-stone-500">
                  高度
                  <input type="number" min="0.1" max="1000" step="0.1" value={dimHeight} onChange={(e) => setDimHeight(e.target.value)} placeholder="高 mm" className="px-2.5 py-2 border border-stone-200 rounded-lg bg-stone-50 text-stone-800 outline-none focus:border-[#5145cd] focus:bg-white" />
                </label>
                <label className="grid gap-1.5 text-[11.5px] text-stone-500">
                  厚度
                  <input type="number" min="0.1" max="1000" step="0.1" value={dimDepth} onChange={(e) => setDimDepth(e.target.value)} placeholder="厚 mm" className="px-2.5 py-2 border border-stone-200 rounded-lg bg-stone-50 text-stone-800 outline-none focus:border-[#5145cd] focus:bg-white" />
                </label>
              </div>

              <IconLabel>自定义提示词（可选，追加到 5 张图）</IconLabel>
              <textarea
                value={settings.extra_prompt}
                onChange={(e) => setSettings((s) => ({ ...s, extra_prompt: e.target.value }))}
                placeholder="在此追加对 5 张图的统一额外要求，例如：整体更冷调、背景加一缕青烟、保留原始自然光感……留空则不追加。"
                className="w-full mt-1 border-[1.5px] border-stone-200 rounded-xl bg-stone-50 p-3 text-[13px] resize-vertical min-h-[88px] text-stone-800 outline-none focus:border-[#5145cd] focus:bg-white"
              />

              <button
                onClick={() => generateScenes([...SCENE_IDS])}
                disabled={anyLoading || !hasImages}
                className="w-full mt-4 py-3 rounded-xl text-[15px] font-semibold text-white bg-[#5145cd] shadow-md shadow-indigo-300/40 hover:bg-[#4034b8] disabled:bg-stone-300 disabled:shadow-none disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
              >
                <span>{anyLoading ? '生成中…' : sceneUrls['01'] ? '重新生成 5 张主图' : '一键生成 5 张主图'}</span>
                {!anyLoading && (
                  <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-white/20 text-[11px] font-medium">
                    {perCost * SCENE_IDS.length} 点
                  </span>
                )}
              </button>
              <div className="text-xs text-stone-500 mt-2.5 text-center">
                上传图片后可一键生成，也可在右侧点击单张生成 · 4K 用时更久
              </div>
            </section>

            {error && <div className="text-red-500 text-[13px] mt-2">{error}</div>}
          </div>
        </aside>

        {/* Right: stage */}
        <main className="flex-1 min-w-0">
          <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-2.5 pb-4 border-b border-stone-200 mb-5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <b className="text-base font-bold">翡翠主图生成大屏</b>
              <span className="ml-auto text-[12.5px] text-stone-500">
                {progress.total > 0 ? `${progress.done} / ${progress.total}` : ''}
              </span>
            </div>

            {progress.total > 0 && (
              <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden mb-4">
                <div className="h-full bg-[#5145cd] rounded-full transition-all duration-300" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
              </div>
            )}

            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {SCENE_IDS.map((id) => {
                const scene = scenes.find((s) => s.id === id)!;
                const url = sceneUrls[id];
                const loading = loadingScenes.has(id);
                const sceneError = sceneErrors[id];
                return (
                  <div key={id} className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">
                    {/* occupancy bar (only when a result exists) */}
                    {url && (
                      <div className="flex items-center justify-between gap-2 px-2.5 py-2 bg-white border-b border-stone-200">
                        <span className="text-[11.5px] text-stone-500 whitespace-nowrap">翡翠占比</span>
                        <div className="grid grid-cols-3 gap-0.5 p-0.5 bg-stone-100 rounded-md">
                          {OCCUPANCY_OPTIONS.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setOccupancies((prev) => ({ ...prev, [id]: opt.id }))}
                              className={`min-w-[38px] px-1.5 py-1 rounded text-[11px] ${(occupancies[id] || 'standard') === opt.id ? 'bg-white text-[#5145cd] font-bold shadow-sm' : 'text-stone-500 hover:text-[#5145cd]'}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="relative">
                      {url ? (
                        <>
                          <img
                            src={url}
                            alt={scene.title}
                            onClick={() => setModal({ url, title: `${id} ${SceneTitle[id]}` })}
                            className="w-full block cursor-zoom-in"
                            style={{ aspectRatio: '1 / 1', objectFit: 'cover' }}
                          />
                          <button
                            type="button"
                            onClick={() => generateScenes([id])}
                            disabled={anyLoading}
                            title={`按所选占比和提示词重新生成${SceneTitle[id]}`}
                            className="absolute top-2 right-2 w-9 h-9 grid place-items-center border border-white/75 rounded-lg bg-white/95 text-stone-700 shadow-md hover:bg-white hover:text-[#5145cd] disabled:opacity-55 disabled:cursor-wait"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                              <path d="M20 7v5h-5" />
                              <path d="M19 12a7 7 0 0 0-12-4L4 11m0 6v-5h5m-4 0a7 7 0 0 0 12 4l3-3" />
                            </svg>
                          </button>
                        </>
                      ) : (
                        <div className="bg-stone-50 flex items-center justify-center text-stone-500 text-[13px] text-center p-2.5" style={{ aspectRatio: '1 / 1' }}>
                          {loading ? '生成中…' : sceneError ? `失败：${sceneError}` : '待生成'}
                        </div>
                      )}
                    </div>

                    {url && (
                      <div className="px-2.5 pt-2 bg-white border-t border-stone-200">
                        <label className="block mb-1.5 text-[11.5px] text-stone-500 font-semibold">本图修改提示词</label>
                        <textarea
                          value={scenePrompts[id] || ''}
                          onChange={(e) => setScenePrompts((prev) => ({ ...prev, [id]: e.target.value }))}
                          maxLength={1500}
                          placeholder="例如：背景再明亮一点，产品位置保持不变"
                          className="w-full min-h-[64px] resize-vertical px-2 py-1.5 border border-stone-200 rounded-md bg-stone-50 text-[11.5px] text-stone-800 outline-none focus:border-[#5145cd] focus:bg-white"
                        />
                      </div>
                    )}

                    <div className="px-2.5 py-2.5 text-[12.5px] flex flex-wrap justify-between gap-1.5 items-center">
                      <b className="text-[#5145cd]">{id}</b>
                      <span className="text-stone-500 text-[11.5px]">{SceneTitle[id]}</span>
                      <div className="w-full flex gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => generateScenes([id])}
                          disabled={anyLoading || !hasImages}
                          className="flex-1 px-2 py-1.5 rounded-lg bg-stone-50 text-stone-600 border border-stone-200 text-[11.5px] hover:bg-indigo-50 hover:text-[#5145cd] disabled:text-stone-400 disabled:bg-stone-100 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                        >
                          <span>{url ? '重新生成' : hasImages ? '生成这张' : '上传后生成'}</span>
                          {hasImages && !anyLoading && (
                            <span className="text-[10px] text-stone-400">· {perCost} 点</span>
                          )}
                        </button>
                        {url && (
                          <button
                            type="button"
                            onClick={() => downloadObjectUrl(url, `${id}.png`)}
                            className="flex-1 px-2 py-1.5 rounded-lg bg-stone-50 text-[#5145cd] border border-stone-200 text-[11.5px] font-semibold hover:bg-indigo-50"
                          >
                            下载
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {!hasImages && (
              <div className="text-center py-12">
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#f5a623" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-4">
                  <path d="M12 3l1.9 5.4L19 10l-5.1 1.6L12 17l-1.9-5.4L5 10l5.1-1.6z" />
                  <path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
                </svg>
                <div className="text-lg font-extrabold mb-3">AI 翡翠主图等待生成</div>
                <div className="text-[13.5px] text-stone-500">
                  在左侧上传翡翠产品图后，可以一键生成，也可以点每张卡片里的「生成这张」。
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Modal preview */}
      {modal && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-20 p-7"
          onClick={() => setModal(null)}
        >
          <div className="fixed left-7 top-6 text-white text-[13px]">{modal.title}</div>
          <button
            type="button"
            className="fixed right-6 top-5 w-9 h-9 rounded-full bg-white text-stone-800 text-xl leading-none flex items-center justify-center"
            onClick={() => setModal(null)}
          >
            ×
          </button>
          <img src={modal.url} alt="大图预览" className="max-w-[94vw] max-h-[86vh] object-contain bg-stone-900 border border-white/20" />
        </div>
      )}
    </div>
  );
};

export default JadeMainImageApp;
