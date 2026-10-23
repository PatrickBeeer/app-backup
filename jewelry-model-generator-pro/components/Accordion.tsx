import React from 'react';
import { ChevronDown } from '@/utils/lucide';

interface AccordionProps {
  icon: React.ElementType;
  title: string;
  summary: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export const Accordion: React.FC<AccordionProps> = ({ icon: Icon, title, summary, isOpen, onToggle, children }) => {
  return (
    <div className="border-b border-gray-200/50 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-4 text-left transition-colors hover:bg-black/5 rounded-lg px-2"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/60 flex items-center justify-center shadow-sm">
            <Icon size={16} className="text-gray-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-800">{title}</p>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{summary}</p>
          </div>
        </div>
        <ChevronDown 
          size={18} 
          className={`text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>

      {isOpen && (
        <div className="pt-2 pb-6 px-2 animate-in fade-in slide-in-from-top-2 duration-300">
          {children}
        </div>
      )}
    </div>
  );
};

