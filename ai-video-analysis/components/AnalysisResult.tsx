
import React, { useState } from 'react';
import { VideoAnalysis } from '../types';
import { Film, Palette, FileText, Video, Copy, Check, TrendingUp, Lightbulb, Zap, Wand2, Loader2 } from 'lucide-react';
import { rewriteScriptAction } from '../services/geminiService';

interface AnalysisResultProps {
  analysis: VideoAnalysis;
}

const AnalysisResult: React.FC<AnalysisResultProps> = ({ analysis }) => {
  const [copied, setCopied] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [rewrittenScript, setRewrittenScript] = useState<string | null>(null);
  const [copiedRewrite, setCopiedRewrite] = useState(false);

  const handleCopyScript = (text: string, type: 'original' | 'rewrite') => {
    navigator.clipboard.writeText(text);
    if (type === 'original') {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      setCopiedRewrite(true);
      setTimeout(() => setCopiedRewrite(false), 2000);
    }
  };

  const handleRewrite = async () => {
    setRewriting(true);
    try {
      const result = await rewriteScriptAction(
        analysis.originalScript,
        analysis.marketingAdvice,
        analysis.isRewrite ? "当前设定的主题方向" : undefined
      );
      setRewrittenScript(result);
    } catch (err) {
      console.error(err);
    } finally {
      setRewriting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Script Section */}
      <div className="bg-white border border-slate-200 p-8 shadow-sm rounded-xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
              <FileText size={20} className="text-slate-600" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 tracking-tight uppercase">原片完整文案</h2>
              <p className="text-xs text-slate-600 font-bold tracking-widest uppercase">Original Script Analysis</p>
            </div>
          </div>
          <button 
            onClick={() => handleCopyScript(analysis.originalScript, 'original')}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 rounded-lg text-xs font-bold transition-all text-white shadow-md"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "已复制" : "复制原稿"}
          </button>
        </div>
        <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
          <p className="text-slate-800 leading-relaxed whitespace-pre-line text-base font-medium">
            {analysis.originalScript || "解析中..."}
          </p>
        </div>
      </div>

      {/* Marketing & Rewrite Section */}
      <div className="bg-slate-900 text-white border border-slate-800 p-8 relative overflow-hidden rounded-xl">
        <div className="absolute top-0 right-0 p-10 opacity-10 pointer-events-none">
          <TrendingUp size={120} />
        </div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center text-white">
              <Zap size={20} />
            </div>
            <div>
              <h2 className="text-lg font-extrabold tracking-tight uppercase">运营与改写建议</h2>
              <p className="text-xs text-slate-400 font-bold tracking-widest uppercase">Marketing Optimization</p>
            </div>
          </div>
          
          <button 
            onClick={handleRewrite}
            disabled={rewriting}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg text-sm font-bold transition-all text-white shadow-lg hover:scale-105 active:scale-95"
          >
            {rewriting ? <Loader2 size={18} className="animate-spin" /> : <Wand2 size={18} />}
            {rewriting ? "生成中..." : "一键同架构改写"}
          </button>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
            <h3 className="text-xs text-emerald-400 font-black uppercase tracking-widest mb-3">核心优化逻辑</h3>
            <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-line font-medium">
              {analysis.marketingAdvice}
            </p>
          </div>

          {rewrittenScript && (
            <div className="bg-emerald-900/30 p-6 rounded-lg border border-emerald-500/30 animate-slide-up">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs text-emerald-400 font-black uppercase tracking-widest">改写方案 (字数偏差 ±20%)</h3>
                <button 
                  onClick={() => handleCopyScript(rewrittenScript, 'rewrite')}
                  className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-emerald-400"
                >
                  {copiedRewrite ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
              <p className="text-white text-base leading-relaxed whitespace-pre-line font-bold">
                {rewrittenScript}
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center gap-2 text-xs text-slate-500 font-bold tracking-widest uppercase">
          <Lightbulb size={12} className="text-emerald-500" />
          基于爆款算法实时生成的商业决策策略
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Style Analysis */}
        <div className="bg-white border border-slate-200 p-8 rounded-xl shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
              <Palette size={20} className="text-slate-600" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 tracking-tight uppercase">视觉美学解析</h2>
              <p className="text-xs text-slate-600 font-bold tracking-widest uppercase">Visual Aesthetic</p>
            </div>
          </div>
          <p className="text-slate-700 text-sm leading-relaxed mb-8 font-medium">
            {analysis.visualStyleAnalysis}
          </p>
          
          <div className="space-y-3">
            <h3 className="text-xs uppercase text-slate-900 font-extrabold tracking-widest">Color Palette</h3>
            <div className="flex gap-3">
              {analysis.colorPalette?.map((color, idx) => (
                <div key={idx} className="group relative">
                  <div 
                    className="w-12 h-12 rounded-lg shadow-sm border border-slate-300 transition-transform hover:scale-110" 
                    style={{ backgroundColor: color }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Cinematography */}
        <div className="bg-white border border-slate-200 p-8 rounded-xl shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
              <Video size={20} className="text-slate-600" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 tracking-tight uppercase">剪辑逻辑与运镜</h2>
              <p className="text-xs text-slate-600 font-bold tracking-widest uppercase">Technical Directing</p>
            </div>
          </div>
          <p className="text-slate-700 text-sm leading-relaxed font-medium">
            {analysis.cinematographyTechniques}
          </p>
          <div className="mt-8 p-5 bg-emerald-50 rounded-lg border border-emerald-200">
            <h3 className="text-emerald-700 text-xs font-black uppercase tracking-widest mb-2">Director's Insight</h3>
            <p className="text-sm text-slate-800 font-semibold italic">
              "{analysis.directorAdvice}"
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalysisResult;
