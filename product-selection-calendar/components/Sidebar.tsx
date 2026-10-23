import React from 'react';
import { MonthData } from '../types';

interface SidebarProps {
  month: MonthData;
}

const Sidebar: React.FC<SidebarProps> = ({ month }) => {
  return (
    <div className="w-full lg:w-80 space-y-6">
      <section className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span className="w-2 h-6 bg-amber-500 rounded-full"></span>
          {month.id}月节日假日
        </h3>
        <div className="space-y-3">
          <div className="grid grid-cols-3 text-xs text-slate-400 pb-2 border-b border-slate-50">
            <span>节日</span>
            <span className="text-center">今年</span>
            <span className="text-right">去年</span>
          </div>
          {month.holidays.map((h, i) => (
            <div key={i} className="grid grid-cols-3 items-center text-sm py-1">
              <span className="font-medium text-slate-700">{h.name}</span>
              <span className="text-center">
                <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px]">{h.date}</span>
              </span>
              <span className="text-right text-slate-400 line-through text-[10px]">{h.lastYear}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="bg-amber-600 rounded-xl p-5 shadow-sm text-white">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          {month.id}月黄金脚本
        </h3>
        <div className="space-y-3 text-xs leading-relaxed opacity-95">
          {month.goldenScripts.map((script, i) => (
            <p key={i} className="pb-2 border-b border-amber-500/30 last:border-0">{script}</p>
          ))}
        </div>
      </section>
      <section className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span className="w-2 h-6 bg-slate-800 rounded-full"></span>
          {month.id}月选品方向
        </h3>
        <ul className="space-y-3">
          {month.selectionDirections.map((dir, i) => (
            <li key={i} className="text-sm text-slate-600 flex gap-2">
              <span className="text-slate-300">•</span>
              {dir}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default Sidebar;
