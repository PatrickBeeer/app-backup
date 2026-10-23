import React, { useState } from 'react';

interface GeneratedImageDisplayProps {
  imageUrls: string[] | null;
  isLoading: boolean;
  error: string | null;
  aspectRatio: string;
}

const Placeholder = () => (
    <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 p-8 min-h-[400px]">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 mb-6 text-slate-300 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.572L16.5 21.75l-.398-1.178a3.375 3.375 0 00-2.456-2.456L12.5 17.25l1.178-.398a3.375 3.375 0 002.456-2.456L16.5 13.5l.398 1.178a3.375 3.375 0 002.456 2.456l1.178.398-1.178.398a3.375 3.375 0 00-2.456 2.456z" />
        </svg>
        <h3 className="text-2xl font-bold text-slate-800 tracking-tight">生成结果将在此处展示</h3>
        <p className="mt-2 text-md max-w-sm text-slate-600">在左侧完成设置，即可开始您的第一次创作。</p>
    </div>
);

const ErrorDisplay = ({ message }: { message: string }) => (
    <div className="flex flex-col items-center justify-center h-full text-center text-red-700 p-4">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="text-xl font-semibold">生成失败</h3>
        <p className="mt-2 text-md max-w-sm">{message}</p>
    </div>
);

const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
  </svg>
);

const ZoomIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
  </svg>
);

const aspectRatioClasses: { [key: string]: string } = {
  '3:4': 'aspect-[3/4]',
  '1:1': 'aspect-square',
  '9:16': 'aspect-[9/16]',
  '16:9': 'aspect-[16/9]',
};

const SkeletonPlaceholder: React.FC<{ aspectRatio: string }> = ({ aspectRatio }) => {
    const aspectClass = aspectRatioClasses[aspectRatio] || 'aspect-[3/4]';
    return (
        <div className={`${aspectClass} w-full bg-slate-500/20 rounded-3xl animate-pulse`}></div>
    );
};

interface ImageItemProps {
  imageUrl: string;
  index: number;
  aspectRatio: string;
}

