import React, { useState } from 'react';
import { PageSection, AspectRatio, TargetAudience } from '../types';
import { PlatformService } from '../../../types';
import * as GeminiService from '../services/geminiService';

interface ShotCardProps {
  frame: PageSection;
  onUpdate: (updatedFrame: PageSection) => void;
  onDelete?: () => void;
    appId: string;
    platform: PlatformService;
        imageGenerateCost: number;
  globalStyle: string;
  productImages?: string[];
  onImageClick?: (imageUrl: string) => void;
  isSelected: boolean;
  onSelect: (id: string) => void;
  targetAudience: TargetAudience;
}

export const ShotCard: React.FC<ShotCardProps> = ({ 
        frame, onUpdate, onDelete, appId, platform, imageGenerateCost, globalStyle, productImages, onImageClick, isSelected, onSelect, targetAudience
}) => {
  const [showVisualPrompt, setShowVisualPrompt] = useState(false);
  const [showCopywriting, setShowCopywriting] = useState(false);
  const [showSpecs, setShowSpecs] = useState(true);

  const update = (partial: Partial<PageSection>) => onUpdate({ ...frame, ...partial });

  const isSpecSection = frame.sectionType.includes("参数") || frame.sectionType.includes("规格");
  const hasSpecs = frame.specs && frame.specs.trim().length > 0;

    const handleGenerateImage = async () => {
    if (isSpecSection && !hasSpecs) {
        alert("⚠️ 请先在下方“参数内容”框中补充具体参数信息，否则无法生成具备说服力的参数表。");
        setShowSpecs(true);
        return;
    }

        const cost = imageGenerateCost;
        const actionType = 'GENERATE_IMAGE';

        if (!platform.checkBalance(cost)) {
            platform.showRecharge();
            return;
        }

    update({ isGeneratingImage: true });
    try {
      const imageUrl = await GeminiService.generateStoryboardImage(
                frame.visualPrompt,
                frame.resolution,
                globalStyle,
                frame.aspectRatio,
                productImages,
                frame.copywriting,
                targetAudience,
                frame.specs
      );

      const newHistory = [...frame.imageHistory, imageUrl];
            await platform.refreshCredits?.();
      update({ imageUrl, imageHistory: newHistory, historyIndex: newHistory.length - 1, isGeneratingImage: false });
        } catch (e: any) {
      update({ isGeneratingImage: false });
            alert(e?.message || '生成失败。');
    }
  };

        const handleDownloadImage = (e?: React.MouseEvent) => {
        e?.stopPropagation();
    if (!frame.imageUrl) return;

        const dataUrlToBlob = (dataUrl: string): Blob => {
            const parts = dataUrl.split(',');
            const meta = parts[0] || '';
            const base64 = parts[1] || '';
            const mimeMatch = meta.match(/data:(.*?);base64/);
            const mime = mimeMatch ? mimeMatch[1] : 'image/png';
            const binary = atob(base64);
            const len = binary.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i += 1) {
                bytes[i] = binary.charCodeAt(i);
            }
            return new Blob([bytes], { type: mime });
        };

        const blob = frame.imageUrl.startsWith('data:image/')
            ? dataUrlToBlob(frame.imageUrl)
            : null;
        const href = blob ? URL.createObjectURL(blob) : frame.imageUrl;
    const link = document.createElement('a');
        link.href = href;
    link.download = `shot_${frame.sectionNumber}.png`;
        link.rel = 'noopener';
        document.body.appendChild(link);
    link.click();
        link.remove();

        if (blob) {
            setTimeout(() => URL.revokeObjectURL(href), 1000);
        }
  };

  const getAspectRatioClass = (ratio: AspectRatio) => {
      switch(ratio) {
          case AspectRatio.PORTRAIT: return 'aspect-[9/16]';
          case AspectRatio.PORTRAIT_3_4: return 'aspect-[3/4]';
          case AspectRatio.SQUARE: return 'aspect-square';
          default: return 'aspect-video';
      }
  };

  return (
    <div 
      className={`relative flex flex-col gap-4 p-5 rounded-[2rem] transition-all duration-500 cursor-default
                  ${isSelected 
                      ? 'bg-white shadow-2xl ring-4 ring-blue-500/10 scale-[1.02]' 
                      : 'bg-white/40 border border-white hover:bg-white hover:shadow-xl hover:scale-[1.01]'
                  }`}
      onClick={() => onSelect(frame.id)}
    >
      <div className="flex justify-between items-center px-1">
        <div className="flex items-center gap-3">
             <div className="w-9 h-9 rounded-2xl bg-black text-white flex items-center justify-center font-bold text-xs shadow-lg">
                {frame.sectionNumber}
             </div>
            <div>
                <span className="text-sm font-bold text-black tracking-tight">{frame.sectionType}</span>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Target: {targetAudience}</p>
            </div>
        </div>
        <div className="flex items-center gap-2">
            {frame.imageUrl && (
                <button onClick={handleDownloadImage} className="text-gray-400 hover:text-black transition p-1" title="下载此图">
                    <i className="ph ph-download-simple text-lg"></i>
                </button>
            )}
            {onDelete && (
                <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-gray-300 hover:text-red-500 transition p-1">
                    <i className="ph ph-trash text-lg"></i>
                </button>
            )}
        </div>
      </div>

      <div 
                    className={`w-full bg-gray-100 rounded-[1.5rem] overflow-hidden relative group border border-gray-200/50 shadow-inner ${getAspectRatioClass(frame.aspectRatio)} ${frame.isGeneratingImage ? 'cursor-wait' : 'cursor-pointer hover:ring-2 hover:ring-black/10'}`}
          onClick={(e) => {
            e.stopPropagation();
                        if (frame.isGeneratingImage) return;
                        if (frame.imageUrl && onImageClick) {
                            onImageClick(frame.imageUrl);
                            return;
                        }
                        void handleGenerateImage();
          }}
      >
           {frame.imageUrl ? (
                <img src={frame.imageUrl} alt="Design" className="w-full h-full object-cover" />
           ) : (
               <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-3 transition-colors">
                   {isSpecSection && !hasSpecs ? (
                       <div className="flex flex-col items-center gap-2 p-6 text-center">
                           <div className="w-14 h-14 bg-amber-100 text-amber-500 rounded-full flex items-center justify-center animate-bounce">
                               <i className="ph-fill ph-warning-circle text-3xl"></i>
                           </div>
                           <span className="text-[11px] font-bold text-amber-700 uppercase tracking-tight">请完善参数内容</span>
                       </div>
                   ) : (
                       <>
                           <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-sm border border-gray-200">
                               <i className="ph ph-image-square text-xl"></i>
                           </div>
                           <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">点击生成 ({imageGenerateCost}积分)</span>
                       </>
                   )}
               </div>
           )}

           {frame.isGeneratingImage && (
               <div className="absolute inset-0 bg-white/80 backdrop-blur-md flex flex-col items-center justify-center gap-3">
                   <div className="w-8 h-8 border-3 border-gray-200 border-t-black rounded-full animate-spin"></div>
                   <span className="text-[10px] font-bold tracking-widest text-black uppercase">Fulfilling...</span>
               </div>
           )}
      </div>

      <div className="space-y-3 px-1">
          {isSpecSection && (
             <div className={`rounded-2xl p-4 border transition-all ${!hasSpecs ? 'bg-amber-50 border-amber-200' : 'bg-white/60 border-gray-200'}`}>
                <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-2">
                        <i className={`ph ph-list-bullets text-sm ${!hasSpecs ? 'text-amber-500' : 'text-gray-400'}`}></i>
                        <label className={`text-[10px] uppercase font-bold tracking-wider ${!hasSpecs ? 'text-amber-600' : 'text-gray-500'}`}>参数内容 (决定生成质量)</label>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setShowSpecs(!showSpecs); }} className="text-gray-400 hover:text-black">
                        <i className={`ph ph-caret-${showSpecs ? 'up' : 'down'}`}></i>
                    </button>
                </div>
                {showSpecs && (
                    <textarea 
                        className="w-full mt-2 bg-transparent text-xs text-black border-none focus:ring-0 p-0 resize-none h-32 leading-relaxed placeholder-gray-300"
                        placeholder="品牌: [请输入品牌名]&#10;型号: ACK-KH20ZQ&#10;额定电压: 220V&#10;额定功率: 230W&#10;产品尺寸: 40x36x23.5cm&#10;..."
                        value={frame.specs || ''}
                        onChange={(e) => update({ specs: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                    />
                )}
             </div>
          )}

          <div className="bg-white/40 rounded-2xl p-4 border border-white">
              <div className="flex justify-between items-center mb-1">
                  <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">画面渲染指导</label>
                  <button onClick={(e) => { e.stopPropagation(); setShowVisualPrompt(!showVisualPrompt); }} className="text-gray-400 hover:text-black">
                      <i className={`ph ph-caret-${showVisualPrompt ? 'up' : 'down'}`}></i>
                  </button>
              </div>
              {showVisualPrompt && (
                  <textarea 
                      className="w-full mt-2 bg-transparent text-xs text-black border-none focus:ring-0 p-0 resize-none h-20 leading-relaxed"
                      value={frame.visualPrompt}
                      onChange={(e) => update({ visualPrompt: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                  />
              )}
          </div>
          
          <div className="bg-black/5 rounded-2xl p-4 border border-black/5">
              <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2">
                      <label className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">营销文案策划</label>
                      <i className="ph ph-scales text-gray-400 text-[10px]" title="已启用广告法合规检查"></i>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setShowCopywriting(!showCopywriting); }} className="text-gray-400 hover:text-black">
                      <i className={`ph ph-caret-${showCopywriting ? 'up' : 'down'}`}></i>
                  </button>
              </div>
              {showCopywriting && (
                  <textarea 
                      className="w-full mt-2 bg-transparent text-xs font-medium text-black border-none focus:ring-0 p-0 resize-none h-20 leading-relaxed"
                      value={frame.copywriting}
                      onChange={(e) => update({ copywriting: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                  />
              )}
          </div>
      </div>
    </div>
  );
};