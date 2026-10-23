import React, { useState, useEffect } from 'react';
import { CloseIcon, SparklesIcon } from './Icon';

interface CustomSceneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (prompt: string) => void;
}

export const CustomSceneModal: React.FC<CustomSceneModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [prompt, setPrompt] = useState('');
  useEffect(() => { if (isOpen) setPrompt(''); }, [isOpen]);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-white/90 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white border border-black shadow-hard p-6 flex flex-col gap-4 animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-black flex items-center gap-2"><SparklesIcon className="w-5 h-5 text-lime-500" />自定义场景</h3>
          <button onClick={onClose}><CloseIcon className="w-6 h-6 hover:text-red-500 transition-colors" /></button>
        </div>
        <p className="text-sm text-gray-600 font-medium">请描述您希望生成的场景环境、光照和氛围。AI 将根据您的描述生成效果图。</p>
        <textarea className="w-full h-32 p-4 border border-gray-300 focus:border-black focus:ring-1 focus:ring-black outline-none resize-none font-medium bg-gray-50 text-sm" placeholder="例如：放在一个充满阳光的白色极简主义艺术画廊墙面上，周围有绿植点缀..." value={prompt} onChange={(e) => setPrompt(e.target.value)} autoFocus />
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-6 py-3 font-bold text-sm border border-gray-200 hover:border-black transition-colors">取消</button>
          <button onClick={() => { if (prompt.trim()) onSubmit(prompt); }} disabled={!prompt.trim()} className="px-6 py-3 font-bold text-sm bg-black text-white hover:bg-lime-300 hover:text-black border border-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed">开始生成</button>
        </div>
      </div>
    </div>
  );
};
