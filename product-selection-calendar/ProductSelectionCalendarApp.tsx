import React, { useState, useMemo, useCallback } from 'react';
import { AppProps } from '../../types';
import { CALENDAR_DATA } from './data';
import { MonthData, DayData } from './types';
import Sidebar from './components/Sidebar';
import DayDetailModal from './components/DayDetailModal';

const DayCell = React.memo(({ dayData, isRecommendation, onClick }: {
  dayData: DayData | null;
  isRecommendation: boolean;
  onClick: () => void;
}) => {
  if (!dayData) return <div className="aspect-square border-r border-b border-slate-50 bg-slate-50/20" />;
  return (
    <div
      onClick={isRecommendation ? onClick : undefined}
      className={`aspect-square p-4 md:p-5 border-r border-b border-slate-50 group transition-all duration-300 relative ${
        isRecommendation
          ? 'cursor-pointer hover:bg-amber-50/50 hover:scale-[1.02] hover:z-10 hover:shadow-2xl hover:rounded-3xl bg-white'
          : 'opacity-50 grayscale-[0.3] bg-white/50'
      }`}
    >
      <div className="flex justify-between items-start mb-1 md:mb-2">
        <span className={`text-xl md:text-2xl font-black leading-none tracking-tighter ${dayData.isHoliday ? 'text-red-500' : 'text-slate-900'}`}>
          {dayData.day}
        </span>
        <span className="text-[9px] md:text-[10px] font-bold text-slate-300 uppercase">{dayData.lunarDate}</span>
      </div>
      {dayData.holidayName && (
        <div className="inline-block bg-red-50 text-red-500 text-[10px] font-black px-2 py-0.5 rounded-lg mb-1 md:mb-2 shadow-sm border border-red-100">
          {dayData.holidayName}
        </div>
      )}
      <div className="text-[11px] md:text-[12px] font-bold text-slate-700 leading-tight line-clamp-2 min-h-[2.4em] group-hover:text-amber-700 transition-colors">
        {dayData.theme}
      </div>
      {dayData.recommendation && (
        <div className="mt-2 md:mt-4 pt-2 md:pt-4 border-t border-amber-100/30 hidden md:block">
          {dayData.recommendation.volume && (
            <div className="text-[10px] text-amber-600 font-black mb-1 flex items-center gap-1">
              <span className="bg-amber-100 p-0.5 rounded">🔥</span> {dayData.recommendation.volume}
            </div>
          )}
          <div className="text-[11px] text-slate-500 font-bold truncate bg-slate-50 px-2 py-1.5 rounded-xl group-hover:bg-white group-hover:shadow-sm">
            {dayData.recommendation.brand ? `${dayData.recommendation.brand} ` : ''}{dayData.recommendation.name}
          </div>
        </div>
      )}
      {isRecommendation && (
        <div className="absolute bottom-2 right-2 md:bottom-4 md:right-4 opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
          <div className="bg-amber-500 text-white p-1.5 md:p-2 rounded-xl shadow-lg shadow-amber-200">
            <svg className="w-3 h-3 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
          </div>
        </div>
      )}
    </div>
  );
});

