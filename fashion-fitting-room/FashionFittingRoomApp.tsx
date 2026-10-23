import React, { useState, useEffect } from 'react';
import { AppProps } from '../../types';
import { 
  ModelGender, 
  Ethnicity, 
  ModelSettings, 
  ClothingSettings, 
  SceneSettings, 
  GeneratedImage 
} from './types';
import { ImageUpload } from './components/ImageUpload';
import { generateFashionImage } from './services/geminiService';
import { cacheGeneratedAsset } from '../../shared_services/localGeneratedAssetCache';
import { Wand2, Download, RefreshCw, AlertCircle, Image as ImageIcon, ChevronDown, Plus, X, Sparkles, Lightbulb } from './utils/lucide';

export const FashionFittingRoomApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  
  const [modelSettings, setModelSettings] = useState<ModelSettings>({
    gender: ModelGender.FEMALE,
    ethnicity: Ethnicity.INFLUENCER,
    age: 22,
    bodyType: '标准模特身材 (Standard)',
    faceReferenceImage: null,
  });

  const [clothingSettings, setClothingSettings] = useState<ClothingSettings>({
    garmentImages: [null], // Start with one slot for upload
    garmentType: '卫衣 (Hoodie)',
    description: '纯棉面料，版型硬挺，保留面料纹理细节 (Cotton fabric, structured fit, preserve texture details)',
  });

  const [sceneSettings, setSceneSettings] = useState<SceneSettings>({
    aspectRatio: "3:4",
    seed: Math.floor(Math.random() * 1000000),
  });

  const [masterPrompt, setMasterPrompt] = useState('');

  const [results, setResults] = useState<GeneratedImage[]>([]);
  
  useEffect(() => {
    const generatePrompt = () => {
      const ethnicityMap: { [key in Ethnicity]?: string } = {
          [Ethnicity.INFLUENCER]: '网红风格',
          [Ethnicity.MIXED]: '混血/国际化',
          [Ethnicity.CAUCASIAN]: '欧美白人',
          [Ethnicity.ASIAN]: '亚洲',
          [Ethnicity.AFRICAN]: '非洲裔',
          [Ethnicity.LATIN]: '拉丁裔',
      };
      
      const genderMap: { [key in ModelGender]: string } = {
          [ModelGender.FEMALE]: '一位女性模特',
          [ModelGender.MALE]: '一位男性模特',
          [ModelGender.COUPLE]: '一对男女模特'
      };
      
      let promptText = `商业时尚摄影，杰作，8K分辨率，专业色彩分级。`;
      
      const genderStr = genderMap[modelSettings.gender];
      
      promptText += `主题：${genderStr}。`;

      if (modelSettings.ethnicity === Ethnicity.INFLUENCER) {
          promptText += `外观：流行的社交媒体网红风格（例如"小红书"审美），无瑕的肌肤，时尚的妆容。`;
      } else {
          promptText += `外观：国际超模脸。人种：${ethnicityMap[modelSettings.ethnicity] || modelSettings.ethnicity}。`;
      }
      
      promptText += `必须有逼真的皮肤纹理。年龄大约 ${modelSettings.age}岁。`;
      promptText += `体型：${modelSettings.bodyType}（确保身体比例真实且一致）。`;
      
      promptText += `姿势：专业的时尚目录姿势，自然站立，自信，展示服装细节。`;

      promptText += `着装：模特穿着参考图中展示的"${clothingSettings.garmentType}"。`;
      promptText += `关键：必须严格保留参考图中的纹理、面料细节、标志、图案和剪裁。服装必须看起来与参考图完全一样，但要自然地贴合在模特身上。`;
      if (clothingSettings.description) {
        promptText += `服装细节：${clothingSettings.description}。`;
      }

      promptText += `背景：极简主义的浅灰色工作室无缝背景。`;
      promptText += `灯光：柔和均匀的专业工作室灯光，轮廓光清晰。`;
      promptText += `风格：高端时尚大片风格，光线完美，焦点清晰，面部或手部无瑕疵。面部必须对称且美观。`;
      
      setMasterPrompt(promptText);
    };
    generatePrompt();
  }, [modelSettings, clothingSettings]);

  const randomizeSeed = () => {
    setSceneSettings(prev => ({ ...prev, seed: Math.floor(Math.random() * 1000000) }));
  };

  const handleGenerate = async () => {
    // 检查是否有产品图
    const hasProductImage = clothingSettings.garmentImages.some(img => img !== null);
    if (!hasProductImage) {
      setError("请至少上传一张产品图");
      return;
    }

    // 检查余额（不扣除）
    if (!platform.checkBalance(costs.GENERATE_FASHION_IMAGE)) {
      return; // 余额不足会自动显示充值弹窗
    }

    setError(null);
    setIsGenerating(true);
    
    try {
      const imageUrls = await generateFashionImage(modelSettings, clothingSettings, sceneSettings, masterPrompt);

      const batchId = Date.now().toString();
      const newImages: GeneratedImage[] = imageUrls.map((url, index) => {
        cacheGeneratedAsset({ appId: "fashion-fitting-room", source: url });
        return {
          id: `${batchId}-${index}`,
          batchId,
          url: url,
          prompt: masterPrompt,
          timestamp: Date.now() + index,
        };
      });
      
      setResults(prev => [...newImages, ...prev]);
      await platform.refreshCredits?.();
    } catch (err: any) {
      setError(err.message || "生成失败，请重试。");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGarmentImageChange = (base64: string | null, index: number) => {
    const newImages = [...clothingSettings.garmentImages];
    newImages[index] = base64;
    setClothingSettings(prev => ({...prev, garmentImages: newImages}));
  };
  
  const addGarmentImageSlot = () => {
    if (clothingSettings.garmentImages.length < 3) {
      setClothingSettings(prev => ({...prev, garmentImages: [...prev.garmentImages, null]}));
    }
  };

  const removeGarmentImageSlot = (index: number) => {
    if (clothingSettings.garmentImages.length === 1 && clothingSettings.garmentImages[0] === null) return;
    
    const newImages = clothingSettings.garmentImages.filter((_, i) => i !== index);
    if (newImages.length === 0) {
      setClothingSettings(prev => ({...prev, garmentImages: [null]}));
    } else {
      setClothingSettings(prev => ({...prev, garmentImages: newImages}));
    }
  };

  const handleHistoryClick = (clickedImage: GeneratedImage) => {
    setResults(prev => {
      const pair = prev.filter(r => r.batchId === clickedImage.batchId);
      const others = prev.filter(r => r.batchId !== clickedImage.batchId);
      return [...pair, ...others];
    });
  };
  
  // 暗色系样式类
  const inputClassName = "w-full bg-slate-100 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition duration-300";
  const labelClassName = "block text-sm font-medium text-slate-700 mb-2";
  const cardClassName = "bg-white border border-slate-200 rounded-2xl p-6 shadow-xl";
  const titleClassName = "text-lg font-semibold text-slate-800 mb-6";

  const GeneratedImageDisplay: React.FC<{ image: GeneratedImage }> = ({ image }) => (
    <div className="relative group rounded-xl overflow-hidden bg-slate-100 border border-slate-300 flex items-center justify-center aspect-[3/4]">
      <img src={image.url} alt="Generated Fashion" className="w-full h-full object-contain" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-3">
        <span className="text-xs text-white/90 font-mono px-2 py-1 rounded-md bg-black/60 backdrop-blur-md">{new Date(image.timestamp).toLocaleTimeString()}</span>
        <a href={image.url} download={`fashion-ai-${image.id}.png`} className="p-2.5 bg-slate-200/80 backdrop-blur-lg text-slate-800 rounded-full hover:bg-indigo-500 hover:text-white transition-colors shadow-lg transform hover:scale-110"><Download size={18} /></a>
      </div>
    </div>
  );

  return (
    <div className="animate-fade-in space-y-8">
      {/* Header */}
      {/* <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <button 
          onClick={platform.onBack}
          className="flex items-center text-slate-700 hover:text-blue-600 transition-colors min-w-[44px] min-h-[44px] p-2 font-medium"
        >
          <span className="mr-2">←</span> 返回控制台
        </button>
      </div> */}

      <div className="min-h-screen w-full p-4 md:p-8 flex flex-col items-center bg-slate-50">
        <div className="w-full max-w-7xl flex items-center border-b border-slate-200 px-6 py-3 bg-white/50 backdrop-blur-sm sticky top-0 z-10 mb-4">
          <button
            onClick={platform.onBack}
            className="flex items-center text-slate-700 hover:text-blue-600 transition-colors font-medium py-1.5 px-2 rounded-lg hover:bg-slate-100"
          >
            <span className="mr-2 text-lg">←</span> 返回控制台
          </button>
        </div>
        <header className="w-full max-w-7xl flex items-center gap-4 mb-8">
          <div className="p-3 bg-indigo-900/30 border border-indigo-800/50 text-indigo-400 rounded-2xl shadow-lg">
            <Sparkles size={28} />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">服装AI试衣间</h1>
        </header>

        <main className="grid grid-cols-1 xl:grid-cols-12 gap-8 w-full max-w-7xl">
        
        <div className="xl:col-span-7 space-y-8">
            
            <section className={cardClassName}>
                <h2 className={titleClassName}>1. 快速设置</h2>
                <div className="space-y-6">
                    <div>
                        <label className={labelClassName}>上传产品图 (支持1-3张)</label>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {clothingSettings.garmentImages.map((img, index) => (
                                <div key={index} className="relative">
                                    <ImageUpload 
                                        label={`产品图 ${index + 1}`} 
                                        image={img}
                                        onImageChange={(b64) => handleGarmentImageChange(b64, index)}
                                    />
                                    { (clothingSettings.garmentImages.length > 1 || img !== null) && (
                                        <button onClick={() => removeGarmentImageSlot(index)} className="absolute -top-2 -right-2 p-1.5 bg-slate-200 border border-slate-600 text-slate-700 rounded-full hover:bg-red-500 hover:text-white transition-colors z-10 shadow-md">
                                            <X size={14}/>
                                        </button>
                                    )}
                                </div>
                            ))}
                            {clothingSettings.garmentImages.length < 3 && (
                                <div 
                                    onClick={addGarmentImageSlot}
                                    className="group relative bg-slate-100 border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-xl p-6 cursor-pointer transition-all duration-300 flex flex-col items-center justify-center text-slate-600 h-48"
                                >
                                    <div className="p-3 bg-indigo-900/30 rounded-full mb-3 transition-all group-hover:scale-110">
                                        <Plus className="text-indigo-400" size={24} />
                                    </div>
                                    <span className="text-sm font-semibold text-slate-700">添加产品图</span>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                          <label className={labelClassName}>服装类型</label>
                          <select
                              value={clothingSettings.garmentType}
                              onChange={(e) => setClothingSettings(prev => ({...prev, garmentType: e.target.value}))}
                              className={inputClassName}
                          >
                              <option>卫衣 (Hoodie)</option>
                              <option>T恤 (T-shirt)</option>
                              <option>夹克 (Jacket)</option>
                              <option>外套 (Coat)</option>
                              <option>连衣裙 (Dress)</option>
                              <option>裤子 (Pants)</option>
                              <option>衬衫 (Shirt)</option>
                          </select>
                      </div>
                       <div>
                          <label className={labelClassName}>模特类型</label>
                          <div className="grid grid-cols-3 gap-3">
                              {[{ val: ModelGender.FEMALE, label: '女模' }, { val: ModelGender.MALE, label: '男模' }, { val: ModelGender.COUPLE, label: '双人' }].map((opt) => (
                              <button key={opt.val} onClick={() => setModelSettings(prev => ({ ...prev, gender: opt.val }))} className={`py-3 rounded-xl text-sm font-semibold transition-all duration-300 ${modelSettings.gender === opt.val ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'}`}>
                                  {opt.label}
                              </button>
                              ))}
                          </div>
                      </div>
                      <div>
                          <label className={labelClassName}>人种风格</label>
                          <select value={modelSettings.ethnicity} onChange={(e) => setModelSettings(prev => ({ ...prev, ethnicity: e.target.value as Ethnicity }))} className={inputClassName}>
                              <option value={Ethnicity.INFLUENCER}>网红风</option>
                              <option value={Ethnicity.MIXED}>混血/国际化</option>
                              <option value={Ethnicity.CAUCASIAN}>欧美白人</option>
                              <option value={Ethnicity.ASIAN}>亚洲</option>
                              <option value={Ethnicity.AFRICAN}>非洲裔</option>
                              <option value={Ethnicity.LATIN}>拉丁裔</option>
                          </select>
                      </div>
                      <div>
                        <label className={labelClassName}>输出比例</label>
                        <div className="flex gap-2 flex-wrap items-center h-full">
                            {["3:4", "1:1", "4:3", "9:16", "16:9"].map((r) => (
                            <button key={r} onClick={() => setSceneSettings(prev => ({ ...prev, aspectRatio: r as any }))} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors duration-300 ${sceneSettings.aspectRatio === r ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'}`}>
                                {r}
                            </button>
                            ))}
                        </div>
                      </div>
                    </div>
                </div>
            </section>

            <section className={`${cardClassName} overflow-hidden`}>
                 <button onClick={() => setIsAdvancedOpen(!isAdvancedOpen)} className="w-full flex justify-between items-center text-left">
                    <h2 className="text-lg font-semibold text-slate-800">2. 精准微调 (可选)</h2>
                    <ChevronDown className={`transition-transform duration-300 text-slate-600 ${isAdvancedOpen ? 'rotate-180' : ''}`} />
                </button>
                <div className={`transition-all duration-500 ease-in-out ${isAdvancedOpen ? 'max-h-[1000px] opacity-100 pt-6' : 'max-h-0 opacity-0'}`}>
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                             <div>
                                <label className={labelClassName}>服装细节描述</label>
                                <input 
                                    type="text"
                                    value={clothingSettings.description}
                                    onChange={(e) => setClothingSettings(prev => ({...prev, description: e.target.value}))}
                                    className={inputClassName}
                                    placeholder="描述面料、剪裁、细节等..."
                                />
                            </div>
                            <div>
                                <label className={labelClassName}>年龄 (18-60)</label>
                                <input type="number" value={modelSettings.age} min="18" max="60" onChange={(e) => setModelSettings(prev => ({...prev, age: parseInt(e.target.value)}))} className={inputClassName} />
                            </div>
                             <div>
                                <label className={labelClassName}>体型描述</label>
                                <input type="text" value={modelSettings.bodyType as string} onChange={(e) => setModelSettings(prev => ({ ...prev, bodyType: e.target.value as any }))} className={inputClassName} placeholder="例如：高挑纤细..."/>
                            </div>
                        </div>
                        <div>
                            <ImageUpload label="面部参考图 (可选)" image={modelSettings.faceReferenceImage} onImageChange={(b64) => setModelSettings(prev => ({...prev, faceReferenceImage: b64}))} helperText="AI会微调以避免肖像权问题。" />
                        </div>
                        <div>
                            <div className="mb-2">
                                <h3 className="text-sm font-medium text-slate-700">AI 核心提示词</h3>
                                <p className="text-xs text-slate-500 mt-1">修改提示词也可以控图哦</p>
                            </div>
                            <textarea 
                                value={masterPrompt}
                                onChange={(e) => setMasterPrompt(e.target.value)}
                                className={`${inputClassName} h-40 resize-y p-3 text-xs leading-5`}
                                placeholder="编辑或输入完整的提示词..."
                            />
                        </div>
                        <div>
                            <label className={labelClassName}>随机种子</label>
                            <div className="flex items-center gap-2">
                                <input 
                                    type="number"
                                    value={sceneSettings.seed}
                                    onChange={(e) => setSceneSettings(prev => ({...prev, seed: parseInt(e.target.value) || 0}))}
                                    className={inputClassName}
                                    placeholder="输入一个数字..."
                                />
                                <button 
                                    onClick={randomizeSeed} 
                                    className="p-3 bg-slate-100 border border-slate-300 rounded-xl hover:bg-slate-200 transition-colors"
                                    aria-label="生成新种子"
                                    title="生成新种子"
                                >
                                    <RefreshCw size={18} className="text-slate-700" />
                                </button>
                            </div>
                             <div className="mt-3 flex items-start gap-2 p-3 bg-indigo-900/20 border border-indigo-800/30 rounded-lg">
                                <Lightbulb size={20} className="text-indigo-400 shrink-0 mt-0.5" />
                                <p className="text-xs text-slate-600">
                                    <span className="font-semibold text-slate-700">小贴士：</span>
                                    固定种子可确保模特风格统一，适合系列创作；更换种子则能探索全新的模特形象和构图。
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>

        <div className="xl:col-span-5 h-full">
            <div className={`${cardClassName} h-full flex flex-col`}>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-slate-800 flex items-center"><Wand2 className="mr-2 text-indigo-400" size={20}/> 生成结果</h2>
                  {error && (<div className="flex items-center text-red-400 bg-red-900/20 border border-red-800/50 px-3 py-1 rounded-lg text-xs font-medium"><AlertCircle size={14} className="mr-1.5" />{error}</div>)}
                </div>
                <div className="space-y-4 flex flex-col flex-grow relative">
                  <div className="grid grid-cols-2 gap-4 flex-grow">
                      {results.length > 0 ? (
                          <>
                            <GeneratedImageDisplay image={results[0]} />
                            {results[1] && <GeneratedImageDisplay image={results[1]} />}
                          </>
                      ) : (
                        <div className="col-span-2 flex flex-col items-center justify-center text-slate-500 bg-slate-100/50 border border-slate-300 rounded-xl">
                          <ImageIcon size={40} className="text-slate-600" />
                          <p className="font-semibold text-slate-600 text-sm mt-3">等待生成...</p>
                        </div>
                      )}
                  </div>
                   {isGenerating && (
                        <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-20 flex flex-col items-center justify-center text-indigo-400 rounded-xl">
                          <RefreshCw className="animate-spin mb-3" size={28} />
                          <span className="font-semibold text-sm animate-pulse">正在生成...</span>
                        </div>
                      )}
                  <button onClick={handleGenerate} disabled={isGenerating || !clothingSettings.garmentImages.some(img => img !== null)} className={`w-full py-4 rounded-xl flex items-center justify-center font-bold text-base transition-all duration-300 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[1.01] bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-indigo-500/30`}>
                      {isGenerating ? (
                        <>
                          <RefreshCw className="animate-spin mr-2" size={20} />
                          AI 思考中...
                        </>
                      ) : (
                        '开始生成'
                      )}
                  </button>
                </div>

                {results.length > 2 && (
                <div className="mt-6">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">历史记录</h3>
                    <div className="grid grid-cols-4 gap-3">
                        {results.slice(2, 6).map(res => (
                            <div key={res.id} className="aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-300 cursor-pointer hover:ring-2 ring-indigo-500 transition-all" onClick={() => handleHistoryClick(res)}>
                                <img src={res.url} alt="History" className="w-full h-full object-cover" />
                            </div>
                        ))}
                    </div>
                </div>
                )}
            </div>
        </div>
        </main>
      </div>
    </div>
  );
};