const ImageItem: React.FC<ImageItemProps> = ({ imageUrl, index, aspectRatio }) => {
  const aspectClass = aspectRatioClasses[aspectRatio] || 'aspect-[3/4]';
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [showControlsMobile, setShowControlsMobile] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [touchStartTime, setTouchStartTime] = useState<number>(0);
  const [isLongPress, setIsLongPress] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    // 如果触摸的是按钮，不处理
    if ((e.target as HTMLElement).closest('button, a')) {
      return;
    }
    
    const startTime = Date.now();
    setTouchStartTime(startTime);
    setIsLongPress(false);
    
    // 长按显示控制按钮（不打开全屏）
    const timer = setTimeout(() => {
      setIsLongPress(true);
      setShowControlsMobile(true);
    }, 500);
    setLongPressTimer(timer);
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const endTime = Date.now();
    const touchDuration = endTime - touchStartTime;
    
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    
    // 如果触摸的是按钮，不处理
    if ((e.target as HTMLElement).closest('button, a')) {
      return;
    }
    
    // 如果是长按，只显示控制按钮，不打开全屏
    if (isLongPress || touchDuration >= 500) {
      // 长按已经显示了控制按钮，不需要额外操作
      return;
    }
    
    // 短按（快速点击）：打开全屏查看
    if (touchDuration < 500) {
      setIsZoomed(true);
    }
  };

  const handleTouchCancel = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    setIsLongPress(false);
  };

  const handleDownload = (e: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    
    // 使用编程方式下载，避免文件名冲突
    const timestamp = Date.now();
    const filename = `ai-模特图-${index + 1}-${timestamp}.png`;
    
    // 创建临时链接并触发下载
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    
    // 延迟移除，确保下载开始
    setTimeout(() => {
      document.body.removeChild(link);
      // 移动端下载后隐藏控制按钮
      setShowControlsMobile(false);
    }, 100);
  };

  const handleZoom = (e: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsZoomed(true);
    // 移动端放大后隐藏控制按钮
    setShowControlsMobile(false);
  };

  const handleCloseZoom = () => {
    setIsZoomed(false);
  };

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // 如果点击的是按钮区域，不触发放大
    if ((e.target as HTMLElement).closest('button, a')) {
      return;
    }
    // 桌面端点击图片打开全屏
    setIsZoomed(true);
  };

  // 桌面端使用 hover，移动端使用长按显示
  const shouldShowControls = isHovering || showControlsMobile;

  return (
    <>
      <div
        className={`${aspectClass} w-full bg-black/5 dark:bg-black/20 rounded-xl overflow-hidden relative group shadow-lg cursor-pointer`}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        onClick={handleImageClick}
        onContextMenu={(e) => {
          // 阻止浏览器默认的长按菜单，使用我们的自定义下载功能
          e.preventDefault();
        }}
      >
        <img
          src={imageUrl}
          alt={`AI generated model ${index + 1}`}
          className="w-full h-full object-cover transition-transform duration-500 ease-in-out select-none"
          draggable={false}
          onContextMenu={(e) => {
            // 完全阻止浏览器默认的长按菜单
            e.preventDefault();
          }}
        />
        {/* 桌面端放大镜效果（仅桌面端显示） */}
        <div
          className="hidden md:block absolute top-0 left-0 w-32 h-32 border-4 border-white rounded-full pointer-events-none transition-opacity duration-300"
          style={{
            opacity: isHovering ? 1 : 0,
            transform: `translate(${mousePosition.x - 64}px, ${mousePosition.y - 64}px)`,
            backgroundImage: `url(${imageUrl})`,
            backgroundPosition: `-${mousePosition.x * 2 - 64}px -${mousePosition.y * 2 - 64}px`,
            backgroundSize: '200% 200%',
          }}
        />
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 md:group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
        {/* 控制按钮 - 桌面端 hover 显示，移动端长按显示（长按时不打开全屏） */}
        <div className={`absolute bottom-4 right-4 flex gap-2 transition-opacity duration-300 ${shouldShowControls ? 'opacity-100' : 'opacity-0 md:opacity-0'} z-20 pointer-events-auto`}>
          <button
            onClick={handleZoom}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleZoom(e);
            }}
            className="bg-white/95 text-gray-800 p-3 md:p-3 rounded-full shadow-xl hover:bg-white active:bg-white/90 transition-all duration-300 touch-manipulation min-w-[48px] min-h-[48px] flex items-center justify-center relative z-30"
            aria-label="放大图片"
          >
            <ZoomIcon />
          </button>
          <button
            onClick={handleDownload}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleDownload(e);
            }}
            className="bg-white/95 text-gray-800 p-3 md:p-3 rounded-full shadow-xl hover:bg-white active:bg-white/90 transition-all duration-300 touch-manipulation min-w-[48px] min-h-[48px] flex items-center justify-center relative z-30"
            aria-label="下载图片"
          >
            <DownloadIcon />
          </button>
        </div>
      </div>

      {/* Full-screen zoom modal */}
      {isZoomed && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={handleCloseZoom}
        >
          <button
            onClick={handleCloseZoom}
            onTouchEnd={(e) => {
              e.stopPropagation();
              handleCloseZoom();
            }}
            className="absolute top-4 right-4 text-white hover:text-gray-300 active:text-gray-400 transition-colors touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center p-2 z-10"
            aria-label="关闭"
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={imageUrl}
            alt={`AI generated model ${index + 1} - 放大视图`}
            className="max-w-full max-h-full object-contain select-none"
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};

export const GeneratedImageDisplay: React.FC<GeneratedImageDisplayProps> = ({ imageUrls, isLoading, error, aspectRatio }) => {
  const shouldShowContent = isLoading || error || (imageUrls && imageUrls.length > 0);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6">
          <SkeletonPlaceholder aspectRatio={aspectRatio} />
          <SkeletonPlaceholder aspectRatio={aspectRatio} />
        </div>
      );
    }
    if (error) {
      return <ErrorDisplay message={error} />;
    }
    if (imageUrls && imageUrls.length > 0) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
          {imageUrls.map((url, index) => (
            <ImageItem key={index} imageUrl={url} index={index} aspectRatio={aspectRatio} />
          ))}
        </div>
      );
    }
    return <Placeholder />;
  };

  if (!shouldShowContent) {
    return null;
  }

  return (
    <div className="w-full flex flex-col p-6 sm:p-8 bg-white/60 backdrop-blur-xl rounded-[2.5rem] shadow-2xl shadow-slate-400/10 border border-white/60 transition-all duration-300 hover:-translate-y-1">
      <div className="flex-grow">
        <h2 className="text-3xl font-bold mb-6 text-left text-slate-800 tracking-tight flex-shrink-0">生成结果</h2>
        <div className="w-full flex items-center justify-center">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};


