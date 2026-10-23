import React from 'react';

interface LightboxProps {
  imageUrl: string;
  onClose: () => void;
}

export const Lightbox: React.FC<LightboxProps> = ({ imageUrl, onClose }) => {
  return (
    <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <button 
        onClick={onClose}
        className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
      <img 
        src={imageUrl} 
        alt="Full screen preview" 
        className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()} 
      />
    </div>
  );
};

