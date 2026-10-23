import React, { useState } from 'react';
import { Star, Copy, Check } from 'lucide-react';

export const FooterCard: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const wechatId = "Lao-liumang0211";
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(wechatId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) { console.error('Failed to copy', err); }
  };
  return (
    <div className="w-full max-w-5xl mx-auto mt-12">
      <div className="relative overflow-hidden rounded-[2rem] bg-white border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 transition-transform hover:scale-[1.01] duration-300">
        <div className="flex items-center gap-5 w-full md:w-auto">
          <div className="w-16 h-16 rounded-full bg-[#A855F7] flex items-center justify-center shadow-lg shadow-purple-500/20 flex-shrink-0">
            <Star className="text-white fill-white" size={28} />
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-bold text-slate-900 tracking-tight">榴芒AI</h3>
              <span className="px-2.5 py-1 rounded-full bg-pink-100 text-pink-600 text-[11px] font-bold tracking-wide">资深专家</span>
            </div>
            <p className="text-slate-500 text-sm font-medium">需要更深度的 1对1 定制方案?</p>
          </div>
        </div>
        <div className="flex items-center bg-slate-50 rounded-2xl p-2 w-full md:w-auto min-w-[300px] border border-slate-100">
          <div className="flex flex-col pl-4 pr-4 flex-grow">
            <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase mb-0.5">WECHAT ID</span>
            <span className="text-sm font-bold text-[#4F46E5] font-mono tracking-wide select-all">{wechatId}</span>
          </div>
          <button onClick={handleCopy} className="flex items-center gap-2 bg-[#4F46E5] hover:bg-[#4338ca] text-white px-5 py-3 rounded-xl font-semibold text-sm transition-all active:scale-95 shadow-lg shadow-indigo-500/20">
            {copied ? <><Check size={16} /><span>已复制</span></> : <><Copy size={16} /><span>复制微信</span></>}
          </button>
        </div>
      </div>
    </div>
  );
};
