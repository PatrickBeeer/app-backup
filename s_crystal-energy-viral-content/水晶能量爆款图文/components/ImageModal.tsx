
import React, { useEffect } from 'react';
import { CloseIcon } from './icons/CloseIcon';

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
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fade-in"
            onClick={onClose}
            aria-modal="true"
            role="dialog"
        >
            <div 
                className="relative max-w-4xl max-h-[90vh] w-full h-full"
                onClick={(e) => e.stopPropagation()} // Prevent closing when clicking on the image itself
            >
                <img src={imageUrl} alt="Enlarged view" className="object-contain w-full h-full"/>
                <button 
                    onClick={onClose}
                    className="absolute -top-2 -right-2 md:top-2 md:right-2 text-white bg-black/50 rounded-full p-2 hover:bg-black/80 transition-colors"
                    aria-label="关闭预览"
                >
                    <CloseIcon className="w-6 h-6" />
                </button>
            </div>
        </div>
    );
};
