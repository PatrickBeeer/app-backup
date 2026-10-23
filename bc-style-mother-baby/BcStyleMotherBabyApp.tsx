import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AppProps } from '../../types';
import { RefinementScreen } from './components/RefinementScreen';
import { GeneratedImageGallery } from './components/GeneratedImageGallery';
import { LoadingSpinner } from './components/LoadingSpinner';
import { analyzeToyImage, generateSceneImages } from './services/geminiService';
import { ToyAnalysis, Language, ModelAge, ToyCategory, AspectRatio } from './types';
import { UI_TEXTS, TOY_CATEGORIES } from './constants';
const language: Language = 'zh';

type AppStatus = 'idle' | 'analyzing' | 'refining' | 'generating' | 'results' | 'error';

export const BcStyleMotherBabyApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [modelAge, setModelAge] = useState<ModelAge>('0-1岁');
  const [productCategory, setProductCategory] = useState<ToyCategory>('其他');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [status, setStatus] = useState<AppStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ToyAnalysis | null>(null);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  
  const resultsRef = useRef<HTMLDivElement>(null);

  const texts = UI_TEXTS[language];

  const handleImageUpload = useCallback(async (file: File) => {
    setStatus('analyzing');
    setError(null);
    setAnalysis(null);
    setGeneratedImages([]);
    
    // Read image immediately for preview
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      try {
        const base64Image = (reader.result as string).split(',')[1];
        const mimeType = file.type;
        setOriginalImage(reader.result as string);

        // Perform analysis (no cost)
        const analysisResult = await analyzeToyImage(base64Image, mimeType, language);
        setAnalysis(analysisResult);
        
        if (analysisResult.category && TOY_CATEGORIES.includes(analysisResult.category)) {
          setProductCategory(analysisResult.category);
        } else {
          setProductCategory('其他');
        }
        
        setStatus('refining');
      } catch (err) {
        console.error(err);
        const errorText = texts.error;
        setError(err instanceof Error ? `${errorText}: ${err.message}` : errorText);
        setStatus('error');
      }
    };
    reader.onerror = () => {
        const errorText = texts.imageError;
        setError(errorText);
        setStatus('error');
    };
  }, [texts]);

  const handleGenerateImages = useCallback(async () => {
    if (!analysis || !originalImage) return;

    // Check balance before generating
    const totalCost = costs.GENERATE_SCENES;
    if (!platform.checkBalance(totalCost)) {
      return; // 余额不足会自动显示充值弹窗
    }

    setStatus('generating');
    setError(null);
    setGeneratedImages([]);
    
    // Scroll to results area slightly to show something is happening down there
    setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

    try {
        const base64Image = originalImage.split(',')[1];
        const mimeType = originalImage.substring(originalImage.indexOf(":") + 1, originalImage.indexOf(";"));
        
        // Generate 4 images
        const images = await generateSceneImages(
          analysis,
          language,
          modelAge,
          aspectRatio,
          base64Image,
          mimeType,
          ({ index, imageUrl }) => {
            setGeneratedImages((prev) => {
              const next = [...prev];
              next[index] = imageUrl;
              return next;
            });
          }
        );
        
        if (images.length === 4) {
          setGeneratedImages(images);
          await platform.refreshCredits?.();
          setStatus('results');
        } else {
          // Not all images generated, don't deduct credits
          setError(`生成失败：只成功生成了 ${images.length}/4 张图片，未扣除积分。请重试。`);
          setStatus('error');
        }
    } catch (err) {
        console.error(err);
        const errorText = texts.error;
        setError(err instanceof Error ? `${errorText}: ${err.message}` : errorText);
        setStatus('error');
    }
  }, [analysis, language, modelAge, aspectRatio, originalImage, platform, costs]);

  // Auto scroll to results when they appear
  useEffect(() => {
    if (status === 'results' && resultsRef.current) {
        resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [status]);

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-800 font-sans">
      <div className="flex items-center border-b border-slate-200 px-6 py-3 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <button
          onClick={platform.onBack}
          className="flex items-center text-slate-700 hover:text-blue-600 transition-colors font-medium py-1.5 px-2 rounded-lg hover:bg-slate-100"
        >
          <span className="mr-2 text-lg">←</span> 返回控制台
        </button>
      </div>
        <main className="flex-grow container mx-auto px-4 py-8 w-full">
          <div className="max-w-[1600px] mx-auto space-y-12 transition-all duration-500 ease-in-out">
            
            {/* Title Section */}
            <div className="max-w-4xl mx-auto text-center mb-12 animate-fade-in-down">
                <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-slate-900 pb-2 drop-shadow-sm">
                    {texts.title}
                </h1>
                <p className="text-slate-600 mt-4 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed font-medium">
                    {texts.subtitle}
                </p>
            </div>
            
            {/* Main Workbench: Refinement Control Panel */}
            <div className="animate-fade-in">
              <RefinementScreen
                analysis={analysis}
                setAnalysis={setAnalysis}
                originalImage={originalImage}
                modelAge={modelAge}
                setModelAge={setModelAge}
                productCategory={productCategory}
                setProductCategory={setProductCategory}
                aspectRatio={aspectRatio}
                setAspectRatio={setAspectRatio}
                onGenerate={handleGenerateImages}
                onReupload={handleImageUpload}
                onImageUpload={handleImageUpload}
                isGenerating={status === 'generating'}
                isAnalyzing={status === 'analyzing'}
                texts={texts}
              />
            </div>

            {/* Bottom Section: Results Area */}
            <div ref={resultsRef} className="scroll-mt-24 min-h-[400px]">
                <div className="flex items-center justify-between mb-8 px-2 border-b border-slate-200 pb-4">
                    <h2 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-3">
                      <span className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-slate-900 shadow-lg shadow-blue-500/20">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                      </span>
                      {texts.generatedImagesTitle}
                    </h2>
                    
                    {/* Status Indicator */}
                    {status === 'generating' && (
                        <div className="flex items-center gap-2 text-blue-400 font-semibold animate-pulse">
                            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                            {texts.generating}
                        </div>
                    )}
                </div>

                {/* Content Area */}
                <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200 p-6 shadow-xl min-h-[300px]">
                    {error && (
                         <div className="mb-8 p-4 bg-red-900/20 border border-red-800 rounded-2xl flex items-center gap-4 text-red-400">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                             <div>
                                 <p className="font-bold">{texts.errorTitle}</p>
                                 <p className="text-sm">{error}</p>
                             </div>
                         </div>
                    )}

                    {status === 'generating' && generatedImages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-64 text-center space-y-4">
                            <LoadingSpinner />
                            <p className="text-slate-600 font-medium">{texts.generating}</p>
                        </div>
                    )}
                    
                    {generatedImages.length > 0 && (
                        <GeneratedImageGallery images={generatedImages} texts={texts} />
                    )}
                    
                    {/* Empty State placeholder */}
                    {generatedImages.length === 0 && status !== 'generating' && (
                        <div className="flex flex-col items-center justify-center h-64 text-center opacity-40">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-slate-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            <p className="text-slate-500 font-medium">配置参数并点击"开始生成图片"<br/>结果将显示在这里</p>
                        </div>
                    )}
                </div>
            </div>
          </div>
        </main>
    </div>
  );
};

