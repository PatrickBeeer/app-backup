import React, { useEffect } from 'react';

interface ImageModalProps {
  imageUrl: string;
  onClose: () => void;
}

export const ImageModal: React.FC<ImageModalProps> = ({ imageUrl, onClose }) => {
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4 transition-opacity duration-300 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="放大的图片"
    >
      <div 
        className="relative max-w-4xl max-h-[90vh] animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <img src={imageUrl} alt="放大的图片" className="block max-w-full max-h-[90vh] rounded-2xl shadow-2xl" />
        <button 
          onClick={onClose}
          className="absolute -top-4 -right-4 h-10 w-10 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-slate-800 hover:bg-white hover:scale-110 transition-all shadow-lg"
          aria-label="关闭"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <style>{`
        @keyframes scale-in {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-scale-in {
          animation: scale-in 0.2s ease-out forwards;
        }
      `}</style>
    </div>
  );
};
