import React, { useState, useRef } from 'react';
import { Icons } from './Icons';

interface ImageLightboxProps {
  imageUrl: string;
  altText: string;
  onClose: () => void;
  onDownload: () => void;
}

const ImageLightbox: React.FC<ImageLightboxProps> = ({ imageUrl, altText, onClose, onDownload }) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  
  const containerRef = useRef<HTMLDivElement>(null);

  const handleZoomToggle = () => {
    if (scale > 1) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    } else {
      setScale(2.5);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale === 1) return;
    setIsDragging(true);
    setStartPos({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || scale === 1) return;
    setPosition({
      x: e.clientX - startPos.x,
      y: e.clientY - startPos.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md animate-fade-in">
      {/* Toolbar */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10">
        <h3 className="text-white/80 font-medium ml-2">{altText}</h3>
        <div className="flex gap-4">
          <button 
            onClick={onDownload}
            className="p-2 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors"
            title="下载图片"
          >
            <Icons.Download className="w-5 h-5" />
          </button>
          <button 
            onClick={onClose}
            className="p-2 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors"
            title="关闭"
          >
            <Icons.X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Image Container */}
      <div 
        className="relative w-full h-full flex items-center justify-center overflow-hidden cursor-move"
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <img 
          src={imageUrl} 
          alt={altText}
          style={{ 
            transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
            transition: isDragging ? 'none' : 'transform 0.3s ease-out',
            maxWidth: '90%',
            maxHeight: '90%'
          }}
          className="object-contain select-none"
          draggable={false}
        />
      </div>

      {/* Bottom Controls */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4">
        <button 
          onClick={handleZoomToggle}
          className="flex items-center gap-2 px-6 py-3 bg-white text-gray-900 rounded-full font-semibold shadow-xl hover:bg-gray-100 transition-transform active:scale-95"
        >
          {scale === 1 ? (
            <>
              <Icons.ZoomIn className="w-5 h-5" />
              <span>放大细节</span>
            </>
          ) : (
            <>
              <Icons.Maximize className="w-5 h-5" />
              <span>还原</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default ImageLightbox;
