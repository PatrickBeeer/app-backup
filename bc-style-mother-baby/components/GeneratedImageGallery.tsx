import React, { useState } from 'react';

interface GeneratedImageGalleryProps {
  images: string[];
  texts: Record<string, string>;
}

export const GeneratedImageGallery: React.FC<GeneratedImageGalleryProps> = ({ images, texts }) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const handleDownload = (e: React.MouseEvent, imageUrl: string, index: number) => {
    e.stopPropagation();
    const timestamp = Date.now();
    const filename = `bc-母婴场景图-${index + 1}-${timestamp}.png`;
    
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
    
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 lg:gap-8 p-2">
        {images.map((img, index) => (
          <div 
            key={index} 
            className="group relative overflow-hidden rounded-2xl shadow-lg bg-slate-100 aspect-square hover:shadow-2xl transition-all duration-500 ring-4 ring-slate-200 cursor-zoom-in"
            onClick={() => setSelectedImage(img)}
          >
            <img src={img} alt={`Generated scene ${index + 1}`} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
            
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 backdrop-blur-sm flex flex-col items-center justify-center">
              <div className="mb-4 text-white opacity-0 group-hover:opacity-100 transform translate-y-4 group-hover:translate-y-0 transition-all duration-500">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
              </div>
              <button
                onClick={(e) => handleDownload(e, img, index)}
                className="transform translate-y-4 group-hover:translate-y-0 transition-transform duration-500 delay-75 bg-white/90 backdrop-blur-md text-slate-900 font-bold py-3 px-8 rounded-full flex items-center gap-2 hover:bg-white hover:scale-105 shadow-xl min-h-[44px]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                {texts.download}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox Modal */}
      {selectedImage && (
        <div 
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md animate-fade-in"
            onClick={() => setSelectedImage(null)}
        >
            <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center">
                <button 
                    onClick={() => setSelectedImage(null)}
                    className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                <img 
                    src={selectedImage} 
                    alt="Full size" 
                    className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl ring-1 ring-white/20"
                    onClick={(e) => e.stopPropagation()} 
                />
                <button
                    onClick={(e) => {
                        // Find index of selected image for filename
                        const idx = images.indexOf(selectedImage);
                        handleDownload(e, selectedImage, idx);
                    }}
                    className="mt-6 bg-white text-slate-900 font-bold py-3 px-8 rounded-full flex items-center gap-2 hover:bg-blue-50 transition-colors shadow-lg min-h-[44px]"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    {texts.download}
                </button>
            </div>
        </div>
      )}
    </>
  );
};

