import React, { useState } from 'react';
import { Download, ImageIcon, Maximize2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface GeneratedImageViewerProps {
  imageUrls: string[];
  isGenerating: boolean;
}

export const GeneratedImageViewer: React.FC<GeneratedImageViewerProps> = ({ imageUrls, isGenerating }) => {
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);

  const handleDownload = async (url: string) => {
    if (!url) return;

    const fileName = `merchandise-visual-${Date.now()}.png`;

    // Prefer direct URL/data URL download to avoid insecure blob URL warnings on HTTP deployments.
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.rel = 'noopener';
      link.referrerPolicy = 'no-referrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    } catch (directError) {
      console.warn('Direct download failed, falling back to fetch download.', directError);
    }

    // Fallback for rare browser cases where direct download is blocked.
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const reader = new FileReader();
      reader.onload = () => {
        const link = document.createElement('a');
        link.href = String(reader.result || '');
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      };
      reader.readAsDataURL(blob);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const handleDownloadAll = async () => {
    for (const url of imageUrls) {
      await handleDownload(url);
      // Small delay between downloads to avoid browser blocking
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  };

  return (
    <div className="glass-panel h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between p-6 border-b border-white/40">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-black text-white rounded-xl">
            <ImageIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-black tracking-tight">预览 / PREVIEW</h3>
            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-widest">Generated Output ({imageUrls.length})</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {imageUrls.length > 0 && (
            <>
              {imageUrls.length > 1 && (
                <button
                  onClick={handleDownloadAll}
                  className="btn-primary flex items-center gap-2 py-2 px-4 text-xs bg-emerald-600 border-emerald-600 hover:bg-emerald-700"
                >
                  <Download className="w-3.5 h-3.5" />
                  全部下载 / ALL
                </button>
              )}
              {imageUrls.length === 1 && (
                <button
                  onClick={() => handleDownload(imageUrls[0])}
                  className="btn-primary flex items-center gap-2 py-2 px-4 text-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  下载 / DOWNLOAD
                </button>
              )}
            </>
          )}
          {isGenerating && (
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
              继续生成中...
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 relative bg-black/5 overflow-y-auto p-8">
        {imageUrls.length > 0 ? (
          <div className={`grid gap-6 w-full h-full ${
            imageUrls.length === 1 ? 'grid-cols-1' : 
            imageUrls.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 
            'grid-cols-1 md:grid-cols-2'
          }`}>
            {imageUrls.map((url, index) => (
              <div key={index} className="relative group aspect-square flex items-center justify-center bg-white/20 rounded-2xl overflow-hidden border border-white/40 shadow-sm">
                <img
                  src={url}
                  alt={`Generated visual ${index + 1}`}
                  className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-[1.05] cursor-zoom-in"
                  onClick={() => setSelectedImageUrl(url)}
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                  <button
                    onClick={() => setSelectedImageUrl(url)}
                    className="p-3 bg-white text-black rounded-xl shadow-xl hover:scale-110 transition-transform"
                    title="放大预览"
                  >
                    <Maximize2 className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDownload(url)}
                    className="p-3 bg-white text-black rounded-xl shadow-xl hover:scale-110 transition-transform"
                    title="下载此图"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                </div>
                <div className="absolute top-4 left-4 px-3 py-1 bg-black/60 backdrop-blur-md text-white text-[10px] font-black rounded-full">
                  方案 {index + 1}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-16 h-16 bg-white/40 backdrop-blur-md rounded-[2rem] flex items-center justify-center mx-auto border border-white/60">
              <ImageIcon className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-400">
              {isGenerating ? '正在生成您的视觉设计...' : '上传图片并选择场景以开始生成'}
            </p>
          </div>
        )}
      </div>

      {/* Zoom Modal */}
      <AnimatePresence>
        {selectedImageUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 md:p-12"
            onClick={() => setSelectedImageUrl(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-full max-h-full"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={selectedImageUrl}
                alt="Zoomed visual"
                className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
                referrerPolicy="no-referrer"
              />
              <div className="absolute top-4 right-4 flex gap-2">
                <button
                  onClick={() => handleDownload(selectedImageUrl)}
                  className="p-3 bg-white text-black rounded-2xl shadow-2xl hover:scale-105 transition-transform"
                  title="下载图片"
                >
                  <Download className="w-6 h-6" />
                </button>
                <button
                  onClick={() => setSelectedImageUrl(null)}
                  className="p-3 bg-white text-black rounded-2xl shadow-2xl hover:scale-105 transition-transform"
                  title="关闭"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
