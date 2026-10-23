import React, { useState, useRef } from 'react';
import { Settings, Upload, Wand2, Play, Square, Trash2 } from 'lucide-react';
import { generateScriptFromIdea } from '../services/geminiService';
import { AspectRatio, GenerationStatus } from '../types';

interface ControlPanelProps {
  script: string;
  setScript: (s: string) => void;
  onAnalyze: (panelCount: number, aspectRatio: AspectRatio) => void;
  onStop: () => void;
  status: GenerationStatus;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ 
    script, setScript, onAnalyze, onStop, status
}) => {
  const [panelCount, setPanelCount] = useState<number>(0); // 0 = Auto
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [ideaInput, setIdeaInput] = useState('');
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setScript(event.target.result as string);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleAiScriptGen = async () => {
    if (!ideaInput.trim()) return;
    setIsGeneratingScript(true);
    try {
      const generated = await generateScriptFromIdea(ideaInput);
      setScript(generated);
    } catch (e) {
      alert("生成剧本失败，请稍后重试");
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const renderActionButton = () => {
    if (status === GenerationStatus.ANALYZING) {
      return (
        <button
          disabled
          className="w-full py-3 px-4 rounded-lg font-bold text-sm tracking-wide flex items-center justify-center gap-2 bg-gray-200 text-gray-500 cursor-wait border border-gray-300"
        >
          <div className="animate-spin w-4 h-4 border-2 border-gray-400 border-t-slate-700 rounded-full"/>
          <span>导演思考中...</span>
        </button>
      );
    }

    if (status === GenerationStatus.GENERATING_IMAGES) {
      return (
        <button
          onClick={onStop}
          className="w-full py-3 px-4 rounded-lg font-bold text-sm tracking-wide flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white border border-red-700 shadow-lg transition-all"
        >
          <Square className="w-4 h-4 fill-current" />
          <span>停止生图</span>
        </button>
      );
    }

    // IDLE, COMPLETED, or ERROR
    return (
      <button
        onClick={() => onAnalyze(panelCount, aspectRatio)}
        disabled={!script.trim()}
        className={`
          w-full py-3 px-4 rounded-lg font-bold text-sm tracking-wide flex items-center justify-center gap-2
          transition-all duration-200 border
          ${!script.trim() 
            ? 'bg-gray-200 text-gray-400 border-gray-300 cursor-not-allowed' 
            : 'bg-amber-600 hover:bg-amber-700 border-amber-700 text-white shadow-lg shadow-amber-900/20'}
        `}
      >
        <Play className="w-4 h-4 fill-current" />
        <span>生成分镜表</span>
      </button>
    );
  };

  return (
    <div className="w-full md:w-80 lg:w-96 bg-white border-r border-gray-200 flex flex-col h-full overflow-hidden shrink-0 shadow-sm">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center gap-2 text-amber-600">
        <Settings className="w-5 h-5" />
        <h2 className="font-bold text-lg tracking-wide text-slate-800">制片控制台</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {/* Settings Section */}
        <section className="space-y-4">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-2">
            分镜参数
          </label>
          
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-5">
            {/* Panel Count */}
            <div>
                <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-slate-700">镜头数量</span>
                <span className="text-[10px] font-mono text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                    {panelCount === 0 ? "AI AUTO" : `${panelCount} SHOTS`}
                </span>
                </div>
                <input
                type="range"
                min="0"
                max="24"
                step="1"
                value={panelCount}
                onChange={(e) => setPanelCount(Number(e.target.value))}
                className="w-full h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-amber-600 hover:accent-amber-500"
                />
            </div>

            {/* Aspect Ratio */}
            <div>
                <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-slate-700">画面比例</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {(['16:9', '9:16', '4:3', '3:4', '1:1'] as AspectRatio[]).map((ratio) => (
                        <button
                            key={ratio}
                            onClick={() => setAspectRatio(ratio)}
                            className={`
                                py-1.5 text-[10px] font-medium rounded border transition-colors
                                ${aspectRatio === ratio 
                                    ? 'bg-amber-600 border-amber-700 text-white' 
                                    : 'bg-white border-gray-300 text-slate-700 hover:bg-gray-50'}
                            `}
                        >
                            {ratio}
                        </button>
                    ))}
                </div>
            </div>
          </div>
        </section>

        {/* Script Input Section */}
        <section className="space-y-3 flex flex-col h-full min-h-[300px]">
           <div className="flex justify-between items-end">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                剧本来源
              </label>
              <div className="flex gap-2">
                 {script && (
                    <button 
                      onClick={() => setScript('')}
                      className="text-gray-500 hover:text-red-600 transition-colors"
                      title="清空剧本"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                 )}
                 <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="text-gray-500 hover:text-slate-800 transition-colors"
                  title="上传 TXT"
                >
                  <Upload className="w-4 h-4" />
                </button>
              </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".txt,.md" 
              onChange={handleFileUpload}
            />
           </div>

          {/* AI Script Writer */}
          <div className="bg-gray-50 p-2 rounded-lg border border-gray-200 space-y-2">
             <div className="flex gap-2">
               <input 
                 type="text" 
                 value={ideaInput}
                 onChange={(e) => setIdeaInput(e.target.value)}
                 placeholder="输入创意（如：赛博朋克面馆的雨夜）"
                 className="flex-1 bg-white border border-gray-200 rounded px-2 py-1 text-sm text-slate-800 placeholder-gray-400 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
               />
               <button 
                onClick={handleAiScriptGen}
                disabled={isGeneratingScript || !ideaInput}
                className="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-slate-700 p-1.5 rounded transition-colors"
                title="AI 生成剧本"
               >
                 {isGeneratingScript ? <div className="animate-spin w-4 h-4 border-2 border-gray-400 border-t-slate-700 rounded-full"/> : <Wand2 className="w-4 h-4" />}
               </button>
             </div>
          </div>

          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder="在此粘贴剧本，或使用上方工具生成..."
            className="flex-1 w-full bg-white border border-gray-200 rounded-lg p-3 text-sm text-slate-800 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 resize-none font-mono leading-relaxed placeholder-gray-400"
          />
        </section>
      </div>

      {/* Action */}
      <div className="p-4 border-t border-gray-200 bg-white z-10">
        {renderActionButton()}
      </div>
    </div>
  );
};

export default ControlPanel;

