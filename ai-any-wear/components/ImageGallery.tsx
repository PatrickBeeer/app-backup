

import React from 'react';
import { GeneratedImage } from '../types';

interface ImageGalleryProps {
  images: GeneratedImage[];
}

const ImageGallery: React.FC<ImageGalleryProps> = ({ images }) => {
  if (images.length === 0) {
    return (
      <div className="w-full text-center text-gray-600 p-8 border border-dashed border-white/40 rounded-xl bg-white/20 transition-all duration-300">
        这里将显示生成的穿戴图片。
      </div>
    );
  }

  const getGridColsClass = (count: number) => {
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-1 md:grid-cols-2';
    if (count === 4) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2'; // 2x2 for desktop
    return 'grid-cols-1';
  };

  return (
    <div className={`grid gap-4 ${getGridColsClass(images.length)} w-full`}>
      {images.map((image, index) => (
        <div key={index} className="relative bg-white/40 border border-white/40 rounded-3xl overflow-hidden shadow-lg transition-all duration-300">
          <img
            src={image.url}
            alt={image.alt}
            className="w-full h-auto object-cover"
            loading="lazy"
          />
          {/* Download Button */}
          <a
            href={image.url}
            download={`穿戴图_${index + 1}.png`} // Suggest a filename
            className="absolute bottom-2 right-2 p-2 bg-black bg-opacity-60 text-white rounded-full hover:bg-opacity-80 transition-opacity flex items-center justify-center"
            title="下载图片"
            aria-label={`下载生成的穿戴图 ${index + 1}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </a>
        </div>
      ))}
    </div>
  );
};

export default ImageGallery;