export const ProductSelectionCalendarApp: React.FC<AppProps> = ({ platform, costs }) => {
  const cost = costs?.GENERATE_STRATEGY ?? 10;
  const [currentMonthIndex, setCurrentMonthIndex] = useState(() =>
    Math.min(new Date().getMonth(), CALENDAR_DATA.length - 1)
  );
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);
  const month = useMemo(() => CALENDAR_DATA[currentMonthIndex], [currentMonthIndex]);
  const gridCells = useMemo(() => {
    const daysInMonth = new Date(2026, month.id, 0).getDate();
    const startDay = new Date(2026, month.id - 1, 1).getDay();
    const cells: (DayData | null)[] = Array(startDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dayData = month.days.find(day => day.day === d) || { day: d, lunarDate: '', theme: '' };
      cells.push(dayData);
    }
    while (cells.length < 42) cells.push(null);
    return cells;
  }, [month]);
  const handleDayClick = useCallback((day: DayData) => setSelectedDay(day), []);

  return (
    <div className="min-h-screen pb-12 flex flex-col bg-[#fdfdfd]">
      <header className="bg-[#0f172a] text-white pt-8 pb-6 px-6 shadow-2xl sticky top-0 z-40 border-b border-white/10 no-print">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center text-slate-900 font-black text-xl shadow-[0_0_20px_rgba(245,158,11,0.3)]">26</div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl md:text-3xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-200">
                    2026 爆单选品日历
                  </h1>
                  <span className="hidden sm:inline-block bg-white/10 px-3 py-1 rounded-full text-[12px] font-black text-amber-400 border border-amber-400/30 backdrop-blur-sm">
                    贾真爆单锦囊
                  </span>
                </div>
                <p className="text-slate-400 flex items-center gap-2 text-sm font-medium mt-1">
                  <span className="bg-amber-500/20 text-amber-500 text-[10px] font-black px-1.5 py-0.5 rounded border border-amber-500/30">AI PRO</span>
                  数字化驱动爆发增长
                </p>
              </div>
            </div>
            <div className="sm:hidden -mt-2">
              <span className="bg-amber-500 text-slate-900 px-2 py-0.5 rounded font-black text-[10px] uppercase tracking-wider">贾真爆单锦囊</span>
            </div>
          </div>
          <div className="overflow-x-auto no-scrollbar">
            <div className="flex bg-slate-800/40 p-1.5 rounded-2xl gap-1 min-w-max border border-white/5">
              {CALENDAR_DATA.map((m, idx) => (
                <button
                  key={m.id}
                  onClick={() => setCurrentMonthIndex(idx)}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all duration-300 border-2 ${
                    currentMonthIndex === idx
                      ? 'bg-amber-500 text-slate-900 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.4)] scale-105'
                      : 'text-slate-400 border-transparent hover:text-white hover:bg-slate-700/50'
                  }`}
                >
                  {m.id}月
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-4 gap-8 mt-10 no-print">
        <div className="lg:col-span-3">
          <div className="bg-white rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-slate-100 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/50">
              {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => (
                <div key={day} className={`py-6 text-center text-[11px] font-black tracking-widest ${day === 'SUN' || day === 'SAT' ? 'text-amber-600' : 'text-slate-400'}`}>
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {gridCells.map((dayData, idx) => (
                <DayCell
                  key={idx}
                  dayData={dayData}
                  isRecommendation={!!dayData?.recommendation}
                  onClick={() => dayData && handleDayClick(dayData)}
                />
              ))}
            </div>
          </div>
          <div className="mt-10 flex flex-wrap gap-8 px-8 py-4 bg-slate-50/50 rounded-3xl inline-flex">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-red-400 shadow-lg shadow-red-200"></span>
              <span className="text-xs font-black text-slate-600 uppercase tracking-wider">法定/核心节假日</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-amber-400 shadow-lg shadow-amber-200"></span>
              <span className="text-xs font-black text-slate-600 uppercase tracking-wider">当日选品爆发推荐</span>
            </div>
          </div>
        </div>
        <Sidebar month={month} />
      </main>
      {selectedDay && (
        <DayDetailModal
          day={selectedDay}
          monthId={month.id}
          onClose={() => setSelectedDay(null)}
          platform={platform}
          cost={cost}
        />
      )}
      <footer className="max-w-7xl mx-auto px-6 mt-20 pb-16 opacity-60 no-print">
        <div className="border-t border-slate-200 pt-10 flex items-center justify-center">
          <p className="text-xs text-slate-400 text-center max-w-2xl leading-loose font-medium">
            * 本数据基于公开信息及市场趋势 analysis，仅供参考，不构成任何投资或购买建议，实际数据以各平台为准。
          </p>
        </div>
      </footer>
    </div>
  );
};
