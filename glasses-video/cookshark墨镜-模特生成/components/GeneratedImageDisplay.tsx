import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Download, 
  ZoomIn, 
  Layers, 
  AlertCircle, 
  CheckCircle2, 
  X, 
  Share2, 
  Eye, 
  Sliders,
  Image as ImageIcon
} from 'lucide-react';

interface GeneratedImageDisplayProps {
  generations: string[][];
  activeGenerationIndex: number;
  setActiveGenerationIndex: (index: number) => void;
  isLoading: boolean;
  error: string | null;
  aspectRatio: string;
}

const aspectRatioClasses: { [key: string]: string } = {
  '3:4': 'aspect-[3/4]',
  '1:1': 'aspect-square',
  '9:16': 'aspect-[9/16]',
  '16:9': 'aspect-[16/9]',
};

const Placeholder = () => (
  <div className="flex flex-col items-center justify-center h-full text-center p-8 min-h-[440px] bg-zinc-950/60 rounded-2xl border border-zinc-800/80">
    <h3 className="text-xl font-bold text-zinc-100 tracking-tight">AI 模特试戴大片等待生成</h3>
    <p className="mt-2 text-xs text-zinc-400 max-w-sm leading-relaxed">
      在左侧选择或上传您的墨镜产品图，调整模特与场景设定，点击<span className="text-amber-400 font-semibold">“生成时尚大片”</span>即可展示。
    </p>
  </div>
);

const ErrorDisplay = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center h-full text-center text-rose-300 p-8 min-h-[400px] bg-rose-950/20 rounded-2xl border border-rose-900/40">
    <AlertCircle className="w-12 h-12 mb-3 text-rose-400" />
    <h3 className="text-lg font-bold">渲染发生异常</h3>
    <p className="mt-2 text-xs text-rose-300/80 max-w-sm">{message}</p>
  </div>
);

const SkeletonPlaceholder: React.FC<{ aspectRatio: string }> = ({ aspectRatio }) => {
  const aspectClass = aspectRatioClasses[aspectRatio] || 'aspect-[3/4]';
  return (
    <div className={`${aspectClass} w-full bg-zinc-900/90 border border-zinc-800 rounded-2xl animate-pulse flex flex-col items-center justify-center p-6 text-zinc-600`}>
      <Sparkles className="w-10 h-10 mb-3 text-amber-500/40 animate-bounce" />
      <span className="text-xs font-mono text-zinc-400">AI 光影与模特细致渲染中...</span>
    </div>
  );
};

