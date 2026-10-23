import React, { useState } from 'react';
import { AppProps } from '../../types';
import ImageUploader from './components/ImageUploader';
import ResultGallery from './components/ResultGallery';
import AnalysisPanel from './components/AnalysisPanel';
import { analyzeImage, generateModelVariations } from './services/geminiService';
import { ModelAnalysis, AspectRatio, GenerationStatus } from './types';
const IMAGES_PER_GENERATION = 4;
const PER_IMAGE_COST = 8;

export const AiModelStudioApp: React.FC<AppProps> = ({ platform, costs }) => {
  const generationCost = costs?.GENERATE_MODEL_IMAGES ?? IMAGES_PER_GENERATION * PER_IMAGE_COST;
  const [base64Image, setBase64Image] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ModelAnalysis | null>(null);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('3:4');

  const handleImageSelected = (base64: string) => {
    setBase64Image(base64);
    setAnalysis(null);
    setGeneratedImages([]);
    setError(null);
  };

  const handleGenerate = async () => {
    if (!base64Image) return;

    await platform.refreshCredits();

    // 检查余额（不扣除）
    if (!platform.checkBalance(generationCost)) {
      return; // 余额不足会自动显示充值弹窗
    }

    setStatus(GenerationStatus.GENERATING);
    setError(null);
    setGeneratedImages([]);

    try {
      let currentAnalysis = analysis;

      // 如果没有分析结果，先进行分析
      if (!currentAnalysis) {
        setStatus(GenerationStatus.ANALYZING);
        setStatusText('正在深度分析模特面部特征...');
        currentAnalysis = await analyzeImage(base64Image);
        setAnalysis(currentAnalysis);
      }

      // 生成4张不同角度的照片
      setStatus(GenerationStatus.GENERATING);
      setStatusText('正在调度多镜头生成（特写、低视角、侧面、俯拍）...');
      const images = await generateModelVariations(base64Image, currentAnalysis, aspectRatio);

      setGeneratedImages(images);
      await platform.refreshCredits?.();
      setStatus(GenerationStatus.SUCCESS);
      setStatusText('');
    } catch (err: any) {
      // 请求失败，不扣费
      console.error('生成失败:', err);
      setStatus(GenerationStatus.ERROR);
      setError(err.message || '生成失败，请检查网络或重试');
      setStatusText('');
    }
  };

  const ratioOptions: { value: AspectRatio; label: string }[] = [
    { value: '1:1', label: '方形' },
    { value: '3:4', label: '竖屏' },
    { value: '4:3', label: '横屏' },
    { value: '9:16', label: '全屏' },
    { value: '16:9', label: '影院' },
    { value: '2:3', label: '经典' },
    { value: '3:2', label: '宽幅' },
  ];

  const isProcessing = status === GenerationStatus.ANALYZING || status === GenerationStatus.GENERATING;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      <div className="flex items-center border-b border-slate-200 px-6 py-3 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <button
          onClick={platform.onBack}
          className="flex items-center text-slate-700 hover:text-blue-600 transition-colors font-medium py-1.5 px-2 rounded-lg hover:bg-slate-100"
        >
          <span className="mr-2 text-lg">←</span> 返回控制台
        </button>
      </div>
        <main className="container mx-auto px-4 py-8 w-full max-w-7xl">
          {/* Title */}
          <header className="text-center mb-8">
            <div className="inline-flex items-center gap-3 mb-2">
              <span className="text-4xl">📸</span>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-800">
                模特图多角度裂变
              </h1>
            </div>
            <p className="text-lg text-slate-600">
              上传模特参考图，AI 自动分析特征并生成该模特在相同服装、场景下的多角度展示套图
            </p>
          </header>

          {/* Error Notification */}
          {error && (
            <div className="mb-6 p-4 bg-red-900/20 backdrop-blur-sm border border-red-800/50 rounded-2xl flex items-center gap-3 text-red-400 animate-in fade-in slide-in-from-top-2 shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          <div className="flex flex-col lg:flex-row gap-8 items-stretch">
            {/* Left Column: Controls */}
            <div className="w-full lg:w-[420px] flex flex-col gap-6 flex-shrink-0">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xl flex flex-col h-full gap-8">
                {/* Section 1: Upload */}
                <div className="flex-1 min-h-[300px] flex flex-col">
                  <div className="flex items-center gap-2.5 mb-4 px-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-indigo-400">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                    </svg>
                    <h2 className="text-lg font-bold text-slate-800">参考图</h2>
                  </div>
                  <div className="flex-1">
                    <ImageUploader onImageSelected={handleImageSelected} isLoading={isProcessing} />
                  </div>
                </div>

                <div className="w-full h-px bg-slate-100"></div>

                {/* Section 2: Settings */}
                <div>
                  <div className="flex items-center gap-2.5 mb-4 px-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-indigo-400">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <h2 className="text-lg font-bold text-slate-800">规格设置</h2>
                  </div>
                  
                  <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 gap-2">
                    {ratioOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setAspectRatio(option.value)}
                        className={`py-2.5 px-2 rounded-xl text-xs font-medium transition-all duration-300 border flex flex-col items-center justify-center gap-1
                          ${aspectRatio === option.value 
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-500/20 transform scale-[1.02]' 
                            : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200 hover:text-indigo-400 hover:border-indigo-500'
                          }`}
                      >
                        <span className="font-bold text-sm">{option.value}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Section 3: Action Button */}
                <div className="mt-auto pt-4">
                  <button
                    onClick={handleGenerate}
                    disabled={!base64Image || isProcessing}
                    className={`w-full py-4 rounded-2xl font-bold text-white shadow-xl transition-all duration-300 transform active:scale-95 flex items-center justify-center gap-2
                      ${!base64Image || isProcessing 
                        ? 'bg-slate-200 text-slate-600 cursor-not-allowed shadow-none' 
                        : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:shadow-indigo-500/30 hover:-translate-y-0.5'}`}
                  >
                    {isProcessing ? (
                      <>
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <div className="flex flex-col items-start text-left leading-tight">
                          <span>生成中...</span>
                          <span className="text-[10px] font-normal opacity-80">{statusText}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                        </svg>
                        <span className="text-lg">开始生成（{PER_IMAGE_COST} 积分/张，共 {generationCost} 积分）</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Analysis Panel */}
              {base64Image && (
                <AnalysisPanel analysis={analysis} isLoading={status === GenerationStatus.ANALYZING} />
              )}
            </div>

            {/* Right Column: Gallery */}
            <div className="w-full flex flex-col">
              <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-xl h-full min-h-[600px]">
                <ResultGallery images={generatedImages} isGenerating={isProcessing} />
                
                {/* Empty State */}
                {!isProcessing && generatedImages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 p-10">
                    <div className="w-24 h-24 bg-slate-100/80 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-slate-900/50 border border-slate-300">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 text-slate-500">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                      </svg>
                    </div>
                    <p className="font-semibold text-xl text-slate-600">等待创作</p>
                    <p className="text-slate-500 mt-2 max-w-sm text-center text-sm leading-relaxed">
                      在左侧上传模特参考图，AI 将为您生成 4 张不同镜头感（特写、全身、侧颜、俯拍）的高清摄影作品
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
    </div>
  );
};

