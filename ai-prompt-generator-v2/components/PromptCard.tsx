import React, { useState } from 'react';
import { Copy, Check, Terminal, Palette, FileJson, Video, Clapperboard, Film } from 'lucide-react';

interface PromptCardProps {
  title: string;
  content: string;
  type: 'mj' | 'jimeng' | 'json' | 'veo' | 'hailuo' | 'jimeng_video';
  className?: string;
}

export const PromptCard: React.FC<PromptCardProps> = ({ title, content, type, className = '' }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const getStyles = () => {
    switch (type) {
      case 'mj':
        return { cardBorder: 'border-indigo-100/50', headerBg: 'bg-indigo-50/50 border-indigo-100/50', iconBg: 'bg-indigo-100', iconColor: 'text-indigo-600', textColor: 'text-indigo-900', gradient: 'bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 opacity-60' };
      case 'jimeng':
        return { cardBorder: 'border-emerald-100/50', headerBg: 'bg-emerald-50/50 border-emerald-100/50', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', textColor: 'text-emerald-900', gradient: 'bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-300 opacity-60' };
      case 'json':
        return { cardBorder: 'border-fuchsia-100/50', headerBg: 'bg-fuchsia-50/50 border-fuchsia-100/50', iconBg: 'bg-fuchsia-100', iconColor: 'text-fuchsia-600', textColor: 'text-fuchsia-900', gradient: 'bg-gradient-to-r from-fuchsia-300 via-purple-300 to-indigo-300 opacity-60' };
      case 'veo':
        return { cardBorder: 'border-blue-100/50', headerBg: 'bg-blue-50/50 border-blue-100/50', iconBg: 'bg-blue-100', iconColor: 'text-blue-600', textColor: 'text-blue-900', gradient: 'bg-gradient-to-r from-blue-300 via-cyan-300 to-sky-300 opacity-60' };
      case 'hailuo':
        return { cardBorder: 'border-rose-100/50', headerBg: 'bg-rose-50/50 border-rose-100/50', iconBg: 'bg-rose-100', iconColor: 'text-rose-600', textColor: 'text-rose-900', gradient: 'bg-gradient-to-r from-rose-300 via-pink-300 to-red-300 opacity-60' };
      case 'jimeng_video':
        return { cardBorder: 'border-orange-100/50', headerBg: 'bg-orange-50/50 border-orange-100/50', iconBg: 'bg-orange-100', iconColor: 'text-orange-600', textColor: 'text-orange-900', gradient: 'bg-gradient-to-r from-orange-300 via-amber-300 to-yellow-300 opacity-60' };
      default:
        return { cardBorder: 'border-slate-100/50', headerBg: 'bg-slate-50/50 border-slate-100/50', iconBg: 'bg-slate-100', iconColor: 'text-slate-600', textColor: 'text-slate-900', gradient: 'bg-gradient-to-r from-slate-300 to-gray-300 opacity-60' };
    }
  };

  const styles = getStyles();

  return (
    <div className={`relative overflow-hidden rounded-[2rem] border bg-white/60 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] flex flex-col ${styles.cardBorder} ${className}`}>
      <div className={`flex items-center justify-between px-6 py-4 border-b ${styles.headerBg}`}>
        <div className="flex items-center gap-2.5">
          <div className={`p-1.5 rounded-lg ${styles.iconBg}`}>
            {type === 'mj' && <Terminal size={16} className={styles.iconColor} />}
            {type === 'jimeng' && <Palette size={16} className={styles.iconColor} />}
            {type === 'json' && <FileJson size={16} className={styles.iconColor} />}
            {type === 'veo' && <Video size={16} className={styles.iconColor} />}
            {type === 'hailuo' && <Clapperboard size={16} className={styles.iconColor} />}
            {type === 'jimeng_video' && <Film size={16} className={styles.iconColor} />}
          </div>
          <h3 className={`font-semibold tracking-tight text-sm ${styles.textColor}`}>{title}</h3>
        </div>
        <button onClick={handleCopy} className="group flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-white hover:text-slate-900 hover:shadow-sm border border-transparent hover:border-slate-100" title="复制到剪贴板">
          {copied ? <><Check size={14} className="text-green-500" /><span>已复制</span></> : <><Copy size={14} className="text-slate-400 group-hover:text-slate-600" /><span>复制</span></>}
        </button>
      </div>
      <div className="p-6 flex-grow">
        <div className="relative font-mono text-[14px] md:text-[15px] leading-relaxed text-slate-700 break-words whitespace-pre-wrap">{content}</div>
      </div>
      <div className={`h-1 w-full ${styles.gradient}`} />
    </div>
  );
};
