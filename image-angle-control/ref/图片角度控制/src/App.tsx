import React, { useCallback, useEffect, useState } from 'react';
import { CameraState, GenerationHistoryItem, GenerationSettings } from './types';
import { VectorControl } from './components/VectorControl';
import { LinearControl } from './components/LinearControl';
import { generateNewPerspective } from './services/geminiService';

const copy = {
  title: '\u63a7\u5236\u56fe\u7247\u591a\u89d2\u5ea6',
  subtitle: 'Advanced AI Camera Engine',
  source: '\u6e90\u56fe',
  upload: '\u4e0a\u4f20\u56fe\u7247',
  standard: '1K \u6a21\u5f0f',
  pro: '2K \u6a21\u5f0f',
  output: '\u56fe\u7247\u5c3a\u5bf8',
  eye: '\u773c\u795e\u8ffd\u8e2a\u76f8\u673a',
  cameraParams: '\u76f8\u673a\u53c2\u6570',
  reset: '\u91cd\u7f6e',
  orbit: '\u4e09\u7ef4\u4e91\u53f0',
  dolly: '\u524d\u540e\u63a8\u8fdb',
  pullBack: '\u7f29\u653e',
  pushIn: '\u7279\u5199',
  generating: '\u6b63\u5728\u751f\u6210',
  generate: '\u751f\u6210\u65b0\u89d2\u5ea6',
  emptyTitle: '\u51c6\u5907\u597d\u751f\u6210\u591a\u89d2\u5ea6\u56fe\u7247\u4e86\u5417\uff1f',
  emptyDesc: '\u4e0a\u4f20\u56fe\u7247\uff0c\u8c03\u6574\u4e91\u53f0\u89d2\u5ea6\u540e\u751f\u6210\u660e\u786e\u7684\u65b0\u62cd\u6444\u89c6\u89d2\u3002',
  loadingTitle: 'AI \u6b63\u5728\u8ba1\u7b97\u89d2\u5ea6\u4e0e\u900f\u89c6',
  loadingDesc: '\u8bf7\u7a0d\u7b49\u7247\u523b',
  download: '\u4e0b\u8f7d\u56fe\u7247',
  remove: '\u79fb\u9664\u56fe\u7247',
  invalidFile: '\u8bf7\u4e0a\u4f20\u56fe\u7247\u6587\u4ef6\u3002',
  readFailed: '\u56fe\u7247\u8bfb\u53d6\u5931\u8d25\uff0c\u8bf7\u6362\u4e00\u5f20\u56fe\u7247\u91cd\u8bd5\u3002',
  generateFailed: '\u751f\u6210\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002',
  result: '\u751f\u6210\u7ed3\u679c',
  sourceAlt: '\u6e90\u56fe',
  preview: '\u9884\u89c8\u5927\u56fe',
  closePreview: '\u5173\u95ed\u5927\u56fe',
  history: '\u5386\u53f2\u8bb0\u5f55',
  historyEmpty: '\u751f\u6210\u540e\u4f1a\u5728\u8fd9\u91cc\u4fdd\u7559\u89c6\u89d2\u8bb0\u5f55',
  clearHistory: '\u6e05\u7a7a',
  subject: '\u4e3b\u4f53\u7c7b\u578b',
  subjectAuto: '\u81ea\u52a8',
  subjectPerson: '\u4eba\u7269',
  subjectProduct: '\u4ea7\u54c1',
};

const HISTORY_KEY = 'ai-camera-scheduler-history';

const MODE_COSTS = { standard: 10, pro: 15 };

const getViewLabel = (cameraState: CameraState) => {
  const yaw = Math.round(cameraState.rotationX * 180);
  const pitch = Math.round(cameraState.rotationY * 90);
  const side = Math.abs(yaw) < 8 ? '\u6b63\u9762\u62cd\u6444' : yaw > 0 ? '\u53f3\u4fa7\u62cd\u6444 / \u6a21\u7279\u5de6\u4fa7' : '\u5de6\u4fa7\u62cd\u6444 / \u6a21\u7279\u53f3\u4fa7';
  const height = Math.abs(pitch) < 5 ? '\u5e73\u89c6' : pitch > 0 ? '\u4fef\u89c6' : '\u4ef0\u89c6';
  return `${side} / ${height}`;
};

