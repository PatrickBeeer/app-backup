import React, { useState } from 'react';
import { AppProps } from '../../types';
import { Sparkles, ArrowRight, Video, AlertCircle } from 'lucide-react';
import { PlatformCard } from './components/PlatformCard';
import { generateContentStrategy } from './services/geminiService';
import { AnalysisResponse, PlatformData } from './types';

const INITIAL_SCRIPT_PLACEHOLDER = `在这里粘贴您的视频逐字稿...

例如：
大家好，今天给大家分享一个AI做视频的神器，只需要输入文字就能自动生成视频，不需要剪辑，而且完全免费。对于想做自媒体又不会剪辑的小白来说，绝对是福音。首先打开这个网站...`;

type PlatformKey = 'Douyin' | 'Xiaohongshu' | 'VideoAccount';

export const ViralTitleGeneratorApp: React.FC<AppProps> = ({ platform, costs }) => {
  const fee = costs?.GENERATE_TITLES ?? 0;
  const [script, setScript] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PlatformKey>('Douyin');

  const handleGenerate = async () => {
    if (!script.trim()) return;

    // 检查余额（不扣除）
    await platform.refreshCredits();
    if (!platform.checkBalance(fee)) {
      return; // 余额不足会自动显示充值弹窗
    }
    
    setLoading(true);
    setError(null);
    setResult(null);
    setActiveTab('Douyin');

    try {
      const data = await generateContentStrategy(script);
      setResult(data);
      await platform.refreshCredits?.();
    } catch (err: any) {
      setError(err.message || '出错了。请检查您的 API Key 并重试。');
    } finally {
      setLoading(false);
    }
  };

  const getActivePlatformData = (): PlatformData | undefined => {
    return result?.platforms.find(p => p.platformName === activeTab);
  };

  const tabs: { key: PlatformKey; label: string; activeClass: string }[] = [
    { key: 'Douyin', label: '抖音', activeClass: 'text-slate-800 bg-slate-100 shadow-sm' },
    { key: 'Xiaohongshu', label: '小红书', activeClass: 'text-slate-800 bg-slate-100 shadow-sm' },
    { key: 'VideoAccount', label: '视频号', activeClass: 'text-slate-800 bg-slate-100 shadow-sm' },
  ];

  return (
    <div className="min-h-screen text-slate-800 flex flex-col font-sans bg-slate-50">
      <div className="flex items-center border-b border-slate-200 px-6 py-3 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <button
          onClick={platform.onBack}
          className="flex items-center text-slate-700 hover:text-blue-600 transition-colors font-medium py-1.5 px-2 rounded-lg hover:bg-slate-100"
        >
          <span className="mr-2 text-lg">←</span> 返回控制台
        </button>
      </div>
        <main className="flex-1 max-w-[1400px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
          {!result && !loading && (
            <div className="text-center mb-16 max-w-2xl mx-auto animate-fade-in-up">
              <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-6 text-white drop-shadow-sm">
                一键生成 <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400">全平台爆款标题</span>
              </h2>
              <p className="text-slate-600 text-lg sm:text-xl font-medium leading-relaxed max-w-xl mx-auto">
                粘贴视频逐字稿，立即生成针对抖音、小红书和视频号优化的标题与标签。
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className={`col-span-1 ${result ? 'lg:col-span-5' : 'lg:col-span-8 lg:col-start-3'} transition-all duration-700 ease-[cubic-bezier(0.25,0.8,0.25,1)]`}>
              <div className="bg-white/80 backdrop-blur-2xl border border-slate-200 rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.2)] p-1.5 transition-all hover:shadow-[0_12px_40px_rgba(0,0,0,0.3)]">
                <div className="bg-slate-100/30 rounded-[20px] p-5">
                  <label htmlFor="script" className="block text-sm font-semibold text-slate-700 mb-3 ml-1">
                    视频逐字稿
                  </label>
                  <textarea
                    id="script"
                    className="w-full h-64 lg:h-[500px] bg-slate-100/50 border border-slate-300 rounded-2xl p-4 text-slate-800 placeholder-slate-500 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 transition-all resize-none text-base leading-relaxed outline-none backdrop-blur-sm"
                    placeholder={INITIAL_SCRIPT_PLACEHOLDER}
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                  />
                  
                  <div className="mt-6 flex flex-col gap-4">
                    <div className="flex justify-between items-center px-1">
                      <div className="text-xs font-medium text-slate-500">
                        {script.length} 字
                      </div>
                      {script.length > 0 && (
                        <button onClick={() => setScript('')} className="text-xs text-slate-500 hover:text-slate-700 transition-colors">
                          清空
                        </button>
                      )}
                    </div>

                    <button
                      onClick={handleGenerate}
                      disabled={!script.trim() || loading}
                      className={`group w-full py-4 rounded-2xl font-bold text-white shadow-lg flex items-center justify-center gap-2 transition-all duration-300 transform hover:-translate-y-0.5 active:translate-y-0 ${
                        !script.trim() || loading
                          ? 'bg-slate-200 cursor-not-allowed text-slate-600 shadow-none'
                          : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:shadow-indigo-500/40'
                      }`}
                    >
                      {loading ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          正在分析策略...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-5 h-5 transition-transform group-hover:rotate-12" />
                          生成爆款策略
                          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                        </>
                      )}
                    </button>
                  </div>

                  {error && (
                    <div className="mt-4 p-4 bg-red-900/20 backdrop-blur-sm border border-red-800/50 rounded-2xl flex items-start gap-3 text-red-400 text-sm">
                      <AlertCircle className="w-5 h-5 flex-shrink-0" />
                      <p>{error}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {result && (
              <div className="col-span-1 lg:col-span-7 animate-fade-in-up">
                <div className="h-full flex flex-col">
                  <div className="mb-6 p-1.5 bg-slate-100/30 backdrop-blur-md rounded-2xl border border-slate-300 flex relative">
                    {tabs.map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300 relative z-10 ${
                          activeTab === tab.key ? tab.activeClass : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/30'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex-1 relative min-h-[500px]">
                    {getActivePlatformData() && (
                      <div className="h-full animate-fade-in">
                        <PlatformCard data={getActivePlatformData()!} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      <style>{`
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(20px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }
        @keyframes fade-in {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in {
          animation: fade-in 0.4s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

