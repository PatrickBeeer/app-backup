/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, ArrowRight, Zap, Target, Layout as LayoutIcon, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import ImageUpload from './components/ImageUpload';
import CopyGenerator from './components/CopyGenerator';
import StyleSuggestions from './components/StyleSuggestions';
import { AppState } from './types';
import { analyzeProduct, generateCopy, suggestVisualStyles } from './services/geminiService';

export default function App() {
  const [isOptionsExpanded, setIsOptionsExpanded] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const [stylesFailed, setStylesFailed] = useState(false);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const [state, setState] = useState<AppState>({
    originalImage: null,
    referenceText: '',
    coreSellingPoints: '',
    analysis: null,
    copySuggestions: [],
    styleSuggestions: [],
    isAnalyzing: false,
    isGeneratingCopy: false,
    isGeneratingStyles: false,
  });

  const handleUpload = async (base64: string) => {
    setErrorMessage(null);
    setCopyFailed(false);
    setStylesFailed(false);
    setState(prev => ({
      ...prev,
      originalImage: base64,
      isAnalyzing: true,
      analysis: null,
      copySuggestions: [],
      styleSuggestions: []
    }));

    try {
      const analysis = await analyzeProduct(base64);
      setState(prev => ({ ...prev, analysis, isAnalyzing: false, isGeneratingCopy: true, isGeneratingStyles: true }));

      const [copyResult, stylesResult] = await Promise.allSettled([
        generateCopy(analysis, state.referenceText, state.coreSellingPoints),
        suggestVisualStyles(analysis)
      ]);

      const copy = copyResult.status === 'fulfilled' ? copyResult.value : [];
      const styles = stylesResult.status === 'fulfilled' ? stylesResult.value : [];
      const didCopyFail = copyResult.status === 'rejected' || copy.length === 0;
      const didStylesFail = stylesResult.status === 'rejected' || styles.length === 0;

      setCopyFailed(didCopyFail);
      setStylesFailed(didStylesFail);

      if (copyResult.status === 'rejected') {
        console.error('Copy generation failed:', copyResult.reason);
      }
      if (stylesResult.status === 'rejected') {
        console.error('Style suggestion generation failed:', stylesResult.reason);
      }

      if (copy.length === 0 && styles.length === 0) {
        const reason = copyResult.status === 'rejected'
          ? copyResult.reason
          : stylesResult.status === 'rejected'
            ? stylesResult.reason
            : null;
        const message = reason instanceof Error ? reason.message : '生成失败，请稍后重试。';
        setErrorMessage(message || '生成失败，请稍后重试。');
      } else if (copy.length === 0 || styles.length === 0) {
        setErrorMessage('部分内容生成失败，可重试一次获取完整结果。');
      }

      setState(prev => ({
        ...prev,
        copySuggestions: copy,
        styleSuggestions: styles,
        isGeneratingCopy: false,
        isGeneratingStyles: false
      }));
    } catch (error) {
      console.error('Processing failed:', error);
      const message = error instanceof Error ? error.message : '处理失败，请稍后重试。';
      setErrorMessage(message || '处理失败，请稍后重试。');
      setCopyFailed(true);
      setStylesFailed(true);
      setState(prev => ({ ...prev, isAnalyzing: false, isGeneratingCopy: false, isGeneratingStyles: false }));
    }
  };

  const handleClear = () => {
    setErrorMessage(null);
    setCopyFailed(false);
    setStylesFailed(false);
    setState({
      originalImage: null,
      referenceText: '',
      coreSellingPoints: '',
      analysis: null,
      copySuggestions: [],
      styleSuggestions: [],
      isAnalyzing: false,
      isGeneratingCopy: false,
      isGeneratingStyles: false,
    });
  };

  const handleRegenerateCopy = async (referenceText: string, coreSellingPoints: string) => {
    if (!state.analysis) return;
    setErrorMessage(null);
    setCopyFailed(false);
    setState(prev => ({ ...prev, isGeneratingCopy: true, copySuggestions: [] }));
    try {
      const copy = await generateCopy(state.analysis, referenceText, coreSellingPoints);
      setCopyFailed(copy.length === 0);
      setState(prev => ({ ...prev, copySuggestions: copy, isGeneratingCopy: false }));
    } catch (error) {
      console.error('Copy regeneration failed:', error);
      const message = error instanceof Error ? error.message : '文案重生成失败，请稍后重试。';
      setErrorMessage(message || '文案重生成失败，请稍后重试。');
      setCopyFailed(true);
      setState(prev => ({ ...prev, isGeneratingCopy: false }));
    }
  };

  return (
    <div className="min-h-screen font-sans bg-transparent">
      {/* Header */}
      <header className="glass-nav">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-red rounded-lg flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-white rounded-full"></div>
            </div>
            <span className="text-xl font-bold tracking-tight text-[#333]">小红书<span className="text-brand-red">爆款助手</span></span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#" className="text-sm font-medium text-gray-900 border-b-2 border-brand-red pb-1">智能画布</a>
          </nav>
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-pink-400 to-brand-red border-2 border-white shadow-sm"></div>
          </div>
        </div>
      </header>

      <main className="pt-8 pb-32 px-6 max-w-7xl mx-auto">
        {errorMessage ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="grid lg:grid-cols-12 gap-8">
          {/* Left Column: Upload & Live Preview */}
          <div className="lg:col-span-4 space-y-6">
            <section>
              <div className="flex items-center gap-2 mb-4">
                <span className="w-1 h-4 bg-brand-red rounded-full"></span>
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">产品上传</h2>
              </div>
              <ImageUpload
                onUpload={handleUpload}
                onClear={handleClear}
                disabled={state.isAnalyzing}
              />
            </section>

            {(state.isAnalyzing || state.isGeneratingCopy || state.isGeneratingStyles) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="glass-card p-8 flex flex-col items-center justify-center text-center gap-4 py-12"
              >
                <div className="relative">
                  <RefreshCw className="text-brand-red animate-spin" size={40} />
                  <Sparkles className="absolute -top-2 -right-2 text-yellow-400 animate-pulse" size={20} />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">AI 正在深度解析并生成...</p>
                  <p className="text-sm text-gray-500 mt-1">正在构思爆款文案与视觉场景方案</p>
                </div>
              </motion.div>
            )}
          </div>

          {/* Right Column: Generation Results */}
          <div className="lg:col-span-8 space-y-8">
            {/* Copywriting Section */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-1 h-4 bg-orange-400 rounded-full"></span>
                  <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">爆款文案建议</h2>
                </div>
                {state.isGeneratingCopy && (
                  <div className="flex items-center gap-2 text-brand-red font-bold text-xs animate-pulse">
                    <RefreshCw size={12} className="animate-spin" />
                    生成中...
                  </div>
                )}
              </div>

              {!state.originalImage ? (
                <div className="h-48 flex flex-col items-center justify-center text-center p-8 glass-card border-dashed border-2">
                  <div className="w-12 h-12 bg-white/60 rounded-xl shadow-sm flex items-center justify-center text-gray-300 mb-4">
                    <Zap size={24} />
                  </div>
                  <p className="text-sm text-gray-500 font-medium">
                    上传产品图后，将在此生成文案
                  </p>
                </div>
              ) : state.copySuggestions.length > 0 ? (
                <CopyGenerator 
                  suggestions={state.copySuggestions} 
                  onRegenerate={handleRegenerateCopy} 
                  isGenerating={state.isGeneratingCopy} 
                />
              ) : state.isAnalyzing || state.isGeneratingCopy ? (
                <div className="h-64 glass-card animate-pulse" />
              ) : copyFailed ? (
                <div className="h-48 flex flex-col items-center justify-center text-center p-8 glass-card border-dashed border-2 border-red-200">
                  <p className="text-sm text-red-600 font-medium">文案暂未生成成功</p>
                  <p className="text-xs text-gray-500 mt-2">请稍后重试，或先使用下方场景图功能。</p>
                </div>
              ) : (
                <div className="h-48 flex flex-col items-center justify-center text-center p-8 glass-card border-dashed border-2">
                  <p className="text-sm text-gray-500 font-medium">分析完成后将自动展示文案建议</p>
                </div>
              )}
            </section>

            {/* Visual Style Section */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-1 h-4 bg-purple-500 rounded-full"></span>
                  <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">视觉场景方案</h2>
                </div>
                {state.isGeneratingStyles && (
                  <div className="flex items-center gap-2 text-purple-600 font-bold text-xs animate-pulse">
                    <RefreshCw size={12} className="animate-spin" />
                    构思场景中...
                  </div>
                )}
              </div>

              {!state.originalImage ? (
                <div className="h-48 flex flex-col items-center justify-center text-center p-8 glass-card border-dashed border-2">
                  <div className="w-12 h-12 bg-white/60 rounded-xl shadow-sm flex items-center justify-center text-gray-300 mb-4">
                    <LayoutIcon size={24} />
                  </div>
                  <p className="text-sm text-gray-500 font-medium">
                    上传产品图后，将在此生成场景方案
                  </p>
                </div>
              ) : state.styleSuggestions.length > 0 ? (
                <StyleSuggestions suggestions={state.styleSuggestions} referenceImage={state.originalImage} />
              ) : state.isAnalyzing || state.isGeneratingStyles ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="aspect-[3/4] glass-card animate-pulse" />
                  <div className="aspect-[3/4] glass-card animate-pulse" />
                </div>
              ) : stylesFailed ? (
                <div className="h-48 flex flex-col items-center justify-center text-center p-8 glass-card border-dashed border-2 border-red-200">
                  <p className="text-sm text-red-600 font-medium">场景方案暂未生成成功</p>
                  <p className="text-xs text-gray-500 mt-2">请稍后重试，或重新上传图片触发分析。</p>
                </div>
              ) : (
                <div className="h-48 flex flex-col items-center justify-center text-center p-8 glass-card border-dashed border-2">
                  <p className="text-sm text-gray-500 font-medium">分析完成后将自动展示场景方案</p>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>

      {/* Footer Floating Action */}
      <footer className="fixed bottom-0 left-0 right-0 h-20 bg-white/20 backdrop-blur-2xl border-t border-white px-4 md:px-8 flex items-center justify-between z-40">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
          <div className="hidden md:flex items-center gap-4">
            <p className="text-xs text-gray-500">已为 <span className="font-bold text-gray-800">1,280</span> 位商家生成 <span className="font-bold text-gray-800">45,902</span> 个爆款图文</p>
          </div>
          <div className="flex gap-2 md:gap-3 w-full md:w-auto justify-between md:justify-end">
            <button 
              onClick={handleClear}
              className="px-4 md:px-8 py-3 bg-white text-gray-800 rounded-full font-bold text-sm shadow-sm border border-gray-200 hover:bg-gray-50 transition-colors flex-1 md:flex-none text-center"
            >
              重置草稿
            </button>
            <button 
              onClick={() => showToast('🚀 此功能正在紧张开发中，敬请期待！')}
              className="px-6 md:px-10 py-3 bg-brand-red text-white rounded-full font-bold text-sm shadow-lg shadow-red-200 hover:bg-brand-red/90 transition-all flex-1 md:flex-none text-center truncate"
            >
              一键合成爆款图文
            </button>
          </div>
        </div>
      </footer>

      {/* Global Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className="fixed bottom-28 left-1/2 z-50 px-6 py-3 bg-gray-900/90 text-white text-sm font-medium rounded-full shadow-2xl backdrop-blur-md whitespace-nowrap"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

