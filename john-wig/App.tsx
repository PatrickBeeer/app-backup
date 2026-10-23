import React, { useState, useEffect } from 'react';
import { Header, Container } from './components/Layout';
import { STYLES, LOADING_MESSAGES, RESOLUTIONS, ASPECT_RATIOS, ETHNICITIES, OUTFITS } from './constants';
import { AppState, GenerationStyle, GeneratedResult, ResolutionType, AspectRatioType, Ethnicity, Outfit } from './types';
import { generateWigRealPerson } from './services/geminiService';
import { AppProps } from '../../types';
import { 
  Upload, 
  User, 
  Settings2, 
  Palette, 
  ChevronDown, 
  ChevronUp, 
  Download, 
  AlertCircle, 
  CheckCircle2,
  Clock,
  Image as ImageIcon,
  Sparkles,
  Briefcase,
  Camera,
  MapPin,
  Sun,
  Film,
  Zap,
  Anchor,
  Heart,
  Edit3,
  MessageSquare,
  Maximize2,
  X
} from 'lucide-react';

const DEFAULT_COST = 20;

const IconMap: Record<string, any> = {
  Sparkles,
  Briefcase,
  Camera,
  MapPin,
  Sun,
  Film,
  Zap,
  Anchor,
  Heart,
  Edit3
};

function isRetryableUpstreamError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return [
    '502',
    '503',
    '504',
    '524',
    'timeout',
    'bad gateway',
    'all mapped keys failed',
  ].some((needle) => message.includes(needle));
}

