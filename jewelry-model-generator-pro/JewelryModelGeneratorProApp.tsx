import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, Loader2, Camera, ChevronRight, ChevronDown, User, Expand, X, Palette, Download, LayoutGrid, Settings2, SlidersHorizontal, FilePenLine } from '@/utils/lucide';
import { AppProps } from '../../types';
import { ImageUploader } from './components/ImageUploader';
import { Accordion } from './components/Accordion';
import { generateTryOn, getAgeDescription, getEthnicityDescription, getStyleDescription } from './services/geminiService';
import { JewelryType, ProcessingState, ViewType, ModelGender, ImageSize, ModelEthnicity, ModelAge, EcommerceStyle, PromptParts } from './types';
import { getModelImage } from './constants';
const DEFAULT_TOTAL_COST = 20;

// Headers for parsing and assembling the master prompt
const HEADER_MODEL = '【模特定义】';
const HEADER_ART = '【艺术执导】';
const HEADER_STYLE = '【视觉风格】';
const HEADER_CUSTOM = '【自定义指令】';

export const JewelryModelGeneratorProApp: React.FC<AppProps> = ({ platform, costs }) => {
  // State
  const [productImage, setProductImage] = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  
  const [jewelryType, setJewelryType] = useState<JewelryType>(JewelryType.NECKLACE);
  const viewType = ViewType.MEDIUM_SHOT; // Internal logic
  
  const [gender, setGender] = useState<ModelGender>(ModelGender.FEMALE);
  const [ethnicity, setEthnicity] = useState<ModelEthnicity>(ModelEthnicity.ASIAN);
  const [age, setAge] = useState<ModelAge>(ModelAge.YOUNG_ADULT);
  const [style, setStyle] = useState<EcommerceStyle>(EcommerceStyle.MINIMALIST);
  
  const [masterPrompt, setMasterPrompt] = useState('');
  
  const [isProMode, setIsProMode] = useState<boolean>(false);
  const [imageSize, setImageSize] = useState<ImageSize>('1K');
  const [aspectRatio, setAspectRatio] = useState<string>('3:4');
  
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  const [processing, setProcessing] = useState<ProcessingState>({
    isLoading: false,
    statusMessage: '',
  });

  const [openAccordions, setOpenAccordions] = useState<string[]>(['model']);

  const parsePrompt = useCallback((text: string): PromptParts => {
    const modelContent = text.split(HEADER_MODEL)[1]?.split(HEADER_ART)[0]?.trim() || '';
    const artContent = text.split(HEADER_ART)[1]?.split(HEADER_STYLE)[0]?.trim() || '';
    const styleContent = text.split(HEADER_STYLE)[1]?.split(HEADER_CUSTOM)[0]?.trim() || '';
    const customContent = text.split(HEADER_CUSTOM)[1]?.trim() || '';
    return {
      modelDefinition: modelContent,
      artDirection: artContent,
      styleAndScene: styleContent,
      customInstructions: customContent,
    };
  }, []);

  // Translation Maps
  const typeLabels: Record<JewelryType, string> = {
    [JewelryType.NECKLACE]: '项链', [JewelryType.EARRINGS]: '耳环', [JewelryType.RING]: '戒指',
    [JewelryType.BRACELET]: '手链', [JewelryType.PENDANT]: '吊坠',
  };
  const genderLabels: Record<ModelGender, string> = { [ModelGender.FEMALE]: '女士', [ModelGender.MALE]: '男士' };
  const ethnicityLabels: Record<ModelEthnicity, string> = {
    [ModelEthnicity.ASIAN]: '亚洲', [ModelEthnicity.CAUCASIAN]: '欧美', [ModelEthnicity.BLACK]: '非裔',
    [ModelEthnicity.HISPANIC]: '拉美', [ModelEthnicity.SOUTH_ASIAN]: '南亚',
  };
  const ageLabels: Record<ModelAge, string> = {
    [ModelAge.YOUNG_ADULT]: '18-24 岁', [ModelAge.ADULT]: '25-34 岁', [ModelAge.MATURE]: '35-44 岁', [ModelAge.SENIOR]: '45+ 岁',
  };
  const styleLabels: Record<EcommerceStyle, string> = {
    [EcommerceStyle.MINIMALIST]: '极简冷淡', [EcommerceStyle.LUXURY]: '高级轻奢', [EcommerceStyle.STREET]: '潮流街头',
    [EcommerceStyle.VINTAGE]: '复古胶片', [EcommerceStyle.NATURE]: '清新自然', [EcommerceStyle.INFLUENCER]: '网红爆款',
    [EcommerceStyle.NEW_CHINESE]: '新中式',
  };

  // Regenerate prompt parts when settings change
  useEffect(() => {
    const newModelDef = `
- **人种特征**: ${getEthnicityDescription(ethnicity)}
- **年龄设定**: ${getAgeDescription(age)}
- **脸部细节 (新增)**: 请确保输出的脸部具有细微的表情变化，如轻微的微笑或自然的眉毛姿态，避免僵硬感。
- **肤色一致性**: 确保面部、颈部和手部的肤色保持一致。
- **核心指令**: 如果参考模特图与指定的人种不符，必须完全忽略参考图的面部特征和肤色，并根据要求重新绘制。参考图仅用于姿势、光线和构图。`;

    const newArtDirection = `
- **核心目标**: 最终图像必须看起来像真实人物的高端摄影作品，而非AI生成物。
- **皮肤细节 (强制)**: 渲染超写实的皮肤。包括毛孔、细纹、自然的微小瑕疵和光线反射（高光）。皮肤绝不能看起来像经过磨皮、塑料或过于光滑，必须有真实质感。
- **情绪表达**: 模特的表情是关键。必须自然地传达【视觉风格】中描述的情绪。避免使用AI常见的、没有情感的"死鱼眼"表情。眼睛需要有神采和焦点。`;
    
    const newStyle = getStyleDescription(style);
    
    // Preserve user's custom instructions when regenerating prompt
    const currentCustomInstructions = parsePrompt(masterPrompt).customInstructions;

    const fullPrompt = `${HEADER_MODEL}\n${newModelDef.trim()}\n\n${HEADER_ART}\n${newArtDirection.trim()}\n\n${HEADER_STYLE}\n${newStyle.trim()}\n\n${HEADER_CUSTOM}\n${currentCustomInstructions}`;
    setMasterPrompt(fullPrompt);
  }, [ethnicity, age, style, parsePrompt, masterPrompt]);

  const fetchModelBase64 = async (url: string): Promise<string> => {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleGenerate = async () => {
    if (!productImage) return;

    // Check balance
    const actionType = isProMode ? 'GENERATE_PRO' : 'GENERATE_STANDARD';
    const cost = costs[actionType] ?? DEFAULT_TOTAL_COST;
    if (!platform.checkBalance(cost)) {
      return;
    }

    setProcessing({ isLoading: true, statusMessage: '分析首饰材质...' });
    setGeneratedImages([]);
    
    try {
      const modelBase64 = referenceImage || await fetchModelBase64(getModelImage(gender, jewelryType, viewType));
      setTimeout(() => setProcessing(prev => ({ ...prev, statusMessage: isProMode ? `高精度渲染 (2张, ${imageSize})...` : '并行生成 2 张方案...' })), 1200);
      
      const finalPromptParts = parsePrompt(masterPrompt);
      const results = await generateTryOn(productImage, modelBase64, jewelryType, viewType, gender, finalPromptParts, isProMode, imageSize, aspectRatio);
      
      setGeneratedImages(results);
      setProcessing({ isLoading: false, statusMessage: '完成' });
      await platform.refreshCredits?.();
    } catch (error: any) {
      console.error("Generation failed:", error);
      let errorMessage = '生成失败，请重试。';
      const errorMessageString = (error.message || '').toLowerCase();

      if (errorMessageString.includes('api key not valid') || errorMessageString.includes('requested entity was not found') || errorMessageString.includes('permission denied')) {
        errorMessage = 'API 密钥无效或项目未启用结算。请检查 Pro 模式密钥并重试。';
      }
      
      setProcessing({ 
        isLoading: false, 
        statusMessage: '', 
        error: errorMessage
      });
    }
  };

  const handleDownload = (imageUrl: string, index: number) => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `smart-tryon-${ethnicity}-${age}-${style}-${index + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const handleAccordionToggle = (accordionKey: string) => {
    setOpenAccordions(prev =>
      prev.includes(accordionKey)
        ? prev.filter(k => k !== accordionKey)
        : [...prev, accordionKey]
    );
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex items-center justify-center font-sans text-slate-800">
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-200" onClick={() => setPreviewImage(null)}>
          <button className="absolute top-6 right-6 text-white/70 hover:text-white bg-white/10 p-2 rounded-full transition-colors" onClick={() => setPreviewImage(null)}><X size={24} /></button>
          <div className="w-full h-full p-4 md:p-10 flex items-center justify-center overflow-hidden">
            <img src={previewImage} alt="Full Preview" className="max-w-full max-h-full object-contain shadow-2xl rounded-lg" onClick={(e) => e.stopPropagation()} />
          </div>
        </div>
      )}
      <div className="w-full max-w-7xl mx-auto h-[90vh] md:h-[95vh] flex flex-col md:flex-row gap-6">
        {/* Left Panel */}
        <div className="w-full md:w-[420px] md:min-w-[420px] h-full flex flex-col gap-6">
          <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-8 flex items-center justify-between shadow-lg shrink-0">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-black">智能饰品穿戴</h1>
              <p className="text-xs text-gray-500 font-medium mt-1 tracking-wide">AI Virtual Try-On Studio</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center"><Sparkles size={18} fill="currentColor" /></div>
          </div>
          <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-8 shadow-lg flex-1 flex flex-col overflow-y-auto scrollbar-hide">
            <div className="flex-1 flex flex-col gap-2">
              <div className="mb-4">
                <span className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
                  <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] text-gray-600">1</span>上传产品图
                </span>
                <ImageUploader label="" imageSrc={productImage} onImageChange={setProductImage} heightClass="h-48" helperText="推荐白底图" className="shadow-sm w-full" />
              </div>
              <div>
                <span className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] text-gray-600">2</span>参数设置
                </span>
                
                <div className="mb-6 mt-3 px-1">
                  <label className="text-xs font-semibold text-gray-500 mb-3 ml-1 flex items-center gap-2 uppercase tracking-wider">
                    <Settings2 size={14} /> 品类选择
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <LayoutGrid size={16} className="text-gray-500" />
                    </div>
                    <select 
                      value={jewelryType}
                      onChange={(e) => setJewelryType(e.target.value as JewelryType)}
                      className="w-full appearance-none bg-white/40 hover:bg-white/60 border border-white/40 hover:border-white/60 text-gray-800 text-sm rounded-xl py-3.5 pl-10 pr-10 focus:outline-none focus:ring-1 focus:ring-black/10 focus:bg-white/80 transition-all cursor-pointer shadow-sm font-medium"
                    >
                      {Object.values(JewelryType).map((type) => (
                        <option key={type} value={type}>
                          {typeLabels[type]}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-gray-500 group-hover:text-black transition-colors">
                      <ChevronDown size={16} />
                    </div>
                  </div>
                </div>

                <div className="h-px bg-gray-200/50 w-full mb-2"></div>
                
                <Accordion icon={Camera} title="参考模特 (可选)" summary={referenceImage ? '已上传自定义模特' : '使用内置模特库'} isOpen={openAccordions.includes('reference')} onToggle={() => handleAccordionToggle('reference')}>
                  <ImageUploader label="" imageSrc={referenceImage} onImageChange={setReferenceImage} heightClass="h-40" helperText="上传指定模特或特定姿势" className="shadow-sm" />
                </Accordion>

                <Accordion icon={User} title="模特定义" summary={`${genderLabels[gender]}, ${ageLabels[age]}, ${ethnicityLabels[ethnicity]}`} isOpen={openAccordions.includes('model')} onToggle={() => handleAccordionToggle('model')}>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-2 ml-1 flex items-center gap-2">性别</label>
                      {Object.values(ModelGender).map((g) => (<button key={g} onClick={() => setGender(g)} className={`w-full py-2 mt-1 px-3 text-xs rounded-lg transition-all text-left border ${gender === g ? 'bg-black/5 border-black/20 text-black font-medium' : 'bg-transparent border-transparent text-gray-500 hover:bg-white/40'}`}>{genderLabels[g]}</button>))}
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-2 ml-1 flex items-center gap-2">年龄</label>
                      {Object.values(ModelAge).map((a) => (<button key={a} onClick={() => setAge(a)} className={`w-full py-2 mt-1 px-3 text-xs rounded-lg transition-all text-left border ${age === a ? 'bg-black/5 border-black/20 text-black font-medium' : 'bg-transparent border-transparent text-gray-500 hover:bg-white/40'}`}>{ageLabels[a]}</button>))}
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="text-xs font-semibold text-gray-500 mb-2 ml-1 flex items-center gap-2">人种</label>
                    <div className="grid grid-cols-3 gap-2">
                      {Object.values(ModelEthnicity).map((e) => (<button key={e} onClick={() => setEthnicity(e)} className={`py-2 px-2 text-[11px] rounded-lg transition-all text-center border ${ethnicity === e ? 'bg-black/5 border-black/20 text-black font-medium' : 'bg-transparent border-transparent text-gray-500 hover:bg-white/40'}`}>{ethnicityLabels[e]}</button>))}
                    </div>
                  </div>
                </Accordion>

                <Accordion icon={Palette} title="视觉风格" summary={styleLabels[style]} isOpen={openAccordions.includes('style')} onToggle={() => handleAccordionToggle('style')}>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.values(EcommerceStyle).map((s) => (<button key={s} onClick={() => setStyle(s)} className={`py-2 px-2 text-[11px] rounded-lg transition-all text-center border whitespace-nowrap overflow-hidden text-ellipsis ${style === s ? 'bg-black/5 border-black/20 text-black font-medium' : 'bg-transparent border-transparent text-gray-500 hover:bg-white/40'}`}>{styleLabels[s]}</button>))}
                  </div>
                </Accordion>

                <Accordion icon={FilePenLine} title="AI 指令精调" summary="高级用户可编辑指令" isOpen={openAccordions.includes('prompt')} onToggle={() => handleAccordionToggle('prompt')}>
                  <textarea
                    value={masterPrompt}
                    onChange={(e) => setMasterPrompt(e.target.value)}
                    rows={15}
                    className="w-full bg-white/40 border border-white/40 rounded-xl p-3 text-xs leading-relaxed text-gray-700 placeholder-gray-400 focus:outline-none focus:bg-white/60 focus:border-black/10 transition-all resize-y"
                    placeholder="AI 指令将在此处根据您的选择自动生成..."
                  />
                </Accordion>

                <Accordion icon={SlidersHorizontal} title="高级设置" summary={isProMode ? `专业模式 (${imageSize}) / ${aspectRatio}` : `标准模式 / ${aspectRatio}`} isOpen={openAccordions.includes('advanced')} onToggle={() => handleAccordionToggle('advanced')}>
                  <div className="mt-4">
                    <label className="text-xs font-semibold text-gray-500 mb-2 ml-1 flex items-center gap-2">图片比例</label>
                    <div className="grid grid-cols-4 gap-2">
                      {(['3:4', '1:1', '9:16', '16:9'] as string[]).map((ratio) => (
                        <button key={ratio} onClick={() => setAspectRatio(ratio)} className={`py-2 px-2 text-xs rounded-lg transition-all text-center border ${aspectRatio === ratio ? 'bg-black/5 border-black/20 text-black font-medium' : 'bg-transparent border-transparent text-gray-500 hover:bg-white/40'}`}>{ratio}</button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="text-xs font-semibold text-gray-500 mb-2 ml-1 flex items-center gap-2">生成模式</label>
                    <div className={`rounded-xl border transition-all duration-300 overflow-hidden ${isProMode ? 'bg-white/60 border-amber-500/30' : 'bg-white/40 border-white/40'}`}>
                      <button onClick={() => setIsProMode(!isProMode)} className="w-full py-3 px-4 flex items-center justify-between hover:bg-white/20 transition-colors">
                        <div className="flex flex-col items-start text-left">
                          <span className="text-sm font-medium flex items-center gap-2 text-gray-800">{isProMode ? 'Pro 专业模式' : '标准模式'} {isProMode && <span className="text-[9px] bg-amber-500 text-black px-1.5 rounded font-bold">PRO</span>}</span>
                          <span className="text-[10px] opacity-60 mt-0.5 text-gray-600">{isProMode ? '极致光影 + 高清画质 (2K/4K)' : '标准光影 + 快速生成'}</span>
                        </div>
                        <div className={`w-10 h-5 rounded-full p-0.5 transition-colors duration-300 relative ${isProMode ? 'bg-amber-500' : 'bg-gray-300'}`}><div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform duration-300 absolute top-0.5 ${isProMode ? 'left-[calc(100%-1.125rem)]' : 'left-0.5'}`} /></div>
                      </button>
                      {isProMode && (<div className="px-4 pb-3 pt-1 animate-in slide-in-from-top-2 duration-200"><div className="h-px bg-gray-200/50 mb-3"></div><div className="flex items-center gap-3"><span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">分辨率</span><div className="flex flex-1 gap-2">{(['1K', '2K', '4K'] as ImageSize[]).map((size) => (<button key={size} onClick={() => setImageSize(size)} className={`flex-1 py-1.5 text-[10px] font-medium rounded-md border transition-all ${imageSize === size ? 'bg-amber-50 border-amber-500 text-amber-700 shadow-sm' : 'bg-transparent border-transparent text-gray-500 hover:bg-white/60'}`}>{size}</button>))}</div></div></div>)}
                    </div>
                  </div>
                </Accordion>
              </div>
            </div>
            <div className="mt-6 pt-6 border-t border-gray-200/30">
              <button onClick={handleGenerate} disabled={!productImage || processing.isLoading} className={`w-full py-4 rounded-2xl text-white font-medium text-base flex items-center justify-center gap-2 shadow-xl transition-all duration-500 ${!productImage || processing.isLoading ? 'bg-gray-300 cursor-not-allowed shadow-none' : isProMode ? 'bg-gradient-to-r from-amber-600 to-amber-700 hover:scale-[1.02] hover:shadow-2xl hover:shadow-amber-500/20' : 'bg-black hover:scale-[1.02] hover:shadow-2xl'}`}>{processing.isLoading ? (<><Loader2 className="animate-spin" size={18} /><span>{processing.statusMessage}</span></>) : (<><span>生成 2 张效果图</span><ChevronRight size={18} /></>)}</button>
              {processing.error && (<p className="text-red-500 text-xs text-center mt-3">{processing.error}</p>)}
            </div>
          </div>
        </div>
        {/* Right Panel */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] w-full h-full shadow-lg relative flex flex-col">
            <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-10 pointer-events-none">
              <div className="bg-white/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/50 shadow-sm pointer-events-auto flex items-center gap-3">
                <span className="text-xs font-semibold text-gray-800 flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${isProMode ? 'bg-amber-500' : 'bg-green-500'}`}></span>{genderLabels[gender]}</span>
                <span className="flex text-xs text-gray-500 items-center gap-1 border-l border-gray-300 pl-3">{ethnicityLabels[ethnicity]} • {ageLabels[age]} • {styleLabels[style]}</span>
                {isProMode && (<span className="text-[10px] font-bold bg-black text-white px-2 py-0.5 rounded-full ml-1">PRO {imageSize}</span>)}
              </div>
            </div>
            <div className="flex-1 w-full h-full flex items-center justify-center bg-white/20 p-4 md:p-8 rounded-[2rem]">
              {generatedImages.length > 0 ? (
                <div className={`w-full h-full grid gap-4 ${generatedImages.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {generatedImages.map((imgSrc, idx) => (
                    <div key={idx} className="relative w-full h-full flex items-center justify-center cursor-zoom-in group rounded-xl overflow-hidden bg-gray-50 border border-white/40 shadow-sm hover:shadow-lg transition-all duration-300" onClick={() => setPreviewImage(imgSrc)}>
                      <img src={imgSrc} alt={`Result ${idx + 1}`} className="max-w-full max-h-full object-contain transition-transform duration-500 group-hover:scale-105" />
                      <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                        <button onClick={(e) => { e.stopPropagation(); setPreviewImage(imgSrc); }} className="pointer-events-auto bg-black/60 hover:bg-black/80 backdrop-blur-md text-white p-2.5 rounded-full shadow-lg transition-colors" title="放大"><Expand size={16} /></button>
                        <button onClick={(e) => { e.stopPropagation(); handleDownload(imgSrc, idx); }} className="pointer-events-auto bg-white/90 hover:bg-white text-black p-2.5 rounded-full shadow-lg transition-colors" title="下载"><Download size={16} /></button>
                      </div>
                      <div className="absolute top-3 left-3 bg-black/50 backdrop-blur text-white text-[10px] px-2 py-0.5 rounded-full opacity-60">#0{idx + 1}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center max-w-sm">{processing.isLoading ? (
                  <div className="flex flex-col items-center">
                    <div className="relative w-24 h-24">
                      <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div><div className={`absolute inset-0 rounded-full border-4 border-t-transparent animate-spin ${isProMode ? 'border-amber-500' : 'border-black'}`}></div>
                      <div className="absolute inset-0 flex items-center justify-center"><Sparkles size={24} className={`animate-pulse ${isProMode ? 'text-amber-500' : 'text-black'}`} /></div>
                    </div>
                    <p className="mt-6 text-base font-medium text-gray-800 animate-pulse">{processing.statusMessage}</p>
                  </div>) : (
                  <><div className="w-20 h-20 bg-white/40 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-sm border border-white/50"><LayoutGrid size={32} className="text-gray-400" /></div>
                    <h3 className="text-lg font-medium text-gray-800 mb-2">准备生成</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">上传产品图 (必选) 和 参考图 (可选)，<br/>AI 将自动合成 2 张佩戴效果图。</p></>)}
                </div>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

