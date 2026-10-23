import React, { useState, useRef } from 'react';
import { AppProps } from '../../types';
import ControlPanel from './components/ControlPanel';
import StoryboardGrid from './components/StoryboardGrid';
import Toast, { ToastMessage } from './components/Toast';
import { analyzeScriptToShots, generateShotImage } from './services/geminiService';
import { cacheGeneratedAsset } from '../../shared_services/localGeneratedAssetCache';
import { Shot, GenerationStatus, AspectRatio } from './types';
import { Clapperboard } from 'lucide-react';

const APP_ID = 'ai-script-to-storyboard-master';

export const AIScriptToStoryboardMasterApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [script, setScript] = useState<string>('');
  const [shots, setShots] = useState<Shot[]>([]);
  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [currentAspectRatio, setCurrentAspectRatio] = useState<AspectRatio>('16:9');
  
  // UI State
  const [toast, setToast] = useState<ToastMessage | null>(null);
  
  // Ref to control the generation loop
  const stopSignalRef = useRef<boolean>(false);
  
  // --- Rate Limiting ---
  const RATE_LIMIT_DELAY_MS = 4000; // 4 seconds delay between requests
  const imageCost = costs?.GENERATE_IMAGE ?? 8;

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ id: Date.now().toString(), type, message });
  };

  // Helper for delay
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Function to process image generation queue
  const processImageQueue = async (initialShots: Shot[], aspectRatio: AspectRatio) => {
    setStatus(GenerationStatus.GENERATING_IMAGES);
    stopSignalRef.current = false; 
    
    const shotsToProcess = initialShots.filter(s => !s.imageUrl);
    
    // 检查余额（不扣除）
    const totalCost = shotsToProcess.length * imageCost;
    if (!platform.checkBalance(totalCost)) {
      setStatus(GenerationStatus.COMPLETED);
      return; // 余额不足会自动显示充值弹窗
    }

    const currentShots = [...initialShots];
    
    // Counter for rate limit pacing
    let processedCount = 0;

    for (let i = 0; i < currentShots.length; i++) {
        if (currentShots[i].imageUrl) continue; 

        if (stopSignalRef.current) {
            showToast('error', '已停止生成');
            break;
        }

        currentShots[i].isGeneratingImage = true;
        setShots([...currentShots]);

        try {
            // Generate a random seed for the initial batch as well
            const seed = Math.floor(Math.random() * 1000000);
            const base64Image = await generateShotImage(currentShots[i], aspectRatio, seed);
            currentShots[i].imageUrl = base64Image;
            
            processedCount++;
        } catch (err) {
            console.error(`Failed to generate image for shot ${currentShots[i].id}`);
            // Don't toast for every error in a loop, just log it
        } finally {
            currentShots[i].isGeneratingImage = false;
            setShots([...currentShots]); 
        }

        // Add delay to avoid rate limits (skip delay if it's the last one)
        // Only apply delay if we actually processed an image
        if (i < currentShots.length - 1 && !stopSignalRef.current) {
            await delay(RATE_LIMIT_DELAY_MS);
        }
    }
    
    setStatus(GenerationStatus.COMPLETED);
    await platform.refreshCredits?.();
    if (!stopSignalRef.current) {
        showToast('success', '所有画面绘制完成');
    }
  };

  const handleStopGeneration = () => {
    stopSignalRef.current = true;
  };

  const handleGenerateSingleImage = async (shot: Shot) => {
    // 检查余额（不扣除）
    if (!platform.checkBalance(imageCost)) {
      return; // 余额不足会自动显示充值弹窗
    }

    const updatedShots = shots.map(s => s.id === shot.id ? { ...s, isGeneratingImage: true } : s);
    setShots(updatedShots);

    try {
        // IMPORTANT: Generate a new random seed for retries to ensure variation
        const newSeed = Math.floor(Math.random() * 1000000000);
        console.log(`Retrying shot ${shot.id} with seed: ${newSeed}`);
        
        const base64Image = await generateShotImage(shot, currentAspectRatio, newSeed);

        setShots(prev => prev.map(s => s.id === shot.id ? { ...s, imageUrl: base64Image, isGeneratingImage: false } : s));
        await platform.refreshCredits?.();
        showToast('success', shot.imageUrl ? `镜头 #${shot.id} 重绘成功 (Variant: ${newSeed % 100})` : `镜头 #${shot.id} 绘制成功`);
    } catch (err) {
         setShots(prev => prev.map(s => s.id === shot.id ? { ...s, isGeneratingImage: false } : s));
         showToast('error', `镜头 #${shot.id} 重绘失败`);
    }
  };

  const handleGenerateAllImages = () => {
      processImageQueue(shots, currentAspectRatio);
  };

  const handleAnalyze = async (panelCount: number, aspectRatio: AspectRatio) => {
    setStatus(GenerationStatus.ANALYZING);
    setShots([]);
    setCurrentAspectRatio(aspectRatio);
    stopSignalRef.current = false;

    try {
      const { shots: analyzedShots } = await analyzeScriptToShots(script, panelCount);
      setShots(analyzedShots);
      setStatus(GenerationStatus.COMPLETED);
      showToast('success', '剧本分析完成，请检查分镜列表');
    } catch (error) {
      console.error(error);
      const msg = error instanceof Error ? error.message : "未知错误";
      showToast('error', `分析失败: ${msg}`);
      setStatus(GenerationStatus.ERROR);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-gray-50 text-slate-800 overflow-hidden selection:bg-amber-500/30 font-sans">
        <Toast toast={toast} onClose={() => setToast(null)} />

        {/* Mobile Warning */}
        <div className="md:hidden fixed inset-0 z-50 bg-white flex items-center justify-center p-6 text-center">
            <p className="text-gray-600">请使用大屏设备以获得最佳制片体验。</p>
        </div>

        {/* Top Navbar */}
        <header className="h-14 border-b border-gray-200 flex items-center px-4 bg-white z-20 shrink-0 shadow-sm">
            <button
              onClick={platform.onBack}
              className="flex items-center text-gray-600 hover:text-slate-900 transition-colors font-medium py-1.5 px-2 rounded-lg hover:bg-gray-100 mr-4"
            >
              <span className="mr-2 text-lg">←</span> 返回控制台
            </button>
            <div className="flex items-center gap-2 text-amber-600">
                <Clapperboard className="w-6 h-6" />
                <h1 className="font-bold text-xl tracking-tighter">AI Storyboard <span className="text-gray-500 font-normal text-sm">Pro</span></h1>
            </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
            <ControlPanel 
                script={script}
                setScript={setScript}
                onAnalyze={handleAnalyze}
                onStop={handleStopGeneration}
                status={status}
            />
            <StoryboardGrid 
                shots={shots} 
                status={status}
                aspectRatio={currentAspectRatio}
              imageCost={imageCost}
              onGenerateSingle={handleGenerateSingleImage}
                onGenerateAll={handleGenerateAllImages}
            />
        </div>
    </div>
  );
};

