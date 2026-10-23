/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Wand2, Download, RefreshCcw, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { VisualStyleSuggestion } from '../types';
import { generateStyledImage } from '../services/geminiService';

interface StyleSuggestionsProps {
  suggestions: VisualStyleSuggestion[];
  referenceImage: string | null;
}

const STYLE_PRESETS = [
  { name: '奶油氛围', prompt: '奶油色调，柔和光影，高级感，ins风，温润奶油感' },
  { name: '复古胶片', prompt: '复古胶片颗粒感，电影感色彩，暖调，怀旧氛围' },
  { name: '极简高级', prompt: '纯净背景，极简构图，冷调高级感，光线纯净' },
  { name: '都市霓虹', prompt: '都市夜景霓虹，动态模糊，冷暖对比，电影氛围' },
  { name: '活力多巴胺', prompt: '高饱和度色彩，活力四射，趣味构图，明快心情' }
];

export default function StyleSuggestions({ suggestions, referenceImage }: StyleSuggestionsProps) {
  const [generations, setGenerations] = useState<Record<string, { url: string; loading: boolean; customPrompt: string }>>({});

  const handleApplyPreset = (id: string, presetPrompt: string) => {
    setGenerations(prev => ({
      ...prev,
      [id]: { ...prev[id], customPrompt: presetPrompt }
    }));
  };

  const handleGenerate = async (suggestion: VisualStyleSuggestion) => {
    const currentCustomPrompt = generations[suggestion.id]?.customPrompt || '';
    setGenerations(prev => ({
      ...prev,
      [suggestion.id]: { url: prev[suggestion.id]?.url || '', loading: true, customPrompt: currentCustomPrompt }
    }));

    try {
      const imageUrl = await generateStyledImage(suggestion.scenePrompt, referenceImage || undefined, currentCustomPrompt);
      setGenerations(prev => ({
        ...prev,
        [suggestion.id]: { url: imageUrl, loading: false, customPrompt: currentCustomPrompt }
      }));
    } catch (error) {
      console.error('Generation failed:', error);
      setGenerations(prev => ({
        ...prev,
        [suggestion.id]: { url: prev[suggestion.id]?.url || '', loading: false, customPrompt: currentCustomPrompt }
      }));
    }
  };

  const handleCustomPromptChange = (id: string, value: string) => {
    setGenerations(prev => ({
      ...prev,
      [id]: { ...prev[id], customPrompt: value }
    }));
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
      {suggestions.map((s, i) => (
        <motion.div
          key={s.id}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.1 }}
          className="glass-card overflow-hidden border-white/80 group flex flex-col"
        >
          <div className="aspect-[3/4] bg-white/20 relative overflow-hidden shrink-0">
            <AnimatePresence mode="wait">
              {generations[s.id]?.url ? (
                <motion.img
                  key="gen"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  src={generations[s.id].url}
                  alt={s.name}
                  className="w-full h-full object-cover"
                />
              ) : generations[s.id]?.loading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex flex-col items-center justify-center bg-white/40 backdrop-blur-md"
                >
                  <RefreshCcw className="text-brand-red animate-spin mb-4" size={32} />
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">AI 正在生成...</p>
                </motion.div>
              ) : (
                <div key="placeholder" className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(#ff244222_1px,transparent_1px)] [background-size:24px_24px]">
                  <div className="w-20 h-20 bg-white/40 rounded-full flex items-center justify-center">
                    <Wand2 className="text-brand-red/30" size={32} />
                  </div>
                </div>
              )}
            </AnimatePresence>

            <div className="absolute top-4 left-4">
              <span className="px-3 py-1 bg-white/60 text-gray-800 text-[9px] font-black uppercase tracking-widest rounded-full backdrop-blur-md border border-white/80">
                方案 {String(i + 1).padStart(2, '0')}
              </span>
            </div>

            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex items-end p-6 backdrop-blur-[2px]">
              {!generations[s.id]?.loading && (
                <div className="w-full space-y-3">
                  {generations[s.id]?.url && (
                    <a
                      href={generations[s.id].url}
                      download={`redtrend-${s.id}.png`}
                      className="w-full py-3 bg-white/20 hover:bg-white/40 text-white border border-white/40 rounded-full flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest backdrop-blur-md transition-all active:scale-95"
                    >
                      <Download size={16} />
                      保存本地
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="p-5 flex-1 flex flex-col">
            <h3 className="text-sm font-bold text-gray-800 mb-1.5 flex items-center gap-2">
               <span className="w-1.5 h-1.5 bg-brand-red rounded-full"></span>
               {s.name}
            </h3>
            <p className="text-[11px] text-gray-500 leading-relaxed font-medium mb-4">
              {s.description}
            </p>
            
            <div className="mt-auto space-y-4">
              {/* Style Presets */}
              <div className="flex flex-wrap gap-2">
                {STYLE_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => handleApplyPreset(s.id, preset.prompt)}
                    className="px-2 py-1 bg-white/40 hover:bg-white/60 border border-white/80 rounded-lg text-[9px] font-bold text-gray-500 transition-all active:scale-95 whitespace-nowrap shadow-sm"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="自定义微调关键（如：背景更亮）"
                  value={generations[s.id]?.customPrompt || ''}
                  onChange={(e) => handleCustomPromptChange(s.id, e.target.value)}
                  className="w-full px-4 py-2.5 bg-white/30 border border-white/60 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-brand-red/50 transition-all placeholder:text-gray-300"
                />
              </div>
              <button
                onClick={() => handleGenerate(s)}
                disabled={generations[s.id]?.loading}
                className="w-full py-3 bg-brand-red hover:bg-brand-red/90 text-white rounded-xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest shadow-lg shadow-red-500/20 transition-all active:scale-95 disabled:opacity-50"
              >
                {generations[s.id]?.loading ? <RefreshCcw className="animate-spin" size={14} /> : <Wand2 size={14} />}
                {generations[s.id]?.url ? '应用修改/重生成' : '立即出图'}
              </button>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