const readHistory = (): GenerationHistoryItem[] => {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const App: React.FC = () => {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [history, setHistory] = useState<GenerationHistoryItem[]>(readHistory);

  const [settings, setSettings] = useState<GenerationSettings>({
    mode: 'standard',
    aspectRatio: '3:4',
    eyeContact: false,
    subjectType: 'auto',
  });

  const [cameraState, setCameraState] = useState<CameraState>({
    rotationX: 0,
    rotationY: 0,
    moveZ: 0,
  });

  const handleImageUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError(copy.invalidFile);
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setOriginalImage(reader.result as string);
      setGeneratedImage(null);
      setError(null);
    };
    reader.onerror = () => setError(copy.readFailed);
    reader.readAsDataURL(file);
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.[0]) handleImageUpload(event.target.files[0]);
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
    if (event.dataTransfer.files?.[0]) handleImageUpload(event.dataTransfer.files[0]);
  };

  const handleVectorChange = useCallback((x: number, y: number) => {
    setCameraState((prev) => ({ ...prev, rotationX: x, rotationY: y }));
  }, []);

  const handleGenerate = async () => {
    if (!originalImage) return;

    setIsLoading(true);
    setError(null);

    try {
      const resultUrl = await generateNewPerspective(originalImage, cameraState, settings);
      setGeneratedImage(resultUrl);
      setHistory((previous) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          url: resultUrl,
          timestamp: Date.now(),
          cameraState: { ...cameraState },
          settings: { ...settings },
          viewLabel: getViewLabel(cameraState),
        },
        ...previous,
      ].slice(0, 12));
    } catch (err: any) {
      setError(err?.message || copy.generateFailed);
    } finally {
      setIsLoading(false);
    }
  };

  const resetControls = () => {
    setCameraState({
      rotationX: 0,
      rotationY: 0,
      moveZ: 0,
    });
  };

  useEffect(() => {
    if (!previewImage) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewImage(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewImage]);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      // Keep the current-session history when browser storage is full.
    }
  }, [history]);

  const restoreHistoryItem = (item: GenerationHistoryItem) => {
    setGeneratedImage(item.url);
    setCameraState(item.cameraState);
    setSettings(item.settings);
    setPreviewImage(item.url);
  };

  return (
    <div className="min-h-screen overflow-hidden bg-[#f5f7fb] text-slate-900 font-sans flex items-center justify-center px-6 py-6">
      <div className="flex h-[calc(100vh-48px)] max-h-[900px] w-full max-w-[980px] max-lg:max-w-[420px] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
        <aside className="w-[360px] max-lg:w-full bg-white border-r border-slate-200 max-lg:border-r-0 flex flex-col h-full overflow-hidden shrink-0">
          <header className="px-8 pt-8 pb-6 border-b border-slate-100 shrink-0">
            <h1 className="text-[26px] leading-tight font-extrabold tracking-normal text-slate-950">
              {copy.title}
            </h1>
            <p className="mt-4 text-[10px] font-bold tracking-[0.24em] text-slate-400 uppercase">
              {copy.subtitle}
            </p>
          </header>

          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-7">
            <section className="space-y-3">
              <label className="text-[11px] font-bold text-slate-600">{copy.source}</label>

              {!originalImage ? (
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={onDrop}
                  className={`relative h-72 rounded-[18px] border-2 border-dashed flex flex-col items-center justify-center transition-colors cursor-pointer ${
                    isDragOver
                      ? 'border-indigo-400 bg-indigo-50'
                      : 'border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/40'
                  }`}
                >
                  <input
                    type="file"
                    onChange={onFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    accept="image/*"
                  />
                  <div className="w-9 h-9 rounded-full bg-white shadow-sm border border-slate-100 flex items-center justify-center text-indigo-500">
                    <i className="fa-solid fa-plus text-sm"></i>
                  </div>
                  <span className="mt-2 text-[10px] font-semibold text-slate-500">{copy.upload}</span>
                </div>
              ) : (
                <div className="relative rounded-[18px] overflow-hidden border border-slate-200 bg-slate-50">
                  <button
                    type="button"
                    onClick={() => setPreviewImage(originalImage)}
                    className="block w-full cursor-zoom-in"
                    title={copy.preview}
                  >
                    <img src={originalImage} alt={copy.sourceAlt} className="w-full h-72 object-contain" />
                  </button>
                  <button
                    onClick={() => {
                      setOriginalImage(null);
                      setGeneratedImage(null);
                    }}
                    className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 hover:bg-red-50 border border-slate-200 text-slate-500 hover:text-red-500 shadow-sm transition-colors"
                    title={copy.remove}
                  >
                    <i className="fa-solid fa-trash-can text-xs"></i>
                  </button>
                </div>
              )}
            </section>

            {settings.subjectType !== 'product' && (
              <section className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <i className={`fa-regular ${settings.eyeContact ? 'fa-eye text-indigo-500' : 'fa-eye-slash text-slate-400'}`}></i>
                    {copy.eye}
                  </div>
                  <button
                    onClick={() => setSettings((prev) => ({ ...prev, eyeContact: !prev.eyeContact }))}
                    className={`w-10 h-6 rounded-full relative transition-colors ${settings.eyeContact ? 'bg-[#2f5bff]' : 'bg-slate-200'}`}
                    aria-label={copy.eye}
                  >
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${settings.eyeContact ? 'translate-x-1' : '-translate-x-4'}`}></span>
                  </button>
                </div>
              </section>
            )}

            <section className="space-y-3">
              <label className="text-[11px] font-bold text-slate-600">{copy.subject}</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ['auto', copy.subjectAuto],
                  ['person', copy.subjectPerson],
                  ['product', copy.subjectProduct],
                ] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setSettings((prev) => ({ ...prev, subjectType: val }))}
                    className={`h-10 rounded-full border text-xs font-bold transition-all ${
                      settings.subjectType === val
                        ? 'border-[#2f5bff] bg-[#2f5bff] text-white shadow-[0_10px_22px_rgba(47,91,255,0.28)]'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-[#2f5bff]/30 hover:text-[#2f5bff]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-5">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-bold text-slate-600">{copy.cameraParams}</label>
                <button onClick={resetControls} className="text-[11px] font-semibold text-indigo-500 hover:text-indigo-700">
                  {copy.reset}
                </button>
              </div>

              <VectorControl
                label={copy.orbit}
                x={cameraState.rotationX}
                y={cameraState.rotationY}
                imageUrl={originalImage}
                onChange={handleVectorChange}
                subjectType={settings.subjectType}
              />

              <LinearControl
                label={copy.dolly}
                value={cameraState.moveZ}
                onChange={(val) => setCameraState((prev) => ({ ...prev, moveZ: val }))}
                minLabel={copy.pullBack}
                maxLabel={copy.pushIn}
              />

              <div className="space-y-4 pt-2">
                {error && (
                  <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-500">
                    {error}
                  </div>
                )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSettings((prev) => ({ ...prev, mode: 'standard' }))}
                  className={`h-11 rounded-full border text-xs font-bold transition-all ${
                    settings.mode === 'standard'
                      ? 'border-[#2f5bff] bg-[#2f5bff] text-white shadow-[0_10px_22px_rgba(47,91,255,0.28)]'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-[#2f5bff]/30 hover:text-[#2f5bff]'
                  }`}
                >
                  {copy.standard} · {MODE_COSTS.standard}点
                </button>
                <button
                  onClick={() => setSettings((prev) => ({ ...prev, mode: 'pro' }))}
                  className={`h-11 rounded-full border text-xs font-bold transition-all ${
                    settings.mode === 'pro'
                      ? 'border-[#2f5bff] bg-[#2f5bff] text-white shadow-[0_10px_22px_rgba(47,91,255,0.28)]'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-[#2f5bff]/30 hover:text-[#2f5bff]'
                  }`}
                >
                  {copy.pro} · {MODE_COSTS.pro}点
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-600">{copy.output}</label>
                <select
                  value={settings.aspectRatio}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      aspectRatio: event.target.value as GenerationSettings['aspectRatio'],
                    }))
                  }
                  className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#2f5bff]"
                  aria-label={copy.output}
                >
                  <option value="1:1">1:1 · 方图</option>
                  <option value="3:4">3:4 · 竖图</option>
                  <option value="4:3">4:3 · 横图</option>
                  <option value="9:16">9:16 · 竖屏</option>
                  <option value="16:9">16:9 · 横屏</option>
                </select>
              </div>
            </div>
            <button
              onClick={handleGenerate}
              disabled={isLoading || !originalImage}
              className={`w-full h-12 rounded-full font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2 ${
                isLoading || !originalImage
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-[#2f5bff] hover:bg-[#244ce6] text-white shadow-[0_12px_28px_rgba(47,91,255,0.30)] active:scale-[0.99]'
              }`}
            >
              {isLoading ? (
                <>
                  <i className="fa-solid fa-circle-notch fa-spin"></i>
                  {copy.generating}
                </>
              ) : (
                <>
                  <i className="fa-solid fa-wand-magic-sparkles"></i>
                  {copy.generate}
                </>
              )}
            </button>

            <section className="space-y-3 border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-600">{copy.history}</label>
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setHistory([])}
                    className="text-[10px] font-semibold text-slate-400 hover:text-red-500"
                  >
                    {copy.clearHistory}
                  </button>
                )}
              </div>
              {history.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-3 py-3 text-[10px] leading-relaxed text-slate-400">
                  {copy.historyEmpty}
                </p>
              ) : (
                <div className="space-y-2">
                  {history.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => restoreHistoryItem(item)}
                      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-2 text-left transition-colors hover:border-[#2f5bff]/40 hover:bg-indigo-50/40"
                    >
                      <img src={item.url} alt={copy.result} className="h-14 w-11 shrink-0 rounded-lg bg-slate-50 object-contain" />
                      <span className="min-w-0">
                        <span className="block truncate text-[11px] font-bold text-slate-700">{item.viewLabel}</span>
                        <span className="mt-1 block text-[10px] text-slate-400">
                          {item.settings.mode === 'pro' ? copy.pro : copy.standard} / {item.settings.aspectRatio}
                        </span>
                        <span className="mt-1 block text-[9px] text-slate-400">
                          {new Date(item.timestamp).toLocaleString('zh-CN', { hour12: false })}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
            </section>
          </div>
        </aside>

        <main className="flex-1 max-lg:hidden relative bg-[#f7f9fd] flex items-center justify-center overflow-hidden">
          <div className="relative w-[min(560px,calc(100%-64px))] aspect-[4/3] rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.06)] flex items-center justify-center overflow-hidden">
            {generatedImage ? (
              <button
                type="button"
                onClick={() => setPreviewImage(generatedImage)}
                className="h-full w-full cursor-zoom-in"
                title={copy.preview}
              >
                <img src={generatedImage} alt={copy.result} className="max-w-full max-h-full object-contain" />
              </button>
            ) : (
              <div className="text-center px-8">
                <div className="mx-auto w-20 h-20 rounded-full bg-indigo-50 border border-indigo-100 shadow-sm flex items-center justify-center text-indigo-500">
                  <i className="fa-regular fa-images text-3xl"></i>
                </div>
                <h2 className="mt-8 text-2xl font-extrabold text-slate-950">{copy.emptyTitle}</h2>
                <p className="mt-5 text-sm font-semibold text-slate-400">{copy.emptyDesc}</p>
              </div>
            )}
          </div>

          {isLoading && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4">
              <div className="w-14 h-14 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin"></div>
              <div className="text-center">
                <p className="text-slate-950 font-extrabold text-lg">{copy.loadingTitle}</p>
                <p className="text-slate-400 text-sm mt-1">{copy.loadingDesc}</p>
              </div>
            </div>
          )}

          {generatedImage && (
            <div className="absolute bottom-7 left-1/2 -translate-x-1/2 rounded-full bg-white/90 backdrop-blur border border-slate-200 px-5 py-3 flex items-center gap-5 shadow-lg">
              <div className="text-xs font-semibold text-slate-500">
                {settings.mode === 'pro' ? copy.pro : copy.standard} / {settings.aspectRatio}
              </div>
              <div className="h-4 w-px bg-slate-200"></div>
              <a
                href={generatedImage}
                download={`multi-angle-${Date.now()}.png`}
                className="text-indigo-600 hover:text-indigo-500 transition-colors flex items-center gap-2 text-sm font-bold"
              >
                <i className="fa-solid fa-download"></i>
                {copy.download}
              </a>
            </div>
          )}
        </main>

        {previewImage && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-6 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label={copy.preview}
            onClick={() => setPreviewImage(null)}
          >
            <div className="relative flex max-h-[92vh] max-w-[92vw] items-center justify-center">
              <img
                src={previewImage}
                alt={copy.preview}
                className="max-h-[88vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              />
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="absolute -right-3 -top-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white text-slate-700 shadow-lg transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                title={copy.closePreview}
                aria-label={copy.closePreview}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
