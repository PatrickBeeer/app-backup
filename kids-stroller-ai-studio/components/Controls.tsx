import React, { useState } from 'react';
import { AgeGroup, Ethnicity, GenerationStatus, AspectRatio, SceneStyle, CompositionRatio, ImageResolution } from '../types';

interface ControlsProps {
  ageGroup: AgeGroup;
  setAgeGroup: (age: AgeGroup) => void;
  ethnicity: Ethnicity;
  setEthnicity: (eth: Ethnicity) => void;
  aspectRatio: AspectRatio;
  setAspectRatio: (ratio: AspectRatio) => void;
  resolution: ImageResolution;
  setResolution: (res: ImageResolution) => void;
  sceneStyle: SceneStyle;
  setSceneStyle: (style: SceneStyle) => void;
  compositionRatio: CompositionRatio;
  setCompositionRatio: (ratio: CompositionRatio) => void;
  productSize: string;
  setProductSize: (size: string) => void;
  customPrompt: string;
  setCustomPrompt: (prompt: string) => void;
  seed: number;
  setSeed: (seed: number) => void;
  onGenerate: () => void;
  status: GenerationStatus;
  disabled: boolean;
}

export const Controls: React.FC<ControlsProps> = ({
  ageGroup, setAgeGroup, ethnicity, setEthnicity, aspectRatio, setAspectRatio,
  resolution, setResolution, sceneStyle, setSceneStyle, compositionRatio, setCompositionRatio,
  productSize, setProductSize, customPrompt, setCustomPrompt, seed, setSeed,
  onGenerate, status, disabled
}) => {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const getStyleIcon = (style: SceneStyle) => {
    switch (style) {
      case SceneStyle.WARM_INDOOR: return 'fa-couch';
      case SceneStyle.OUTDOOR: return 'fa-tree';
      case SceneStyle.WHITE_STUDIO: return 'fa-regular fa-square';
      case SceneStyle.CUSTOM: return 'fa-wand-magic-sparkles';
      default: return 'fa-image';
    }
  };

  return (
    <div className="bg-white/60 backdrop-blur-xl border border-white/40 p-8 rounded-[2rem] shadow-xl space-y-8">
      <div className="space-y-6">
        <div className="flex items-center justify-between px-1"><label className="text-xs font-bold text-gray-400 uppercase tracking-widest">02. 场景配置</label></div>
        <div>
          <span className="block text-sm font-semibold text-gray-900 mb-3">模特年龄</span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {Object.values(AgeGroup).map((age) => (
              <button key={age} onClick={() => setAgeGroup(age)} className={`px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 border ${ageGroup === age ? 'bg-gray-900 text-white border-gray-900 shadow-lg' : 'bg-white/40 text-gray-500 border-transparent hover:bg-white/80 hover:text-gray-900'}`}>{age.split(' ')[0]}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 sm:col-span-1">
            <span className="block text-sm font-semibold text-gray-900 mb-3">模特面孔</span>
            <div className="flex flex-col gap-2">
              {Object.values(Ethnicity).map((eth) => (
                <button key={eth} onClick={() => setEthnicity(eth)} className={`px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 text-left flex justify-between items-center ${ethnicity === eth ? 'bg-white shadow-md text-gray-900' : 'bg-white/40 text-gray-500 hover:bg-white/80'}`}><span>{eth}</span>{ethnicity === eth && <i className="fa-solid fa-check text-xs"></i>}</button>
              ))}
            </div>
          </div>
          <div className="col-span-2 sm:col-span-1 space-y-4">
            <div>
              <span className="block text-sm font-semibold text-gray-900 mb-3">图片比例</span>
              <div className="flex gap-2">
                {(['1:1', '3:4', '9:16'] as AspectRatio[]).map((ratio) => (
                  <button key={ratio} onClick={() => setAspectRatio(ratio)} className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all duration-200 flex flex-col items-center justify-center gap-1 ${aspectRatio === ratio ? 'bg-white shadow-md text-gray-900' : 'bg-white/40 text-gray-500 hover:bg-white/80'}`}><span>{ratio}</span><span className="text-[10px] text-gray-400 opacity-60">{ratio === '1:1' ? '方' : ratio === '3:4' ? '竖' : '全'}</span></button>
                ))}
              </div>
            </div>
            <div>
              <span className="block text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1">清晰度 <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-bold uppercase">PRO</span></span>
              <div className="flex gap-2 bg-white/40 p-1 rounded-xl">
                {(['2K', '4K'] as ImageResolution[]).map((res) => (
                  <button key={res} onClick={() => setResolution(res)} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${resolution === res ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-900 hover:bg-white/50'}`}>{res}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-gray-200/50 pt-2">
        <button onClick={() => setIsAdvancedOpen(!isAdvancedOpen)} className="w-full flex items-center justify-between py-2 group">
          <span className="text-sm font-bold text-gray-900 flex items-center gap-2"><i className={`fa-solid fa-sliders text-indigo-500 transition-transform ${isAdvancedOpen ? 'rotate-180' : ''}`}></i>精准微调 (Advanced)</span>
          <i className={`fa-solid fa-chevron-down text-gray-400 text-xs transition-transform duration-300 ${isAdvancedOpen ? 'rotate-180' : ''}`}></i>
        </button>
        <div className={`grid transition-all duration-500 ease-in-out overflow-hidden ${isAdvancedOpen ? 'grid-rows-[1fr] opacity-100 mt-6' : 'grid-rows-[0fr] opacity-0 mt-0'}`}>
          <div className="min-h-0 space-y-6">
            <div>
              <span className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">场景美学</span>
              <div className="grid grid-cols-1 gap-3">
                {Object.values(SceneStyle).map((style) => (
                  <button key={style} onClick={() => setSceneStyle(style)} className={`p-4 rounded-2xl text-left transition-all duration-200 flex items-center gap-4 group ${sceneStyle === style ? 'bg-gradient-to-r from-gray-900 to-gray-800 text-white shadow-lg' : 'bg-white/40 hover:bg-white/80 text-gray-600'}`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shadow-sm ${sceneStyle === style ? 'bg-white/20 text-white' : 'bg-white text-gray-400'}`}><i className={`fa-solid ${getStyleIcon(style)}`}></i></div>
                    <div>
                      <span className="font-bold block text-sm">{style}</span>
                      <span className={`text-xs ${sceneStyle === style ? 'text-gray-300' : 'text-gray-400'}`}>{style === SceneStyle.WARM_INDOOR && '温馨舒适，柔和光线'}{style === SceneStyle.OUTDOOR && '自然阳光，活力清新'}{style === SceneStyle.WHITE_STUDIO && '极简纯白，突出产品细节'}{style === SceneStyle.CUSTOM && '全自由度，编辑下方提示词'}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">相机构图</span>
              <div className="flex bg-white/40 p-1 rounded-2xl">
                {Object.values(CompositionRatio).map((ratio) => (
                  <button key={ratio} onClick={() => setCompositionRatio(ratio)} className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1 ${compositionRatio === ratio ? 'bg-white shadow-md text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
                    <i className={`fa-solid ${ratio === CompositionRatio.PRODUCT_FOCUS ? 'fa-magnifying-glass-plus' : ratio === CompositionRatio.BALANCED ? 'fa-camera' : 'fa-panorama'}`}></i>{ratio.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">真实尺寸参考</span>
              <input type="text" value={productSize} onChange={(e) => setProductSize(e.target.value)} placeholder="例如：长 110cm，大型儿童电动车..." className="w-full bg-white/40 border-0 rounded-2xl p-4 text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-black/5 outline-none transition-all" />
            </div>
            <div className={`transition-all duration-300 ${sceneStyle === SceneStyle.CUSTOM ? 'p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl' : ''}`}>
              <span className={`block text-xs font-bold uppercase tracking-widest mb-3 ${sceneStyle === SceneStyle.CUSTOM ? 'text-indigo-600' : 'text-gray-400'}`}>{sceneStyle === SceneStyle.CUSTOM ? '自定义指令 (必填)' : '自定义指令 (可选)'}</span>
              <textarea value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} placeholder={sceneStyle === SceneStyle.CUSTOM ? "请描述您想要的场景... 例如：梦幻糖果乐园、火星表面、赛博朋克街道..." : "添加细节，如：木质地板、蓝天白云..."} className={`w-full border-0 rounded-2xl p-4 text-sm text-gray-900 placeholder-gray-400 focus:ring-2 outline-none resize-none h-24 transition-all ${sceneStyle === SceneStyle.CUSTOM ? 'bg-white shadow-inner focus:ring-indigo-500/20' : 'bg-white/40 focus:ring-black/5'}`} />
            </div>
            <div>
              <span className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">随机种子 (Seed)</span>
              <div className="flex gap-2 mb-3">
                <input type="number" value={seed} onChange={(e) => setSeed(parseInt(e.target.value) || 0)} className="flex-1 bg-white/40 border-0 rounded-2xl p-4 text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-black/5 outline-none transition-all font-mono" placeholder="随机种子..." />
                <button onClick={() => setSeed(Math.floor(Math.random() * 2000000000))} className="w-14 bg-white/40 hover:bg-white/80 rounded-2xl flex items-center justify-center text-gray-600 transition-all shadow-sm active:scale-95" title="生成新种子"><i className="fa-solid fa-rotate"></i></button>
              </div>
              <div className="flex gap-3 items-start text-xs text-gray-500 bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100/50">
                <div className="bg-indigo-100 text-indigo-600 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"><i className="fa-regular fa-lightbulb"></i></div>
                <div className="space-y-1.5 leading-relaxed">
                  <p className="font-bold text-indigo-700">图片多样性小贴士</p>
                  <p><span className="font-semibold text-gray-700">可复现性：</span>使用相同的提示词和种子，AI将倾向于生成风格和构图都非常相似的图片，这对于系列创作非常有用。</p>
                  <p><span className="font-semibold text-gray-700">随机化：</span>如果您想探索新的创意，只需点击种子输入框旁边的刷新按钮，即可生成一个全新的随机种子，从而获得完全不同的创作结果。</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="pt-2">
        <button onClick={onGenerate} disabled={disabled || status === 'generating'} className={`w-full py-5 rounded-2xl font-bold text-lg tracking-wide transition-all duration-300 transform ${disabled || status === 'generating' ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-black text-white shadow-xl hover:shadow-2xl hover:scale-[1.02] active:scale-95'}`}>
          {status === 'generating' ? <span className="flex items-center justify-center gap-3"><i className="fa-solid fa-circle-notch fa-spin text-sm"></i><span>正在施展魔法...</span></span> : <span className="flex items-center justify-center gap-3"><span>生成场景</span><i className="fa-solid fa-arrow-right"></i></span>}
        </button>
      </div>
    </div>
  );
};