const App: React.FC<AppProps> = ({ platform, costs }) => {
  const generationCost = (costs as any).GENERATE_IMAGE ?? DEFAULT_COST;
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [selectedStyle, setSelectedStyle] = useState<GenerationStyle>(STYLES[0]);
  const [customPrompt, setCustomPrompt] = useState<string>(STYLES[0].prompt);
  const [lightingStyle, setLightingStyle] = useState<string>("自然光 (Natural)");
  const [selectedEthnicity, setSelectedEthnicity] = useState<Ethnicity>(ETHNICITIES[0]);
  const [selectedOutfit, setSelectedOutfit] = useState<Outfit>(OUTFITS[0]);
  const [age, setAge] = useState<number>(25);
  const [resolution, setResolution] = useState<ResolutionType>('2K');
  const [aspectRatio, setAspectRatio] = useState<AspectRatioType>('3:4');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedMimeType, setUploadedMimeType] = useState<string>('image/png');
  const [results, setResults] = useState<GeneratedResult[]>([]);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState<Record<string, boolean>>({});
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  // Collapsible sections state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    upload: true,
    model: false,
    params: false,
    style: false
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  useEffect(() => {
    let interval: number;
    if (appState === AppState.GENERATING) {
      let idx = 0;
      setLoadingProgress(0);
      interval = window.setInterval(() => {
        idx = (idx + 1) % LOADING_MESSAGES.length;
        setLoadingMsg(LOADING_MESSAGES[idx]);
        setLoadingProgress(prev => Math.min(prev + (100 / (LOADING_MESSAGES.length + 2)), 95));
      }, 2500);
    } else {
      setLoadingProgress(0);
    }
    return () => clearInterval(interval);
  }, [appState]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedMimeType(file.type || 'image/png');
      const reader = new FileReader();
      reader.onload = (event) => {
        setUploadedImage(event.target?.result as string);
        setAppState(AppState.IDLE);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const startGeneration = async () => {
    if (!uploadedImage) {
      setError("请先上传磨具图");
      setExpandedSections(prev => ({ ...prev, upload: true }));
      return;
    }

    if (!platform.checkBalance(generationCost)) {
      return;
    }

    try {
      setAppState(AppState.GENERATING);
      setError(null);
      const validUrls: string[] = [];
      let firstError: unknown = null;
      const baseSeed = Math.floor(Math.random() * 1_000_000);

      for (let i = 0; i < 2; i += 1) {
        setLoadingMsg(`正在生成第 ${i + 1} 张效果图...`);
        try {
          const url = await generateWigRealPerson(
            uploadedImage,
            `${customPrompt}. Lighting: ${lightingStyle}`,
            age,
            selectedEthnicity.name,
            selectedOutfit.prompt,
            resolution,
            aspectRatio,
            uploadedMimeType,
            baseSeed + i,
            ""
          );
          if (url) {
            validUrls.push(url);
          }
        } catch (singleError) {
          if (!firstError) {
            firstError = singleError;
          }
        }
      }
      
      if (validUrls.length > 0) {
        setLoadingProgress(100);
        const newResults: GeneratedResult[] = validUrls.map((url, index) => ({
          id: `${Date.now()}-${index}`,
          originalUrl: uploadedImage,
          resultUrl: url,
          timestamp: Date.now(),
          styleName: selectedStyle.name,
          ethnicityName: selectedEthnicity.name,
          outfitName: selectedOutfit.name,
          age: age,
          resolution: resolution,
          aspectRatio: aspectRatio
        }));
        
        setResults(prev => [...newResults, ...prev]);
        await platform.refreshCredits?.();
        setAppState(AppState.SUCCESS);
      } else {
        throw firstError || new Error("生成失败，请重试");
      }
    } catch (err: any) {
      console.error(err);
      if (isRetryableUpstreamError(err)) {
        setError("图像服务暂时超时或繁忙（502/524），系统已自动重试。请稍后重试，或先使用较小图片再试。");
      } else {
        setError(err.message || "生成过程出现未知错误");
      }
      setAppState(AppState.ERROR);
    }
  };

  const clearResults = () => {
    if (window.confirm("确定要清空所有生成结果吗？")) {
      setResults([]);
    }
  };

  const toggleCompare = (id: string) => {
    setCompareMode(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const downloadAll = () => {
    results.forEach((res, index) => {
      const link = document.createElement('a');
      link.href = res.resultUrl;
      link.download = `wig-ai-result-${index + 1}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header onBack={platform.onBack} />
      
      <Container>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column Controls */}
          <div className="lg:col-span-4 space-y-4">
            {/* 1. Upload Section */}
            <section className="glass-panel overflow-hidden">
              <button 
                onClick={() => toggleSection('upload')}
                className="w-full p-6 flex justify-between items-center hover:bg-white/40 transition-colors"
              >
                <h2 className="text-sm font-bold text-black flex items-center">
                  <Upload className="w-4 h-4 mr-3 text-gray-400" />
                  1. 上传磨具图
                </h2>
                <div className="flex items-center space-x-2">
                  {uploadedImage && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                  {expandedSections.upload ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </div>
              </button>
              
              {expandedSections.upload && (
                <div className="p-6 pt-0 border-t border-white/20">
                  <div 
                    className={`relative border border-dashed rounded-3xl p-6 transition-all flex flex-col items-center justify-center text-center cursor-pointer hover:bg-white/40 ${uploadedImage ? 'border-pink-200 bg-pink-50/20' : 'border-gray-200'}`}
                    onClick={() => document.getElementById('fileInput')?.click()}
                  >
                    {uploadedImage ? (
                      <div className="relative group w-full flex justify-center">
                        <img src={uploadedImage} alt="Uploaded" className="max-h-48 rounded-2xl object-contain shadow-sm" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center text-white text-xs font-bold backdrop-blur-sm">点击更换图片</div>
                      </div>
                    ) : (
                      <div className="py-8">
                        <div className="w-12 h-12 bg-gray-100 text-gray-400 rounded-2xl flex items-center justify-center mb-4 mx-auto">
                          <ImageIcon size={24} />
                        </div>
                        <p className="text-sm text-gray-600 font-medium">点击或拖拽上传</p>
                        <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider">JPG, PNG, WEBP</p>
                      </div>
                    )}
                    <input type="file" id="fileInput" className="hidden" accept="image/*" onChange={handleFileUpload} />
                  </div>
                </div>
              )}
            </section>

            {/* 2. Model Settings Section */}
            <section className="glass-panel overflow-hidden">
              <button 
                onClick={() => toggleSection('model')}
                className="w-full p-6 flex justify-between items-center hover:bg-white/40 transition-colors"
              >
                <h2 className="text-sm font-bold text-black flex items-center">
                  <User className="w-4 h-4 mr-3 text-gray-400" />
                  2. 模特与穿搭
                </h2>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{selectedEthnicity.name} · {age}岁</span>
                  {expandedSections.model ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </div>
              </button>

              {expandedSections.model && (
                <div className="p-6 pt-0 border-t border-white/20 space-y-6">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-3">人种设定</p>
                    <div className="flex flex-wrap gap-2">
                      {ETHNICITIES.map(eth => (
                        <button
                          key={eth.id}
                          onClick={() => setSelectedEthnicity(eth)}
                          className={`py-2 px-4 rounded-xl border text-[11px] font-medium transition-all ${
                            selectedEthnicity.id === eth.id ? 'border-black bg-black text-white' : 'border-white/40 bg-white/40 text-gray-500 hover:bg-white/60'
                          }`}
                        >
                          {eth.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">年龄: <span className="text-black">{age}岁</span></p>
                    </div>
                    <input 
                      type="range" 
                      min="18" 
                      max="65" 
                      value={age} 
                      onChange={(e) => setAge(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black"
                    />
                  </div>

                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-3">穿搭选择</p>
                    <div className="grid grid-cols-2 gap-2">
                      {OUTFITS.map(outfit => (
                        <button
                          key={outfit.id}
                          onClick={() => setSelectedOutfit(outfit)}
                          className={`p-3 rounded-2xl border text-left transition-all ${
                            selectedOutfit.id === outfit.id ? 'border-black bg-black text-white' : 'border-white/40 bg-white/40 text-gray-500 hover:bg-white/60'
                          }`}
                        >
                          <p className={`text-[11px] font-bold ${selectedOutfit.id === outfit.id ? 'text-white' : 'text-black'}`}>{outfit.name}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* 3. Style Section */}
            <section className="glass-panel overflow-hidden">
              <button 
                onClick={() => toggleSection('style')}
                className="w-full p-6 flex justify-between items-center hover:bg-white/40 transition-colors"
              >
                <h2 className="text-sm font-bold text-black flex items-center">
                  <Palette className="w-4 h-4 mr-3 text-gray-400" />
                  3. 视觉风格
                </h2>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{selectedStyle.name}</span>
                  {expandedSections.style ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </div>
              </button>

              {expandedSections.style && (
                <div className="p-6 pt-0 border-t border-white/20 space-y-6">
                  <div className="grid grid-cols-2 gap-3">
                    {STYLES.map(style => {
                      const Icon = IconMap[style.iconName] || Sparkles;
                      return (
                        <button
                          key={style.id}
                          onClick={() => {
                            setSelectedStyle(style);
                            setCustomPrompt(style.prompt);
                            // Randomly match suitable outfits
                            const randomOutfit = OUTFITS[Math.floor(Math.random() * OUTFITS.length)];
                            setSelectedOutfit(randomOutfit);
                          }}
                          className={`relative p-4 rounded-2xl border-2 transition-all text-left flex flex-col items-center justify-center gap-2 group ${
                            selectedStyle.id === style.id ? 'border-black bg-black text-white' : 'border-white/40 bg-white/40 text-gray-500 hover:bg-white/60'
                          }`}
                        >
                          <Icon size={24} className={selectedStyle.id === style.id ? 'text-white' : 'text-gray-400'} />
                          <p className="text-[11px] font-bold text-center">{style.name}</p>
                          {selectedStyle.id === style.id && (
                            <div className="absolute top-2 right-2 w-4 h-4 bg-white rounded-full flex items-center justify-center shadow-lg">
                              <CheckCircle2 className="w-2.5 h-2.5 text-black" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="pt-4 border-t border-white/10">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                        <MessageSquare size={12} />
                        提示词编辑 (PROMPT)
                      </p>
                      {selectedStyle.id !== 'custom' && (
                        <button 
                          onClick={() => setCustomPrompt(selectedStyle.prompt)}
                          className="text-[8px] text-gray-400 hover:text-black font-bold uppercase tracking-widest"
                        >
                          重置
                        </button>
                      )}
                    </div>
                    <textarea
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder="在此输入或修改提示词，例如：一个在阳光下的优雅女性，背景是咖啡馆..."
                      className="w-full h-32 glass-input p-4 text-xs leading-relaxed resize-none focus:ring-1 focus:ring-black/10"
                    />
                    <p className="text-[9px] text-gray-400 mt-2 leading-tight">
                      * 您可以自由修改上方提示词来微调生成效果。
                    </p>
                  </div>

                  <div className="pt-4 border-t border-white/10">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-3">光影设置 (Lighting)</p>
                    <div className="grid grid-cols-2 gap-2">
                      {["自然光 (Natural)", "影棚光 (Studio)", "柔和窗光 (Soft Window)", "夕阳光 (Golden Hour)"].map(light => (
                        <button
                          key={light}
                          onClick={() => setLightingStyle(light)}
                          className={`py-2 px-3 rounded-xl border text-[10px] font-medium transition-all ${
                            lightingStyle === light ? 'border-black bg-black text-white' : 'border-white/40 bg-white/40 text-gray-500 hover:bg-white/60'
                          }`}
                        >
                          {light}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* 4. Parameters Section */}
            <section className="glass-panel overflow-hidden">
              <button 
                onClick={() => toggleSection('params')}
                className="w-full p-6 flex justify-between items-center hover:bg-white/40 transition-colors"
              >
                <h2 className="text-sm font-bold text-black flex items-center">
                  <Settings2 className="w-4 h-4 mr-3 text-gray-400" />
                  4. 输出参数
                </h2>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{resolution} · {aspectRatio}</span>
                  {expandedSections.params ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </div>
              </button>

              {expandedSections.params && (
                <div className="p-6 pt-0 border-t border-white/20 space-y-6">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] w-16">清晰度</p>
                    <div className="flex gap-2 flex-1">
                      {RESOLUTIONS.map(res => (
                        <button
                          key={res}
                          onClick={() => setResolution(res)}
                          className={`flex-1 py-2 rounded-xl border text-[11px] font-medium transition-all ${
                            resolution === res ? 'border-black bg-black text-white' : 'border-white/40 bg-white/40 text-gray-500 hover:bg-white/60'
                          }`}
                        >
                          {res}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] w-16">比例</p>
                    <div className="flex gap-2 flex-1">
                      {ASPECT_RATIOS.map(ratio => (
                        <button
                          key={ratio}
                          onClick={() => setAspectRatio(ratio)}
                          className={`flex-1 py-2 rounded-xl border text-[11px] font-medium transition-all ${
                            aspectRatio === ratio ? 'border-black bg-black text-white' : 'border-white/40 bg-white/40 text-gray-500 hover:bg-white/60'
                          }`}
                        >
                          {ratio}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>

            <button
              onClick={startGeneration}
              disabled={appState === AppState.GENERATING || !uploadedImage}
              className={`w-full py-5 rounded-[2rem] font-bold text-white shadow-2xl transition-all flex items-center justify-center space-x-3 mt-6 ${
                appState === AppState.GENERATING || !uploadedImage ? 'bg-gray-300 cursor-not-allowed' : 'bg-black hover:scale-[1.02] active:scale-[0.98]'
              }`}
            >
              {appState === AppState.GENERATING ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  <span>AI 建模中...</span>
                </>
              ) : (
                <>
                  <Sparkles size={20} />
                  <span>立即生成超清大图 ({generationCost} 积分)</span>
                </>
              )}
            </button>
            
            {error && (
              <div className="flex items-center justify-center gap-2 text-xs text-red-500 font-medium animate-pulse">
                <AlertCircle size={14} />
                {error}
              </div>
            )}
          </div>

          {/* Right Column Results */}
          <div className="lg:col-span-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-black flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-gray-400" />
                生成结果
                {results.length > 0 && <span className="ml-2 px-2 py-0.5 bg-black/5 rounded-full text-[10px] text-gray-500">{results.length}</span>}
              </h2>
              {results.length > 0 && (
                <div className="flex gap-3">
                  <button 
                    onClick={downloadAll}
                    className="text-xs font-medium text-gray-500 hover:text-black transition-colors flex items-center gap-1.5"
                  >
                    <Download size={14} />
                    全部下载
                  </button>
                  <button 
                    onClick={clearResults}
                    className="text-xs font-medium text-gray-500 hover:text-red-500 transition-colors flex items-center gap-1.5"
                  >
                    <AlertCircle size={14} />
                    清空结果
                  </button>
                </div>
              )}
            </div>

            {appState === AppState.GENERATING ? (
              <div className="glass-panel p-12 flex flex-col items-center justify-center text-center h-full min-h-[600px]">
                <div className="relative mb-12">
                  <div className="w-40 h-40 border-4 border-black/5 border-t-black rounded-full animate-spin"></div>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-bold text-2xl text-black">{Math.round(loadingProgress)}%</span>
                    <span className="text-[10px] text-gray-400 uppercase tracking-widest mt-1">{resolution}</span>
                  </div>
                </div>
                <div className="w-full max-w-md bg-black/5 h-1.5 rounded-full overflow-hidden mb-8">
                  <div 
                    className="h-full bg-black transition-all duration-500 ease-out"
                    style={{ width: `${loadingProgress}%` }}
                  ></div>
                </div>
                <h3 className="text-2xl font-bold mb-4 text-black tracking-tight">正在打造真实高保真质感</h3>
                <p className="text-gray-400 animate-pulse text-sm max-w-sm mx-auto leading-relaxed h-12">{loadingMsg}</p>
              </div>
            ) : results.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {results.map(result => (
                  <div key={result.id} className="glass-panel overflow-hidden group hover:shadow-2xl transition-all duration-500">
                    <div className={`relative bg-gray-50 overflow-hidden`} style={{ aspectRatio: result.aspectRatio.replace(':', '/') }}>
                      <img 
                        src={compareMode[result.id] ? result.originalUrl : result.resultUrl} 
                        alt="Result" 
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                      />
                      
                      <div className="absolute top-6 left-6 flex flex-wrap gap-2 max-w-[85%]">
                        <span className="px-3 py-1.5 bg-black/80 backdrop-blur-md text-white text-[10px] rounded-xl font-bold uppercase tracking-wider shadow-lg">{result.styleName}</span>
                        <span className="px-3 py-1.5 bg-white/80 backdrop-blur-md text-black text-[10px] rounded-xl font-bold uppercase tracking-wider shadow-lg">{result.ethnicityName}</span>
                      </div>

                      <div className="absolute bottom-6 left-6 flex gap-2">
                        <button 
                          onClick={() => toggleCompare(result.id)}
                          className={`px-4 py-2 backdrop-blur-md rounded-full text-[10px] font-bold uppercase tracking-wider transition-all shadow-lg ${
                            compareMode[result.id] ? 'bg-black text-white' : 'bg-white/80 text-black hover:bg-white'
                          }`}
                        >
                          {compareMode[result.id] ? '查看生成图' : '对比原图'}
                        </button>
                        <button 
                          onClick={() => setZoomedImage(compareMode[result.id] ? result.originalUrl : result.resultUrl)}
                          className="p-2 bg-white/80 backdrop-blur-md text-black rounded-full shadow-lg hover:bg-white transition-all transform hover:scale-110"
                          title="放大查看"
                        >
                          <Maximize2 size={14} />
                        </button>
                      </div>

                      <a 
                        href={result.resultUrl} 
                        download={`wig-ai-${result.id}.png`} 
                        className="absolute bottom-6 right-6 p-4 bg-white text-black rounded-full shadow-2xl hover:bg-black hover:text-white transition-all transform hover:scale-110 active:scale-95"
                      >
                        <Download size={20} />
                      </a>
                    </div>
                    
                    <div className="p-6">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-xl border border-black/5 overflow-hidden shadow-inner flex-shrink-0">
                          <img src={result.originalUrl} className="w-full h-full object-cover" alt="Source" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center">
                            <p className="text-xs font-bold text-black uppercase tracking-wider truncate">AI 高保真建模</p>
                            <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">{new Date(result.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-gray-400 uppercase tracking-wider">{result.resolution}</span>
                            <span className="w-1 h-1 bg-gray-200 rounded-full"></span>
                            <span className="text-[10px] text-gray-400 uppercase tracking-wider">{result.aspectRatio}</span>
                          </div>
                        </div>
                      </div>
                      <div className="pt-4 border-t border-black/5 flex justify-between items-center">
                        <div className="flex gap-3">
                          <div className="flex flex-col">
                            <span className="text-[8px] text-gray-400 uppercase tracking-widest">人种</span>
                            <span className="text-[10px] font-bold text-black">{result.ethnicityName}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[8px] text-gray-400 uppercase tracking-widest">年龄</span>
                            <span className="text-[10px] font-bold text-black">{result.age}岁</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[8px] text-gray-400 uppercase tracking-widest">穿搭</span>
                            <span className="text-[10px] font-bold text-black">{result.outfitName}</span>
                          </div>
                        </div>
                        <button className="text-[10px] font-bold text-gray-400 hover:text-black transition-colors uppercase tracking-widest">
                          分享
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="glass-panel p-12 flex flex-col items-center justify-center text-center h-full min-h-[600px] border-dashed border-2 border-white/40">
                <div className="w-24 h-24 bg-black/5 rounded-[2.5rem] flex items-center justify-center mb-8 relative">
                  <ImageIcon size={40} className="text-black/10" />
                  <div className="absolute -top-2 -right-2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center">
                    <Sparkles size={16} className="text-amber-400" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-black tracking-tight">超清建模预览区</h3>
                <p className="text-sm text-gray-400 mt-4 max-w-sm mx-auto leading-relaxed">
                  上传您的假发磨具图，设置好模特参数与视觉风格，AI 将为您精准还原真实佩戴效果。
                </p>
                
                <div className="mt-12 flex flex-wrap justify-center gap-4">
                  <div className="px-4 py-2 bg-black/5 rounded-full text-[10px] font-bold text-gray-500 uppercase tracking-widest border border-black/10">成功生成扣费 {generationCost} 积分</div>
                  <div className="px-4 py-2 bg-white/40 rounded-full text-[10px] font-bold text-gray-400 uppercase tracking-widest border border-white/20">2K/4K 超清</div>
                  <div className="px-4 py-2 bg-white/40 rounded-full text-[10px] font-bold text-gray-400 uppercase tracking-widest border border-white/20">真实肌理</div>
                  <div className="px-4 py-2 bg-white/40 rounded-full text-[10px] font-bold text-gray-400 uppercase tracking-widest border border-white/20">自然光影</div>
                </div>

                <div className="mt-16 grid grid-cols-3 gap-12 opacity-10">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-black"></div>
                      <div className="w-16 h-1.5 bg-black rounded-full"></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </Container>

      {/* Image Zoom Modal */}
      {zoomedImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 md:p-12 animate-in fade-in duration-300"
          onClick={() => setZoomedImage(null)}
        >
          <button 
            className="absolute top-8 right-8 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all z-[110]"
            onClick={() => setZoomedImage(null)}
          >
            <X size={24} />
          </button>
          
          <div className="relative max-w-full max-h-full flex items-center justify-center overflow-hidden rounded-2xl shadow-2xl">
            <img 
              src={zoomedImage} 
              alt="Zoomed" 
              className="max-w-full max-h-[90vh] object-contain animate-in zoom-in-95 duration-500"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4">
              <a 
                href={zoomedImage} 
                download="wig-ai-zoom.png"
                className="px-6 py-3 bg-white text-black rounded-full font-bold text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-gray-100 transition-all shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <Download size={16} />
                下载此图
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
