import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, AlertCircle, Download, Grid, LayoutTemplate, Palette, RefreshCw, Wand2 } from 'lucide-react';
import { ImageUploader } from './components/ImageUploader';
import { ImageFile, GenerationStatus, GeneratedResult } from './types';
import { generateRenovationImage, generateMultiAngleGrid } from './services/geminiService';
import { AppProps } from '../../types';
const COST_PER_IMAGE = 10;
const GENERATED_IMAGE_COUNT = 2;

export const AiHomeRenovationApp: React.FC<AppProps> = ({ platform, costs }) => {
  const configuredCostPerImage =
    costs?.GENERATE_PER_IMAGE ?? costs?.GENERATE_FULL_SET ?? COST_PER_IMAGE;
  const totalCost = configuredCostPerImage * GENERATED_IMAGE_COUNT;

  const [roughImage, setRoughImage] = useState<ImageFile | null>(null);
  const [styleImage, setStyleImage] = useState<ImageFile | null>(null);

  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);

  const [multiAngleStatus, setMultiAngleStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [multiAngleImage, setMultiAngleImage] = useState<string | null>(null);
  const [multiAngleProgress, setMultiAngleProgress] = useState<number>(0);
  const [hasCharged, setHasCharged] = useState<boolean>(false);

  const progressIntervalRef = useRef<any>(null);
  const multiAngleProgressIntervalRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      if (multiAngleProgressIntervalRef.current) clearInterval(multiAngleProgressIntervalRef.current);
    };
  }, []);

  const startProgress = (
    setProgressFunc: React.Dispatch<React.SetStateAction<number>>,
    intervalRef: React.MutableRefObject<any>
  ) => {
    setProgressFunc(5);
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      setProgressFunc(prev => {
        if (prev >= 95) return 95;
        const increment = prev < 50 ? Math.random() * 5 + 2 : Math.random() * 2;
        return Math.min(prev + increment, 95);
      });
    }, 500);
  };

  const stopProgress = (
    setProgressFunc: React.Dispatch<React.SetStateAction<number>>,
    intervalRef: React.MutableRefObject<any>
  ) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setProgressFunc(100);
  };

  const handleDownload = (url: string, prefix: string) => {
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = `${prefix}-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const generateMultiAngleAndCharge = async (imageUrl: string) => {
    setMultiAngleStatus(GenerationStatus.LOADING);
    setMultiAngleProgress(5);
    startProgress(setMultiAngleProgress, multiAngleProgressIntervalRef);

    try {
      const gridUrl = await generateMultiAngleGrid(imageUrl);
      stopProgress(setMultiAngleProgress, multiAngleProgressIntervalRef);

      setTimeout(async () => {
        setMultiAngleImage(gridUrl);
        setMultiAngleStatus(GenerationStatus.SUCCESS);

        if (!hasCharged) {
          setHasCharged(true);
          await platform.refreshCredits?.();
        }
      }, 300);
    } catch (error: any) {
      if (multiAngleProgressIntervalRef.current) clearInterval(multiAngleProgressIntervalRef.current);
      setMultiAngleStatus(GenerationStatus.ERROR);
      setErrorMsg(error?.message || '生成多角度视图失败');
    }
  };

  const handleGenerate = async () => {
    if (!roughImage || !styleImage) return;

    await platform.refreshCredits?.();

    if (!platform.checkBalance(totalCost)) {
      return;
    }

    setStatus(GenerationStatus.LOADING);
    setMultiAngleStatus(GenerationStatus.IDLE);
    setMultiAngleImage(null);
    setErrorMsg(null);
    setResult(null);
    setHasCharged(false);
    setProgress(0);
    setMultiAngleProgress(0);

    startProgress(setProgress, progressIntervalRef);

    try {
      const generatedData = await generateRenovationImage(
        roughImage.base64,
        styleImage.base64,
        roughImage.width,
        roughImage.height
      );
      stopProgress(setProgress, progressIntervalRef);

      setTimeout(async () => {
        setResult(generatedData);
        setStatus(GenerationStatus.SUCCESS);
        await generateMultiAngleAndCharge(generatedData.imageUrl);
      }, 300);
    } catch (error: any) {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      setStatus(GenerationStatus.ERROR);
      setErrorMsg(error?.message || '生成失败，请稍后重试。');
    }
  };

  const handleGenerateMultiAngle = async () => {
    if (!result?.imageUrl) return;
    await generateMultiAngleAndCharge(result.imageUrl);
  };

  const canGenerate = !!roughImage && !!styleImage && status !== GenerationStatus.LOADING;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-800">
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={platform.onBack}
              className="flex items-center gap-1 text-slate-500 hover:text-slate-900 text-sm font-medium px-2 py-1 rounded-lg hover:bg-slate-100"
            >
              <ArrowLeft size={18} />
              返回控制台
            </button>
            <div className="flex items-center gap-2">
              <div className="bg-indigo-600 p-2 rounded-lg text-white">
                <Wand2 size={22} />
              </div>
              <div>
                <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">毛坯房改造</h1>
                <p className="text-[11px] text-slate-500 font-medium">主图 + 多角度，一次生成</p>
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg font-semibold">
            按张计费：<span className="text-indigo-700">{configuredCostPerImage}</span> 积分/张，共 {GENERATED_IMAGE_COUNT} 张，合计 <span className="text-indigo-700">{totalCost}</span> 积分
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 pb-24">
        <div className="mb-8 text-center sm:text-left">
          <h2 className="text-3xl font-bold text-slate-900 mb-2">一键预见未来家</h2>
          <p className="text-slate-600 max-w-2xl">
            上传毛坯房与风格参考，AI 自动融合并输出高质主效果图及 2x2 多角度沉浸拼图。
            保留原有结构与光影，确保真实、可落地的设计方案。
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex items-center gap-2 mb-4 text-indigo-700">
                <LayoutTemplate size={20} />
                <h3 className="font-bold text-lg">1. 上传毛坯房</h3>
              </div>
              <ImageUploader
                label="原始空间"
                subLabel="支持 JPG/PNG，保持光线均匀"
                image={roughImage}
                onImageChange={setRoughImage}
              />
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex items-center gap-2 mb-4 text-pink-600">
                <Palette size={20} />
                <h3 className="font-bold text-lg">2. 选择风格参考</h3>
              </div>
              <ImageUploader
                label="理想风格"
                subLabel="包含配色、材质与家居氛围"
                image={styleImage}
                onImageChange={setStyleImage}
              />
            </div>

            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className={`
                w-full py-4 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 transition-all transform
                ${canGenerate ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:scale-[1.02] hover:shadow-xl cursor-pointer' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}
              `}
            >
              {status === GenerationStatus.LOADING ? (
                <>
                  <RefreshCw className="animate-spin" />
                  设计渲染中...
                </>
              ) : (
                <>
                  <Wand2 />
                  生成主图 + 多角度
                </>
              )}
            </button>

            <p className="text-xs text-slate-500 text-center">按 10 积分/张计费，本次共 {GENERATED_IMAGE_COUNT} 张，成功后扣费 {totalCost} 积分，失败不扣费。</p>

            {errorMsg && (
              <div className="p-4 bg-red-50 text-red-600 rounded-xl flex items-start gap-3 text-sm">
                <AlertCircle className="shrink-0 mt-0.5" size={16} />
                <p>{errorMsg}</p>
              </div>
            )}
          </div>

          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 min-h-[500px] flex flex-col">
              <h3 className="font-bold text-xl text-slate-800 mb-6 flex items-center gap-2">
                设计成果展示
                {status === GenerationStatus.SUCCESS && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">完成</span>}
              </h3>

              <div className="flex-1 rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden relative group min-h-[400px]">
                {status === GenerationStatus.IDLE && (
                  <div className="text-center text-slate-400 p-8">
                    <div className="bg-slate-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Wand2 size={40} className="text-slate-300" />
                    </div>
                    <p>请上传两张图片后开始生成</p>
                  </div>
                )}

                {status === GenerationStatus.LOADING && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/95 backdrop-blur-sm z-10 px-8">
                    <div className="relative mb-6">
                      <div className="w-20 h-20 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                      <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-indigo-600">
                        {Math.round(progress)}%
                      </div>
                    </div>
                    <h3 className="text-lg font-bold text-indigo-900 mb-2 animate-pulse">AI 正在构思方案...</h3>
                    <div className="w-full max-w-xs bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                    <p className="text-sm text-slate-500 mt-4 text-center">
                      正在分析空间结构、匹配材质光影...<br />
                      <span className="text-xs opacity-75">通常需要 10-20 秒</span>
                    </p>
                  </div>
                )}

                {status === GenerationStatus.SUCCESS && result && (
                  <>
                    <img
                      src={result.imageUrl}
                      alt="Generated Renovation"
                      className="w-full h-full object-contain max-h-[700px] transition-transform duration-700 ease-out hover:scale-[1.01]"
                    />
                    <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleDownload(result.imageUrl, 'renovated-main')}
                        className="bg-white/90 hover:bg-white text-indigo-700 px-4 py-2 rounded-lg shadow-lg font-medium flex items-center gap-2 backdrop-blur-sm"
                      >
                        <Download size={18} />
                        保存图片
                      </button>
                    </div>
                  </>
                )}
              </div>

              {status === GenerationStatus.SUCCESS && result?.description && (
                <div className="mt-6 p-4 bg-indigo-50 rounded-xl text-sm text-indigo-900">
                  <p className="font-bold mb-1">AI 设计说明：</p>
                  <p>{result.description}</p>
                </div>
              )}
            </div>

            {status === GenerationStatus.SUCCESS && result && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                    <Grid size={20} className="text-purple-600" />
                    全景沉浸视图
                  </h3>
                  {multiAngleStatus === GenerationStatus.IDLE && (
                    <button
                      onClick={handleGenerateMultiAngle}
                      className="text-sm bg-purple-100 text-purple-700 px-3 py-1.5 rounded-lg hover:bg-purple-200 font-medium transition-colors flex items-center gap-1"
                    >
                      <Wand2 size={14} />
                      重新生成 4 角度
                    </button>
                  )}
                    {hasCharged && <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">已扣费 {totalCost} 积分（{configuredCostPerImage} 积分/张）</span>}
                </div>

                {multiAngleStatus === GenerationStatus.LOADING && (
                  <div className="h-64 bg-slate-50 rounded-xl flex flex-col items-center justify-center border-2 border-dashed border-purple-200 px-8">
                    <div className="w-full max-w-xs space-y-3">
                      <div className="flex justify-between text-xs text-purple-700 font-medium">
                        <span>生成多角度视图...</span>
                        <span>{Math.round(multiAngleProgress)}%</span>
                      </div>
                      <div className="w-full bg-purple-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-purple-600 h-2 rounded-full transition-all duration-300 ease-out"
                          style={{ width: `${multiAngleProgress}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                )}

                {multiAngleStatus === GenerationStatus.SUCCESS && multiAngleImage && (
                  <div className="relative group rounded-xl overflow-hidden border border-slate-200">
                    <img
                      src={multiAngleImage}
                      alt="Multi-angle Grid"
                      className="w-full h-auto"
                    />
                    <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleDownload(multiAngleImage, 'renovated-grid')}
                        className="bg-white/90 hover:bg-white text-purple-700 px-4 py-2 rounded-lg shadow-lg font-medium flex items-center gap-2 backdrop-blur-sm"
                      >
                        <Download size={18} />
                        保存拼图
                      </button>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4 text-white text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                      包含：广角全景、局部特写、平视景深、侧方视角
                    </div>
                  </div>
                )}

                {multiAngleStatus === GenerationStatus.ERROR && (
                  <div className="h-32 bg-red-50 rounded-xl flex flex-col items-center justify-center text-red-500 text-sm">
                    <AlertCircle size={20} className="mb-1" />
                    <p>生成多角度视图失败</p>
                    <button onClick={handleGenerateMultiAngle} className="text-red-700 underline mt-1">重试</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="bg-white border-t border-slate-200 py-8 text-center text-slate-500 text-sm">
        <p>© 2024 毛坯房改造. 使用先进 AI 技术提供高品质图像生成。</p>
      </footer>
    </div>
  );
};

export default AiHomeRenovationApp;