import React from 'react';
import { HistoryItem, Language } from '../types';
import { Trash2, ChevronRight, History } from 'lucide-react';
import { useTranslation } from '../i18n';

interface HistoryListProps {
  lang: Language;
  history: HistoryItem[];
  onSelect: (item: HistoryItem) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onClear: () => void;
}

const HistoryList: React.FC<HistoryListProps> = ({ lang, history, onSelect, onDelete, onClear }) => {
  const t = useTranslation(lang);
  if (history.length === 0) return null;

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(lang, {
      month: '2-digit',
      day: '2-digit',
    }) + ' ' + new Date(timestamp).toLocaleTimeString(lang, {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getLabel = (type: string) => {
    switch (type) {
      case 'Product Quality': return t.quality;
      case 'Logistics/Shipping': return t.logistics;
      case 'Customer Service': return t.service;
      default: return t.other;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center px-2">
        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
          <History className="w-4 h-4" />
          {t.historyTitle}
        </h3>
        <button onClick={onClear} className="text-xs text-slate-400 hover:text-red-500 transition-colors uppercase font-bold">
          {t.clearHistory}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {history.map((item) => (
          <div
            key={item.id}
            onClick={() => onSelect(item)}
            className="group bg-white rounded-2xl p-5 border border-slate-100 hover:border-brand-200 hover:shadow-md hover:shadow-brand-100/20 transition-all cursor-pointer relative"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full uppercase">
                  {getLabel(item.request.issueType)}
                </span>
                <span className="text-[10px] font-medium text-slate-400">
                  {formatDate(item.timestamp)}
                </span>
              </div>
              <button onClick={(e) => onDelete(item.id, e)} className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-300 hover:text-red-500 rounded-lg transition-all">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-sm font-bold text-slate-800 line-clamp-1 mb-1">
              {item.request.productInfo || (lang === Language.ZH ? '未标记产品' : 'Unnamed Product')}
            </p>
            <p className="text-xs text-slate-400 line-clamp-1 italic">
              {item.request.reviewText}
            </p>

            <div className="absolute right-4 bottom-4 opacity-0 group-hover:opacity-100 transition-all">
              <ChevronRight className="w-4 h-4 text-brand-500" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HistoryList;
