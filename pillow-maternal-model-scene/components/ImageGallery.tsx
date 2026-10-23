import React from 'react';
import DownloadIcon from './icons/DownloadIcon';
import PhotoIcon from './icons/PhotoIcon';

interface ImageGalleryProps {
  images: string[];
  isLoading: boolean;
}

const GalleryPlaceholder: React.FC = () => (
    <div className="relative aspect-square w-full bg-white/30 rounded-3xl overflow-hidden animate-pulse">
        <div className="absolute inset-0 bg-white/40"></div>
    </div>
);

const EmptyState: React.FC = () => (
    <div className="flex flex-col items-center justify-center aspect-square bg-white/30 rounded-[2.5rem] p-8 text-center border border-white/60">
        <PhotoIcon className="w-16 h-16 text-slate-400/70" />
        <h3 className="text-xl font-semibold text-slate-700 mt-4">等待生成图片</h3>
        <p className="text-slate-500 mt-2 max-w-xs">在左侧面板完成设置后，点击"生成图片"，您的作品将在此处展示。</p>
    </div>
);


const ImageGallery: React.FC<ImageGalleryProps> = ({ images, isLoading }) => {
  if (images.length === 0 && !isLoading) {
    return <EmptyState />;
  }
  const loadingPlaceholders = Array.from({ length: 2 });


  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-center text-slate-800 lg:text-left">生成的图片</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {isLoading && images.length === 0 && loadingPlaceholders.map((_, index) => <GalleryPlaceholder key={index} />)}
        {images.map((image, index) => (
          <div key={index} className="group relative aspect-square w-full bg-slate-200 rounded-3xl overflow-hidden shadow-xl shadow-purple-300/20 transform transition-transform duration-300 hover:scale-105">
            <img src={image} alt={`生成的图片 ${index + 1}`} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <a
                href={image}
                download={`生成的枕头图片-${index + 1}.png`}
                className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm text-slate-800 p-2 rounded-full shadow-md hover:bg-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black/50 focus:ring-purple-500"
              >
                <DownloadIcon className="w-5 h-5" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ImageGallery;

