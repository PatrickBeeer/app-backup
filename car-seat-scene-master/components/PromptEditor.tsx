import React, { useState } from 'react';
import { DEFAULT_PROMPTS } from '../services/geminiService';

interface PromptEditorProps {
  prompts: typeof DEFAULT_PROMPTS;
  onPromptsChange: (prompts: typeof DEFAULT_PROMPTS) => void;
  isLoading: boolean;
}

const titles = {
  standard: "车内常规图",
  convertible: "敞篷特效图"
};

const AccordionItem: React.FC<{ 
  title: string; 
  children: React.ReactNode; 
  isOpen: boolean; 
  onClick: () => void 
}> = ({ title, children, isOpen, onClick }) => {
  return (
    <div className="border-b border-slate-300">
      <button
        onClick={onClick}
        className="w-full flex justify-between items-center py-3 text-left font-bold text-slate-800 hover:text-slate-900 transition-colors"
      >
        <span>{title}</span>
        <svg
          className={`w-5 h-5 transform transition-transform duration-300 text-slate-600 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
        </svg>
      </button>
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-96' : 'max-h-0'}`}>
        <div className="pb-4 pt-1">
          {children}
        </div>
      </div>
    </div>
  );
};

export const PromptEditor: React.FC<PromptEditorProps> = ({ prompts, onPromptsChange, isLoading }) => {
  const [openAccordion, setOpenAccordion] = useState<keyof typeof titles | null>('standard');

  const handlePromptChange = (key: keyof typeof prompts, value: string) => {
    onPromptsChange({ ...prompts, [key]: value });
  };
  
  const toggleAccordion = (key: keyof typeof titles) => {
    setOpenAccordion(openAccordion === key ? null : key);
  };

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-indigo-400">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
        AI 指令编辑 (高级)
      </h3>
      <div className="space-y-1">
        {(Object.keys(titles) as Array<keyof typeof titles>).map((key) => (
          <AccordionItem
            key={key}
            title={titles[key]}
            isOpen={openAccordion === key}
            onClick={() => toggleAccordion(key)}
          >
            <textarea
              value={prompts[key]}
              onChange={(e) => handlePromptChange(key, e.target.value)}
              disabled={isLoading}
              rows={4}
              className="w-full p-3 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none bg-slate-100 text-slate-800 disabled:bg-slate-200/50 disabled:cursor-not-allowed"
              placeholder={`输入 ${titles[key]} 的提示词...`}
            />
          </AccordionItem>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        提示：您可以直接修改上方文字来调整生成细节
      </p>
    </div>
  );
};

