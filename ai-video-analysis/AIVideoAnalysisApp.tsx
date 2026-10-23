import React, { useState, useRef, useEffect } from 'react';
import { Upload, Film, AlertCircle, Wand2, FileVideo, X, Layers, Sparkles, ChevronRight, Link as LinkIcon } from 'lucide-react';
import { AppProps } from '../../types';
import { analyzeVideoFrames } from './services/geminiService';
import { extractVideoFrames } from './utils/videoProcessor';
import { VideoAnalysis, AnalysisStatus } from './types';
import AnalysisResult from './components/AnalysisResult';
import StoryboardTable from './components/StoryboardTable';

export const AIVideoAnalysisApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const [analysis, setAnalysis] = useState<VideoAnalysis | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [inputType, setInputType] = useState<'file' | 'url'>('file');
  const [targetTopic, setTargetTopic] = useState('');
  const [processPercent, setProcessPercent] = useState(0);
  const [loadingText, setLoadingText] = useState('初始化解析引擎...');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressTimerRef = useRef<number | null>(null);

  const COST = costs?.ANALYZE_VIDEO ?? 8;

  useEffect(() => {
    if (status === AnalysisStatus.ANALYZING) {
      progressTimerRef.current = window.setInterval(() => {
        setProcessPercent(prev => {
          if (prev >= 98) return prev;
          return prev + (99 - prev) * 0.05;
        });

        const texts = [
          "正在进行视觉语义对齐...",
          "提取视频全量文案...",
          "解析镜头运动轨迹...",
          "构建商业改写逻辑...",
          "正在输出像素拆解报告..."
        ];
        setLoadingText(texts[Math.floor(Math.random() * texts.length)]);
      }, 3000);
    } else {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    }
    return () => { if (progressTimerRef.current) clearInterval(progressTimerRef.current); };
  }, [status]);

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('video/')) {
        setErrorMsg("请上传有效的视频文件。");
        return;
    }
    setErrorMsg(null);
    setSelectedFile(file);
    setVideoUrl('');
  };

  const handleStartAnalysis = async () => {
    const source = inputType === 'file' ? selectedFile : videoUrl;
    if (!source) return;

    // Check balance first
    if (!platform.checkBalance(COST)) {
      return; // Platform shows recharge modal
    }

    setStatus(AnalysisStatus.UPLOADING);
    setProcessPercent(10);
    try {
      setLoadingText("正在自适应提取视频关键帧...");
      const frames = await extractVideoFrames(source);
      setProcessPercent(40);
      
      setStatus(AnalysisStatus.ANALYZING);
      setProcessPercent(50);
      const result = await analyzeVideoFrames(frames, targetTopic);
      
      setAnalysis(result);
      setStatus(AnalysisStatus.COMPLETED);
      setProcessPercent(100);
      await platform.refreshCredits?.();
    } catch (err: any) {
      console.error(err);
      setStatus(AnalysisStatus.ERROR);
      setErrorMsg(err.message || "分析中断。提示：若使用链接，请确保视频源支持跨域访问(CORS)。");
    }
  };

  const resetState = () => {
    setStatus(AnalysisStatus.IDLE);
    setSelectedFile(null);
    setVideoUrl('');
    setAnalysis(null);
    setErrorMsg(null);
    setTargetTopic('');
    setProcessPercent(0);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="fixed top-0 w-full z-50 bg-white border-b border-slate-200 h-16">
        <div className="max-w-6xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={platform.onBack}
              className="flex items-center text-slate-600 hover:text-slate-900 transition-colors font-medium py-1.5 px-2 rounded-lg hover:bg-slate-100 mr-4"
            >
              <span className="mr-2 text-lg">←</span> 返回控制台
            </button>
            <div className="bg-slate-800 text-white p-1.5 rounded-xl shadow-sm">
              <Layers size={20} />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">短视频拆片专家</h1>
          </div>
          <div className="text-xs text-slate-600">
            每次分析消耗 <span className="font-semibold text-slate-900">{COST}</span> 积分
          </div>
        </div>
      </header>

      <main className="pt-32 pb-24 px-6 max-w-6xl mx-auto">
        {status === AnalysisStatus.IDLE && (
          <div className="space-y-12 animate-fade-in">
            <div className="text-center space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest text-slate-600 mb-4 border border-slate-200 bg-white">
                <Sparkles size={12} className="text-emerald-600" /> AI Multimodal Engine
              </div>
              <h2 className="text-5xl md:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.3]">
                解构爆款视频的<br/><span className="text-emerald-600">视觉生产逻辑</span>
              </h2>
            </div>

            <div className="max-w-2xl mx-auto">
              <div className="bg-white border border-slate-200 p-8 md:p-10 space-y-8 rounded-xl shadow-sm">
                {/* Mode Selector */}
                <div className="flex p-1 bg-slate-100 rounded-xl">
                  <button 
                    onClick={() => setInputType('file')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all ${inputType === 'file' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    <Upload size={16} /> 本地上传
                  </button>
                  <button 
                    onClick={() => setInputType('url')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all ${inputType === 'url' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    <LinkIcon size={16} /> 粘贴地址
                  </button>
                </div>

                {inputType === 'file' ? (
                  !selectedFile ? (
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-300 rounded-lg p-12 hover:border-emerald-500 cursor-pointer transition-all bg-slate-50 group text-center"
                    >
                      <div className="w-14 h-14 bg-white rounded-lg shadow-sm flex items-center justify-center mx-auto mb-5 group-hover:scale-110 transition-transform border border-slate-200">
                        <Upload className="text-slate-600" size={24} />
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 mb-1">选择参考视频</h3>
                      <p className="text-xs text-slate-600">支持 MP4, MOV 等主流格式</p>
                      <input type="file" accept="video/*" ref={fileInputRef} className="hidden" onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
                    </div>
                  ) : (
                    <div className="bg-slate-100 border border-slate-200 rounded-lg p-5 flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className="bg-slate-800 p-3 rounded-lg text-white">
                          <FileVideo size={20} />
                        </div>
                        <div className="text-left">
                          <p className="text-slate-900 font-bold text-sm truncate max-w-[200px]">{selectedFile.name}</p>
                          <p className="text-xs text-slate-600 font-medium">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                      </div>
                      <button onClick={() => setSelectedFile(null)} className="text-slate-400 hover:text-slate-600 p-2"><X size={20} /></button>
                    </div>
                  )
                ) : (
                  <div className="space-y-4">
                    <div className="relative">
                      <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        placeholder="粘贴视频直链 (需支持 CORS)"
                        className="w-full bg-white border border-slate-200 rounded-lg p-4 pl-12 text-sm focus:border-emerald-500 outline-none transition-all text-slate-900 font-medium"
                        value={videoUrl}
                        onChange={(e) => setVideoUrl(e.target.value)}
                      />
                    </div>
                    <p className="text-xs text-slate-600 px-2">提示：该功能需要视频源服务器允许跨域请求。若失败，请下载后上传。</p>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-600 px-1">
                    <Wand2 size={12} />
                    <span>改写方向设定 (可选)</span>
                  </div>
                  <input 
                    placeholder="例如：'将该视频风格应用到高端美妆类目'"
                    className="w-full bg-white border border-slate-200 rounded-lg p-4 text-sm focus:border-emerald-500 outline-none transition-all placeholder:text-slate-400 text-slate-900 font-medium"
                    value={targetTopic}
                    onChange={(e) => setTargetTopic(e.target.value)}
                  />
                </div>

                {(selectedFile || videoUrl) && (
                  <button 
                    onClick={handleStartAnalysis}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-5 rounded-lg transition-all shadow-md flex items-center justify-center gap-2"
                  >
                    开始像素级拆解 <ChevronRight size={18} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {(status === AnalysisStatus.UPLOADING || status === AnalysisStatus.ANALYZING) && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-12 animate-fade-in">
            <div className="relative">
              <div className="w-40 h-40 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                <span className="text-3xl font-black text-slate-900">{Math.floor(processPercent)}%</span>
              </div>
              <div className="absolute inset-0 border-2 border-emerald-500/20 rounded-full animate-ping"></div>
            </div>
            <div className="text-center space-y-3">
              <h3 className="text-2xl font-bold text-slate-900 tracking-tight">{loadingText}</h3>
              <p className="text-sm text-slate-600 font-medium">AI 正在进行自适应时序建模...</p>
            </div>
          </div>
        )}

        {status === AnalysisStatus.COMPLETED && analysis && (
          <div className="space-y-16 animate-slide-up">
            <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-slate-200 pb-10 gap-6">
               <div className="space-y-4">
                 <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight italic">像素级拆解报告</h2>
                 <p className="text-sm text-slate-600 font-medium uppercase tracking-widest">
                   基于自适应动态采样 · 已还原全量视觉逻辑
                 </p>
               </div>
               <button onClick={resetState} className="px-8 py-3 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-sm font-bold text-slate-900 transition-all shadow-sm">
                 拆解新视频
               </button>
            </div>
            <AnalysisResult analysis={analysis} />
            <div className="space-y-8">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white border border-slate-200 flex items-center justify-center rounded-lg shadow-sm">
                  <Layers size={16} className="text-slate-600" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">自适应分镜拆解</h2>
              </div>
              <StoryboardTable storyboard={analysis.reimaginedStoryboard} />
            </div>
          </div>
        )}

        {status === AnalysisStatus.ERROR && (
          <div className="bg-white border border-slate-200 p-20 text-center flex flex-col items-center justify-center space-y-8 rounded-xl shadow-sm animate-fade-in">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center border border-red-200">
               <AlertCircle size={40} className="text-red-600" />
            </div>
            <div className="space-y-2 max-w-md">
              <p className="text-2xl font-bold text-slate-900 tracking-tight">解析受阻</p>
              <p className="text-sm text-slate-600 font-medium">{errorMsg}</p>
            </div>
            <button onClick={resetState} className="px-10 py-4 bg-slate-900 text-white rounded-lg font-bold shadow-md transition-transform hover:bg-slate-800">
              重试或切换上传方式
            </button>
          </div>
        )}
      </main>
    </div>
  );
};
