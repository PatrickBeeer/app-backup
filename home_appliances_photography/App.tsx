/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef } from 'react';
import { 
  Upload, 
  X, 
  Tv, 
  Refrigerator, 
  Wind, 
  Image as ImageIcon, 
  User, 
  Sparkles, 
  WashingMachine,
  Utensils,
  Droplets,
  Flame,
  ShieldCheck,
  Download,
  Loader2,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppProps } from '../../types';
import { generateContent, extractTextFromResponse, extractImageFromResponse } from '../../shared_services/geminiProxyService';
import { ApplianceType, AspectRatio, SceneStyle, AppState, ModelEthnicity, ModelAge, BrandStyle, ModelGender } from './types';

const DEFAULT_COST_PER_IMAGE = 10;
const MODEL_IDS = {
  text: 'gemini-3-flash-preview',
  image: 'gemini-3.1-flash-image-preview',
  video: 'veo_3_1',
} as const;

const Navbar = () => (
  <nav className="h-16 flex items-center px-6 sticky top-16 z-20">
    <div className="flex items-center gap-2 bg-white/60 backdrop-blur-md border border-white/40 rounded-full px-4 py-2 shadow-sm">
      <div className="w-6 h-6 bg-black rounded-full flex items-center justify-center">
        <Sparkles className="text-white w-3 h-3" />
      </div>
      <span className="font-bold text-lg tracking-tight">大家电 <span className="text-slate-500 font-medium">AI 影棚</span></span>
    </div>
  </nav>
);

