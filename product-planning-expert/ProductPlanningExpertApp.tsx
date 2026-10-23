import React, { useState } from 'react';
import { AppProps } from '../../types';
import { ProductFormData, StrategyResult, AppState } from './types';
import { InputForm } from './components/InputForm';
import { StrategyDisplay } from './components/StrategyDisplay';
import { LoadingState } from './components/LoadingState';
import { generateStrategy } from './services/geminiService';
const DEFAULT_STRATEGY_COST = 10;

const initialFormData: ProductFormData = {
  platform: '',
  category: '',
  targetAudience: '',
  priceRange: '',
  positioning: '',
  advantages: '',
  competitors: '',
  brandStyle: ''
};

// Internal Component for the Contact Card
const ContactSection: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const wechatId = "qianying0396";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(wechatId);
    } catch {
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-12 mb-8 bg-white/70 backdrop-blur-xl rounded-[2rem] p-6 shadow-xl shadow-blue-200/40 border border-white/60 flex flex-col sm:flex-row items-center justify-between gap-6 animate-fade-in-up">
      <div className="flex items-center gap-5">
        <div className="relative">
            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-blue-300 via-purple-300 to-pink-300 p-[3px]">
                <div className="w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden">
                    <span className="text-3xl">👩‍💻</span>
                </div>
            </div>
            <div className="absolute -bottom-1 -right-1 bg-pink-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border-2 border-white">
                Expert
            </div>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-extrabold text-gray-800">大钱AI</h3>
            <span className="px-2.5 py-1 rounded-full bg-gradient-to-r from-purple-100 to-pink-100 text-purple-600 text-[10px] font-bold tracking-wide">
              资深专家
            </span>
          </div>
          <p className="text-gray-500 text-sm font-medium">需要更深度的 1对1 定制方案？</p>
        </div>
      </div>
      
      <div className="flex items-center gap-3 bg-white/80 rounded-2xl p-2 pl-5 border border-blue-50 shadow-sm w-full sm:w-auto justify-between sm:justify-start">
        <div className="flex flex-col">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">WeChat ID</span>
            <span className="text-base font-bold text-blue-600 font-mono tracking-tight">{wechatId}</span>
        </div>
        <button 
            onClick={handleCopy}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 transform active:scale-95 ${
                copied 
                ? 'bg-green-500 text-white shadow-green-200' 
                : 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-blue-200 hover:shadow-lg hover:-translate-y-0.5'
            }`}
        >
          {copied ? '已复制' : '复制微信'}
        </button>
      </div>
    </div>
  );
};

export const ProductPlanningExpertApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [appState, setAppState] = useState<AppState>(AppState.INPUT);
  const [formData, setFormData] = useState<ProductFormData>(initialFormData);
  const [result, setResult] = useState<StrategyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const strategyCost = costs?.GENERATE_STRATEGY ?? DEFAULT_STRATEGY_COST;

  const handleInputChange = (field: keyof ProductFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.category || !formData.targetAudience || !formData.advantages) {
      alert("请填写至少包括【产品品类】、【目标人群】和【产品优势】在内的信息。");
      return;
    }

    await platform.refreshCredits?.();

    if (!platform.checkBalance(strategyCost)) {
      return;
    }

    setAppState(AppState.LOADING);
    setError(null);

    try {
      const strategyData = await generateStrategy(formData);
      await platform.refreshCredits?.();
      setResult(strategyData);
      setAppState(AppState.RESULT);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "发生意外错误");
      setAppState(AppState.ERROR);
    }
  };

  const handleReset = () => {
    setAppState(AppState.INPUT);
    setFormData(initialFormData);
    setResult(null);
    setError(null);
  };

  return (
    <div className="min-h-screen font-sans selection:bg-pink-200 selection:text-pink-900 overflow-x-hidden relative">
      {/* MBTI Style Background - Dreamy Gradients */}
      <div className="fixed inset-0 z-[-1] bg-[#F4F6FB]"></div>
      <div className="fixed top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-200/30 rounded-full blur-[100px] z-[-1] animate-pulse"></div>
      <div className="fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-200/30 rounded-full blur-[100px] z-[-1]"></div>
      <div className="fixed top-[20%] right-[10%] w-[30%] h-[30%] bg-pink-200/20 rounded-full blur-[80px] z-[-1]"></div>

      {/* Glassmorphic Header */}
      <header className="sticky top-0 z-50 w-full bg-white/60 backdrop-blur-xl border-b border-white/50 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-18 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={handleReset}>
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 group-hover:scale-105 transition-transform duration-300">
               <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
               </svg>
            </div>
            <div className="flex flex-col">
                <h1 className="text-lg font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 tracking-tight leading-none">超级单品</h1>
                <span className="text-[10px] text-gray-400 font-bold tracking-widest uppercase mt-0.5">Planning AI</span>
            </div>
          </div>
          
          <nav className="flex items-center gap-3">
            <button 
              onClick={platform.onBack}
              className="flex items-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-full text-xs font-bold transition-all border border-blue-100"
            >
               <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
               </svg>
               返回
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {appState === AppState.INPUT && (
            <div className="animate-fade-in-up">
                <div className="text-center mb-10">
                    <span className="inline-block px-4 py-1.5 rounded-full bg-white/80 border border-white/60 text-blue-600 text-xs font-bold shadow-sm mb-4 backdrop-blur-sm">
                        ✨ 专为电商卖家打造的 AI 策划专家
                    </span>
                    <h2 className="text-3xl md:text-4xl font-black text-gray-800 tracking-tight mb-2">
                        打造您的 <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-pink-500">超级单品</span>
                    </h2>
                    <p className="text-gray-500 font-medium">智能生成主图结构、详情页逻辑与 SEO 策略</p>
                </div>
                <InputForm 
                    data={formData} 
                    onChange={handleInputChange} 
                  onSubmit={handleSubmit}
                  cost={strategyCost}
                />
            </div>
        )}

        {appState === AppState.LOADING && (
            <LoadingState />
        )}

        {appState === AppState.RESULT && result && (
            <div className="animate-fade-in">
                <StrategyDisplay result={result} onReset={handleReset} />
            </div>
        )}

        {appState === AppState.ERROR && (
            <div className="max-w-lg mx-auto text-center mt-12 p-8 bg-white/80 backdrop-blur rounded-[2rem] shadow-xl shadow-red-100/50 border border-red-50 animate-shake">
                <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-50 mb-6">
                    <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900">生成遇到问题</h3>
                <p className="mt-2 text-gray-500 font-medium">{error || "网络请求发生错误，请稍后重试。"}</p>
                <div className="mt-8">
                    <button 
                        onClick={handleReset}
                        className="inline-flex items-center px-8 py-3.5 border border-transparent text-sm font-bold rounded-2xl shadow-lg shadow-blue-500/30 text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:scale-105 transition-all"
                    >
                        返回重试
                    </button>
                </div>
            </div>
        )}

        {/* Contact Section - Always visible at bottom */}
        <ContactSection />

      </main>

       {/* Footer */}
       <footer className="mt-8 py-8 border-t border-gray-200/50">
        <div className="max-w-7xl mx-auto px-4 text-center">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">&copy; {new Date().getFullYear()} Super Single Product AI</p>
        </div>
      </footer>
    </div>
  );
};
