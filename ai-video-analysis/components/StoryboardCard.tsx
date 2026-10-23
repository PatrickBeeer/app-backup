import React from 'react';
import { StoryboardShot } from '../types';
import { Camera, Copy, Aperture, Sun } from 'lucide-react';

interface StoryboardCardProps {
  shot: StoryboardShot;
}

const StoryboardCard: React.FC<StoryboardCardProps> = ({ shot }) => {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Could add a toast notification here
  };

  const isStartFrame = shot.splitType === 'StartFrame';
  const isEndFrame = shot.splitType === 'EndFrame';

  return (
    <div className={`relative group bg-white rounded-lg overflow-hidden border transition-all duration-300 hover:shadow-lg hover:border-emerald-500 ${
      shot.isDynamicSplit ? 'border-l-4 border-l-emerald-500' : 'border-slate-200'
    }`}>
      {/* Badge for Split Frames */}
      {shot.isDynamicSplit && (
        <div className={`absolute top-0 left-0 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white z-10 ${
          isStartFrame ? 'bg-emerald-600' : isEndFrame ? 'bg-blue-600' : 'bg-slate-600'
        }`}>
          {isStartFrame ? '动态起始帧 (Start)' : '动态结束帧 (End)'}
        </div>
      )}

      <div className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <span className="text-4xl font-mono text-slate-300 font-bold">
              {String(shot.shotNumber).padStart(2, '0')}
            </span>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                {shot.visualContent}
              </h3>
              <p className="text-xs text-emerald-600 mt-0.5">{shot.composition}</p>
            </div>
          </div>
        </div>

        {/* Technical Specs */}
        <div className="grid grid-cols-2 gap-4 mb-6 bg-slate-50 p-3 rounded-lg text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <Camera size={14} className="text-emerald-600" />
            <span>{shot.camera}</span>
          </div>
          <div className="flex items-center gap-2">
            <Sun size={14} className="text-emerald-600" />
            <span>{shot.lighting}</span>
          </div>
          <div className="flex items-center gap-2 col-span-2">
            <Aperture size={14} className="text-emerald-600" />
            <span>{shot.mood}</span>
          </div>
        </div>

        {/* Prompts */}
        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs uppercase text-slate-600 font-bold tracking-wider">Midjourney Prompt (EN)</label>
              <button 
                onClick={() => copyToClipboard(shot.mjPromptEn)}
                className="text-slate-400 hover:text-emerald-600 transition-colors"
                title="Copy English Prompt"
              >
                <Copy size={12} />
              </button>
            </div>
            <div className="bg-slate-100 p-3 rounded border border-slate-300 font-mono text-xs text-emerald-700 break-words leading-relaxed select-all">
              {shot.mjPromptEn}
            </div>
          </div>

          <div>
             <div className="flex justify-between items-center mb-1">
              <label className="text-xs uppercase text-slate-600 font-bold tracking-wider">中文视觉描述 (ZH)</label>
               <button 
                onClick={() => copyToClipboard(shot.mjPromptZh)}
                className="text-slate-400 hover:text-emerald-600 transition-colors"
                title="Copy Chinese Prompt"
              >
                <Copy size={12} />
              </button>
            </div>
            <div className="bg-slate-100 p-3 rounded border border-slate-300 font-mono text-xs text-slate-700 break-words leading-relaxed select-all">
              {shot.mjPromptZh}
            </div>
          </div>
        </div>
        
        {shot.directorNote && (
           <div className="mt-4 pt-4 border-t border-slate-200">
             <p className="text-xs text-slate-600 italic">🎬 建议: {shot.directorNote}</p>
           </div>
        )}
      </div>
    </div>
  );
};

export default StoryboardCard;