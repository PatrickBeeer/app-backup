import React, { useState, useCallback } from 'react';
import { AppProps } from '../../types';
import Header from './components/Header';
import FileUpload from './components/FileUpload';
import AnalysisPanel from './components/AnalysisPanel';
import ResultDisplay from './components/ResultDisplay';
import { analyzeReferenceImage, generateSeamlessTexture, generatePBRMap } from './services/geminiService';
import { AppState, AnalysisResult, TextureMaps } from './types';
import { Sparkles, ArrowRight } from '@/utils/lucide';

export const MagicTextureMaterialGeneratorApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [userPrompt, setUserPrompt] = useState<string>('');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [maps, setMaps] = useState<TextureMaps>({ diffuse: null, normal: null, height: null, roughness: null, metallic: null });
  const [pbrLoading, setPbrLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // PBR Settings State
  const [roughnessLevel, setRoughnessLevel] = useState<number>(0.5);
  const [metallicLevel, setMetallicLevel] = useState<number>(0.0);
  const [displacementLevel, setDisplacementLevel] = useState<number>(1.0);

  const handleFileSelect = useCallback((base64: string | null) => {
    setReferenceImage(base64);
    setAnalysis(null);
    setMaps({ diffuse: null, normal: null, height: null, roughness: null, metallic: null });
    setError(null);
    setState(AppState.IDLE);
    setPbrLoading(false);
  }, []);

  // Re-generate specific map when sliders change
  const handlePBRSettingChange = async (type: 'roughness' | 'metallic' | 'height', value: number) => {
      if (!maps.diffuse) return;
      if (type === 'roughness') setRoughnessLevel(value);
      if (type === 'metallic') setMetallicLevel(value);
      if (type === 'height') setDisplacementLevel(value);

      setPbrLoading(true);
      try {
          const newMap = await generatePBRMap(maps.diffuse, type, value);
          setMaps(prev => ({
              ...prev,
              [type]: newMap
          }));
      } catch (e) {
          console.error(`Failed to update ${type} map`, e);
      } finally {
          setPbrLoading(false);
      }
  };

  const handleGenerate = async () => {
    if (!referenceImage && !userPrompt) return;

    // 检查余额（不扣除）
    if (!platform.checkBalance(costs.GENERATE_TEXTURE)) {
      return; // 余额不足会自动显示充值弹窗
    }

    try {
      setState(AppState.ANALYZING);
      setMaps({ diffuse: null, normal: null, height: null, roughness: null, metallic: null });
      setPbrLoading(false);
      setError(null);
      setAnalysis(null);

      // Reset PBR settings defaults for new generation
      setRoughnessLevel(0.5);
      setMetallicLevel(0.0);
      setDisplacementLevel(1.0);

      let finalPrompt = userPrompt;

      // Logic Branch 1: Image exists -> Analyze it first (to get style or prompt)
      // 分析不扣费，只是辅助功能
      if (referenceImage) {
          const analysisResult = await analyzeReferenceImage(referenceImage);
          setAnalysis(analysisResult);

          // If user provided a prompt, we combine them. If not, we use the AI generated prompt.
          if (!userPrompt) {
              finalPrompt = analysisResult.midjourneyPrompt;
          } else {
              finalPrompt = `${userPrompt}. Visual Style: ${analysisResult.visualStyle}. Material: ${analysisResult.material}.`;
          }
      }

      // Step 2: Generate Diffuse (Main Texture)
      setState(AppState.GENERATING);
      const textureUrl = await generateSeamlessTexture(finalPrompt, referenceImage);

      // Update state with Diffuse immediately
      setMaps(prev => ({ ...prev, diffuse: textureUrl }));
      setState(AppState.SUCCESS);
      await platform.refreshCredits?.();

      // Step 3: Generate PBR Maps (Normal & Height & Roughness & Metallic) in background
      generatePBRMaps(textureUrl);

    } catch (err: any) {
      console.error(err);
      setState(AppState.ERROR);
      setError(err.message || "An unexpected error occurred during processing.");
    }
  };

  const generatePBRMaps = async (diffuseUrl: string) => {
    try {
        setPbrLoading(true);
        
        // Parallel generation using client-side processing
        const [normalMap, heightMap, roughnessMap, metallicMap] = await Promise.allSettled([
            generatePBRMap(diffuseUrl, 'normal'),
            generatePBRMap(diffuseUrl, 'height', 1.0),
            generatePBRMap(diffuseUrl, 'roughness', 0.5),
            generatePBRMap(diffuseUrl, 'metallic', 0.0)
        ]);

        setMaps(prev => ({
            ...prev,
            normal: normalMap.status === 'fulfilled' ? normalMap.value : null,
            height: heightMap.status === 'fulfilled' ? heightMap.value : null,
            roughness: roughnessMap.status === 'fulfilled' ? roughnessMap.value : null,
            metallic: metallicMap.status === 'fulfilled' ? metallicMap.value : null,
        }));

    } catch (e) {
        console.error("Partial PBR generation failure", e);
    } finally {
        setPbrLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-accent-cyan/30 flex flex-col">
      <Header cost={costs.GENERATE_TEXTURE} />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 lg:p-8">
        
        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:items-start relative">
          
          {/* Left Column: Input & Analysis (4 cols) */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <section className="bg-white p-5 rounded-2xl border border-gray-200 shadow-lg">
              <FileUpload 
                onFileSelect={handleFileSelect} 
                onPromptChange={setUserPrompt}
                prompt={userPrompt}
                referenceImage={referenceImage}
                disabled={state === AppState.ANALYZING || state === AppState.GENERATING} 
              />
              
              <div className="mt-5">
                 <button
                   onClick={handleGenerate}
                   disabled={(!referenceImage && !userPrompt) || state === AppState.ANALYZING || state === AppState.GENERATING}
                   className={`w-full py-3.5 px-6 rounded-xl font-bold tracking-wide uppercase transition-all duration-300 flex items-center justify-center gap-2 text-sm
                     ${(!referenceImage && !userPrompt) 
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : state === AppState.ANALYZING || state === AppState.GENERATING
                          ? 'bg-gray-300 text-gray-600 cursor-wait'
                          : 'bg-gradient-to-r from-accent-purple to-accent-cyan text-white shadow-lg shadow-accent-purple/25 hover:shadow-accent-cyan/40 hover:scale-[1.02]'
                     }
                   `}
                 >
                   {state === AppState.IDLE && (
                     <>
                       <Sparkles className="w-5 h-5" />
                       生成无缝贴图
                     </>
                   )}
                   {state === AppState.ANALYZING && "正在分析材质..."}
                   {state === AppState.GENERATING && "正在合成基础层..."}
                   {state === AppState.SUCCESS && (
                     <>
                       <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                         <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                         <path d="M21 3v5h-5"/>
                         <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                         <path d="M3 21v-5h5"/>
                       </svg>
                       重新生成
                     </>
                   )}
                   {state === AppState.ERROR && "重试生成"}
                 </button>
              </div>
            </section>

            {/* Analysis Result Panel */}
            {referenceImage && ((state === AppState.ANALYZING || analysis)) && (
              <section className="bg-white p-5 rounded-2xl border border-gray-200 shadow-lg">
                <AnalysisPanel analysis={analysis} loading={state === AppState.ANALYZING} />
              </section>
            )}
            
            {/* Text Only Mode Indicator */}
            {userPrompt && !referenceImage && state === AppState.SUCCESS && (
                 <section className="bg-white p-5 rounded-2xl border border-gray-200 shadow-lg flex items-center justify-center text-gray-600 text-xs font-mono">
                    <p>已使用文本模式生成</p>
                 </section>
            )}
          </div>

          {/* Center Column: Workflow Arrows (Hidden on mobile) */}
          <div className="hidden lg:flex lg:col-span-1 h-32 lg:h-auto items-center justify-center opacity-30 lg:sticky lg:top-32">
             <ArrowRight className="w-8 h-8 lg:w-10 lg:h-10 text-gray-400 lg:rotate-0 rotate-90" />
          </div>

          {/* Right Column: Result (7 cols) */}
          <div className="lg:col-span-7 lg:sticky lg:top-24">
            <section className="bg-white p-5 rounded-2xl border border-gray-200 shadow-lg min-h-[500px]">
              {error ? (
                <div className="h-full flex flex-col items-center justify-center text-red-600 p-8 text-center border border-red-200 rounded-xl bg-red-50 min-h-[400px]">
                   <p className="font-mono text-lg mb-2 text-red-800">系统错误</p>
                   <p className="text-sm text-red-700">{error}</p>
                </div>
              ) : (
                <ResultDisplay 
                  maps={maps}
                  loading={state === AppState.GENERATING} 
                  pbrLoading={pbrLoading}
                  onRegenerate={handleGenerate}
                  roughnessLevel={roughnessLevel}
                  metallicLevel={metallicLevel}
                  displacementLevel={displacementLevel}
                  onPBRSettingChange={handlePBRSettingChange}
                />
              )}
            </section>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-6 text-center text-gray-500 text-xs font-mono border-t border-gray-200 mt-auto bg-white">
        <p>由 GEMINI 2.5 FLASH & IMAGEN 驱动 • MAGIC TEXTURE 实验室</p>
      </footer>
    </div>
  );
};

