import React, { useState, useCallback, useMemo } from 'react';
import { DayData } from '../types';
import { MarketingStrategyResult } from '../types';
import { generateMarketingStrategy } from '../services/geminiService';
import type { PlatformService } from '../../../types';

interface DayDetailModalProps {
  day: DayData;
  monthId: number;
  onClose: () => void;
  platform: PlatformService;
  cost: number;
}

const AIStrategyView: React.FC<{ data: MarketingStrategyResult }> = React.memo(({ data }) => (
  <div className="space-y-8">
    <div className="grid md:grid-cols-2 gap-5 pdf-card">
      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
        <h4 className="text-[10px] font-black text-indigo-500 mb-4 uppercase tracking-widest flex items-center gap-2">
          <span className="w-4 h-0.5 bg-indigo-500"></span> 核心痛点洞察
        </h4>
        <ul className="text-sm text-slate-600 space-y-3 font-medium">
          {data.painPoints.map((p, i) => (
            <li key={i} className="flex gap-3 items-start">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-200 shrink-0"></span>
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
        <h4 className="text-[10px] font-black text-emerald-500 mb-4 uppercase tracking-widest flex items-center gap-2">
          <span className="w-4 h-0.5 bg-emerald-500"></span> 差异化卖点建议
        </h4>
        <ul className="text-sm text-slate-600 space-y-3 font-medium">
          {data.sellingPoints.map((s, i) => (
            <li key={i} className="flex gap-3 items-start">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-200 shrink-0"></span>
              {s}
            </li>
          ))}
        </ul>
      </div>
    </div>
    <div className="bg-slate-900 rounded-[2rem] p-8 text-white pdf-card">
      <h4 className="text-sm font-black text-amber-400 mb-6 flex items-center gap-2 uppercase tracking-widest">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        电商关键词搜索矩阵
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { title: '流量词 (Traffic)', items: data.keywords.traffic, color: 'from-amber-400/20 to-amber-400/5', border: 'border-amber-400/20' },
          { title: '种草词 (Seedling)', items: data.keywords.content, color: 'from-emerald-400/20 to-emerald-400/5', border: 'border-emerald-400/20' },
          { title: '长尾词 (Long-tail)', items: data.keywords.longTail, color: 'from-blue-400/20 to-blue-400/5', border: 'border-blue-400/20' }
        ].map((kb, idx) => (
          <div key={idx} className={`bg-gradient-to-br ${kb.color} rounded-2xl p-4 border ${kb.border}`}>
            <p className="text-[10px] font-black mb-3 opacity-60 tracking-wider uppercase">{kb.title}</p>
            <div className="flex flex-wrap gap-2">
              {kb.items.map((item, i) => (
                <span key={i} className="text-xs bg-white/10 px-2 py-1 rounded-md font-medium">{item}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
    <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm pdf-card">
      <h4 className="text-[10px] font-black text-rose-500 mb-4 uppercase tracking-widest flex items-center gap-2">
        <span className="w-4 h-0.5 bg-rose-500"></span> 商家落地执行清单
      </h4>
      <div className="space-y-4">
        {data.operationsChecklist.map((item, i) => (
          <div key={i} className="flex gap-4 items-center p-3 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="w-6 h-6 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center text-xs font-black text-slate-400">
              {i + 1}
            </div>
            <p className="text-sm font-bold text-slate-700">{item}</p>
          </div>
        ))}
      </div>
    </div>
    <div className="bg-gradient-to-br from-indigo-50 to-white rounded-[2rem] p-8 border border-indigo-100 pdf-card">
      <h4 className="text-md font-black text-indigo-900 mb-6 flex items-center gap-2">
        <svg className="w-6 h-6 text-indigo-500" fill="currentColor" viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
        爆单短视频/直播脚本大纲
      </h4>
      <div className="space-y-6">
        {[
          { label: '黄金开头 (Hook)', content: data.videoScript.hook },
          { label: '核心内容 (Body)', content: data.videoScript.body },
          { label: '行动转化 (CTA)', content: data.videoScript.cta, isCta: true }
        ].map((step, idx) => (
          <div key={idx} className="relative pl-6 border-l-2 border-indigo-200">
            <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-white border-4 border-indigo-400"></div>
            <span className={`text-[10px] font-black ${step.isCta ? 'text-amber-600' : 'text-indigo-500'} uppercase mb-2 block tracking-widest`}>{step.label}</span>
            <p className={`${step.isCta ? 'text-slate-900 font-black' : 'text-slate-700 font-medium'} leading-relaxed`}>{step.content}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
));

const DayDetailModal: React.FC<DayDetailModalProps> = ({ day, monthId, onClose, platform, cost }) => {
  const [loading, setLoading] = useState(false);
  const [aiData, setAiData] = useState<MarketingStrategyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!day.recommendation || loading) return;
    await platform.refreshCredits?.();
    if (cost > 0 && !platform.checkBalance(cost)) return;
    setLoading(true);
    setError(null);
    try {
      const data = await generateMarketingStrategy(day.theme, day.recommendation.name, day.recommendation.audience);
      await platform.refreshCredits?.();
      setAiData(data);
    } catch (err) {
      console.error('Failed to generate strategy:', err);
      const message = err instanceof Error ? err.message : '生成失败，请稍后重试。';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [day, loading, platform, cost]);

  const handleDownloadPDF = useCallback(() => {
    alert('PDF 导出功能敬请期待，请先复制页面内容使用。');
  }, []);

  const recommendationSection = useMemo(() => (
    <section className="bg-amber-50 rounded-3xl p-6 border border-amber-100 relative overflow-hidden pdf-card">
      <div className="absolute top-0 right-0 p-4 opacity-10 no-print">
        <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
      </div>
      <h3 className="text-xs font-black text-amber-800 uppercase tracking-widest mb-6 flex items-center gap-2">
        <span className="w-1 h-3 bg-amber-400 rounded-full"></span>
        核心选品推荐与数据
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {[
          { label: '产品名称', value: (day.recommendation?.brand ? `${day.recommendation.brand} ` : '') + (day.recommendation?.name || '—') },
          { label: '预估爆发', value: `🔥 ${day.recommendation?.volume || '—'}`, highlight: true },
          { label: '建议定价', value: day.recommendation?.price || '—', highlight: true },
          { label: '目标画像', value: day.recommendation?.audience || '—', isSmall: true }
        ].map((item, i) => (
          <div key={i} className="space-y-1">
            <p className="text-[10px] font-bold text-amber-600/60 uppercase">{item.label}</p>
            <p className={`font-black text-slate-800 ${item.highlight ? 'text-lg' : ''} ${item.isSmall ? 'text-xs leading-relaxed' : ''}`}>{item.value}</p>
          </div>
        ))}
      </div>
    </section>
  ), [day]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md modal-open">
      <div id="print-area" className="bg-white rounded-[2rem] w-full max-w-2xl overflow-hidden shadow-2xl border border-white/20 flex flex-col max-h-[90vh]">
        <div id="print-area-content" className="flex flex-col bg-white relative overflow-hidden">
          <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-gradient-to-br from-slate-50 to-white shrink-0">
            <div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                {monthId}月{day.day}日 <span className="text-sm font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-lg no-print">农历 {day.lunarDate}</span>
              </h2>
              <p className="text-amber-600 font-bold mt-2 text-lg flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse no-print"></span>
                {day.theme}
              </p>
            </div>
            <button onClick={onClose} className="p-3 hover:bg-slate-100 rounded-2xl transition-all active:scale-95 group no-print">
              <svg className="w-6 h-6 text-slate-400 group-hover:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="p-8 overflow-y-auto max-h-[60vh] space-y-8 no-scrollbar modal-scroll-area pdf-no-scroll">
            {recommendationSection}
            <section className="space-y-6">
              <div className="flex items-center gap-3 mb-2 no-print">
                <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 text-white rounded-2xl shadow-lg">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"/></svg>
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-lg">AI 运营锦囊</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">资深电商运营全维方案</p>
                </div>
              </div>
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-6 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200 no-print">
                  <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                  <div className="text-center">
                    <p className="text-slate-800 font-bold text-sm">正在深度构建爆单方案...</p>
                    <p className="text-slate-400 text-[10px] mt-1 uppercase tracking-widest font-medium">重构关键词矩阵与执行清单</p>
                  </div>
                </div>
              ) : aiData ? (
                <AIStrategyView data={aiData} />
              ) : (
                <div className="text-center py-10 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200 no-print">
                  <div className="w-14 h-14 bg-white rounded-2xl shadow-sm mx-auto flex items-center justify-center text-indigo-500 mb-4 border border-slate-100">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                  </div>
                  <p className="text-slate-600 font-bold">开启 AI 电商运营锦囊</p>
                  <p className="text-slate-400 text-[10px] mt-1 uppercase tracking-widest">深度生成关键词矩阵、种草策略及执行动作</p>
                </div>
              )}
              {error && (
                <div className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3 font-medium no-print">
                  {error}
                </div>
              )}
            </section>
          </div>
        </div>
        <div className="p-6 bg-white border-t border-slate-100 flex flex-col sm:flex-row gap-4 justify-center no-print shrink-0">
          {!aiData ? (
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full max-w-xs py-4 bg-indigo-600 text-white rounded-2xl font-black text-lg shadow-xl shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 group"
            >
              {loading ? (
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              ) : (
                <svg className="w-6 h-6 group-hover:animate-pulse" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"/></svg>
              )}
              {loading ? '锦囊生成中...' : '生成运营锦囊'}
            </button>
          ) : (
            <div className="flex gap-3 w-full max-w-lg">
              <button
                onClick={handleDownloadPDF}
                disabled={loading}
                className="flex-[1.4] py-3.5 bg-white border border-indigo-100 text-slate-700 rounded-2xl font-bold text-sm hover:bg-slate-50 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-70 shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                下载方案 PDF
              </button>
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="flex-1 py-3.5 bg-indigo-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                )}
                换个方案
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DayDetailModal;
