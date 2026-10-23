
import React from 'react';
import { StoryboardShot } from '../types';
import { Camera, Sun, Info, Target } from 'lucide-react';

interface StoryboardTableProps {
  storyboard: StoryboardShot[];
}

const StoryboardTable: React.FC<StoryboardTableProps> = ({ storyboard }) => {
  return (
    <div className="bg-white border border-slate-200 overflow-hidden shadow-sm rounded-xl animate-fade-in">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-8 py-5 text-xs font-extrabold uppercase tracking-widest text-slate-600 w-24">Shot</th>
              <th className="px-8 py-5 text-xs font-extrabold uppercase tracking-widest text-slate-600 w-1/2">Visual Content</th>
              <th className="px-8 py-5 text-xs font-extrabold uppercase tracking-widest text-slate-600">Technical Specs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {storyboard.map((shot) => (
              <tr key={shot.shotNumber} className="hover:bg-slate-50 transition-colors group">
                <td className="px-8 py-12 align-top">
                  <span className="font-bold text-3xl text-slate-200 group-hover:text-slate-400 transition-colors duration-500">
                    {String(shot.shotNumber).padStart(2, '0')}
                  </span>
                </td>
                <td className="px-8 py-12 align-top">
                  <div className="space-y-4">
                    <p className="text-slate-900 text-lg font-bold leading-tight">
                      {shot.mjPromptZh}
                    </p>
                    <div className="flex flex-wrap gap-2">
                       <span className="px-3 py-1 bg-slate-100 rounded-full text-xs text-slate-700 border border-slate-300 font-semibold tracking-widest flex items-center gap-1.5 shadow-sm uppercase">
                        <Target size={10} className="text-emerald-600" /> {shot.mood}
                       </span>
                    </div>
                  </div>
                </td>
                <td className="px-8 py-12 align-top">
                  <div className="space-y-5">
                    <div className="flex items-start gap-4">
                      <div className="p-2 bg-slate-100 rounded-lg shadow-sm border border-slate-300">
                        <Camera size={16} className="text-slate-600" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-600 uppercase font-black tracking-widest mb-1">Camera & Comp</p>
                        <p className="text-sm text-slate-900 font-bold">{shot.camera} · {shot.composition}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="p-2 bg-slate-100 rounded-lg shadow-sm border border-slate-300">
                        <Sun size={16} className="text-slate-600" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-600 uppercase font-black tracking-widest mb-1">Lighting</p>
                        <p className="text-sm text-slate-900 font-bold">{shot.lighting}</p>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bg-slate-50 px-8 py-5 border-t border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-slate-600 font-bold tracking-widest uppercase">
          <Info size={14} className="text-emerald-600" /> 基于视觉像素流深度扫描报告
        </div>
        <div className="text-xs text-slate-500 font-medium italic opacity-60">
          Generated for Professional Content Creators
        </div>
      </div>
    </div>
  );
};

export default StoryboardTable;
