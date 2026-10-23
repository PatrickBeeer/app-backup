import React, { useState, useEffect } from 'react';
import { Download, RefreshCw, Maximize2, Layers, Activity, Mountain, Droplets, Gem } from '@/utils/lucide';
import { TextureMaps } from '../types';

interface ResultDisplayProps {
  maps: TextureMaps;
  loading: boolean; // General loading state
  pbrLoading: boolean; // Specific loading state for PBR maps
  onRegenerate: () => void;
  
  roughnessLevel?: number;
  metallicLevel?: number;
  displacementLevel?: number;
  onPBRSettingChange?: (type: 'roughness' | 'metallic' | 'height', value: number) => void;
}

type MapType = 'diffuse' | 'normal' | 'height' | 'roughness' | 'metallic';

const ResultDisplay: React.FC<ResultDisplayProps> = ({ 
    maps, 
    loading, 
    pbrLoading, 
    onRegenerate,
    roughnessLevel = 0.5,
    metallicLevel = 0.0,
    displacementLevel = 1.0,
    onPBRSettingChange
}) => {
  const [tiledMode, setTiledMode] = useState(false);
  const [activeTab, setActiveTab] = useState<MapType>('diffuse');

  // Automatically switch to diffuse if others are empty, or stay on current if valid
  const currentImageUrl = maps[activeTab];

  // Local state for sliders to allow smooth dragging before committing
  const [localRoughness, setLocalRoughness] = useState(roughnessLevel);
  const [localMetallic, setLocalMetallic] = useState(metallicLevel);
  const [localDisplacement, setLocalDisplacement] = useState(displacementLevel);

  // Sync local state when props change (e.g. reset)
  useEffect(() => {
    setLocalRoughness(roughnessLevel);
  }, [roughnessLevel]);

  useEffect(() => {
    setLocalMetallic(metallicLevel);
  }, [metallicLevel]);

  useEffect(() => {
    setLocalDisplacement(displacementLevel);
  }, [displacementLevel]);

  if (loading) {
    return (
      <div className="w-full h-full min-h-[500px] flex flex-col items-center justify-center bg-gray-50 rounded-xl border border-gray-200 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-5"></div>
        <div className="relative z-10 flex flex-col items-center">
            <div className="w-16 h-16 border-4 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin mb-4"></div>
            <p className="text-accent-cyan font-mono tracking-widest animate-pulse text-gray-900">正在合成贴图...</p>
            <p className="text-gray-600 text-xs mt-2">GPU 处理中 / 正在去噪扩散</p>
        </div>
      </div>
    );
  }

  if (!maps.diffuse) {
    return (
      <div className="w-full h-full min-h-[500px] flex items-center justify-center bg-gray-50 rounded-xl border border-dashed border-gray-300">
        <p className="text-gray-600 font-mono text-sm uppercase">等待生成数据...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 animate-in zoom-in-95 duration-500 h-full">
      {/* Header Controls */}
      <div className="flex items-center justify-between shrink-0">
         <h2 className="text-sm font-mono text-gray-600 uppercase tracking-widest flex items-center gap-2">
           <span className={`w-2 h-2 rounded-full ${pbrLoading ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`}></span>
           输出预览
         </h2>
         <div className="flex gap-2">
            <button 
              onClick={() => setTiledMode(!tiledMode)}
              className={`p-2 rounded transition-colors ${tiledMode ? 'bg-accent-cyan text-black' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
              title="切换平铺预览"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
         </div>
      </div>

      {/* Main Image Display Area - Centered and Constrained Max Width */}
      <div className="w-full max-w-[550px] mx-auto">
        <div className="relative w-full aspect-square bg-gray-100 rounded-xl overflow-hidden border border-gray-300 group shadow-xl">
            
            {/* Loading overlay for PBR maps */}
            {activeTab !== 'diffuse' && !currentImageUrl && pbrLoading && (
                <div className="absolute inset-0 z-20 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center">
                    <div className="w-8 h-8 border-2 border-accent-purple/30 border-t-accent-purple rounded-full animate-spin mb-2"></div>
                    <span className="text-xs text-accent-purple font-mono animate-pulse text-gray-900">正在计算 PBR 通道...</span>
                </div>
            )}

            {/* The Image */}
            {currentImageUrl ? (
                <div 
                className="w-full h-full transition-all duration-700 ease-in-out"
                style={{
                backgroundImage: `url(${currentImageUrl})`,
                backgroundSize: tiledMode ? '50%' : '100%',
                backgroundRepeat: 'repeat', // Always repeat to enable smooth shrinking transition
                backgroundPosition: 'center',
                // Removed 'pixelated' for better quality on photos
                }}
            />
            ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs font-mono bg-gray-100">
                    无数据
                </div>
            )}
        
            
            {/* Overlay Actions */}
            {currentImageUrl && (
                <div className="absolute inset-0 z-10 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 backdrop-blur-[2px]">
                <a 
                    href={currentImageUrl} 
                    download={`texture_${activeTab}-${Date.now()}.png`}
                    className="flex flex-col items-center gap-2 text-white hover:text-accent-cyan transition-colors"
                >
                    <div className="p-3 bg-gray-800 rounded-full border border-gray-600 hover:border-accent-cyan">
                    <Download className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-mono uppercase">下载当前层</span>
                </a>
                
                {activeTab === 'diffuse' && (
                    <button 
                        onClick={onRegenerate}
                        className="flex flex-col items-center gap-2 text-white hover:text-accent-purple transition-colors"
                    >
                        <div className="p-3 bg-gray-800 rounded-full border border-gray-600 hover:border-accent-purple">
                        <RefreshCw className="w-6 h-6" />
                        </div>
                        <span className="text-xs font-mono uppercase">重新生成</span>
                    </button>
                )}
                </div>
            )}

            <div className="absolute bottom-2 left-2 text-[10px] font-mono text-gray-700 bg-white/90 backdrop-blur-md px-2 py-1 rounded z-10 pointer-events-none border border-gray-300 shadow-sm">
            {tiledMode ? `预览：2x2 平铺 [${activeTab.toUpperCase()}]` : `预览：1:1 原图 [${activeTab.toUpperCase()}]`}
            </div>
        </div>
      </div>

      {/* Sliders for PBR Control */}
      {activeTab === 'roughness' && onPBRSettingChange && (
          <div className="w-full bg-gray-50 p-3 rounded-lg border border-gray-200 flex flex-col gap-2">
            <div className="flex justify-between text-xs font-mono text-gray-700">
                <span>粗糙度基准 (Roughness)</span>
                <span>{Math.round(localRoughness * 100)}%</span>
            </div>
            <input 
                type="range" 
                min="0" max="1" step="0.05"
                value={localRoughness}
                onChange={(e) => setLocalRoughness(parseFloat(e.target.value))}
                onMouseUp={() => onPBRSettingChange('roughness', localRoughness)}
                onTouchEnd={() => onPBRSettingChange('roughness', localRoughness)}
                className="w-full h-1.5 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-orange-500 hover:accent-orange-400"
            />
            <div className="flex justify-between text-[10px] text-gray-600">
                <span>光滑 (Smooth)</span>
                <span>粗糙 (Rough)</span>
            </div>
          </div>
      )}

      {activeTab === 'metallic' && onPBRSettingChange && (
          <div className="w-full bg-gray-50 p-3 rounded-lg border border-gray-200 flex flex-col gap-2">
            <div className="flex justify-between text-xs font-mono text-gray-700">
                <span>金属度基准 (Metallic)</span>
                <span>{Math.round(localMetallic * 100)}%</span>
            </div>
            <input 
                type="range" 
                min="0" max="1" step="0.05"
                value={localMetallic}
                onChange={(e) => setLocalMetallic(parseFloat(e.target.value))}
                onMouseUp={() => onPBRSettingChange('metallic', localMetallic)}
                onTouchEnd={() => onPBRSettingChange('metallic', localMetallic)}
                className="w-full h-1.5 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-blue-400 hover:accent-blue-300"
            />
            <div className="flex justify-between text-[10px] text-gray-600">
                <span>非金属 (Dielectric)</span>
                <span>金属 (Metal)</span>
            </div>
          </div>
      )}

      {activeTab === 'height' && onPBRSettingChange && (
          <div className="w-full bg-gray-50 p-3 rounded-lg border border-gray-200 flex flex-col gap-2">
            <div className="flex justify-between text-xs font-mono text-gray-700">
                <span>置换强度 (Displacement)</span>
                <span>{localDisplacement.toFixed(1)}x</span>
            </div>
            <input 
                type="range" 
                min="0" max="2" step="0.1"
                value={localDisplacement}
                onChange={(e) => setLocalDisplacement(parseFloat(e.target.value))}
                onMouseUp={() => onPBRSettingChange('height', localDisplacement)}
                onTouchEnd={() => onPBRSettingChange('height', localDisplacement)}
                className="w-full h-1.5 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400"
            />
            <div className="flex justify-between text-[10px] text-gray-600">
                <span>平坦 (Flat)</span>
                <span>深邃 (Deep)</span>
            </div>
          </div>
      )}

      {/* Tabs / Channel Switcher */}
      <div className="grid grid-cols-5 gap-2 bg-gray-100 p-1 rounded-lg border border-gray-200 shrink-0">
         <button
            onClick={() => setActiveTab('diffuse')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-xs font-medium transition-all
                ${activeTab === 'diffuse' 
                    ? 'bg-gray-300 text-gray-900 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                }
            `}
         >
            <Layers className="w-3.5 h-3.5" />
            原色
         </button>
         <button
            onClick={() => setActiveTab('normal')}
            disabled={!maps.diffuse}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-xs font-medium transition-all relative overflow-hidden
                ${activeTab === 'normal' 
                    ? 'bg-indigo-100 text-indigo-800 border border-indigo-300' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                }
                ${!maps.diffuse ? 'opacity-50 cursor-not-allowed' : ''}
            `}
         >  
            {pbrLoading && !maps.normal && <div className="absolute bottom-0 left-0 h-0.5 bg-indigo-500 animate-[width_1s_ease-in-out_infinite] w-full"></div>}
            <Activity className="w-3.5 h-3.5" />
            法线
         </button>
         <button
            onClick={() => setActiveTab('height')}
            disabled={!maps.diffuse}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-xs font-medium transition-all relative overflow-hidden
                ${activeTab === 'height' 
                    ? 'bg-gray-300 text-gray-900 border border-gray-400' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                }
                ${!maps.diffuse ? 'opacity-50 cursor-not-allowed' : ''}
            `}
         >
            {pbrLoading && !maps.height && <div className="absolute bottom-0 left-0 h-0.5 bg-gray-700 animate-[width_1s_ease-in-out_infinite] w-full"></div>}
            <Mountain className="w-3.5 h-3.5" />
            置换
         </button>
         <button
            onClick={() => setActiveTab('roughness')}
            disabled={!maps.diffuse}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-xs font-medium transition-all relative overflow-hidden
                ${activeTab === 'roughness' 
                    ? 'bg-orange-100 text-orange-800 border border-orange-300' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                }
                ${!maps.diffuse ? 'opacity-50 cursor-not-allowed' : ''}
            `}
         >
            {pbrLoading && !maps.roughness && <div className="absolute bottom-0 left-0 h-0.5 bg-orange-500 animate-[width_1s_ease-in-out_infinite] w-full"></div>}
            <Droplets className="w-3.5 h-3.5" />
            粗糙
         </button>
         <button
            onClick={() => setActiveTab('metallic')}
            disabled={!maps.diffuse}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-xs font-medium transition-all relative overflow-hidden
                ${activeTab === 'metallic' 
                    ? 'bg-blue-100 text-blue-800 border border-blue-300' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                }
                ${!maps.diffuse ? 'opacity-50 cursor-not-allowed' : ''}
            `}
         >
            {pbrLoading && !maps.metallic && <div className="absolute bottom-0 left-0 h-0.5 bg-blue-500 animate-[width_1s_ease-in-out_infinite] w-full"></div>}
            <Gem className="w-3.5 h-3.5" />
            金属
         </button>
      </div>

      {/* Info Footer */}
      <div className="flex justify-between items-center bg-gray-50 p-3 rounded border border-gray-200 mt-auto shrink-0">
         <div className="flex flex-col">
            <span className="text-[10px] text-gray-600 uppercase tracking-wider">分辨率</span>
            <span className="text-xs text-gray-800 font-mono">1024x1024</span>
         </div>
         <div className="flex flex-col items-end">
            <span className="text-[10px] text-gray-600 uppercase tracking-wider">格式</span>
            <span className="text-xs text-gray-800 font-mono">PNG / RGB</span>
         </div>
      </div>
    </div>
  );
};

export default ResultDisplay;