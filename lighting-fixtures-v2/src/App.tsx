/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Maximize2, 
  Download, 
  Heart,
  Video,
  Camera,
  LayoutGrid,
  Menu,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Home
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { MainImageGenerator } from './components/MainImageGenerator';
import { LightingStudioGenerator } from './components/LightingStudioGenerator';
import { XiaohongshuGenerator } from './components/XiaohongshuGenerator';
import { VideoGenerator } from './components/VideoGenerator';
import { RealSceneTester } from './components/RealSceneTester';
import { STYLE_PRESETS } from './constants';
import { AspectRatio, Resolution } from './types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [activeTab, setActiveTab] = useState('main-image');
  const [isNavCollapsed, setIsNavCollapsed] = useState(false);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState(STYLE_PRESETS[0].id);
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [resolution, setResolution] = useState<Resolution>('2K');
  const [generatedImages, setGeneratedImages] = useState<(string | null)[]>([null, null, null, null, null]);
  const [generatingStates, setGeneratingStates] = useState<boolean[]>([false, false, false, false, false]);
  const [errorStates, setErrorStates] = useState<(string | null)[]>([null, null, null, null, null]);
  const [showFullImage, setShowFullImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setReferenceImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setReferenceImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const generateImageAtIndex = async (index: number) => {
    // Moved to MainImageGenerator
  };

  const startRendering = async () => {
    // Moved to MainImageGenerator
  };

  const handleDownload = (img: string) => {
    if (!img) return;
    const link = document.createElement('a');
    link.href = img;
    link.download = `lumina-render-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const navItems = [
    { id: 'lighting', name: '灯具影棚', icon: Camera },
    { id: 'real-scene', name: '实景试灯', icon: Home },
    { id: 'main-image', name: '主图生成', icon: LayoutGrid },
    { id: 'xiaohongshu', name: '小红书种草', icon: Heart },
    { id: 'video', name: '视频生成', icon: Video },
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#f0f2f5] font-sans text-text-deep antialiased">
      {/* Navigation Sidebar */}
      <motion.nav
        initial={false}
        animate={{ width: isNavCollapsed ? 80 : 240 }}
        className="glass-panel relative z-30 flex flex-col border-r border-white/40 bg-white/60 backdrop-blur-xl transition-all duration-300"
      >
        <div className="flex h-20 items-center justify-between px-6">
          {!isNavCollapsed && (
            <motion.span 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xl font-black tracking-tighter text-black"
            >
              灯具AI工作台
            </motion.span>
          )}
          <button 
            onClick={() => setIsNavCollapsed(!isNavCollapsed)}
            className="rounded-xl p-2 text-text-cool hover:bg-black/5 hover:text-text-deep transition-colors"
          >
            {isNavCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>

        <div className="flex-1 space-y-2 px-3 py-6">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              title={isNavCollapsed ? item.name : undefined}
              className={cn(
                "group relative flex w-full items-center gap-4 rounded-2xl p-4 transition-all duration-300",
                activeTab === item.id 
                  ? "bg-black text-white shadow-xl" 
                  : "text-text-cool hover:bg-black/5 hover:text-text-deep",
                isNavCollapsed && "justify-center px-0"
              )}
            >
              <item.icon size={20} className={cn(activeTab === item.id ? "text-white" : "text-text-cool group-hover:text-text-deep")} />
              {!isNavCollapsed && (
                <motion.span 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-sm font-bold tracking-tight"
                >
                  {item.name}
                </motion.span>
              )}
            </button>
          ))}
        </div>

        <div className="p-4">
          <div className={cn(
            "rounded-2xl bg-black/5 p-4 transition-all",
            isNavCollapsed && "flex items-center justify-center p-2"
          )}>
            {!isNavCollapsed ? (
              <>
                <p className="text-[10px] font-bold uppercase tracking-widest text-text-cool/60">当前版本</p>
                <p className="text-xs font-bold text-text-deep">v2.4.0 Pro</p>
              </>
            ) : (
              <p className="text-[10px] font-bold text-text-deep">v2.4</p>
            )}
          </div>
        </div>
      </motion.nav>

      {/* Main Content Area */}
      <div className="relative flex flex-1 overflow-hidden">
        {activeTab === 'main-image' ? (
          <MainImageGenerator
            referenceImage={referenceImage}
            setReferenceImage={setReferenceImage}
            selectedStyle={selectedStyle}
            setSelectedStyle={setSelectedStyle}
            prompt={prompt}
            setPrompt={setPrompt}
            aspectRatio={aspectRatio}
            setAspectRatio={setAspectRatio}
            resolution={resolution}
            setResolution={setResolution}
            generatedImages={generatedImages}
            setGeneratedImages={setGeneratedImages}
            generatingStates={generatingStates}
            setGeneratingStates={setGeneratingStates}
            errorStates={errorStates}
            setErrorStates={setErrorStates}
            setShowFullImage={setShowFullImage}
            handleDownload={handleDownload}
          />
        ) : activeTab === 'lighting' ? (
          <LightingStudioGenerator
            referenceImage={referenceImage}
            setReferenceImage={setReferenceImage}
            selectedStyle={selectedStyle}
            setSelectedStyle={setSelectedStyle}
            prompt={prompt}
            setPrompt={setPrompt}
            aspectRatio={aspectRatio}
            setAspectRatio={setAspectRatio}
            resolution={resolution}
            setResolution={setResolution}
            setShowFullImage={setShowFullImage}
            handleDownload={handleDownload}
          />
        ) : activeTab === 'real-scene' ? (
          <RealSceneTester
            referenceImage={referenceImage}
            setReferenceImage={setReferenceImage}
            setShowFullImage={setShowFullImage}
            handleDownload={handleDownload}
          />
        ) : activeTab === 'xiaohongshu' ? (
          <XiaohongshuGenerator
            referenceImage={referenceImage}
            setReferenceImage={setReferenceImage}
            selectedStyle={selectedStyle}
            setSelectedStyle={setSelectedStyle}
            prompt={prompt}
            setPrompt={setPrompt}
            aspectRatio={aspectRatio}
            setAspectRatio={setAspectRatio}
            resolution={resolution}
            setResolution={setResolution}
            setShowFullImage={setShowFullImage}
            handleDownload={handleDownload}
          />
        ) : activeTab === 'video' ? (
          <VideoGenerator
            referenceImage={referenceImage}
            setReferenceImage={setReferenceImage}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center bg-[#f0f2f5]">
            <div className="glass-panel max-w-md p-12 text-center bg-white/60 backdrop-blur-xl rounded-[2rem] border border-white/40 shadow-2xl">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-black/5">
                <Sparkles className="h-10 w-10 text-black/20" />
              </div>
              <h2 className="mb-3 text-2xl font-bold tracking-tight text-text-deep">功能开发中</h2>
              <p className="mb-8 text-sm font-medium leading-relaxed text-text-cool">
                {navItems.find(i => i.id === activeTab)?.name} 功能正在全力研发中，敬请期待更多精彩特性。
              </p>
              <button 
                onClick={() => setActiveTab('main-image')}
                className="rounded-2xl bg-black px-8 py-4 text-sm font-bold text-white shadow-xl transition-all hover:scale-[1.02] active:scale-95"
              >
                返回主图生成
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Full Image Modal */}
      <AnimatePresence>
        {showFullImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 backdrop-blur-xl"
            onClick={() => setShowFullImage(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-h-full max-w-full overflow-hidden rounded-[2.5rem] bg-white/5 p-2 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <img 
                src={showFullImage} 
                alt="Full preview" 
                referrerPolicy="no-referrer"
                className="max-h-[85vh] w-auto object-contain rounded-[2rem]" 
              />
              <div className="mt-6 flex items-center justify-between px-4 pb-4">
                <div className="flex gap-4">
                  <button 
                    onClick={() => handleDownload(showFullImage)}
                    className="flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-bold text-black shadow-xl transition-all hover:scale-[1.02]"
                  >
                    <Download size={18} />
                    <span>下载高清原图</span>
                  </button>
                </div>
                <button 
                  onClick={() => setShowFullImage(null)}
                  className="rounded-2xl bg-white/10 p-3 text-white backdrop-blur-md hover:bg-white/20 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
