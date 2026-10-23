import React from 'react';
import { Copy, Hash, Check } from 'lucide-react';
import { PlatformData, TitleVariant } from '../types';

interface PlatformCardProps {
  data: PlatformData;
}

type PlatformConfig = {
  label: string;
  iconPath: string;
  extraPath?: string;
  colors: {
    gradient: string;
    text: string;
    subText: string;
    badge: string;
    accent: string;
  };
};

const CONFIG: Record<PlatformData['platformName'], PlatformConfig> = {
  Douyin: {
    label: '抖音',
    iconPath: "M19.5 7.5v-3h-3v3h-3v3h3v3h3v-3h3v-3h-3zM5.5 13.5c-2.2 0-4-1.8-4-4s1.8-4 4-4 4 1.8 4 4v2h-2v-2c0-1.1-.9-2-2-2s-2 .9-2 2 .9 2 2 2h2v4.5c0 2.5-2 4.5-4.5 4.5S1 16.5 1 14s2-4.5 4.5-4.5h.5v2h-.5c-1.4 0-2.5 1.1-2.5 2.5s1.1 2.5 2.5 2.5 2.5-1.1 2.5-2.5V8.5h4v5c0 2.2-1.8 4-4 4z",
    colors: {
      gradient: 'from-gray-900 to-black',
      text: 'text-slate-800',
      subText: 'text-slate-600',
      badge: 'bg-slate-100 text-slate-700 border-slate-300',
      accent: 'bg-slate-200', 
    },
  },
  Xiaohongshu: {
    label: '小红书',
    iconPath: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z",
    extraPath: "M19.05 4.91A9.957 9.957 0 0012 2C6.48 2 2 6.48 2 12c0 2.65.91 5.09 2.58 7.02L19.05 4.91zM4.95 19.09C6.91 20.76 9.35 21.67 12 21.67c5.52 0 10-4.48 10-10 0-2.65-.91-5.09-2.58-7.02L4.95 19.09z",
    colors: {
      gradient: 'from-red-500 to-red-600',
      text: 'text-slate-800',
      subText: 'text-slate-600',
      badge: 'bg-red-900/30 text-red-300 border-red-800',
      accent: 'bg-red-500',
    },
  },
  VideoAccount: {
    label: '视频号',
    iconPath: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z",
    colors: {
      gradient: 'from-green-500 to-green-600',
      text: 'text-slate-800',
      subText: 'text-slate-600',
      badge: 'bg-green-900/30 text-green-300 border-green-800',
      accent: 'bg-green-600',
    },
  }
};

interface TitleRowProps {
  title: TitleVariant;
  styleColor: string;
}

const TitleRow: React.FC<TitleRowProps> = ({ title, styleColor }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(title.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = title.content;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch (err) {
          console.error('复制失败:', err);
        }
        document.body.removeChild(textArea);
      }
    } catch (err) {
      console.error('复制失败:', err);
      // 如果复制失败，尝试使用fallback方法
      try {
        const textArea = document.createElement('textarea');
        textArea.value = title.content;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        document.body.removeChild(textArea);
      } catch (fallbackErr) {
        console.error('Fallback复制也失败:', fallbackErr);
      }
    }
  };

  return (
    <div className="group relative p-4 rounded-2xl bg-slate-100/40 hover:bg-slate-100/70 transition-all duration-300 border border-slate-300 hover:border-slate-300 shadow-sm hover:shadow-md">
      <div className="flex justify-between items-start gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${styleColor}`}></span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
              {title.style}
            </span>
          </div>
          <p className="text-[15px] font-medium leading-relaxed text-slate-800 tracking-tight">
            {title.content}
          </p>
        </div>
        <button
          onClick={handleCopy}
          className="p-2 rounded-xl text-slate-600 hover:text-slate-800 hover:bg-slate-200/50 transition-all opacity-0 group-hover:opacity-100 transform scale-90 group-hover:scale-100"
          title="复制标题"
        >
          {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
        </button>
      </div>
    </div>
  );
};

export const PlatformCard: React.FC<PlatformCardProps> = ({ data }) => {
  const config = CONFIG[data.platformName];
  
  const [tagsCopied, setTagsCopied] = React.useState(false);

  const copyTags = async () => {
    // 规范化标签：确保每个标签都有 '#' 前缀，且 '#' 和文字之间没有空格
    const normalizedTags = data.tags.map(tag => {
      // 先移除所有空格（包括 '#' 前后的空格）
      let cleanTag = tag.replace(/\s+/g, '').trim();
      // 移除所有现有的 '#' 符号
      cleanTag = cleanTag.replace(/#/g, '');
      // 如果标签为空，跳过
      if (!cleanTag) {
        return '';
      }
      // 确保以 '#' 开头，且 '#' 和文字之间没有空格
      return `#${cleanTag}`;
    }).filter(tag => tag !== ''); // 过滤掉空标签
    const tagsString = normalizedTags.join(' ');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(tagsString);
        setTagsCopied(true);
        setTimeout(() => setTagsCopied(false), 2000);
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = tagsString;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
          setTagsCopied(true);
          setTimeout(() => setTagsCopied(false), 2000);
        } catch (err) {
          console.error('复制失败:', err);
        }
        document.body.removeChild(textArea);
      }
    } catch (err) {
      console.error('复制失败:', err);
      // 如果复制失败，尝试使用fallback方法
      try {
        const textArea = document.createElement('textarea');
        textArea.value = tagsString;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        setTagsCopied(true);
        setTimeout(() => setTagsCopied(false), 2000);
        document.body.removeChild(textArea);
      } catch (fallbackErr) {
        console.error('Fallback复制也失败:', fallbackErr);
      }
    }
  };

  return (
    <div className="h-full flex flex-col rounded-3xl bg-white/40 backdrop-blur-2xl border border-slate-200 shadow-[0_8px_32px_rgba(0,0,0,0.2)] hover:shadow-[0_12px_48px_rgba(0,0,0,0.3)] transition-all duration-500 overflow-hidden relative group">
      <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${config.colors.gradient} opacity-10 blur-[60px] rounded-full pointer-events-none transform translate-x-10 -translate-y-10 group-hover:opacity-20 transition-opacity`}></div>

      <div className="px-6 pt-6 pb-2 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${config.colors.gradient} flex items-center justify-center text-white shadow-lg shadow-black/20`}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d={config.iconPath} />
              {config.extraPath && <path d={config.extraPath} />}
              {!config.iconPath && <path d="M0 0h24v24H0z" fill="none" />}
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-lg text-slate-800 leading-tight">{config.label}</h3>
          </div>
        </div>
      </div>

      <div className="p-6 flex-1 flex flex-col gap-6 relative z-10">
        <div className="space-y-3">
          {data.titles.map((title, idx) => (
            <TitleRow key={idx} title={title} styleColor={config.colors.accent} />
          ))}
        </div>

        <div className="mt-auto pt-5 border-t border-dashed border-slate-300">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
              推荐标签
            </span>
            <button 
              onClick={copyTags}
              className={`text-[10px] flex items-center gap-1 font-semibold hover:opacity-80 transition-opacity px-2 py-1 rounded-lg ${config.colors.badge}`}
            >
              {tagsCopied ? '已复制' : '复制全部'}
              {!tagsCopied && <Copy size={10} />}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.tags.map((tag, idx) => (
              <span 
                key={idx} 
                className={`text-[11px] px-3 py-1.5 rounded-xl font-medium border flex items-center gap-1 transition-colors ${config.colors.badge}`}
              >
                <Hash size={10} className="opacity-50" />
                {tag.replace('#', '')}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

