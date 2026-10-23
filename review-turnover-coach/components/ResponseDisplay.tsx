import React, { useState } from 'react';
import { Copy, Check, Quote, Lightbulb, RefreshCw, AlertCircle } from 'lucide-react';
import { GenerationResponse, Language } from '../types';
import { useTranslation } from '../i18n';

interface ResponseDisplayProps {
  lang: Language;
  response: GenerationResponse | null;
  error: string | null;
  onRegenerate: () => void;
  isLoading: boolean;
}

const ResponseDisplay: React.FC<ResponseDisplayProps> = ({ lang, response, error, onRegenerate, isLoading }) => {
  const t = useTranslation(lang);
  const [copied, setCopied] = useState(false);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-100 rounded-3xl p-8 text-center space-y-4 animate-fade-in">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-red-100 text-red-600 rounded-full">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-red-900 font-bold">{t.genFailed}</h3>
          <p className="text-red-700/70 text-sm mt-1">{error}</p>
        </div>
        <button
          onClick={onRegenerate}
          disabled={isLoading}
          className="inline-flex items-center gap-2 bg-red-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-red-700 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          {t.retry}
        </button>
      </div>
    );
  }

  if (!response && !isLoading) return null;

  if (isLoading && !response) {
    return (
      <div className="bg-white rounded-[2rem] border border-slate-100 p-12 flex flex-col items-center justify-center space-y-6 animate-pulse">
        <div className="w-16 h-16 bg-slate-100 rounded-full"></div>
        <div className="space-y-3 w-full max-w-sm">
          <div className="h-4 bg-slate-100 rounded-full w-full"></div>
          <div className="h-4 bg-slate-100 rounded-full w-5/6 mx-auto"></div>
        </div>
      </div>
    );
  }

  const handleCopy = () => {
    if (response) {
      navigator.clipboard.writeText(response.reply);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-brand-100 overflow-hidden relative">
        <div className="px-8 pt-8 pb-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="bg-brand-50 text-brand-600 p-2 rounded-lg">
              <Quote className="w-4 h-4" />
            </span>
            <h3 className="text-slate-900 font-bold">{t.suggestedReply}</h3>
          </div>
          <button
            onClick={handleCopy}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all ${copied ? 'bg-green-500 text-white' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? t.copied : t.copyBtn}
          </button>
        </div>

        <div className={`px-8 py-6 transition-all duration-300 ${isLoading ? 'opacity-40 blur-[1px]' : 'opacity-100'}`}>
          <div className="text-slate-800 text-lg leading-relaxed whitespace-pre-wrap font-medium">
            {response?.reply}
          </div>
        </div>

        <div className="bg-slate-50/50 px-8 py-4 border-t border-slate-100 flex justify-between items-center">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            AI READY
          </span>
          <button onClick={onRegenerate} disabled={isLoading} className="text-slate-400 hover:text-brand-600 transition-colors text-xs flex items-center gap-1.5">
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
            {t.regenerate}
          </button>
        </div>
      </div>

      <div className={`bg-amber-50/50 rounded-2xl p-6 border border-amber-100/50 transition-all duration-300 ${isLoading ? 'opacity-40' : 'opacity-100'}`}>
        <div className="flex gap-4">
          <div className="shrink-0 w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center text-amber-600">
            <Lightbulb className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-amber-900 font-bold text-sm mb-1">{t.analysisTitle}</h4>
            <p className="text-amber-800/80 text-sm leading-relaxed italic">&quot;{response?.analysis}&quot;</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResponseDisplay;
