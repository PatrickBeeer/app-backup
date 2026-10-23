import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LayoutDashboard, Mic, Menu, X, ListTree } from 'lucide-react';
import TitleGenerator from './components/TitleGenerator';
import TextToAudio from './components/TextToAudio';
import TextToAudioV2 from './components/TextToAudioV2';
import TextToAudioV3 from './components/TextToAudioV3';
import TextToAudioQwenTTS from './components/TextToAudioQwenTTS';
import ScriptPlanner from './components/ScriptPlanner';
import ErrorBoundary from './components/ErrorBoundary';

type Tool = 'title' | 'audio' | 'audioV2' | 'audioV3' | 'audioQwenTTS' | 'script';

type ToolItem = {
  id: Tool;
  name: string;
  icon: ReactNode;
  hidden?: boolean;
};

function resolveInitialTool(): Tool {
  const tool = new URLSearchParams(window.location.search).get('tool');
  if (tool === 'audio-qwen-tts') {
    return 'audioQwenTTS';
  }
  if (tool === 'audio-v3') {
    return 'audioV3';
  }
  if (tool === 'audio-v2') {
    return 'audioV2';
  }
  return 'audioV3';
}

export default function App() {
  const [activeTool, setActiveTool] = useState<Tool>(resolveInitialTool);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const tools: ToolItem[] = [
    { id: 'audio', name: '文案转音频', icon: <Mic className="w-5 h-5" />, hidden: true },
    { id: 'audioV2', name: '文案转音频 V2', icon: <Mic className="w-5 h-5" />, hidden: true },
    { id: 'audioV3', name: '文案转音频 CosyVoice', icon: <Mic className="w-5 h-5" /> },
    { id: 'audioQwenTTS', name: '文案转音频 Qwen-TTS', icon: <Mic className="w-5 h-5" /> },
    { id: 'script', name: '剪辑规划与爆点提取', icon: <ListTree className="w-5 h-5" /> },
    { id: 'title', name: '封面标题生成', icon: <LayoutDashboard className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30 flex">
      {/* Background Effects */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-900/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-900/20 blur-[120px]" />
        <div className="absolute inset-0 opacity-20 mix-blend-overlay [background-image:radial-gradient(rgba(255,255,255,0.08)_0.8px,transparent_0.8px)] [background-size:3px_3px]" />
      </div>

      {/* Mobile Menu Toggle */}
      <button 
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      >
        {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Sidebar */}
      <aside 
        className={`fixed md:sticky top-0 left-0 z-40 h-screen w-64 bg-zinc-950/80 backdrop-blur-xl border-r border-zinc-800/50 flex flex-col transition-transform duration-300 ease-in-out ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="p-6">
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-blue-500 flex items-center justify-center">
              <span className="text-white text-sm font-black">AI</span>
            </div>
            剪辑工作台
          </h1>
        </div>

        <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
          {tools.filter((tool) => !tool.hidden).map((tool) => {
            const isActive = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                onClick={() => {
                  setActiveTool(tool.id);
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive 
                    ? 'bg-zinc-800/80 text-white shadow-sm border border-zinc-700/50' 
                    : 'text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200 border border-transparent'
                }`}
              >
                <div className={`${isActive ? 'text-emerald-400' : 'text-zinc-500'}`}>
                  {tool.icon}
                </div>
                <span className="font-medium text-sm">{tool.name}</span>
              </button>
            );
          })}
        </nav>

      </aside>

      {/* Mobile Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 relative z-10 w-full min-h-screen overflow-x-hidden">
        <div className="p-6 md:p-12 md:pt-20 pt-20">
          <ErrorBoundary>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTool}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {activeTool === 'title' && <TitleGenerator />}
                {activeTool === 'script' && <ScriptPlanner />}
                {activeTool === 'audio' && <TextToAudio />}
                {activeTool === 'audioV2' && <TextToAudioV2 />}
                {activeTool === 'audioV3' && <TextToAudioV3 />}
                {activeTool === 'audioQwenTTS' && <TextToAudioQwenTTS />}
              </motion.div>
            </AnimatePresence>
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
