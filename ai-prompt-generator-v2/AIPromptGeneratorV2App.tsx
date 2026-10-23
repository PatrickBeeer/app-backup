import React, { useState } from 'react';
import { AppProps } from '../../types';
import { Sparkles, Wand2, Loader2, AlertCircle, ChevronDown, Type, Image as ImageIcon, FileJson, Video } from 'lucide-react';
import { generateArtPrompts, generatePromptsFromImage, generateJsonSystemPrompt, generateVideoPrompts } from './services/geminiService';
import { PromptResponse, GenerationStatus, Platform, VideoPlatform } from './types';
import { PromptCard } from './components/PromptCard';
import { TipsCard } from './components/TipsCard';
import { AnalysisCard } from './components/AnalysisCard';
import { ImageUploader } from './components/ImageUploader';
import { FooterCard } from './components/FooterCard';

type InputMode = 'text' | 'image' | 'json' | 'video';

export const AIPromptGeneratorV2App: React.FC<AppProps> = ({ platform, costs }) => {
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [userInput, setUserInput] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('all');
  const [videoPlatform, setVideoPlatform] = useState<VideoPlatform>('all');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [endFrameImage, setEndFrameImage] = useState<string | null>(null);
  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [result, setResult] = useState<PromptResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cost = costs?.GENERATE_PROMPTS ?? 0;

  const handleGenerate = async () => {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    await platform.refreshCredits();

    if (!platform.checkBalance(cost)) {
      setStatus(GenerationStatus.IDLE);
      return;
    }
    setStatus(GenerationStatus.LOADING);
    setError(null);
    setResult(null);

    try {
      let data: PromptResponse;
      if (inputMode === 'text') {
        if (!userInput.trim()) return;
        data = await generateArtPrompts(userInput, selectedPlatform);
      } else if (inputMode === 'video') {
        if (!userInput.trim() || !selectedImage) {
          setError("视频生成模式需要上传首帧参考图并输入动态描述。");
          setStatus(GenerationStatus.ERROR);
          return;
        }
        data = await generateVideoPrompts(userInput, selectedImage, endFrameImage, videoPlatform);
      } else if (inputMode === 'json') {
        if (!userInput.trim()) return;
        data = await generateJsonSystemPrompt(userInput);
      } else {
        if (!selectedImage) return;
        data = await generatePromptsFromImage(selectedImage);
      }

      setResult(data);
      setStatus(GenerationStatus.SUCCESS);
      await platform.refreshCredits?.();
    } catch (err: any) {
      const message = String(err?.message || '').trim();
      setError(message || "生成失败，请检查网络设置后重试。");
      setStatus(GenerationStatus.ERROR);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      if (inputMode === 'image' && !selectedImage) return;
      if (inputMode === 'video' && (!selectedImage || !userInput.trim())) return;
      if (inputMode !== 'image' && inputMode !== 'video' && !userInput.trim()) return;
      handleGenerate();
    }
  };

  const isGenerateDisabled =
    status === GenerationStatus.LOADING ||
    isSubmitting ||
    (inputMode === 'text' && !userInput.trim()) ||
    (inputMode === 'json' && !userInput.trim()) ||
    (inputMode === 'image' && !selectedImage) ||
    (inputMode === 'video' && (!userInput.trim() || !selectedImage));

  return (
    <div className="min-h-screen pb-12 selection:bg-blue-200 selection:text-blue-900 flex flex-col">
      <div className="flex-grow w-full max-w-6xl mx-auto px-4 py-8 md:py-12">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
          <button onClick={platform.onBack} className="text-slate-700 hover:text-blue-600 transition-colors font-medium py-1.5 px-2 rounded-lg hover:bg-slate-100">
            <span className="mr-2 text-lg">←</span> 返回控制台
          </button>
        </div>

        <header className="mb-12 text-center">
          <div className="inline-flex items-center justify-center p-4 mb-4 rounded-[2rem] bg-white/40 backdrop-blur-xl border border-white/60 shadow-lg shadow-blue-500/5">
            <Wand2 className="w-8 h-8 text-blue-500 mr-3" />
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-800">AI提示词生成器 2.0</h1>
          </div>
        </header>

        <div className="mb-12 max-w-4xl mx-auto relative z-10">
          <div className="relative bg-white/60 backdrop-blur-2xl rounded-[2rem] border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
            <div className="p-2">
              <div className="flex bg-slate-100/50 p-1 rounded-full border border-slate-200/50 flex-wrap gap-1">
                <button onClick={() => { setInputMode('text'); setResult(null); setError(null); }} className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-full transition-all duration-300 whitespace-nowrap px-3 ${inputMode === 'text' ? 'bg-white text-slate-800 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}><Type size={16} />文本绘图</button>
                <button onClick={() => { setInputMode('video'); setResult(null); setError(null); }} className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-full transition-all duration-300 whitespace-nowrap px-3 ${inputMode === 'video' ? 'bg-white text-slate-800 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}><Video size={16} />视频生成</button>
                <button onClick={() => { setInputMode('image'); setResult(null); setError(null); }} className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-full transition-all duration-300 whitespace-nowrap px-3 ${inputMode === 'image' ? 'bg-white text-slate-800 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}><ImageIcon size={16} />图片反推</button>
                <button onClick={() => { setInputMode('json'); setResult(null); setError(null); }} className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-full transition-all duration-300 whitespace-nowrap px-3 ${inputMode === 'json' ? 'bg-white text-slate-800 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}><FileJson size={16} />JSON 助手</button>
              </div>
            </div>

            <div className="p-1">
              {inputMode === 'image' && (
                <div className="p-6 pb-2">
                  <ImageUploader selectedImage={selectedImage} onImageSelect={setSelectedImage} onClear={() => setSelectedImage(null)} label="上传图片进行分析" />
                </div>
              )}
              {inputMode === 'video' && (
                <div className="p-6 pb-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="h-64"><ImageUploader selectedImage={selectedImage} onImageSelect={setSelectedImage} onClear={() => setSelectedImage(null)} label="首帧 (必须)" /></div>
                  <div className="h-64"><ImageUploader selectedImage={endFrameImage} onImageSelect={setEndFrameImage} onClear={() => setEndFrameImage(null)} label="尾帧 (可选 - 自动补间)" /></div>
                </div>
              )}
              {inputMode !== 'image' && (
                <div className="relative">
                  {inputMode === 'video' && <p className="text-sm font-medium text-slate-500 px-7 pt-2">{selectedImage && endFrameImage ? "描述从首帧到尾帧的过渡方式..." : "描述视频的运动轨迹..."}</p>}
                  <textarea
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={inputMode === 'json' ? "描述你想创建的 AI 角色或任务..." : inputMode === 'video' ? "例如：'镜头缓慢推进，猫咪眨眼并看向窗外'..." : "描述你的创意... (例如：'东京雨夜的赛博朋克路边摊')"}
                    className={`w-full bg-transparent text-lg text-slate-700 placeholder-slate-400 p-6 focus:outline-none resize-none ${inputMode === 'video' ? 'min-h-[100px]' : 'min-h-[160px]'}`}
                    disabled={status === GenerationStatus.LOADING}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 bg-white/40 border-t border-white/50 gap-4">
              <div className="text-xs font-medium text-slate-400 hidden sm:block w-full sm:w-auto">
                {inputMode === 'image' ? 'AI 智能分析图片风格与构图' : inputMode === 'video' ? '图生视频模式：支持首尾帧插值与动态生成' : '按 Ctrl + Enter 快速生成'}
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                {inputMode === 'text' && (
                  <div className="relative flex-1 sm:flex-none min-w-[160px]">
                    <select value={selectedPlatform} onChange={(e) => setSelectedPlatform(e.target.value as Platform)} disabled={status === GenerationStatus.LOADING} className="w-full appearance-none bg-white/80 backdrop-blur-md text-slate-700 text-sm font-semibold pl-4 pr-10 py-3 rounded-2xl border border-white/60 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 cursor-pointer disabled:opacity-50 hover:bg-white transition-colors shadow-sm">
                      <option value="all">双平台 (MJ + 即梦)</option>
                      <option value="midjourney">仅 Midjourney</option>
                      <option value="jimeng">仅即梦 AI</option>
                    </select>
                    <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                  </div>
                )}
                {inputMode === 'video' && (
                  <div className="relative flex-1 sm:flex-none min-w-[160px]">
                    <select value={videoPlatform} onChange={(e) => setVideoPlatform(e.target.value as VideoPlatform)} disabled={status === GenerationStatus.LOADING} className="w-full appearance-none bg-white/80 backdrop-blur-md text-slate-700 text-sm font-semibold pl-4 pr-10 py-3 rounded-2xl border border-white/60 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 cursor-pointer disabled:opacity-50 hover:bg-white transition-colors shadow-sm">
                      <option value="all">全平台 (VEO/即梦/海螺)</option>
                      <option value="veo">Google Veo</option>
                      <option value="jimeng_video">即梦视频</option>
                      <option value="hailuo">海螺 (Hailuo)</option>
                    </select>
                    <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                  </div>
                )}
                <button onClick={handleGenerate} disabled={isGenerateDisabled} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-8 py-3 rounded-2xl font-semibold transition-all duration-300 shadow-lg ${isGenerateDisabled ? 'bg-slate-200/80 text-slate-400 cursor-not-allowed shadow-none' : 'bg-blue-500 hover:bg-blue-600 text-white shadow-blue-500/30 hover:shadow-blue-500/40 hover:-translate-y-0.5 active:scale-95'}`}>
                  {status === GenerationStatus.LOADING ? <><Loader2 className="animate-spin" size={18} /><span>处理中...</span></> : <><Sparkles size={18} /><span>开始生成</span></>}
                </button>
              </div>
            </div>
          </div>
        </div>

        {status === GenerationStatus.ERROR && error && (
          <div className="max-w-3xl mx-auto mb-8 p-4 rounded-2xl bg-red-50/80 backdrop-blur-sm border border-red-100 text-red-600 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 shadow-sm">
            <AlertCircle size={20} /><p className="font-medium">{error}</p>
          </div>
        )}

        {result && (
          <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
            {inputMode === 'json' && result.jsonSystemPrompt && (
              <div className="max-w-4xl mx-auto w-full">
                <h2 className="text-xl font-bold text-slate-800 pl-2 mb-4">JSON System Prompt</h2>
                <PromptCard title="复制下方代码到 GPT/Claude/Gemini 的对话框中" content={result.jsonSystemPrompt} type="json" className="w-full" />
              </div>
            )}
            {inputMode === 'video' && (
              <div className={`grid gap-6 ${videoPlatform === 'all' ? 'md:grid-cols-3' : 'max-w-3xl mx-auto w-full'} items-stretch`}>
                {(videoPlatform === 'all' || videoPlatform === 'veo') && result.veoPrompt && <div className="flex flex-col gap-4 h-full"><h2 className="text-xl font-bold text-slate-800 pl-2">Google Veo</h2><PromptCard title="Veo 提示词" content={result.veoPrompt} type="veo" className="flex-1" /></div>}
                {(videoPlatform === 'all' || videoPlatform === 'jimeng_video') && result.jimengVideoPrompt && <div className="flex flex-col gap-4 h-full"><h2 className="text-xl font-bold text-slate-800 pl-2">即梦视频</h2><PromptCard title="即梦视频提示词" content={result.jimengVideoPrompt} type="jimeng_video" className="flex-1" /></div>}
                {(videoPlatform === 'all' || videoPlatform === 'hailuo') && result.hailuoPrompt && <div className="flex flex-col gap-4 h-full"><h2 className="text-xl font-bold text-slate-800 pl-2">海螺 (Hailuo)</h2><PromptCard title="海螺提示词" content={result.hailuoPrompt} type="hailuo" className="flex-1" /></div>}
              </div>
            )}
            {inputMode !== 'json' && inputMode !== 'video' && (
              <div className={`grid gap-6 ${inputMode === 'image' || selectedPlatform === 'all' ? 'md:grid-cols-2' : 'max-w-3xl mx-auto w-full'} items-stretch`}>
                {result.midjourneyPrompt && (
                  <div className="flex flex-col gap-4 h-full">
                    <h2 className="text-xl font-bold text-slate-800 pl-2">Midjourney</h2>
                    <PromptCard title="MJ 提示词" content={result.midjourneyPrompt} type="mj" className="flex-1" />
                    {result.mjTips && <TipsCard tips={result.mjTips} />}
                  </div>
                )}
                {result.jimengPrompt && (
                  <div className="flex flex-col gap-4 h-full">
                    <h2 className="text-xl font-bold text-slate-800 pl-2">即梦 AI</h2>
                    <PromptCard title="即梦提示词" content={result.jimengPrompt} type="jimeng" className="flex-1" />
                  </div>
                )}
              </div>
            )}
            {result.promptAnalysis && (
              <div className="max-w-6xl mx-auto w-full">
                <AnalysisCard analysis={result.promptAnalysis} recommendedPlatform={result.recommendedPlatform} detectedAspectRatio={result.detectedAspectRatio} />
              </div>
            )}
          </div>
        )}

        {!result && status !== GenerationStatus.LOADING && status !== GenerationStatus.ERROR && (
          <div className="mt-8 text-center opacity-60"><p className="text-sm text-slate-400 tracking-wide font-medium">DESIGNED FOR CREATORS</p></div>
        )}
      </div>
      <div className="px-4 pb-8"><FooterCard /></div>
    </div>
  );
};
