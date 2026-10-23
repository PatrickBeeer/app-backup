
import React, { useState } from 'react';
import JSZip from 'jszip';
import type { XiaohongshuPost } from '../types';
import { CopyIcon } from './icons/CopyIcon';
import { CheckIcon } from './icons/CheckIcon';
import { ImageModal } from './ImageModal';
import { DownloadAllIcon } from './icons/DownloadAllIcon';
import { ChevronLeftIcon } from './icons/ChevronLeftIcon';
import { ChevronRightIcon } from './icons/ChevronRightIcon';
import { ResultsPlaceholder } from './ResultsPlaceholder';
import { ResultsSkeleton } from './ResultsSkeleton';

interface ContentDisplayProps {
    content: XiaohongshuPost | null;
    isLoading: boolean;
    error: string | null;
    onReset: () => void;
    onRetry: () => void;
}

const CopyButton: React.FC<{ textToCopy: string }> = ({ textToCopy }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button 
            onClick={handleCopy} 
            className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-400 dark:text-gray-500"
            aria-label="复制"
        >
            {copied ? <CheckIcon className="w-4 h-4 text-green-500" /> : <CopyIcon className="w-4 h-4" />}
        </button>
    );
};

export const ContentDisplay: React.FC<ContentDisplayProps> = ({ content, isLoading, error, onReset, onRetry }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);

    const openModal = (imgSrc: string) => {
        setSelectedImage(imgSrc);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setSelectedImage(null);
    };
    
    if (isLoading) {
        return <ResultsSkeleton />;
    }
    
    if (error) {
        return (
           <div className="flex-grow flex flex-col items-center justify-center text-center p-8">
               <p className="text-red-500 mb-4">{error}</p>
               <button
                   onClick={onRetry}
                   className="px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
               >
                   再试一次
               </button>
           </div>
       );
    }
    
    if (!content) {
        return <ResultsPlaceholder />;
    }

    const { title, body, hashtags, images } = content;
    const normalizedHashtags = hashtags.map(tag => `#${tag.trim().replace(/^#+/, '')}`);

    const handleBatchDownload = async () => {
        const zip = new JSZip();
        const textContent = `【标题】\n${title}\n\n【正文】\n${body}\n\n【话题标签】\n${normalizedHashtags.join(' ')}`;
        zip.file("文案.txt", textContent.trim());
        images.forEach((img, i) => {
            const base64Data = img.split(',')[1];
            zip.file(`水晶能量图-${i + 1}.png`, base64Data, { base64: true });
        });
        const blob = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "水晶能量爆款内容包.zip";
        link.click();
        URL.revokeObjectURL(link.href);
    };

    const nextImage = () => setCurrentImageIndex((prev) => (prev + 1) % images.length);
    const prevImage = () => setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);

    return (
        <>
            <div className="p-6 md:p-8 animate-fade-in relative flex-grow flex flex-col">
                <div className="absolute top-4 right-4 z-10">
                    <button
                        onClick={handleBatchDownload}
                        className="flex items-center px-3 py-1.5 bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200 rounded-full text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                        <DownloadAllIcon className="w-4 h-4 mr-1.5" />
                        打包下载
                    </button>
                </div>

                {images && images.length > 0 && (
                    <div className="mb-4 relative">
                        <div className="aspect-[3/4] rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
                             <img 
                                src={images[currentImageIndex]} 
                                alt={`Generated image ${currentImageIndex + 1}`} 
                                className="w-full h-full object-cover cursor-pointer"
                                onClick={() => openModal(images[currentImageIndex])}
                            />
                        </div>
                        {images.length > 1 && (
                            <>
                                <button onClick={prevImage} className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/40 text-white rounded-full hover:bg-black/60 transition-colors">
                                    <ChevronLeftIcon className="w-5 h-5"/>
                                </button>
                                <button onClick={nextImage} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/40 text-white rounded-full hover:bg-black/60 transition-colors">
                                    <ChevronRightIcon className="w-5 h-5"/>
                                </button>
                                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex space-x-2">
                                    {images.map((_, index) => (
                                        <div key={index} className={`w-2 h-2 rounded-full ${index === currentImageIndex ? 'bg-white' : 'bg-white/40'}`}></div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}
                
                <div className="space-y-4 flex-grow">
                    <div>
                        <div className="flex items-start justify-between">
                            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 pr-2">{title}</h2>
                            <CopyButton textToCopy={title} />
                        </div>
                    </div>

                    <div>
                        <div className="flex items-start justify-between">
                            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed pr-2">{body}</p>
                            <CopyButton textToCopy={body} />
                        </div>
                    </div>

                    <div>
                        <div className="flex items-start justify-between">
                            <div className="flex flex-wrap gap-2 pr-2">
                                {normalizedHashtags.map((tag, index) => (
                                    <span key={index} className="text-red-500 dark:text-red-400">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                            <CopyButton textToCopy={normalizedHashtags.join(' ')} />
                        </div>
                    </div>
                </div>
                
                 <div className="text-center mt-8">
                    <button
                        onClick={onReset}
                        className="px-6 py-2 bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200 font-semibold rounded-full shadow-sm hover:bg-gray-200 dark:hover:bg-gray-600 transform transition-all duration-300"
                    >
                        ✨ 创作一组新的
                    </button>
                </div>
            </div>
            {isModalOpen && selectedImage && <ImageModal imageUrl={selectedImage} onClose={closeModal} />}
        </>
    );
};
