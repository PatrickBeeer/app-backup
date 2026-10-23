
import React, { useState } from 'react';
import { StrategyResult, MainImageCard, DetailPageRow } from '../types';
import PptxGenJS from 'pptxgenjs';

interface StrategyDisplayProps {
  result: StrategyResult;
  onReset: () => void;
}

export const StrategyDisplay: React.FC<StrategyDisplayProps> = ({ result, onReset }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'seo_ai' | 'mainImages' | 'detailPage'>('overview');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };
  
  const handleDownload = () => {
    if (!result) {
        alert("没有可下载的方案数据。");
        return;
    }

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';

    // Define some styles for reusability
    const titleStyle = { x: 0.5, y: 0.5, w: 12, h: 1, fontSize: 36, fontFace: 'Inter', bold: true, color: '0F172A' };
    const sectionTitleStyle = { x: 0.5, y: 0.2, w: 12, h: 0.5, fontSize: 24, fontFace: 'Inter', bold: true, color: '2563EB' };
    const bodyTextStyle = { fontSize: 12, fontFace: 'Inter', color: '334155' };

    // --- Slide 1: Title Slide ---
    let titleSlide = pptx.addSlide();
    titleSlide.background = { color: 'F1F5F9' };
    titleSlide.addText('超级单品策划方案', { ...titleStyle, y: 2.5, align: 'center' });
    titleSlide.addText(`品类: ${result.mainImages[0].copy.slice(0,15)}...`, { x: 0.5, y: 3.5, w: 12, h: 0.5, align: 'center', fontSize: 18, fontFace: 'Inter', color: '64748B' });
    titleSlide.addText('由 超级单品策划专家(AI) 生成', { x: 0, y: 5.2, w: 13.3, align: 'center', fontSize: 10, color: '94A3B8' });


    // --- Slide 2: Overview ---
    let overviewSlide = pptx.addSlide();
    overviewSlide.addText('📊 策略总览', sectionTitleStyle);

    overviewSlide.addText('市场洞察', { x: 0.5, y: 1.0, w: 4, h: 0.4, ...bodyTextStyle, bold: true, fontSize: 14 });
    overviewSlide.addText(result.analysisSummary, { x: 0.5, y: 1.4, w: 4, h: 3.8, ...bodyTextStyle, align: 'left', valign: 'top' });

    overviewSlide.addText('差异化策略', { x: 5, y: 1.0, w: 4, h: 0.4, ...bodyTextStyle, bold: true, fontSize: 14 });
    overviewSlide.addText(result.differentiation, { x: 5, y: 1.4, w: 4.3, h: 1.8, ...bodyTextStyle, align: 'left', valign: 'top' });

    overviewSlide.addText('竞品痛点打击', { x: 5, y: 3.5, w: 4, h: 0.4, ...bodyTextStyle, bold: true, fontSize: 14 });
    overviewSlide.addText(result.competitorWeakness, { x: 5, y: 3.9, w: 4.3, h: 1.8, ...bodyTextStyle, align: 'left', valign: 'top' });


    // --- Slide 3: SEO ---
    let seoSlide = pptx.addSlide();
    seoSlide.addText('🚀 SEO 关键词策略', sectionTitleStyle);

    seoSlide.addText('核心大词 (保流量)', { x: 0.5, y: 1.0, w: 4, h: 0.4, ...bodyTextStyle, bold: true, fontSize: 14 });
    seoSlide.addText(result.seoStrategy.coreKeywords.join(', '), { x: 0.5, y: 1.4, w: 4, h: 3.8, ...bodyTextStyle, valign: 'top' });

    seoSlide.addText('精准长尾词 (保转化)', { x: 5, y: 1.0, w: 4, h: 0.4, ...bodyTextStyle, bold: true, fontSize: 14 });
    seoSlide.addText(result.seoStrategy.longTailKeywords.join('\n'), { x: 5, y: 1.4, w: 4, h: 3.8, ...bodyTextStyle, valign: 'top' });
    
    seoSlide.addText('场景/种草词 (强种草)', { x: 9.5, y: 1.0, w: 4, h: 0.4, ...bodyTextStyle, bold: true, fontSize: 14 });
    seoSlide.addText(result.seoStrategy.scenarioKeywords.join(', '), { x: 9.5, y: 1.4, w: 3.3, h: 3.8, ...bodyTextStyle, valign: 'top' });


    // --- Slides 4+: Main Images ---
    result.mainImages.forEach(img => {
        let imgSlide = pptx.addSlide();
        imgSlide.addText(`🖼️ 主图 ${img.order}: ${img.goal}`, sectionTitleStyle);

        imgSlide.addText('文案策略', { x: 0.5, y: 1.0, w: 12, h: 0.4, ...bodyTextStyle, bold: true, fontSize: 14 });
        imgSlide.addText(`"${img.copy}"`, { x: 0.5, y: 1.4, w: 12, h: 0.8, ...bodyTextStyle, fontSize: 18, bold: true, color: '0F172A' });
        
        imgSlide.addText('画面指导', { x: 0.5, y: 2.5, w: 12, h: 0.4, ...bodyTextStyle, bold: true, fontSize: 14 });
        imgSlide.addText(img.visualSuggestion, { x: 0.5, y: 2.9, w: 12, h: 1, ...bodyTextStyle, valign: 'top' });

        imgSlide.addText('Midjourney Prompt', { x: 0.5, y: 4.2, w: 12, h: 0.4, ...bodyTextStyle, bold: true, fontSize: 14 });
        imgSlide.addText(img.mjPrompt, { x: 0.5, y: 4.6, w: 12, h: 2, ...bodyTextStyle, fontFace: 'Courier New', color: '1E293B', fill: { color: 'F1F5F9' }, valign: 'top' });
    });


    // --- Final Slide(s): Detail Page ---
    let detailPageSlide = pptx.addSlide();
    detailPageSlide.addText('📝 详情页逻辑', sectionTitleStyle);

    let tableRows = result.detailPage.map(row => [
        { text: row.screen.match(/\d+(-\d+)?/)?.[0] || row.screen, options: { ...bodyTextStyle, bold: true } },
        { text: row.content, options: bodyTextStyle },
        { text: row.visualFocus, options: bodyTextStyle }
    ]);
    
    tableRows.unshift([
        { text: "屏数", options: { ...bodyTextStyle, bold: true, color: 'FFFFFF' } },
        { text: "内容策划", options: { ...bodyTextStyle, bold: true, color: 'FFFFFF' } },
        { text: "视觉重点", options: { ...bodyTextStyle, bold: true, color: 'FFFFFF' } }
    ]);

    detailPageSlide.addTable(tableRows, {
        x: 0.5,
        y: 1.0,
        w: 12.3,
        rowH: 0.4,
        fill: { color: 'F8FAFC' },
        border: { type: 'solid', pt: 1, color: 'FFFFFF' },
        valign: 'middle',
        colW: [1, 6, 5.3],
        autoPage: true,
        newSlideStartY: 1.0,
    });

    pptx.writeFile({ fileName: `超级单品策划方案-${result.mainImages[0].copy.slice(0,10)}.pptx` });
  };


  const tabs = [
    { id: 'overview', label: '策略总览' },
    { id: 'seo_ai', label: '流量 & AI' },
    { id: 'mainImages', label: '主图结构' },
    { id: 'detailPage', label: '详情页逻辑' }
  ];

  return (
    <div className="space-y-8 pb-12">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-2">
        <div>
            <h2 className="text-3xl font-black text-gray-800 tracking-tight">方案已就绪</h2>
            <p className="mt-1 text-gray-500 font-medium">✨ 这是为您生成的定制化差异策略</p>
        </div>
        <div className="flex gap-3">
            <button 
                onClick={handleDownload}
                className="group inline-flex items-center px-5 py-2.5 border border-white/60 shadow-sm text-sm font-bold rounded-2xl text-gray-600 bg-white/60 hover:bg-white hover:text-blue-600 hover:shadow-md transition-all backdrop-blur-sm"
            >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                下载方案 (PPT)
            </button>
            <button 
                onClick={onReset}
                className="group inline-flex items-center px-5 py-2.5 border border-white/60 shadow-sm text-sm font-bold rounded-2xl text-gray-600 bg-white/60 hover:bg-white hover:text-blue-600 hover:shadow-md transition-all backdrop-blur-sm"
            >
                <svg className="w-4 h-4 mr-2 group-hover:-rotate-180 transition-transform duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                重新策划
            </button>
        </div>
      </div>

      {/* Modern Pill Tabs */}
      <div className="flex justify-start overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0">
        <div className="bg-white/40 backdrop-blur-md p-1.5 rounded-[1.25rem] inline-flex shadow-sm border border-white/40">
            {tabs.map((tab) => (
                <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`${
                    activeTab === tab.id
                    ? 'bg-white text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 shadow-md shadow-blue-100'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                } px-6 py-2.5 rounded-2xl text-sm font-bold transition-all duration-300 whitespace-nowrap`}
                >
                {tab.label}
                </button>
            ))}
        </div>
      </div>

      {/* Content */}
      <div className="animate-fade-in-up">
        
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Market Analysis */}
                <div className="bg-white/80 backdrop-blur-xl shadow-lg shadow-blue-100/30 rounded-[2rem] p-8 border border-white/60 hover:-translate-y-1 transition-transform duration-300">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-3">
                        <span className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 shadow-sm">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                        </span>
                        市场洞察
                    </h3>
                    <p className="text-gray-600 leading-relaxed text-sm whitespace-pre-line font-medium">
                        {result.analysisSummary}
                    </p>
                </div>

                {/* Differentiation */}
                <div className="bg-white/80 backdrop-blur-xl shadow-lg shadow-indigo-100/30 rounded-[2rem] p-8 border border-white/60 hover:-translate-y-1 transition-transform duration-300">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-3">
                        <span className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </span>
                        差异化策略
                    </h3>
                    <p className="text-gray-600 leading-relaxed text-sm whitespace-pre-line font-medium">
                        {result.differentiation}
                    </p>
                </div>

                 {/* Competitor Weakness */}
                 <div className="bg-gradient-to-br from-orange-50 to-white backdrop-blur-xl shadow-lg shadow-orange-100/30 rounded-[2rem] p-8 border border-white/60 md:col-span-2 hover:-translate-y-1 transition-transform duration-300">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-3">
                        <span className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-500 shadow-sm">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </span>
                        竞品痛点打击 (机会点)
                    </h3>
                    <p className="text-gray-600 leading-relaxed text-sm whitespace-pre-line font-medium">
                        {result.competitorWeakness}
                    </p>
                </div>

                {/* Style Advice */}
                <div className="bg-white/80 backdrop-blur-xl shadow-lg shadow-purple-100/30 rounded-[2rem] p-8 border border-white/60 hover:-translate-y-1 transition-transform duration-300">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-3">
                         <span className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-purple-500 shadow-sm">
                             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                         </span>
                        风格建议
                    </h3>
                    <ul className="space-y-3">
                        {result.styleAdvice.map((style, idx) => (
                            <li key={idx} className="flex items-start gap-3 text-sm text-gray-600 font-medium">
                                <span className="mt-1.5 w-2 h-2 rounded-full bg-purple-400 flex-shrink-0 shadow-sm shadow-purple-300"></span>
                                {style}
                            </li>
                        ))}
                    </ul>
                </div>

                {/* AB Testing */}
                <div className="bg-white/80 backdrop-blur-xl shadow-lg shadow-teal-100/30 rounded-[2rem] p-8 border border-white/60 hover:-translate-y-1 transition-transform duration-300">
                     <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-3">
                        <span className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center text-teal-600 shadow-sm">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                            </svg>
                        </span>
                         A/B 测试建议
                     </h3>
                     <div className="space-y-4">
                        {result.abTesting.map((test, idx) => (
                            <div key={idx} className="bg-gray-50/80 p-5 rounded-2xl border border-gray-100">
                                <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400"></span>
                                    {test.location}
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                                        <div className="text-[10px] text-gray-400 font-bold mb-1 uppercase">Option A</div>
                                        <div className="text-sm font-bold text-gray-700">{test.optionA}</div>
                                    </div>
                                    <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                                        <div className="text-[10px] text-gray-400 font-bold mb-1 uppercase">Option B</div>
                                        <div className="text-sm font-bold text-gray-700">{test.optionB}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                     </div>
                </div>
            </div>
        )}

        {/* TAB 2: SEO & AI */}
        {activeTab === 'seo_ai' && (
            <div className="space-y-8">
                {/* SEO Section */}
                <div className="bg-white/80 backdrop-blur-xl shadow-lg shadow-green-100/30 rounded-[2rem] p-8 border border-white/60">
                    <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                         <span className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-green-600 shadow-sm">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                         </span>
                        SEO 关键词埋词策略
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Core Keywords */}
                        <div className="flex flex-col h-full bg-blue-50/50 rounded-2xl p-5 border border-blue-50/50">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="font-bold text-gray-800 text-sm">核心大词</h4>
                                <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-1 rounded-full font-bold">保流量</span>
                            </div>
                            <div className="flex flex-wrap gap-2 mb-3">
                                {result.seoStrategy.coreKeywords.map((kw, i) => (
                                    <span key={i} className="px-3 py-1.5 bg-white text-gray-700 text-xs rounded-lg border border-white shadow-sm font-bold hover:scale-105 transition-transform cursor-default">{kw}</span>
                                ))}
                            </div>
                        </div>

                        {/* Long Tail */}
                         <div className="flex flex-col h-full bg-purple-50/50 rounded-2xl p-5 border border-purple-50/50">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="font-bold text-gray-800 text-sm">精准长尾词</h4>
                                <span className="text-[10px] bg-purple-100 text-purple-600 px-2 py-1 rounded-full font-bold">保转化</span>
                            </div>
                             <div className="flex flex-wrap gap-2 mb-3">
                                {result.seoStrategy.longTailKeywords.map((kw, i) => (
                                    <span key={i} className="px-3 py-1.5 bg-white text-gray-700 text-xs rounded-lg border border-white shadow-sm font-bold hover:scale-105 transition-transform cursor-default">{kw}</span>
                                ))}
                            </div>
                        </div>

                        {/* Social */}
                         <div className="flex flex-col h-full bg-pink-50/50 rounded-2xl p-5 border border-pink-50/50">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="font-bold text-gray-800 text-sm">场景/种草词</h4>
                                <span className="text-[10px] bg-pink-100 text-pink-600 px-2 py-1 rounded-full font-bold">强种草</span>
                            </div>
                             <div className="flex flex-wrap gap-2 mb-3">
                                {result.seoStrategy.scenarioKeywords.map((kw, i) => (
                                    <span key={i} className="px-3 py-1.5 bg-white text-gray-700 text-xs rounded-lg border border-white shadow-sm font-bold hover:scale-105 transition-transform cursor-default">{kw}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* AI Prompts Section */}
                <div className="bg-gradient-to-br from-[#1e293b] to-[#0f172a] shadow-2xl shadow-blue-900/20 rounded-[2rem] p-8 border border-white/10 text-white overflow-hidden relative">
                     {/* Decorative background blob */}
                     <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/20 rounded-full blur-[80px] -mr-20 -mt-20 pointer-events-none"></div>
                     <div className="absolute bottom-0 left-0 w-60 h-60 bg-purple-500/20 rounded-full blur-[80px] -ml-10 -mb-10 pointer-events-none"></div>

                     <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-2">
                            <span className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-pink-300 shadow-inner">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            </span>
                            <h3 className="text-xl font-bold text-white tracking-wide">Midjourney 提示词</h3>
                        </div>
                        <p className="text-slate-400 text-sm mb-8 pl-14 max-w-2xl font-medium">
                            复制下方英文指令到 Midjourney，一键生成摄影棚级产品图。
                        </p>
                        
                        <div className="grid gap-4">
                            {result.mainImages.map((img, idx) => (
                                <div key={idx} className="bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all overflow-hidden group">
                                    <div className="flex items-center justify-between px-5 py-3 bg-black/20 border-b border-white/5">
                                        <div className="flex items-center gap-3">
                                            <span className="flex items-center justify-center w-6 h-6 rounded bg-blue-500/20 text-xs font-bold text-blue-300 border border-blue-500/30">0{img.order}</span>
                                            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">{img.goal}</span>
                                        </div>
                                        <button 
                                            onClick={() => handleCopy(img.mjPrompt, idx)}
                                            className="text-xs font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-all text-slate-300 group-hover:text-white"
                                        >
                                            {copiedIndex === idx ? (
                                                <>
                                                    <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                    <span className="text-green-400">已复制</span>
                                                </>
                                            ) : (
                                                <>
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                                    </svg>
                                                    复制
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    <div className="p-5 relative">
                                         <code className="block text-sm text-slate-300 font-mono leading-relaxed break-all opacity-90 group-hover:opacity-100 transition-opacity">
                                            {img.mjPrompt}
                                        </code>
                                    </div>
                                </div>
                            ))}
                        </div>
                     </div>
                </div>
            </div>
        )}

        {/* TAB 3: MAIN IMAGES */}
        {activeTab === 'mainImages' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
                {result.mainImages.map((card: MainImageCard) => (
                <div key={card.order} className="bg-white/80 backdrop-blur-xl shadow-lg shadow-gray-200/50 rounded-[2rem] border border-white/60 p-6 flex flex-col h-full transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 relative group">
                    {/* Number Badge */}
                    <div className="absolute top-4 right-4 w-12 h-12 rounded-full bg-gradient-to-tr from-blue-100 to-purple-100 flex items-center justify-center text-xl font-black text-white drop-shadow-md select-none opacity-40 group-hover:opacity-100 transition-opacity">
                         <span className="text-transparent bg-clip-text bg-gradient-to-br from-blue-500 to-purple-600">{card.order}</span>
                    </div>

                    <div className="relative z-10 flex flex-col h-full">
                        <div className="mb-6 mt-1">
                             <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600 tracking-wider uppercase border border-blue-100">
                                {card.goal}
                            </span>
                        </div>
                        
                        <div className="mb-6">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">文案策略</label>
                            <h4 className="text-lg font-bold text-gray-800 leading-snug">"{card.copy}"</h4>
                        </div>

                        <div className="mt-auto pt-5 border-t border-gray-100/50">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">画面指导</label>
                            <p className="text-sm text-gray-500 leading-relaxed font-medium mb-4">{card.visualSuggestion}</p>
                            
                            <button 
                                onClick={() => setActiveTab('seo_ai')}
                                className="w-full text-xs py-2.5 bg-gray-50 hover:bg-blue-50 text-gray-500 hover:text-blue-600 rounded-xl transition-colors font-bold border border-gray-100"
                            >
                                查看 Prompt
                            </button>
                        </div>
                    </div>
                </div>
                ))}
            </div>
        )}

        {/* TAB 4: DETAIL PAGE */}
        {activeTab === 'detailPage' && (
             <div className="bg-white/80 backdrop-blur-xl shadow-lg shadow-gray-200/50 rounded-[2rem] border border-white/60 overflow-hidden">
                <div className="overflow-x-auto p-6">
                    <table className="min-w-full divide-y divide-gray-100">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th scope="col" className="px-6 py-6 text-left text-xs font-bold text-gray-400 uppercase tracking-wider w-32 min-w-[8rem]">
                                    屏数
                                </th>
                                <th scope="col" className="px-8 py-6 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                                    内容策划
                                </th>
                                <th scope="col" className="px-8 py-6 text-left text-xs font-bold text-gray-400 uppercase tracking-wider w-1/3">
                                    视觉重点
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-transparent divide-y divide-gray-50">
                            {result.detailPage.map((row: DetailPageRow, idx) => (
                                <tr key={idx} className="hover:bg-blue-50/50 transition-colors group">
                                    <td className="px-6 py-6 whitespace-nowrap min-w-[8rem]">
                                        <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 rounded-full bg-white text-gray-500 text-xs font-bold shadow-sm border border-gray-100 group-hover:border-blue-200 group-hover:text-blue-600 transition-colors">
                                            { row.screen.match(/\d+(-\d+)?/)?.[0] || row.screen }
                                        </span>
                                    </td>
                                    <td className="px-8 py-6 max-w-md">
                                        <div className="max-h-32 overflow-y-auto pr-2">
                                            <p className="text-sm font-bold text-gray-800 leading-relaxed whitespace-pre-line break-words">{row.content}</p>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 max-w-md">
                                        <div className="max-h-32 overflow-y-auto pr-2">
                                            <p className="text-sm text-gray-500 font-medium leading-relaxed whitespace-pre-line break-words">{row.visualFocus}</p>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};
