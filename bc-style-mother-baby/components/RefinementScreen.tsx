import React, { useState, useRef } from 'react';
import { ToyAnalysis, ModelAge, ToyCategory, AspectRatio } from '../types';
import { ModelAgeSelector } from './ModelAgeSelector';
import { ProductTypeSelector } from './ProductTypeSelector';
import { AspectRatioSelector } from './AspectRatioSelector';
import { ImageUploader } from './ImageUploader';

interface RefinementScreenProps {
  analysis: ToyAnalysis | null;
  setAnalysis: (analysis: ToyAnalysis) => void;
  originalImage: string | null;
  modelAge: ModelAge;
  setModelAge: (age: ModelAge) => void;
  productCategory: ToyCategory;
  setProductCategory: (category: ToyCategory) => void;
  aspectRatio: AspectRatio;
  setAspectRatio: (ratio: AspectRatio) => void;
  onGenerate: () => void;
  onReupload: (file: File) => void;
  onImageUpload: (file: File) => void;
  isGenerating: boolean;
  isAnalyzing: boolean;
  texts: Record<string, string>;
}

export const RefinementScreen: React.FC<RefinementScreenProps> = ({
  analysis,
  setAnalysis,
  originalImage,
  modelAge,
  setModelAge,
  productCategory,
  setProductCategory,
  aspectRatio,
  setAspectRatio,
  onGenerate,
  onReupload,
  onImageUpload,
  isGenerating,
  isAnalyzing,
  texts
}) => {
  const [newFeature, setNewFeature] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleRemoveFeature = (indexToRemove: number) => {
    if (isGenerating || !analysis) return;
    const updatedFeatures = analysis.features.filter((_, index) => index !== indexToRemove);
    setAnalysis({ ...analysis, features: updatedFeatures });
  };

  const handleAddFeature = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isGenerating || !analysis) return;
    if (e.key === 'Enter' && newFeature.trim()) {
      const updatedFeatures = [...analysis.features, newFeature.trim()];
      setAnalysis({ ...analysis, features: updatedFeatures });
      setNewFeature('');
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      onReupload(event.target.files[0]);
    }
  };

  // Determine button state
  const isButtonDisabled = isGenerating || isAnalyzing || !originalImage || !analysis;
  
  let buttonText = texts.generateButton;
  if (isAnalyzing) buttonText = texts.analyzing;
  else if (isGenerating) buttonText = texts.generating;
  else if (!originalImage) buttonText = "请先上传图片";

  return (
    <div className="grid lg:grid-cols-2 gap-6 lg:gap-8 items-stretch min-h-[600px]">
        {/* Left Column: Input Source (Uploader or Product Info) */}
        <div className="h-full">
            {!originalImage ? (
                <ImageUploader onImageUpload={onImageUpload} texts={texts} />
            ) : (
                <div className={`flex flex-col h-full bg-white/80 backdrop-blur-2xl border border-slate-200 rounded-2xl p-6 md:p-8 shadow-xl transition-all duration-500 ${isGenerating ? 'opacity-80 pointer-events-none grayscale-[0.2]' : 'hover:shadow-2xl'}`}>
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <h2 className="text-xl font-bold text-slate-900">{texts.refinementTitle}</h2>
                    </div>

                    {/* Image with Reupload Overlay */}
                    <div className="relative rounded-xl overflow-hidden shadow-lg border-2 border-slate-300 mb-6 bg-slate-100/50 aspect-video flex items-center justify-center group shrink-0">
                        <img src={originalImage} alt="Uploaded Product" className="w-full h-full object-cover" />
                        
                        {/* Loading Overlay */}
                        {isAnalyzing && (
                             <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-20">
                                 <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                             </div>
                        )}

                        {/* Reupload Overlay (only when not analyzing/generating) */}
                        {!isAnalyzing && !isGenerating && (
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-sm z-10">
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileChange}
                                    accept="image/png, image/jpeg, image/webp"
                                    className="hidden"
                                />
                                <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="bg-white/90 text-slate-900 font-bold py-2 px-6 rounded-full hover:bg-white hover:scale-105 transition-all shadow-lg flex items-center gap-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                    更换图片
                                </button>
                            </div>
                        )}
                    </div>
                    
                    {/* Info Area - Switches between Content and Skeleton */}
                    <div className="space-y-5 flex-grow">
                        {isAnalyzing || !analysis ? (
                            // Skeleton Loading State
                            <div className="space-y-4 animate-pulse">
                                <div className="h-8 bg-slate-200/50 rounded-lg w-3/4"></div>
                                <div className="space-y-2">
                                    <div className="h-4 bg-slate-200/50 rounded w-full"></div>
                                    <div className="h-4 bg-slate-200/50 rounded w-5/6"></div>
                                    <div className="h-4 bg-slate-200/50 rounded w-4/6"></div>
                                </div>
                                <div className="pt-4 border-t border-slate-300/20">
                                    <div className="flex gap-2">
                                        <div className="h-8 w-20 bg-slate-200/50 rounded-xl"></div>
                                        <div className="h-8 w-24 bg-slate-200/50 rounded-xl"></div>
                                        <div className="h-8 w-16 bg-slate-200/50 rounded-xl"></div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            // Actual Content
                            <>
                                <div className="space-y-2">
                                    <h3 className="text-3xl font-black text-slate-900 tracking-tight">
                                        {analysis.name}
                                    </h3>
                                    <p className="text-slate-600 font-medium leading-relaxed">
                                        {analysis.description}
                                    </p>
                                </div>
                                
                                <div className="pt-4 border-t border-slate-300/50">
                                    <h4 className="flex items-center gap-2 font-bold text-slate-600 text-xs uppercase tracking-wider mb-3">
                                        {texts.features}
                                    </h4>
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        {analysis.features.map((feature, index) => (
                                            <button 
                                                key={index} 
                                                onClick={() => handleRemoveFeature(index)}
                                                disabled={isGenerating}
                                                className="group inline-flex items-center px-4 py-2 rounded-xl text-sm font-semibold bg-slate-100 text-slate-700 border border-slate-300 shadow-sm backdrop-blur-sm hover:bg-red-900/30 hover:text-red-400 hover:border-red-800 transition-all cursor-pointer disabled:cursor-not-allowed"
                                            >
                                                {feature}
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 ml-2 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                        ))}
                                    </div>
                                    <input
                                        type="text"
                                        value={newFeature}
                                        onChange={(e) => setNewFeature(e.target.value)}
                                        onKeyDown={handleAddFeature}
                                        disabled={isGenerating}
                                        placeholder={texts.addFeaturePlaceholder}
                                        className="w-full px-4 py-3 bg-slate-100 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all disabled:opacity-50"
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
        
        {/* Right Column: Settings Glass Card */}
        <div className="flex flex-col h-full bg-white/80 backdrop-blur-2xl border border-slate-200 rounded-2xl p-6 md:p-8 shadow-xl transition-all duration-500 hover:shadow-2xl">
            {/* Header */}
            <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                </div>
                <h2 className="text-xl font-bold text-slate-900">配置参数</h2>
            </div>

            <div className={`space-y-8 flex-grow ${isGenerating || isAnalyzing || !originalImage ? 'opacity-60 pointer-events-none' : ''}`}>
                <ProductTypeSelector selectedCategory={productCategory} setSelectedCategory={setProductCategory} texts={texts} />
                
                <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent"></div>
                
                <ModelAgeSelector selectedAge={modelAge} setSelectedAge={setModelAge} texts={texts} />

                <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent"></div>

                <AspectRatioSelector selectedRatio={aspectRatio} setSelectedRatio={setAspectRatio} texts={texts} />
            </div>
            
            <div className="mt-8 pt-8">
                <button
                onClick={onGenerate}
                disabled={isButtonDisabled}
                className={`group w-full relative bg-gradient-to-r from-blue-600 to-indigo-600 text-slate-900 font-bold py-5 px-8 rounded-xl shadow-xl shadow-blue-500/20 transition-all duration-300 overflow-hidden
                    ${isButtonDisabled ? 'cursor-not-allowed opacity-50' : 'hover:shadow-blue-500/40 hover:-translate-y-1 hover:scale-[1.01]'}`}
                >
                    {!isButtonDisabled && <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>}
                    
                    <span className="relative flex items-center justify-center gap-3 text-lg tracking-wide">
                        {(isGenerating || isAnalyzing) ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-slate-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                {buttonText}
                            </>
                        ) : (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                                {buttonText}
                            </>
                        )}
                    </span>
                </button>
            </div>
        </div>
    </div>
  );
};

