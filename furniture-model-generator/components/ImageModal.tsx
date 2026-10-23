import React from 'react';

interface ImageModalProps {
  imageUrl: string;
  onClose: () => void;
}

export const ImageModal: React.FC<ImageModalProps> = ({ imageUrl, onClose }) => {
  return (
    <div 
      className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button 
        className="absolute top-4 right-4 text-white text-4xl font-bold z-50 hover:text-red-400 transition-colors"
        onClick={onClose}
        aria-label="Close image view"
      >
        &times;
      </button>
      <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <img src={imageUrl} alt="Enlarged view" className="max-w-full max-h-full object-contain rounded-lg" />
      </div>
    </div>
  );
};