export const GeneratedImageDisplay: React.FC<GeneratedImageDisplayProps> = ({ 
  generations, 
  activeGenerationIndex, 
  setActiveGenerationIndex, 
  isLoading, 
  error, 
  aspectRatio 
}) => {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);

  const activeGeneration = generations[activeGenerationIndex];

  useEffect(() => {
    setSelectedImageIndex(0);
  }, [activeGenerationIndex]);

  const renderContent = () => {
    if (isLoading && generations.length === 0) {
      return (
        <div className="flex flex-col items-center w-full max-w-lg mx-auto">
          <SkeletonPlaceholder aspectRatio={aspectRatio} />
          <div className="flex space-x-3 mt-4">
            <div className="w-16 h-16 bg-zinc-900 rounded-xl animate-pulse border border-zinc-800"></div>
            <div className="w-16 h-16 bg-zinc-900 rounded-xl animate-pulse border border-zinc-800"></div>
          </div>
        </div>
      );
    }
    if (error) {
      return <ErrorDisplay message={error} />;
    }
    if (activeGeneration && activeGeneration.length > 0) {
      const selectedImageUrl = activeGeneration[selectedImageIndex];
      const aspectClass = aspectRatioClasses[aspectRatio] || 'aspect-[3/4]';

      return (
        <div className="flex flex-col items-center w-full animate-fade-in">
          {/* Main Hero Showcase */}
          <div className={`${aspectClass} w-full max-w-lg mb-4 bg-zinc-950 rounded-2xl overflow-hidden relative group border border-zinc-800/80 shadow-2xl`}>
            <img 
              src={selectedImageUrl} 
              alt="AI generated model with eyewear"
              className="w-full h-full object-cover" 
            />

            {/* Hover Action Bar */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-between p-4">
              <div className="flex justify-end space-x-2">
                <span className="text-[10px] uppercase tracking-wider font-bold bg-amber-500/20 border border-amber-500/40 text-amber-300 px-2.5 py-1 rounded-full backdrop-blur-md">
                  4K 高清渲染
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-left text-xs">
                  <p className="text-white font-bold">酷鲨墨镜模特试戴图</p>
                  <p className="text-zinc-300 text-[11px]">方案候选 #{selectedImageIndex + 1}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setZoomedImageUrl(selectedImageUrl)}
                    className="p-2.5 bg-zinc-900/90 hover:bg-amber-500 text-white hover:text-black rounded-xl border border-zinc-700 transition-all shadow-lg"
                    title="查看高清大图"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  <a
                    href={selectedImageUrl}
                    download={`cookshark-model-image-${selectedImageIndex + 1}.png`}
                    className="p-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition-all shadow-lg flex items-center space-x-1"
                    title="下载高清原图"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Candidate Thumbnails */}
          <div className="flex items-center space-x-3 p-1.5 bg-zinc-950 rounded-xl border border-zinc-800">
            {activeGeneration.map((url, index) => (
              <button 
                key={index} 
                onClick={() => setSelectedImageIndex(index)}
                className={`w-16 h-16 rounded-lg overflow-hidden transition-all duration-200 relative ${
                  selectedImageIndex === index 
                    ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-zinc-950 scale-105' 
                    : 'opacity-50 hover:opacity-100'
                }`}
              >
                <img src={url} alt={`Candidate ${index + 1}`} className="w-full h-full object-cover" />
                <div className="absolute top-1 left-1 bg-black/60 text-[9px] font-bold text-white px-1 rounded">
                  #{index + 1}
                </div>
              </button>
            ))}
          </div>
        </div>
      );
    }
    return <Placeholder />;
  };

  return (
    <>
      {/* Zoom Modal */}
      {zoomedImageUrl && (
        <div 
          className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setZoomedImageUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
            <img 
              src={zoomedImageUrl} 
              alt="Zoomed result" 
              className="max-w-full max-h-[82vh] object-contain rounded-xl shadow-2xl border border-zinc-800" 
            />
            <div className="mt-3 flex items-center space-x-4 bg-zinc-900/90 px-4 py-2 rounded-xl border border-zinc-800">
              <a
                href={zoomedImageUrl}
                download="cookshark-model-hd.png"
                onClick={(e) => e.stopPropagation()}
                className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center space-x-1.5"
              >
                <Download className="w-4 h-4" />
                <span>下载 4K 超清大图</span>
              </a>
              <span className="text-zinc-600">|</span>
              <button
                onClick={() => setZoomedImageUrl(null)}
                className="text-xs text-zinc-400 hover:text-white"
              >
                关闭预览 (ESC)
              </button>
            </div>
          </div>
          <button
            onClick={() => setZoomedImageUrl(null)}
            className="absolute top-6 right-6 p-2 bg-zinc-900/80 text-zinc-400 hover:text-white rounded-full border border-zinc-800"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      )}

      {/* Main Display Panel */}
      <div className="w-full flex flex-col p-6 sm:p-8 bg-zinc-900/80 backdrop-blur-xl rounded-3xl border border-zinc-800/80 shadow-2xl">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-zinc-800">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full bg-amber-400"></div>
            <h2 className="text-lg font-bold text-zinc-100 tracking-tight">AI 试戴展示大屏</h2>
          </div>
          {generations.length > 0 && (
            <span className="text-xs text-zinc-400 bg-zinc-950 px-2.5 py-1 rounded-full border border-zinc-800">
              已生成 {generations.length} 组试戴方案
            </span>
          )}
        </div>

        <div className="w-full flex items-center justify-center">
          {renderContent()}
        </div>

        {/* History Stream */}
        {generations.length > 0 && (
          <div className="mt-8 pt-6 border-t border-zinc-800/80">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center space-x-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                <span>历史生成记录</span>
              </h3>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5">
              {generations.map((urls, index) => (
                <button
                  key={index}
                  onClick={() => setActiveGenerationIndex(index)}
                  className={`relative aspect-square rounded-xl overflow-hidden transition-all duration-200 border ${
                    activeGenerationIndex === index 
                      ? 'border-amber-400 ring-2 ring-amber-400/30 scale-105' 
                      : 'border-zinc-800 opacity-60 hover:opacity-100 hover:border-zinc-600'
                  }`}
                >
                  <img src={urls[0]} alt={`History ${index + 1}`} className="w-full h-full object-cover"/>
                  <div className="absolute top-1 left-1 bg-black/70 text-[9px] font-bold text-amber-300 px-1 rounded">
                    #{generations.length - index}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
};
