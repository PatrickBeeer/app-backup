import React from 'react';
import { GeneratedImage } from '../types';

interface GeneratedImageCardProps {
  image: GeneratedImage;
  onZoom: (imageUrl: string) => void;
}

const GeneratedImageCard: React.FC<GeneratedImageCardProps> = ({ image, onZoom }) => (
  <div className="bg-white/60 backdrop-blur-md border border-white/40 rounded-[2rem] shadow-xl overflow-hidden flex flex-col h-full">
    <div className="p-4 bg-indigo-50/50 border-b border-white/40">
      <h3 className="text-lg font-semibold text-black tracking-tight" aria-label={`图片场景: ${image.alt}`}>{image.alt}</h3>
    </div>
    <div className="relative w-full h-64 sm:h-80 md:h-96 flex-grow">
      <img
        src={image.url}
        alt={image.alt}
        className="w-full h-full object-cover"
        loading="lazy"
      />
    </div>
    <div className="p-4 flex justify-around space-x-2">
      <button
        onClick={() => onZoom(image.url)}
        className="flex-1 flex items-center justify-center py-2 px-4 rounded-2xl shadow-lg text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-400 transition-all ease-in-out duration-200"
        aria-label="放大图片"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        放大
      </button>
      <a
        href={image.url}
        download={`${image.alt}.png`}
        className="flex-1 flex items-center justify-center py-2 px-4 rounded-2xl shadow-lg text-sm font-medium text-white bg-black hover:bg-gray-800 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black transition-all ease-in-out duration-200"
        aria-label="下载图片"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        下载
      </a>
    </div>
  </div>
);

export default GeneratedImageCard;

