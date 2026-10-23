/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Copy, Heart, BookOpen, Coffee, Sparkles, Settings2, Zap, Layout as LayoutIcon, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';
import { CopySuggestion } from '../types';

interface CopyGeneratorProps {
  suggestions: CopySuggestion[];
  onRegenerate?: (referenceText: string, coreSellingPoints: string) => void;
  isGenerating?: boolean;
}

export default function CopyGenerator({ suggestions, onRegenerate, isGenerating }: CopyGeneratorProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isOptionsExpanded, setIsOptionsExpanded] = useState(false);
  const [coreSellingPoints, setCoreSellingPoints] = useState('');
  const [referenceText, setReferenceText] = useState('');

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getVibeIcon = (vibe: string) => {
    switch (vibe) {
      case 'cute': return <Heart className="text-pink-500" size={18} />;
      case 'professional': return <BookOpen className="text-blue-500" size={18} />;
      case 'lifestyle': return <Coffee className="text-amber-500" size={18} />;
      default: return <Sparkles className="text-purple-500" size={18} />;
    }
  };

  const vibeLabels: Record<string, string> = {
    cute: '情感/心动',
    professional: '专业/科谱',
    lifestyle: '生活/随笔',
    minimalist: '极简/高级'
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex gap-2 p-1 bg-white/40 backdrop-blur-md rounded-2xl w-fit border border-white/60 overflow-x-auto">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => setActiveIndex(i)}
              className={`
                px-6 py-2 rounded-xl text-xs font-bold transition-all duration-300 flex-shrink-0
                ${activeIndex === i ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}
              `}
            >
              {vibeLabels[s.vibe] || s.vibe}
            </button>
          ))}
        </div>

        <button
          onClick={() => setIsOptionsExpanded(!isOptionsExpanded)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-300 border ${isOptionsExpanded ? 'bg-brand-red text-white border-brand-red shadow-sm' : 'bg-white/40 text-gray-700 border-white/60 hover:bg-white/60'}`}
        >
          <Settings2 size={16} /> 自定义优化
        </button>
      </div>

      <AnimatePresence>
        {isOptionsExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white/40 backdrop-blur-xl border border-brand-red/20 rounded-3xl p-6 shadow-sm mb-2 space-y-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-brand-red/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
              
              <div className="flex flex-col gap-2 relative z-10">
                <span className="text-xs font-bold text-gray-500">强化卖点</span>
                <textarea
                  value={coreSellingPoints}
                  onChange={(e) => setCoreSellingPoints(e.target.value)}
                  disabled={isGenerating}
                  placeholder="请输入想要强化的产品优势或痛点..."
                  className="w-full h-20 p-3 text-sm bg-white/60 rounded-2xl border border-white/80 resize-none focus:outline-none focus:ring-2 focus:ring-brand-red disabled:opacity-50 placeholder-gray-400"
                />
              </div>
              <div className="flex flex-col gap-2 relative z-10">
                <span className="text-xs font-bold text-gray-500">仿写参考</span>
                <textarea
                  value={referenceText}
                  onChange={(e) => setReferenceText(e.target.value)}
                  disabled={isGenerating}
                  placeholder="粘贴喜欢的爆款笔记作为仿写参考..."
                  className="w-full h-20 p-3 text-sm bg-white/60 rounded-2xl border border-white/80 resize-none focus:outline-none focus:ring-2 focus:ring-brand-red disabled:opacity-50 placeholder-gray-400"
                />
              </div>
              <div className="flex justify-end pt-2 relative z-10">
                <button
                  onClick={() => {
                    if (onRegenerate) {
                      onRegenerate(referenceText, coreSellingPoints);
                      setIsOptionsExpanded(false);
                    }
                  }}
                  disabled={isGenerating || (!referenceText && !coreSellingPoints)}
                  className="text-xs px-5 py-2.5 bg-brand-red text-white hover:bg-brand-red/90 rounded-full font-bold flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGenerating ? <RefreshCw size={14} className="animate-spin text-white" /> : <Zap size={14} className="text-yellow-300" />}
                  重新生成优化版本
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeIndex}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="glass-card p-6 border-white/80 min-h-[300px] flex flex-col"
        >
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-white/60 rounded-lg">
                {getVibeIcon(suggestions[activeIndex].vibe)}
              </div>
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">高转化文案建议</span>
            </div>
            <button
              onClick={() => {
                const titleText = suggestions[activeIndex].titles ? suggestions[activeIndex].titles[0] : (suggestions[activeIndex] as any).title;
                handleCopy(`${titleText}\n\n${suggestions[activeIndex].content}`);
              }}
              className="flex items-center gap-2 px-6 py-2 bg-brand-red text-white rounded-full hover:bg-brand-red/90 transition-all text-xs font-bold shadow-lg shadow-red-200"
            >
              {copied ? '已复制 🎉' : <><Copy size={14} /> 复制全文</>}
            </button>
          </div>

          <div className="space-y-4 flex-1">
            <div className="flex flex-col gap-3">
              <span className="text-xs font-bold text-gray-500 uppercase">爆款标题选填 (任选一):</span>
              <ul className="space-y-2">
                {suggestions[activeIndex].titles?.map((title, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-brand-red font-black text-sm mt-0.5">{idx + 1}.</span>
                    <h3 className="text-md font-bold text-gray-900 leading-tight">
                      {title}
                    </h3>
                  </li>
                )) || (
                  // Fallback in case of old data structure where title was a string
                  <li className="flex items-start gap-2">
                    <span className="text-brand-red font-black text-sm">[</span>
                    <h3 className="text-md font-bold text-gray-900 leading-tight">
                      {(suggestions[activeIndex] as any).title}
                    </h3>
                    <span className="text-brand-red font-black text-sm">]</span>
                  </li>
                )}
              </ul>
            </div>

            <div className="text-sm font-medium text-gray-700 leading-relaxed whitespace-pre-wrap p-4 bg-white/20 rounded-2xl border border-white/40 mt-4">
              {suggestions[activeIndex].content}
            </div>

            <div className="flex flex-wrap gap-3 pt-2 px-1">
              {suggestions[activeIndex].tags.map((tag, i) => (
                <span key={i} className="text-blue-500 text-xs font-bold hover:underline cursor-pointer">
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
