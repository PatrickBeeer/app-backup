import React from 'react';

interface ImageViewerProps {
  src: string;
  alt: string;
  title?: string;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({ src, alt, title }) => {
  // 添加调试：检查图片源
  React.useEffect(() => {
    console.log('ImageViewer rendered with src length:', src?.length);
    console.log('ImageViewer src preview:', src?.substring(0, 100));
  }, [src]);

  return (
    <div className="w-full">
      {title && <h3 className="text-lg font-semibold text-slate-700 mb-2">{title}</h3>}
      <div className="relative w-full bg-slate-100/50 rounded-lg overflow-hidden border border-slate-300">
        <img
          src={src}
          alt={alt}
          className="w-full h-auto object-contain max-h-96"
          onLoad={() => console.log('Image loaded successfully')}
          onError={(e) => console.error('Image load error:', e)}
        />
      </div>
    </div>
  );
};

