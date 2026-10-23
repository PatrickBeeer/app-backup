import React, { useState, useCallback, useRef } from 'react';
import { PlatformService } from '../../types';
import { CameraState, GenerationSettings } from './types';
import { VectorControl } from './components/VectorControl';
import { LinearControl } from './components/LinearControl';
import { generateNewPerspective } from './services/geminiService';
import { cacheGeneratedAsset } from '../../shared_services/localGeneratedAssetCache';

const APP_ID = 'ai-camera-scheduler';
const IMAGE_COST = 10;

interface AiCameraSchedulerAppProps {
  platform: PlatformService;
}

export const AiCameraSchedulerApp: React.FC<AiCameraSchedulerAppProps> = ({ platform }) => {
  // State
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Settings
  const [settings, setSettings] = useState<GenerationSettings>({
    resolution: '1K',
    eyeContact: false,
  });

  // Camera Control State
  const [cameraState, setCameraState] = useState<CameraState>({
    rotationX: 0,
    rotationY: 0,
    moveX: 0,
    moveZ: 0,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Image Upload Handlers
  const handleImageUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      setOriginalImage(reader.result as string);
      setGeneratedImage(null);
      setError(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleImageUpload(e.target.files[0]);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files?.[0]) handleImageUpload(e.dataTransfer.files[0]);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = () => {
    setIsDragOver(false);
  };

  const currentImageCost = IMAGE_COST;

  const handleGenerate = async () => {
    if (!originalImage) return;

    await platform.refreshCredits?.();

    if (!platform.checkBalance(currentImageCost)) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const resultUrl = await generateNewPerspective(originalImage, cameraState, settings);
      setGeneratedImage(resultUrl);
      cacheGeneratedAsset({ appId: APP_ID, source: resultUrl });

      await platform.refreshCredits?.();
    } catch (err: any) {
      console.error(err);
      setError(err.message || '生成失败，请重试。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="animate-fade-in flex h-[calc(100vh-120px)] bg-slate-50 text-slate-800 overflow-hidden font-sans">
      {/* LEFT SIDEBAR - CONTROLS */}
      <aside className="w-[420px] bg-white border-r border-slate-200 flex flex-col h-full overflow-hidden shrink-0">
        
        {/* Sidebar Header */}
        <div className="p-5 border-b border-slate-200 bg-white/50 backdrop-blur shrink-0 z-10 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent flex items-center gap-2">
                <span className="text-2xl">📷</span>
                AI相机调度器
              </h1>
            </div>
          </div>
          <button
            onClick={platform.onBack}
            className="flex items-center text-slate-700 hover:text-blue-600 transition-colors font-medium py-1.5 px-2 rounded-lg hover:bg-slate-100 text-sm"
          >
            <span className="mr-2 text-lg">←</span> 返回控制台
          </button>
        </div>

        {/* Scrollable Controls Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          
          {/* Upload / Original Image Thumbnail */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">源图像</label>
            
            {!originalImage ? (
              <div 
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={`border-2 border-dashed rounded-xl h-32 flex flex-col items-center justify-center transition-colors cursor-pointer relative
                  ${isDragOver ? 'border-blue-500 bg-blue-900/20' : 'border-slate-300 hover:border-slate-600 bg-slate-850'}`}
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={onFileChange} 
                  className="absolute inset-0 opacity-0 cursor-pointer" 
                  accept="image/*" 
                />
                <span className="text-2xl mb-2">☁️</span>
                <span className="text-xs text-slate-600">点击或拖拽上传图片</span>
              </div>
            ) : (
              <div className="relative group rounded-xl overflow-hidden border border-slate-300 bg-slate-100">
                <img src={originalImage} alt="Source" className="w-full h-48 object-contain bg-white" />
                <button 
                  onClick={() => { setOriginalImage(null); setGeneratedImage(null); }}
                  className="absolute top-2 right-2 bg-black/60 hover:bg-red-600 text-white p-2 rounded-lg backdrop-blur transition-colors min-h-[44px] min-w-[44px]"
                  title="移除图片"
                >
                  🗑️
                </button>
              </div>
            )}
          </div>

          {/* Generation Settings */}
          <div className="space-y-4 pt-2 border-t border-slate-200">
             <div className="bg-slate-100 border border-slate-300 rounded-lg px-3 py-2">
               <label className="text-[10px] text-slate-500 block mb-1">分辨率</label>
               <select 
                  value={settings.resolution}
                  onChange={(e) => setSettings(p => ({...p, resolution: e.target.value as GenerationSettings['resolution']}))}
                  className="w-full bg-transparent text-sm text-slate-800 outline-none border-none p-0 cursor-pointer"
               >
                 <option value="1K">1K 标准</option>
                 <option value="2K">2K 高清</option>
                 <option value="4K">4K 超清</option>
               </select>
               <p className="text-[10px] text-slate-500 mt-1">固定单模型通道，单次生成 {currentImageCost} 积分</p>
             </div>

             {/* Eye Contact Toggle */}
             <div className="flex items-center justify-between bg-slate-850 border border-slate-300 rounded-lg px-3 py-3">
                 <div className="flex items-center gap-2">
                    <span className={`text-lg ${settings.eyeContact ? 'text-blue-500' : 'text-slate-500'}`}>
                      {settings.eyeContact ? '👁️' : '👁️‍🗨️'}
                    </span>
                    <span className="text-sm text-slate-700">眼神追踪摄像机</span>
                 </div>
                 <button 
                    onClick={() => setSettings(p => ({...p, eyeContact: !p.eyeContact}))}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                      settings.eyeContact ? 'bg-blue-600' : 'bg-slate-200'
                    }`}
                    role="switch"
                    aria-checked={settings.eyeContact}
                 >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        settings.eyeContact ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                 </button>
             </div>
          </div>

          {/* Camera Controls */}
          <div className="space-y-6 pt-2 border-t border-slate-200">
             <div className="flex justify-between items-center">
               <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">相机参数</label>
               <button 
                 onClick={() => setCameraState({ rotationX: 0, rotationY: 0, moveX: 0, moveZ: 0 })} 
                 className="text-[10px] text-blue-500 hover:underline min-h-[44px]"
               >
                 重置所有
               </button>
             </div>

             <VectorControl 
                label="三维云台 (Orbit)"
                x={cameraState.rotationX}
                y={cameraState.rotationY}
                onChange={(x, y) => setCameraState(prev => ({ ...prev, rotationX: x, rotationY: y }))}
             />

             <LinearControl 
                label="水平位移 (Truck)"
                value={-cameraState.moveX} 
                onChange={(val) => setCameraState(prev => ({ ...prev, moveX: -val }))}
                minLabel="向右移"
                maxLabel="向左移"
             />

             <LinearControl 
                label="前后推进 (Dolly)"
                value={cameraState.moveZ}
                onChange={(val) => setCameraState(prev => ({ ...prev, moveZ: val }))}
                minLabel="后退/拉远"
                maxLabel="前进/拉近"
             />
          </div>

        </div>

        {/* Sidebar Footer / Action */}
        <div className="p-5 border-t border-slate-200 bg-white shrink-0">
          {error && (
              <div className="mb-3 text-xs text-red-400 bg-red-900/20 p-2 rounded border border-red-900/50">
                {error}
              </div>
          )}
          <button
              onClick={handleGenerate}
              disabled={isLoading || !originalImage}
              className={`w-full py-3.5 rounded-xl font-bold text-sm shadow-lg transform transition-all flex flex-col items-center justify-center gap-0.5 min-h-[44px]
                  ${isLoading 
                      ? 'bg-slate-100 text-slate-500 cursor-not-allowed' 
                      : 'bg-blue-600 hover:bg-blue-500 text-white hover:scale-[1.02] active:scale-[0.98]'
                  }`}
          >
              {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin">⏳</span>
                      正在渲染...
                  </span>
              ) : (
                  <>
                    <span className="flex items-center justify-center gap-2">
                        ✨
                        生成新视角
                    </span>
                    <span className="text-[10px] font-normal opacity-70">
                      消耗 {currentImageCost} 积分
                    </span>
                  </>
              )}
          </button>
        </div>
      </aside>

      {/* RIGHT MAIN AREA - PREVIEW */}
      <main className="flex-1 bg-black relative flex flex-col">
        <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-slate-50">
          {generatedImage ? (
            <img 
              src={generatedImage} 
              alt="Rendered Result" 
              className="max-w-full max-h-full object-contain shadow-2xl" 
            />
          ) : (
            <div className="text-center text-slate-600 space-y-4">
              <div className="inline-block p-6 rounded-full bg-white border border-slate-200">
                <span className="text-4xl opacity-30">📦</span>
              </div>
              <p className="text-sm font-medium opacity-50">等待渲染生成</p>
            </div>
          )}

          {/* Loading Overlay */}
          {isLoading && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4">
                <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                <div className="text-center">
                  <p className="text-blue-400 font-bold text-lg animate-pulse">AI 正在计算光影与透视</p>
                  <p className="text-slate-600 text-sm mt-1">这可能需要几秒钟...</p>
                </div>
            </div>
          )}
        </div>

        {/* Bottom Bar (Download/Info) */}
        {generatedImage && !isLoading && (
           <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur border border-white/10 px-6 py-3 rounded-2xl flex items-center gap-6 shadow-2xl">
              <div className="text-xs text-slate-600 font-mono">
                {settings.resolution}
              </div>
              <div className="h-4 w-px bg-slate-200"></div>
              <a 
                href={generatedImage} 
                download={`ai-cam-${Date.now()}.png`}
                className="text-white hover:text-blue-400 transition-colors flex items-center gap-2 text-sm font-medium min-h-[44px]"
              >
                ⬇️
                下载原图
              </a>
           </div>
        )}
      </main>
    </div>
  );
};

