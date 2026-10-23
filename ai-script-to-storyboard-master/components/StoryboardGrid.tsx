import React, { useState } from 'react';
import { AspectRatio, Shot } from '../types';
import ShotCard from './ShotCard';
import { Download, Images, Loader2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';

interface StoryboardGridProps {
  shots: Shot[];
  status: string;
  aspectRatio: AspectRatio;
  imageCost: number;
  onGenerateSingle: (shot: Shot) => void;
  onGenerateAll: () => void;
}

const StoryboardGrid: React.FC<StoryboardGridProps> = ({ 
    shots, status, aspectRatio, imageCost, onGenerateSingle, onGenerateAll
}) => {
  const [isZipping, setIsZipping] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  // Count how many shots need images
  const missingImagesCount = shots.filter(s => !s.imageUrl).length;

  // 1. Export entire board as a single screenshot image
  const handleExportScreenshot = async () => {
    const originalElement = document.getElementById('storyboard-canvas');
    if (!originalElement) return;

    setIsExporting(true);
    
    try {
      // CLONE METHOD:
      // We clone the element to render it off-screen with full height.
      // This bypasses any scrollbar clipping issues in the main view.
      const clone = originalElement.cloneNode(true) as HTMLElement;
      
      // Setup clone styles to ensure full capture
      clone.style.position = 'fixed';
      clone.style.top = '-10000px';
      clone.style.left = '0';
      clone.style.width = `${originalElement.clientWidth}px`; // Maintain width
      clone.style.height = 'auto'; // Force full height expansion
      clone.style.maxHeight = 'none';
      clone.style.overflow = 'visible';
      clone.style.zIndex = '-1000';
      
      document.body.appendChild(clone);

      const canvas = await html2canvas(clone, {
        backgroundColor: '#f9fafb', // Light background (gray-50)
        scale: 2, // High res
        ignoreElements: (element) => element.classList.contains('no-export'), // Exclude prompt areas
        useCORS: true,
        logging: false,
        windowWidth: clone.scrollWidth,
        windowHeight: clone.scrollHeight,
      });

      // Cleanup
      document.body.removeChild(clone);

      const link = document.createElement('a');
      link.download = `storyboard_full_${new Date().toISOString().slice(0,10)}.png`;
      link.href = canvas.toDataURL();
      link.click();
    } catch (e) {
      console.error("Export failed", e);
      alert("导出全览图失败");
    } finally {
      setIsExporting(false);
    }
  };

  // 2. Batch export individual clean images as ZIP
  const handleBatchExport = async () => {
    const imagesToExport = shots.filter(s => s.imageUrl);
    if (imagesToExport.length === 0) {
        alert("没有可导出的图片。请先生成分镜图。");
        return;
    }

    setIsZipping(true);
    try {
        const zip = new JSZip();
        // Create a folder inside the zip
        const folder = zip.folder("shots_clean");

        imagesToExport.forEach((shot) => {
            if (shot.imageUrl) {
                // The imageUrl is a base64 string: "data:image/png;base64,....."
                // We need to strip the prefix to get the raw data
                const base64Data = shot.imageUrl.split(',')[1];
                const fileName = `shot_${String(shot.id).padStart(2, '0')}_${shot.type}.png`;
                
                // Add file to zip folder
                folder?.file(fileName, base64Data, { base64: true });
            }
        });

        // Generate the zip file
        const content = await zip.generateAsync({ type: "blob" });
        
        // Trigger download
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `storyboard_batch_${new Date().toISOString().slice(0,19).replace(/[:T]/g, '-')}.zip`;
        link.click();

        // Clean up
        URL.revokeObjectURL(link.href);
    } catch (e) {
        console.error("Batch export failed", e);
        alert("打包下载失败，请重试。");
    } finally {
        setIsZipping(false);
    }
  };

  if (shots.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-8 text-center">
        <div className="w-24 h-24 mb-4 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-10 h-10 opacity-40" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM8 17h8v-2H8v2zm0-4h8v-2H8v2zm0-4h8v-2H8v2zm0-4h8V7H8v2z"/>
            </svg>
        </div>
        <h3 className="text-xl font-medium text-gray-600 mb-2">准备就绪</h3>
        <p className="max-w-md text-gray-500">
          在左侧输入剧本，点击"生成分镜表"即可开始AI导演工作流。
          <br/>支持自动拆解镜头、生成手绘草图与光影分析。
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-gray-50">
      {/* Toolbar */}
      <div className="h-14 border-b border-gray-200 flex items-center justify-between px-6 bg-white shadow-sm shrink-0 z-10">
        <div className="flex items-center gap-4">
          <h2 className="text-slate-800 font-semibold">分镜预览</h2>
          <span className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded-full border border-gray-200">
            共 {shots.length} 镜 / {aspectRatio}
          </span>
          {status === 'generating_images' && (
             <span className="text-xs text-amber-600 animate-pulse">
                正在绘制手绘草稿...
             </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
            
            {/* Main Generation Trigger */}
            {missingImagesCount > 0 && status !== 'generating_images' ? (
                <button 
                  onClick={onGenerateAll}
                  className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-md"
                >
                  <Images className="w-4 h-4" />
                  <span>一键绘制 ({missingImagesCount}) · {imageCost}积分/张</span>
                </button>
            ) : status === 'generating_images' ? (
                <button disabled className="flex items-center gap-2 bg-gray-200 text-gray-500 px-3 py-1.5 rounded-lg text-xs font-bold cursor-wait">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>绘制中...</span>
                </button>
            ) : (
                <>
                  <button 
                    onClick={handleExportScreenshot}
                    disabled={isExporting}
                    className="flex items-center gap-2 bg-white hover:bg-gray-50 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border border-gray-300 shadow-sm"
                  >
                    {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Images className="w-4 h-4" />}
                    <span>{isExporting ? '生成中...' : '导出全览图'}</span>
                  </button>
                  <button 
                    onClick={handleBatchExport}
                    disabled={isZipping}
                    className="flex items-center gap-2 bg-white hover:bg-gray-50 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border border-gray-300 shadow-sm disabled:opacity-50"
                  >
                    {isZipping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    <span>{isZipping ? '打包中...' : '打包下载 (ZIP)'}</span>
                  </button>
                </>
            )}
        </div>
      </div>

      {/* Content Grid Container */}
      {/* Outer div handles scrolling */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300">
        {/* Inner div is the capture target for html2canvas. 
            It contains padding and the grid, and expands to full height. */}
        <div id="storyboard-canvas" className="p-4 md:p-6 min-h-full bg-gray-50">
            <div className={`grid gap-4 md:gap-6 pb-20 
            ${aspectRatio === '9:16' ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5' : 
                'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`}
            >
            {shots.map((shot) => (
                <div key={shot.id} className="h-full">
                    <ShotCard 
                        shot={shot} 
                        aspectRatio={aspectRatio} 
                      imageCost={imageCost}
                      onGenerateSingle={onGenerateSingle} 
                      isBatchGenerating={status === 'generating_images'}
                    />
                </div>
            ))}
            </div>
        </div>
      </div>
    </div>
  );
};

export default StoryboardGrid;