const Uploader = ({ 
  image, 
  onUpload, 
  onClear 
}: { 
  image: string | null; 
  onUpload: (base64: string) => void; 
  onClear: () => void;
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        onUpload(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  return (
    <div className="space-y-3">
      <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">1. 上传家电照片</label>
      <div 
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className={`relative aspect-video rounded-[2rem] border border-white/40 transition-all duration-300 overflow-hidden flex flex-col items-center justify-center bg-white/40 backdrop-blur-md ${
          image ? 'border-indigo-500' : 'hover:border-indigo-400'
        }`}
      >
        {image ? (
          <>
            <img src={image} alt="预览" className="w-full h-full object-contain p-2" />
            <button 
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="absolute top-3 right-3 p-1.5 bg-white/90 backdrop-blur shadow-sm rounded-full text-slate-600 hover:text-red-500 transition-colors"
            >
              <X size={18} />
            </button>
          </>
        ) : (
          <div 
            className="cursor-pointer flex flex-col items-center gap-3 p-8 text-center"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <Upload size={24} />
            </div>
            <div>
              <p className="font-medium text-slate-700">点击或拖拽上传</p>
              <p className="text-sm text-slate-400 mt-1">支持 PNG, JPG，最大 10MB</p>
            </div>
          </div>
        )}
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*" 
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} 
        />
      </div>
    </div>
  );
};

const ConfigPanel = ({ 
  state, 
  setState, 
  onGenerate,
  generationCostPerImage,
}: { 
  state: AppState; 
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  onGenerate: (target?: 'scene' | 'model') => void;
  generationCostPerImage: number;
}) => {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">1.5 确认家电类型</label>
          {state.isDetecting && (
            <span className="flex items-center gap-1 text-[10px] text-indigo-600 font-medium">
              <Loader2 size={10} className="animate-spin" />
              正在自动识别...
            </span>
          )}
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { id: ApplianceType.TV, icon: <Tv size={14} />, label: '电视' },
            { id: ApplianceType.REFRIGERATOR, icon: <Refrigerator size={14} />, label: '冰箱' },
            { id: ApplianceType.AIR_CONDITIONER, icon: <Wind size={14} />, label: '空调' },
            { id: ApplianceType.WASHING_MACHINE, icon: <WashingMachine size={14} />, label: '洗/烘' },
            { id: ApplianceType.WATER_HEATER, icon: <Droplets size={14} />, label: '热水器' },
            { id: ApplianceType.DISHWASHER, icon: <Utensils size={14} />, label: '洗碗机' },
            { id: ApplianceType.KITCHEN_STOVE, icon: <Flame size={14} />, label: '烟灶' },
            { id: ApplianceType.STERILIZER, icon: <ShieldCheck size={14} />, label: '消毒柜' },
          ].map((type) => (
            <button
              key={type.id}
              onClick={() => setState(prev => ({ ...prev, selectedAppliance: type.id }))}
              className={`py-2 px-1 rounded-2xl text-[10px] font-bold transition-all flex flex-col items-center gap-1 border backdrop-blur-sm ${
                state.selectedAppliance === type.id 
                  ? 'bg-black text-white border-black scale-105' 
                  : 'bg-white/40 text-slate-600 border-white/40'
              }`}
            >
              {type.icon}
              {type.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">2. 选择尺寸</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: AspectRatio.SQUARE, label: '1:1 正方形' },
            { id: AspectRatio.LANDSCAPE, label: '16:9 横屏' },
            { id: AspectRatio.PORTRAIT, label: '9:16 竖屏' },
          ].map((ratio) => (
            <button
              key={ratio.id}
              onClick={() => setState(prev => ({ ...prev, selectedAspectRatio: ratio.id }))}
              className={`py-2 px-1 rounded-2xl text-[10px] font-bold transition-all border backdrop-blur-sm ${
                state.selectedAspectRatio === ratio.id 
                  ? 'bg-black text-white border-black' 
                  : 'bg-white/40 text-slate-600 border-white/40'
              }`}
            >
              {ratio.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">3. 选择品牌风格</label>
        <div className="grid grid-cols-3 gap-2">
          {Object.values(BrandStyle).map((brand) => (
            <button
              key={brand}
              onClick={() => setState(prev => ({ ...prev, selectedBrandStyle: brand }))}
              className={`py-2 px-1 rounded-2xl text-[10px] font-bold transition-all border backdrop-blur-sm ${
                state.selectedBrandStyle === brand 
                  ? 'bg-black text-white border-black' 
                  : 'bg-white/40 text-slate-600 border-white/40'
              }`}
            >
              {brand}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">4. 选择场景风格</label>
          {state.selectedBrandStyle !== BrandStyle.NONE && (
            <span className="text-[10px] text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
              已由品牌风格接管
            </span>
          )}
        </div>
        <div className={`grid grid-cols-2 gap-2 transition-opacity duration-300 ${state.selectedBrandStyle !== BrandStyle.NONE ? 'opacity-50 pointer-events-none' : ''}`}>
          {Object.values(SceneStyle).map((style) => (
            <button
              key={style}
              disabled={state.selectedBrandStyle !== BrandStyle.NONE}
              onClick={() => setState(prev => ({ ...prev, selectedSceneStyle: style }))}
              className={`py-2.5 px-3 rounded-xl text-xs font-medium border-2 transition-all flex items-center justify-between ${
                state.selectedSceneStyle === style 
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-600' 
                  : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'
              }`}
            >
              {style}
              {state.selectedSceneStyle === style && <Sparkles size={12} />}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 text-slate-700">
            <User size={16} className="text-indigo-600" />
            <span className="text-xs font-bold uppercase tracking-wider">模特配置</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold transition-colors ${!state.useModel ? 'text-indigo-600' : 'text-slate-400'}`}>无模特</span>
            <button 
              onClick={() => setState(prev => ({ ...prev, useModel: !prev.useModel }))}
              className={`relative flex items-center h-5 w-10 rounded-full transition-colors duration-300 focus:outline-none ${
                state.useModel ? 'bg-indigo-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`absolute left-0.5 h-4 w-4 rounded-full bg-white transition-transform duration-300 transform ${
                  state.useModel ? 'translate-x-5' : 'translate-x-0'
                } shadow-sm`}
              />
            </button>
            <span className={`text-[10px] font-bold transition-colors ${state.useModel ? 'text-indigo-600' : 'text-slate-400'}`}>有模特</span>
          </div>
        </div>

        <div className={`space-y-4 transition-all duration-300 ${state.useModel ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">模特人种</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.values(ModelEthnicity).map((ethnicity) => (
                <button
                  key={ethnicity}
                  disabled={!state.useModel}
                  onClick={() => setState(prev => ({ ...prev, selectedModelEthnicity: ethnicity }))}
                  className={`py-2 px-3 rounded-xl text-xs font-medium border-2 transition-all ${
                    state.selectedModelEthnicity === ethnicity 
                      ? 'border-indigo-600 bg-white text-indigo-600' 
                      : 'border-transparent bg-white/50 text-slate-500 hover:border-slate-200'
                  }`}
                >
                  {ethnicity}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">模特年龄</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.values(ModelAge).map((age) => (
                <button
                  key={age}
                  disabled={!state.useModel}
                  onClick={() => setState(prev => ({ ...prev, selectedModelAge: age }))}
                  className={`py-2 px-3 rounded-xl text-xs font-medium border-2 transition-all ${
                    state.selectedModelAge === age 
                      ? 'border-indigo-600 bg-white text-indigo-600' 
                      : 'border-transparent bg-white/50 text-slate-500 hover:border-slate-200'
                  }`}
                >
                  {age}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">模特组合</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.values(ModelGender).map((gender) => (
                <button
                  key={gender}
                  disabled={!state.useModel}
                  onClick={() => setState(prev => ({ ...prev, selectedModelGender: gender }))}
                  className={`py-2 px-2 rounded-xl text-[10px] font-medium border-2 transition-all ${
                    state.selectedModelGender === gender 
                      ? 'border-indigo-600 bg-white text-indigo-600' 
                      : 'border-transparent bg-white/50 text-slate-500 hover:border-slate-200'
                  }`}
                >
                  {gender}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">5. 自定义提示词 (可选)</label>
        <textarea
          value={state.customPrompt}
          onChange={(e) => setState(prev => ({ ...prev, customPrompt: e.target.value }))}
          placeholder="例如：增加温暖的夕阳光，背景有绿植..."
          className="w-full h-24 p-3 rounded-xl border-2 border-slate-100 bg-slate-50 text-sm text-slate-700 placeholder:text-slate-300 focus:border-indigo-500 focus:bg-white outline-none transition-all resize-none"
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <button
            disabled={!state.uploadedImage || state.isGenerating}
            onClick={() => onGenerate('scene')}
            className={`py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all text-xs ${
              state.isGenerating
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                : state.uploadedImage 
                  ? 'bg-white text-indigo-600 border-2 border-indigo-600 hover:bg-indigo-50 active:scale-[0.98]' 
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <ImageIcon size={16} />
            生成1张 ({generationCostPerImage} 积分)
          </button>
          
          <button
            disabled={!state.uploadedImage || state.isGenerating || !state.useModel}
            onClick={() => onGenerate()}
            className={`py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all text-xs ${
              state.isGenerating || !state.useModel
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border-2 border-transparent' 
                : state.uploadedImage 
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 active:scale-[0.98]' 
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Sparkles size={16} />
            {state.useModel ? `生成2张 (${generationCostPerImage * 2} 积分)` : '启用模特生成'}
          </button>
        </div>
        
        {state.isGenerating && (
          <div className="flex items-center justify-center gap-2 py-2 px-4 bg-indigo-50 rounded-xl text-indigo-600 text-[10px] font-bold animate-pulse">
            <Loader2 className="animate-spin" size={12} />
            {state.loadingStep}
          </div>
        )}
      </div>
    </div>
  );
};

const ImageCard = ({ 
  img, 
  label, 
  state, 
  setState, 
  activeRegen, 
  setActiveRegen, 
  onRegenerate, 
  handleDownload 
}: { 
  img: string | null; 
  label: string; 
  state: AppState; 
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  activeRegen: 'scene' | 'model' | null;
  setActiveRegen: (val: 'scene' | 'model' | null) => void;
  onRegenerate: (type: 'scene' | 'model', specificPrompt?: string) => void;
  handleDownload: (img: string, label: string) => void;
}) => {
  const regenPrompt = label === 'scene' ? state.sceneRegenPrompt : state.modelRegenPrompt;
  const setRegenPrompt = (val: string) => {
    setState(prev => ({
      ...prev,
      [label === 'scene' ? 'sceneRegenPrompt' : 'modelRegenPrompt']: val
    }));
  };

  return (
    <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col group">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
          {label === 'scene' ? <ImageIcon size={16} className="text-indigo-600" /> : <User size={16} className="text-indigo-600" />}
          {label === 'scene' ? '效果渲染图 A' : '效果渲染图 B'}
        </span>
        <div className="flex items-center gap-2">
          {img && !activeRegen && (
            <button 
              onClick={() => setActiveRegen(label as 'scene' | 'model')}
              disabled={state.isGenerating}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:border-indigo-500 hover:text-indigo-600 transition-all disabled:opacity-50"
            >
              <Sparkles size={12} />
              重新生成
            </button>
          )}
        </div>
      </div>
      
      <div className="flex-1 relative flex items-center justify-center p-4 min-h-[400px] bg-slate-50/30">
        {activeRegen === label ? (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-sm p-6 bg-white rounded-2xl shadow-xl border border-slate-100 space-y-4 z-20"
          >
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">局部重绘提示词</label>
              <textarea
                autoFocus
                value={regenPrompt}
                onChange={(e) => setRegenPrompt(e.target.value)}
                placeholder="输入针对此图的特殊要求..."
                className="w-full h-24 p-3 rounded-xl border-2 border-slate-100 bg-slate-50 text-sm text-slate-700 focus:border-indigo-500 focus:bg-white outline-none transition-all resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => setActiveRegen(null)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-all"
              >
                取消
              </button>
              <button 
                onClick={() => {
                  onRegenerate(label as 'scene' | 'model', regenPrompt);
                  setActiveRegen(null);
                }}
                className="flex-[2] py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all"
              >
                确认生成
              </button>
            </div>
          </motion.div>
        ) : img ? (
          <div className="relative w-full h-full flex flex-col items-center justify-center gap-6">
            <img src={img} alt={label} className="max-w-full max-h-[450px] object-contain rounded-xl shadow-md transition-transform group-hover:scale-[1.01]" />
            
            <button 
              onClick={() => handleDownload(img, label)}
              className="w-full max-w-xs flex items-center justify-center gap-3 py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl shadow-indigo-200 hover:bg-indigo-700 hover:-translate-y-0.5 active:translate-y-0 transition-all"
            >
              <Download size={20} />
              下载高清大图
            </button>
          </div>
        ) : (
          <div className="text-center space-y-3">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto text-slate-200 shadow-sm">
              <Sparkles size={32} />
            </div>
            <p className="text-xs text-slate-400 font-medium">等待生成...</p>
          </div>
        )}
      </div>
    </div>
  );
};

const ResultView = ({ 
  state, 
  setState,
  onRegenerate 
}: { 
  state: AppState; 
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  onRegenerate: (type: 'scene' | 'model', specificPrompt?: string) => void;
}) => {
  const [activeRegen, setActiveRegen] = useState<'scene' | 'model' | null>(null);

  const handleDownload = (img: string, label: string) => {
    const link = document.createElement('a');
    link.href = img;
    link.download = `appliance-${label}-${Date.now()}.png`;
    link.click();
  };

  return (
    <div className="h-full flex flex-col gap-6">
      <AnimatePresence mode="wait">
        {state.isGenerating && !state.resultSceneImage && !state.resultModelImage ? (
          <motion.div 
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center justify-center p-8 space-y-8"
          >
            <div className={`grid ${state.useModel ? 'grid-cols-2' : 'grid-cols-1'} gap-4 w-full max-w-2xl`}>
              <div className="aspect-[3/4] bg-slate-100 rounded-2xl animate-pulse" />
              {state.useModel && <div className="aspect-[3/4] bg-slate-100 rounded-2xl animate-pulse" />}
            </div>
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="animate-spin text-indigo-600" size={32} />
              <p className="text-sm font-medium text-slate-600 animate-pulse">{state.loadingStep}</p>
            </div>
          </motion.div>
        ) : !state.resultSceneImage && !state.resultModelImage && !state.isGenerating ? (
          <motion.div 
            key="empty"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center justify-center p-8 text-center space-y-4"
          >
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300">
              <ImageIcon size={40} />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-slate-800">准备就绪</h3>
              <p className="text-sm text-slate-400 max-w-[240px]">上传家电照片并配置参数，系统将为您生成高质量家居效果图，并可选生成模特互动图。</p>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="results"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex-1 grid grid-cols-1 ${state.useModel || state.resultModelImage ? 'xl:grid-cols-2' : 'max-w-2xl mx-auto w-full'} gap-8`}
          >
            <div className="relative">
              <ImageCard 
                img={state.resultSceneImage} 
                label="scene" 
                state={state}
                setState={setState}
                activeRegen={activeRegen}
                setActiveRegen={setActiveRegen}
                onRegenerate={onRegenerate}
                handleDownload={handleDownload}
              />
              {state.isGenerating && !state.resultSceneImage && (
                <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center rounded-2xl z-10">
                  <Loader2 className="animate-spin text-indigo-600" size={32} />
                </div>
              )}
            </div>
            {(state.useModel || state.resultModelImage) && (
              <div className="relative">
                <ImageCard 
                  img={state.resultModelImage} 
                  label="model" 
                  state={state}
                  setState={setState}
                  activeRegen={activeRegen}
                  setActiveRegen={setActiveRegen}
                  onRegenerate={onRegenerate}
                  handleDownload={handleDownload}
                />
                {state.isGenerating && !state.resultModelImage && (
                  <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center rounded-2xl z-10">
                    <Loader2 className="animate-spin text-indigo-600" size={32} />
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App({ platform, costs }: AppProps) {
  const generationCostPerImage = (costs as any).GENERATE_IMAGE ?? DEFAULT_COST_PER_IMAGE;
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<AppState>({
    uploadedImage: null,
    selectedAppliance: ApplianceType.TV,
    selectedAspectRatio: AspectRatio.SQUARE,
    selectedSceneStyle: SceneStyle.MODERN,
    selectedModelEthnicity: ModelEthnicity.CHINESE,
    selectedModelAge: ModelAge.YOUTH,
    selectedModelGender: ModelGender.FEMALE,
    selectedBrandStyle: BrandStyle.NONE,
    useModel: true,
    customPrompt: '',
    sceneRegenPrompt: '',
    modelRegenPrompt: '',
    isGenerating: false,
    isDetecting: false,
    resultSceneImage: null,
    resultModelImage: null,
    loadingStep: '',
  });

  const detectAppliance = async (base64: string) => {
    setState(prev => ({ ...prev, isDetecting: true }));
    try {
      const response = await generateContent({
        model: MODEL_IDS.text,
        task: 'text_gen',
        contents: {
          parts: [
            {
              inlineData: {
                data: base64.split(',')[1],
                mimeType: 'image/png',
              },
            },
            {
              text: `Identify the appliance in this image. 
              Choose ONLY one from these options: "电视机", "冰箱", "空调", "洗衣机/烘干机", "热水器", "洗碗机", "集成灶/油烟机/燃气灶", "消毒柜". 
              Return ONLY the name of the category.`
            },
          ],
        },
      });

      const detected = extractTextFromResponse(response).trim();
      if (detected && Object.values(ApplianceType).includes(detected as ApplianceType)) {
        setState(prev => ({ ...prev, selectedAppliance: detected as ApplianceType, isDetecting: false }));
      } else {
        setState(prev => ({ ...prev, isDetecting: false }));
      }
    } catch (error) {
      console.error('Detection failed:', error);
      setState(prev => ({ ...prev, isDetecting: false }));
    }
  };

  const handleGenerate = async (target?: 'scene' | 'model', specificPrompt?: string) => {
    if (!state.uploadedImage) return;
    const imageCount = target ? 1 : state.useModel ? 2 : 1;
    const totalCost = generationCostPerImage * imageCount;
    if (!platform.checkBalance(totalCost)) return;
    setError(null);

    setState(prev => ({ 
      ...prev, 
      isGenerating: true, 
      resultSceneImage: target === 'model' ? prev.resultSceneImage : null,
      resultModelImage: target === 'scene' ? prev.resultModelImage : null,
      loadingStep: '正在分析家电轮廓与风格...' 
    }));

    try {
      const generateImageWithRetry = async (isModel: boolean, overridePrompt?: string, retries = 3, delay = 2000): Promise<string | null> => {
        const finalCustomPrompt = overridePrompt !== undefined ? overridePrompt : state.customPrompt;
        const styleDetails: Record<SceneStyle, string> = {
          [SceneStyle.MODERN]: 'Clean lines, sophisticated furniture, abstract art on walls, designer floor lamps, and high-end materials like marble and polished wood.',
          [SceneStyle.NORDIC]: 'Warm wooden textures, cozy textiles, plenty of indoor plants, soft natural light, minimalist but functional furniture, and a lived-in atmosphere.',
          [SceneStyle.LUXURY]: 'Opulent decor, gold or brass accents, velvet upholstery, grand architectural details, crystal chandeliers, and a sense of exclusive high-end living.',
          [SceneStyle.NEW_CHINESE]: 'Elegant New Chinese interior, blending traditional oriental motifs with modern minimalism. Features dark wood framing, ink-wash painting textures, silk fabrics, zen-like lighting, and symmetrical layouts.',
          [SceneStyle.WABI_SABI]: 'Natural stone, rough-hewn wood, handmade ceramics, textured plaster walls, organic shapes, and a serene, uncluttered but deeply textured environment.',
          [SceneStyle.CREAM]: "Soft curved furniture, layered neutral tones, plush rugs, rounded architectural elements, and a warm, inviting, and highly aesthetic 'Instagrammable' look."
        };

        const interactionLogic = {
          [ApplianceType.TV]: 'The model(s) MUST be oriented towards the TV, sitting comfortably on a sofa or standing, looking directly at the TV screen as if watching a program. Their attention must be fully focused on the TV, showing a natural, relaxed, and engaged viewing experience. Their eyes should be fixed on the screen.',
          [ApplianceType.REFRIGERATOR]: 'The model(s) should be naturally interacting with the refrigerator. If the interaction involves opening a door, that specific door MUST be shown as physically OPEN, revealing a premium interior. CRITICAL: All other doors and sections of the refrigerator (including bottom freezer doors or drawers) MUST remain visible and correctly rendered according to the original product design. Do NOT omit or hide the bottom half of the appliance.',
          [ApplianceType.AIR_CONDITIONER]: 'The model(s) should be relaxing in the room, feeling the cool breeze, perhaps with hair slightly moving, or adjusting the settings with a remote control while looking comfortable.',
          [ApplianceType.WASHING_MACHINE]: 'The model(s) should be naturally standing or leaning next to the washing machine in a high-end laundry room. They can be holding a laundry basket or touching the control panel. The scene should feel clean, organized, and modern.',
          [ApplianceType.DISHWASHER]: 'The model(s) should be interacting with the dishwasher in a modern kitchen. They could be loading or unloading clean, sparkling dishes, or simply standing by the counter where it is installed, looking happy with the convenience.',
          [ApplianceType.WATER_HEATER]: 'The model(s) could be in a luxurious bathroom setting, perhaps testing the water temperature at a faucet or showerhead, looking satisfied and comfortable in a well-lit, steamy (but not blurry) environment.',
          [ApplianceType.KITCHEN_STOVE]: 'The model(s) should be joyfully cooking in a modern, high-end kitchen. They could be adjusting the gas stove knobs, checking the integrated stove, or standing near the range hood that is actively working (perhaps with a subtle mist or light effect).',
          [ApplianceType.STERILIZER]: 'The model(s) should be placing clean dishes into or taking them out of the disinfection cabinet, which should show a subtle internal blue light effect to signify it is a sterilizer. They should look confident in the cleanliness of their home.'
        };

        const spatialLogic = {
          [ApplianceType.TV]: 'The TV must be placed at a natural viewing height. CRITICAL: If the TV in the input image has a stand, base, or legs, it MUST be placed sitting perfectly on a high-end media console or TV stand; do NOT mount it on the wall. Only if the TV has no visible stand should it be mounted flush on a feature wall. It should be the central focus of the living area. NO FLOATING IN MID-AIR.',
          [ApplianceType.REFRIGERATOR]: 'The refrigerator must be shown in its FULL HEIGHT from top to bottom. It must be placed logically on the FLOOR within a kitchen setting, typically recessed into a dedicated tall cabinet cavity or standing against a wall. Ensure the entire unit, including the base and all door segments, is clearly visible and sits firmly on the ground. DO NOT place on top of counters or tables.',
          [ApplianceType.AIR_CONDITIONER]: "The air conditioner must be mounted high on a wall. It MUST be rendered as a 3D volume with clear depth, showing its top and side surfaces according to the camera's perspective. CRITICAL: The back of the unit must have a dark, soft 'contact shadow' (ambient occlusion) against the wall texture, making it look physically attached. There should be NO glowing or unnaturally clean edges where it meets the wall.",
          [ApplianceType.WASHING_MACHINE]: 'The washing machine (or dryer) MUST be placed on the FLOOR level in a modern laundry area, a designer bathroom, or an aesthetic balcony setting. It is usually recessed into a dedicated cavity under a countertop or within a floor-to-ceiling cabinetry unit. The entire front face and its base must be clearly visible and sit firmly on the ground. DO NOT place on top of high cabinets.',
          [ApplianceType.DISHWASHER]: 'The dishwasher MUST be perfectly EMBEDDED and RECESSED into the base kitchen cabinetry. It must be FLUSH with the surrounding cabinet door faces and sit directly on the floor level under a continuous countertop. It is a built-in appliance; its sides and top must be completely hidden within the cabinet structure. DO NOT place it as a free-standing unit or on top of any furniture.',
          [ApplianceType.WATER_HEATER]: 'The water heater MUST be wall-mounted vertically in a modern bathroom, a utility room, or a high-end balcony setting. It must be positioned at a height that allows for plumbing connections below. It should be rendered with a clear 3D volume, showing its curved or flat panels, and must be perfectly integrated with the wall texture with realistic mounting shadows. Ensure it looks like a permanent, solid installation.',
          [ApplianceType.KITCHEN_STOVE]: 'The kitchen stove (integrated stove, range hood, or gas hob) MUST be perfectly FITTED and EMBEDDED into the kitchen countertop. The hob part must be flush with the counter surface with zero visible height-gaps. The range hood MUST be positioned directly and vertically above the cooking surface at a standard functional height (usually 65-75cm above the counter). The entire kitchen island or wall unit must look structurally coherent and custom-designed.',
          [ApplianceType.STERILIZER]: 'The disinfection cabinet MUST be FULLY EMBEDDED into the kitchen wall or base cabinetry. It must be RECESSED so its front face is exactly flush with the adjacent cabinet panels. It must look like a seamless, built-in feature of a custom cabinetry unit.'
        };

        const brandStyleMapping: Record<BrandStyle, { prompt: string; negativePrompt: string }> = {
          [BrandStyle.SIEMENS]: {
            prompt: 'German industrial precision, high-end modern tech style interior, dark grey concrete walls, brushed metal textures, sleek surfaces, dramatic cool studio lighting, sharp edges, high contrast, clean and sterile',
            negativePrompt: 'warm sunlight, cozy, messy, rustic, heavy wood textures, colorful, soft pastel, traditional, cluttered'
          },
          [BrandStyle.MIDEA]: {
            prompt: 'cozy family home interior, warm morning sunlight, modern bright living space, light wood floors, soft fabric textures, indoor green plants, bright and airy, welcoming atmosphere, soft natural shadows',
            negativePrompt: 'cold, dark, industrial, cyberpunk, metallic, sterile, laboratory, dramatic heavy lighting, concrete'
          },
          [BrandStyle.HAIER]: {
            prompt: 'smart home concept interior, extreme minimalist modern design, pure white and light grey tones, seamless surfaces, soft LED ambient lighting, futuristic yet clean, high-key lighting, spacious and organized',
            negativePrompt: 'cluttered, vintage, heavy classic furniture, dark, complex textures, messy background, traditional decor'
          },
          [BrandStyle.GREE]: {
            prompt: 'High-resolution commercial product photography. Seamlessly integrated dark matte grey or graphite appliances (e.g., refrigerator, built-in oven) within custom-designed, contemporary cabinetry. Polished concrete or modern light oak flooring (no dark wood). Professional studio lighting—clean, even, and flattering, highlighting precise forms and sophisticated matte metallic and glass textures, *without* moody shadows or dramatic chiaroscuro. Subtle, professional decor, potentially one sculptural green plant, integrated neatly. Refined, intelligent, modern professional aesthetic. Magazine-quality rendering.',
            negativePrompt: 'moody shadows, dramatic chiaroscuro, dark wood, warm sunlight, cozy, messy, rustic, colorful, soft pastel, traditional, cluttered, New Chinese style, walnut wood, symmetric composition'
          },
          [BrandStyle.NONE]: {
            prompt: '',
            negativePrompt: ''
          }
        };

        const brandMapping = brandStyleMapping[state.selectedBrandStyle];
        const isBrandSelected = state.selectedBrandStyle !== BrandStyle.NONE;
        const brandAesthetics = isBrandSelected
          ? `BRAND AESTHETICS & VISUAL STYLE (MANDATORY): \n             - POSITIVE STYLE: ${brandMapping.prompt}. \n             - NEGATIVE PROMPT (STRICTLY AVOID): ${brandMapping.negativePrompt}.`
          : '';

        const currentSceneStyle = isBrandSelected ? `Brand-defined style (${state.selectedBrandStyle})` : state.selectedSceneStyle;
        const currentStyleDetails = isBrandSelected ? brandMapping.prompt : styleDetails[state.selectedSceneStyle];

        const prompt = `STRICT PRODUCT FIDELITY REQUIREMENT (MANDATORY): 
        - You MUST use the EXACT ${state.selectedAppliance} from the provided input image. 
        - DO NOT generate a generic, random, or different version of the ${state.selectedAppliance}. 
        - PRODUCT PIXEL-PERFECT CONSISTENCY: You MUST preserve the EXACT appearance, shape, color, logo, text labels, button layouts, and unique design textures of the ${state.selectedAppliance} from the provided image. 
        - The product is the absolute focal point. Every detail from the source photo must be reproduced with 100% accuracy.
        - The product is the HERO of this shot. 
        - FULL BODY VISIBILITY: You MUST render the ENTIRE appliance from top to bottom. Do NOT crop out the bottom doors, base, or legs of the ${state.selectedAppliance}.
        - STATE TRANSFORMATION: If the scene requires the product to be in an 'OPEN' state (like an open dishwasher or refrigerator), you MUST realistically render the interior while strictly maintaining the product's brand identity and materials from the source photo.
        - The product in the generated image must be a 1:1 PERCEPTUAL MATCH to the source photo in terms of style, branding, and finish (e.g., brushed metal, matte plastic, or glossy glass).
        
        STYLE & ENVIRONMENT CONSISTENCY (MANDATORY):
        - The overall environment, architectural layout, furniture placement, and lighting setup MUST be identical to a professional high-end ${currentSceneStyle} interior.
        - The style "${currentSceneStyle}" must be the dominant visual theme.
        - COLOR & TEXTURE HARMONY: Analyze the secondary colors and textures of the ${state.selectedAppliance}. The room's secondary elements (cushions, wall details, small decor) MUST echo these colors to ensure the product feels like an intentional part of the design, not an afterthought.
        - STRUCTURAL EMBEDDING (CRITICAL): If the appliance is built-in (like a dishwasher, sterilizer, or stove), the surrounding cabinetry MUST provide a dedicated, perfectly-sized recess. The appliance MUST be recessed into this opening so its front face is exactly flush with the cabinet doors. There should be zero visible side-gaps, ensuring a professional, integrated installation.
        - If generating multiple versions (one with models, one without), the room geometry, wall textures, floor materials, and lighting MUST remain 100% consistent and identical.
        
        ${brandAesthetics}
        
        PHOTOGRAPHIC REALISM & SEAMLESS INTEGRATION (CRITICAL):
        - NO STICKER LOOK: The product must NOT look like a flat cutout, a pasted sticker, or a separate layer. It must be physically and visually embedded into the 3D environment.
        - 3D VOLUME & PERSPECTIVE: The appliance must have visible thickness. Its perspective lines MUST converge to the same vanishing points as the room's walls and ceiling.
        - MATERIAL HARMONY: The floor or surface the appliance sits on MUST show realistic compression or weight-bearing contact shadows.
        - AMBIENT OCCLUSION & CONTACT SHADOWS: Generate deep, realistic contact shadows exactly where the product meets the floor or walls. For wall-mounted items, the shadow must be darkest at the point of contact and soften as it moves away.
        - LIGHT WRAP & GLOBAL ILLUMINATION: The environment's light should naturally "wrap" around the edges of the product. The product must receive "color bleed" from the surrounding environment.
        - LIGHTING HARMONY: The highlights and shadows on the product must align perfectly with the primary and secondary light sources in the room. Match the color temperature (Kelvin) of the room's lights.
        - REFLECTIONS: Metallic, glass, or glossy surfaces of the ${state.selectedAppliance} must reflect the actual generated room geometry and lighting, not generic studio reflections.
        - PHOTOGRAPHIC GRAIN & LENS CONSISTENCY: The entire image, including the product, must share the same photographic grain, noise level, and lens sharpness.
        - COLOR GRADING: Ensure the product's saturation, contrast, black levels, and white balance are perfectly matched to the rest of the scene for a cohesive look.
        
        E-COMMERCE PHOTOGRAPHY STANDARDS (CRITICAL):
        - NO FOREGROUND OBSTRUCTIONS: The view of the ${state.selectedAppliance} must be 100% clear and unobstructed. 
        - DO NOT place any objects (like plants, furniture, vases, or blurry elements) in the foreground that block, overlap, or obscure any part of the product.
        - The composition must be clean and centered on the product, following mainstream e-commerce catalog photography standards.
        
        SPATIAL LOGIC & PLACEMENT:
        - ${spatialLogic[state.selectedAppliance]}
        - Ensure the product's scale is realistic relative to the furniture and the room.
        - The perspective of the product must perfectly match the camera angle of the generated scene.
        
        Context: Generate a high-end, professional commercial photography shot. The scene must be FULLY FURNISHED but CLEAN and UNOBSTRUCTED.
        
        Environment: A premium ${isModel ? 'lifestyle setting' : 'interior design showcase'}. 
        - The room must feature high-quality furniture and realistic architectural textures.
        - Decorative items (vases, books, plants) should be placed in the BACKGROUND or MIDGROUND only. NEVER in the foreground.
        - Style: ${currentSceneStyle}. ${currentStyleDetails}
        
        ${finalCustomPrompt ? `Additional User Requirements: ${finalCustomPrompt}` : ''}
        
        Integration: Seamlessly place the UNCHANGED ${state.selectedAppliance} from the input image into the new environment.
        - Place it in a ${currentSceneStyle} home setting with perfect studio lighting, realistic reflections, and accurate shadows.
        - The product must be the focal point, clearly visible and well-lit.
        
        ${isModel ? `MODEL REALISM & PHOTOGRAPHY (CRITICAL):
        - ULTRA-REALISTIC HUMANS: The models MUST look 100% human, not AI-generated or digital art.
        - NATURAL SKIN TEXTURES: Include visible skin pores, natural skin micro-textures, subtle imperfections, and realistic peach fuzz. 
        - ABSOLUTELY NO PLASTIC LOOK: Avoid smooth, waxy, or overly edited "AI-skin". The skin should reflect light like real human skin (subsurface scattering).
        - AUTHENTIC EXPRESSIONS: Facial expressions must be natural, subtle, and relaxed. Avoid generic, frozen, or "perfect" AI smiles.
        - EYE REALISM: Detailed iris patterns, realistic wetness in eyes, and authentic catchlights from the room's light sources.
        - HAIR REALISM: Realistic hair strands, natural flyaways, and physically accurate interaction with the air and light.
        - IMPORTANT: Even with models present, the ${state.selectedAppliance} MUST be the exact one from the input image. DO NOT change its design.
        - Model Composition: ${state.selectedModelGender} (Note: '一女一男' means a couple, '一家三口' means a family of three with a child, '女和儿童' means a woman and a child).
        - STRICT MODEL COUNT: If the composition is '女性' (Female) or '男性' (Male), there MUST be EXACTLY ONE person in the image. DO NOT add extra people, children, or partners.
        - Model Ethnicity: ${state.selectedModelEthnicity}.
        - Model Age Group: ${state.selectedModelAge}.
        - ${interactionLogic[state.selectedAppliance]}
        - The models' poses must be natural, elegant, and professional. 
        - The models should NOT block the view of the product; they should complement it.` : '- Ensure NO humans are visible in the scene.'}
        
        Maintain correct perspective, scale, and lighting consistency while keeping the product itself 100% faithful to the original input image. The final result should look like a professional advertisement.`;

        try {
          const response = await generateContent({
            model: MODEL_IDS.image,
            task: 'image_gen',
            contents: {
              parts: [
                {
                  inlineData: {
                    data: state.uploadedImage!.split(',')[1],
                    mimeType: 'image/png',
                  },
                },
                { text: prompt },
              ],
            },
            config: {
              imageConfig: {
                aspectRatio: state.selectedAspectRatio
              }
            }
          });

          const imageData = extractImageFromResponse(response);
          if (imageData) {
            return imageData;
          }

          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
            return generateImageWithRetry(isModel, overridePrompt, retries - 1, delay * 2);
          }

          return null;
        } catch (error: any) {
          if (error?.message?.includes('429') || error?.message?.includes('RESOURCE_EXHAUSTED')) {
            if (retries > 0) {
              console.warn(`Rate limit hit (429). Retrying in ${delay}ms... (${retries} retries left)`);
              await new Promise(resolve => setTimeout(resolve, delay));
              return generateImageWithRetry(isModel, overridePrompt, retries - 1, delay * 2);
            }
          }
          throw error;
        }
      };

      if (target === 'scene') {
        setState(prev => ({ ...prev, loadingStep: '正在重新渲染家居场景图...' }));
        const sceneImg = await generateImageWithRetry(false, specificPrompt);
        if (!sceneImg) {
          throw new Error('场景图生成失败，请重试。');
        }
        setState(prev => ({ ...prev, resultSceneImage: sceneImg, isGenerating: false }));
        await platform.refreshCredits?.();
      } else if (target === 'model') {
        setState(prev => ({ ...prev, loadingStep: '正在重新渲染模特互动图...' }));
        const modelImg = await generateImageWithRetry(true, specificPrompt);
        if (!modelImg) {
          throw new Error('模特图生成失败，请重试。');
        }
        setState(prev => ({ ...prev, resultModelImage: modelImg, isGenerating: false }));
        await platform.refreshCredits?.();
      } else if (!state.useModel) {
        setState(prev => ({ ...prev, loadingStep: '正在渲染家居场景图...' }));
        const sceneImg = await generateImageWithRetry(false);
        if (!sceneImg) {
          throw new Error('场景图生成失败，请重试。');
        }
        setState(prev => ({ ...prev, resultSceneImage: sceneImg, resultModelImage: null, isGenerating: false }));
        await platform.refreshCredits?.();
      } else {
        setState(prev => ({ ...prev, loadingStep: '正在渲染家居场景图...' }));
        const sceneImg = await generateImageWithRetry(false);
        await new Promise(resolve => setTimeout(resolve, 1500));
        setState(prev => ({ ...prev, loadingStep: '正在渲染模特互动图...' }));
        const modelImg = await generateImageWithRetry(true);

        if (!sceneImg && !modelImg) {
          throw new Error('双图生成失败，请重试。');
        }

        if (sceneImg && !modelImg) {
          setError('已成功生成家居场景图，模特图生成失败，请点击模特图卡片重试。');
        } else if (!sceneImg && modelImg) {
          setError('已成功生成模特互动图，家居场景图生成失败，请点击场景图卡片重试。');
        }

        setState(prev => ({ 
          ...prev, 
          resultSceneImage: sceneImg, 
          resultModelImage: modelImg, 
          isGenerating: false 
        }));
        await platform.refreshCredits?.();
      }
    } catch (error) {
      console.error('Generation failed:', error);
      setError('生成失败，请重试。');
      setState(prev => ({ ...prev, isGenerating: false }));
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-8 p-6 lg:p-8">
        <div className="space-y-8 lg:sticky lg:top-24 h-fit">
          <div className="bg-white/70 backdrop-blur-md p-6 rounded-3xl border border-white/40 shadow-sm space-y-8">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900">配置参数</h2>
              <p className="text-sm text-slate-500">自定义家电的呈现方式。</p>
            </div>

            <Uploader 
              image={state.uploadedImage} 
              onUpload={(img) => {
                setState(prev => ({ ...prev, uploadedImage: img }));
                detectAppliance(img);
              }}
              onClear={() => setState(prev => ({ ...prev, uploadedImage: null, resultSceneImage: null, resultModelImage: null, isDetecting: false }))}
            />

            <ConfigPanel 
              state={state} 
              setState={setState} 
              onGenerate={handleGenerate}
              generationCostPerImage={generationCostPerImage}
            />
          </div>

          <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex gap-3">
            <div className="p-2 bg-white rounded-lg h-fit text-indigo-600 shadow-sm">
              <Sparkles size={16} />
            </div>
            <div className="text-xs text-indigo-900/70 leading-relaxed">
              <p className="font-semibold text-indigo-900 mb-0.5">小贴士</p>
              单图按每张 {generationCostPerImage} 积分计费；启用模特后可一次生成两张图，共 {generationCostPerImage * 2} 积分。
            </div>
          </div>

          {error && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
              {error}
            </div>
          )}
        </div>

        <ResultView state={state} setState={setState} onRegenerate={(type, prompt) => handleGenerate(type, prompt)} />
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}} />
    </div>
  );
}
