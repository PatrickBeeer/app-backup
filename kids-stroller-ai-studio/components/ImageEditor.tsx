import React, { useState } from 'react';
import { GeneratedImage, EditOptions, LightingOption, BlurOption, ColorOption } from '../types';

interface ImageEditorProps {
  image: GeneratedImage;
  onClose: () => void;
  onGenerate: (options: EditOptions) => void;
  isProcessing: boolean;
}

export const ImageEditor: React.FC<ImageEditorProps> = ({ image, onClose, onGenerate, isProcessing }) => {
  const [lighting, setLighting] = useState<LightingOption>('default');
  const [blur, setBlur] = useState<BlurOption>('default');
  const [color, setColor] = useState<ColorOption>('default');
  const [customPrompt, setCustomPrompt] = useState('');

  const handleGenerateClick = () => {
    onGenerate({ lighting, blur, color, customPrompt });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-[90vh] md:h-[800px]">
        <div className="flex-1 bg-gray-100 relative flex items-center justify-center p-8">
          <div className="relative shadow-lg max-h-full max-w-full">
            <img src={image.url} alt="Editing" className="max-h-[70vh] max-w-full object-contain rounded-lg" />
            <div className="absolute top-4 left-4 bg-black/60 text-white px-3 py-1 rounded-full text-xs font-medium backdrop-blur-md">原始图片</div>
          </div>
        </div>
        <div className="w-full md:w-96 bg-white p-6 flex flex-col border-l border-gray-200 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">高级编辑</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><i className="fa-solid fa-xmark text-2xl"></i></button>
          </div>
          <div className="space-y-8 flex-grow">
            <div>
              <label className="block text-sm font-bold text-gray-900 mb-3 flex items-center gap-2"><i className="fa-regular fa-sun"></i> 光照风格</label>
              <div className="grid grid-cols-2 gap-2">
                {[{ id: 'default', label: '默认', icon: 'fa-ban' }, { id: 'warm', label: '暖光温馨', icon: 'fa-mug-hot' }, { id: 'cool', label: '冷光清爽', icon: 'fa-snowflake' }, { id: 'studio', label: '专业影棚', icon: 'fa-camera' }].map((opt) => (
                  <button key={opt.id} onClick={() => setLighting(opt.id as LightingOption)} className={`py-3 px-2 rounded-lg text-sm font-medium border transition-all flex flex-col items-center gap-1 ${lighting === opt.id ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}><i className={`fa-solid ${opt.icon}`}></i>{opt.label}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-900 mb-3 flex items-center gap-2"><i className="fa-solid fa-droplet"></i> 背景虚化 (景深)</label>
              <div className="grid grid-cols-3 gap-2">
                {[{ id: 'default', label: '默认' }, { id: 'strong', label: '强虚化' }, { id: 'sharp', label: '全清晰' }].map((opt) => (
                  <button key={opt.id} onClick={() => setBlur(opt.id as BlurOption)} className={`py-2 px-2 rounded-lg text-xs font-medium border transition-all ${blur === opt.id ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{opt.label}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-900 mb-3 flex items-center gap-2"><i className="fa-solid fa-palette"></i> 色彩饱和度</label>
              <div className="grid grid-cols-3 gap-2">
                {[{ id: 'default', label: '默认' }, { id: 'vivid', label: '鲜艳' }, { id: 'soft', label: '柔和' }].map((opt) => (
                  <button key={opt.id} onClick={() => setColor(opt.id as ColorOption)} className={`py-2 px-2 rounded-lg text-xs font-medium border transition-all ${color === opt.id ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{opt.label}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-900 mb-2 flex items-center gap-2"><i className="fa-solid fa-comment-dots"></i> 额外微调指令 (可选)</label>
              <textarea value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} placeholder="例如：让地板看起来更像木质..." className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none h-20" />
            </div>
          </div>
          <div className="pt-6 mt-auto border-t border-gray-100">
            <button onClick={handleGenerateClick} disabled={isProcessing} className={`w-full py-3.5 rounded-xl font-bold text-white shadow-lg transition-all ${isProcessing ? 'bg-gray-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95 shadow-indigo-200'}`}>
              {isProcessing ? <span className="flex items-center justify-center gap-2"><i className="fa-solid fa-circle-notch fa-spin"></i> 正在微调...</span> : <span className="flex items-center justify-center gap-2"><i className="fa-solid fa-wand-magic-sparkles"></i> 确认生成</span>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
