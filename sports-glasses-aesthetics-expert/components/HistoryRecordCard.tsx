import React from 'react';
import { GenerationRecord } from '../types';
import { GeneratedImageCard } from './GeneratedImageCard';

interface HistoryRecordCardProps {
  record: GenerationRecord;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onZoom: (src: string) => void;
  onDownload: (src: string, title: string) => void;
}

const ChevronIcon: React.FC<{ open: boolean }> = ({ open }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-slate-600 transition-transform duration-300 ${open ? 'transform rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

export const HistoryRecordCard: React.FC<HistoryRecordCardProps> = ({ record, isExpanded, onToggleExpand, onZoom, onDownload }) => {
  const formattedDate = new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(record.timestamp));

  const hasFinishedImages = record.generatedImages.some(img => img.status === 'success' || img.status === 'error');
  
  return (
    <div className="bg-slate-100/50 backdrop-blur-xl rounded-xl shadow-lg border border-slate-300 hover:shadow-xl transition-all duration-300 overflow-hidden group">
      {/* Header */}
      <header className="flex items-center justify-between p-5 cursor-pointer hover:bg-slate-100/70 transition-colors" onClick={onToggleExpand}>
        <div className="flex items-center gap-5 overflow-hidden">
          <div className="flex -space-x-3 flex-shrink-0 pl-1">
            {record.uploadedImages.map((image, index) => (
              <img 
                key={index}
                src={`data:${image.mimeType};base64,${image.base64}`} 
                alt={`Uploaded thumbnail ${index + 1}`}
                className="w-12 h-12 object-cover rounded-xl bg-white ring-2 ring-slate-200 shadow-sm"
                style={{ zIndex: record.uploadedImages.length - index }}
              />
            ))}
          </div>
          <div className="truncate">
            <p className="font-bold text-white truncate text-base">{formattedDate}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-xs font-semibold rounded-md uppercase tracking-wide">
                {record.aspectRatio}
              </span>
              <span className="text-slate-500 text-xs">
                {record.generatedImages.length} 张图片
              </span>
            </div>
          </div>
        </div>
        <div className="p-2 bg-slate-200/50 rounded-full group-hover:bg-slate-200 transition-colors">
          <ChevronIcon open={isExpanded} />
        </div>
      </header>
      
      {/* Collapsible Content Area */}
      <div className={`transition-[max-height] duration-500 ease-in-out overflow-hidden ${isExpanded ? 'max-h-[2000px]' : 'max-h-0'}`}>
        <div className="p-6 pt-0">
          {/* Prompt Info Display */}
          <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {record.generatedImages.map((img) => (
              <div key={`prompt-${img.id}`} className="bg-white/50 p-4 rounded-xl border border-slate-300 text-xs">
                <span className="font-bold text-slate-700 mb-1 block">{img.title} 提示词:</span>
                <p className="text-slate-600 leading-relaxed line-clamp-3 hover:line-clamp-none transition-all">{img.prompt}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {record.generatedImages.map(image => (
              <GeneratedImageCard
                key={image.id}
                image={image}
                onZoom={onZoom}
                onDownload={onDownload}
              />
            ))}
          </div>
        </div>
      </div>
      
      {/* Collapsed Thumbnail Preview */}
      {!isExpanded && hasFinishedImages && (
        <div className="px-5 pb-5 pt-0">
          <div className="flex flex-wrap gap-2">
            {record.generatedImages.map(image => (
              <div key={image.id} className="w-14 h-14 rounded-lg overflow-hidden bg-white border border-slate-300 flex-shrink-0" title={image.title}>
                {image.status === 'success' && image.src ? (
                  <img src={image.src} alt={image.title} className="w-full h-full object-cover opacity-80" />
                ) : image.status === 'loading' ? (
                  <div className="w-full h-full bg-slate-100 animate-pulse" />
                ) : (
                  <div className="w-full h-full bg-red-900/50 flex items-center justify-center">
                    <span className="text-red-400 text-xs">!</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
