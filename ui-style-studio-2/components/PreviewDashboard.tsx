
import React from 'react';
import { StyleConfig } from '../types';
import { 
  AreaChart, Area, ResponsiveContainer, Tooltip
} from 'recharts';
import { 
  Bell, 
  Search, 
  Target,
  CornerUpRight,
  Maximize,
  Droplets,
  Loader2,
  Zap,
  Cpu,
  ArrowDownUp
} from 'lucide-react';

const data = [
  { name: 'Jan', value: 400 },
  { name: 'Feb', value: 300 },
  { name: 'Mar', value: 600 },
  { name: 'Apr', value: 800 },
  { name: 'May', value: 500 },
  { name: 'Jun', value: 900 },
];

interface PreviewDashboardProps {
  style: StyleConfig;
  isLoading?: boolean;
}

const VibrantDecoration = () => (
  <div className="absolute inset-0 pointer-events-none overflow-hidden">
    <div className="absolute top-20 left-[-5%] w-[400px] flex flex-col gap-[-40px] floating-discs">
      {[...Array(6)].map((_, i) => (
        <div 
          key={i} 
          className="w-full h-24 rounded-full border-[10px] border-white/40 shadow-2xl backdrop-blur-sm -mt-12"
          style={{ 
            backgroundColor: `rgba(163, 230, 53, ${0.4 - i * 0.05})`,
            transform: `rotateX(45deg) rotateY(${i * 5}deg) translateX(${i * 10}px)`
          }}
        />
      ))}
    </div>
  </div>
);

const CyberHUDDecoration = () => (
  <div className="absolute inset-0 pointer-events-none overflow-hidden">
    <div className="scanline"></div>
    {/* 四角包边 */}
    <div className="absolute top-8 left-8 w-12 h-12 border-t-4 border-l-4 border-emerald-500 opacity-80" />
    <div className="absolute top-8 right-8 w-12 h-12 border-t-4 border-r-4 border-emerald-500 opacity-80" />
    <div className="absolute bottom-8 left-8 w-12 h-12 border-b-4 border-l-4 border-emerald-500 opacity-80" />
    <div className="absolute bottom-8 right-8 w-12 h-12 border-b-4 border-r-4 border-emerald-500 opacity-80" />
    
    {/* 雷达扫描器 */}
    <div className="absolute top-20 right-20 w-48 h-48 opacity-20 hud-glow">
      <div className="absolute inset-0 rounded-full border border-emerald-500" />
      <div className="absolute inset-4 rounded-full border border-emerald-500/50" />
      <div className="absolute inset-8 rounded-full border border-emerald-500/20" />
      <div className="absolute top-0 left-1/2 w-1 h-1/2 bg-emerald-500/40 origin-bottom animate-[spin_4s_linear_infinite]" />
    </div>

    {/* 随机数据线 */}
    <div className="absolute bottom-20 left-10 w-32 h-px bg-emerald-500/30" />
    <div className="absolute bottom-24 left-10 w-24 h-px bg-emerald-500/20" />
    <div className="absolute top-1/2 right-10 w-16 h-px bg-emerald-500/20 rotate-90" />
  </div>
);

const PreviewDashboard: React.FC<PreviewDashboardProps> = ({ style, isLoading }) => {
  const { visualSpecs } = style;

  if (isLoading) {
    return (
      <div className="absolute inset-0 bg-white/60 backdrop-blur-[40px] z-50 flex items-center justify-center flex-col gap-8 transition-all duration-500">
        <div className="relative">
          <div className="w-24 h-24 rounded-full border-8 border-indigo-50 border-t-indigo-600 animate-spin shadow-2xl" />
          <Loader2 className="absolute inset-0 m-auto text-indigo-600 animate-pulse" size={40} />
        </div>
        <div className="text-center">
          <p className="text-lg font-black text-indigo-900 uppercase tracking-[0.3em] animate-pulse">DNA RECONSTRUCTING</p>
          <p className="text-sm text-indigo-400 mt-3 font-bold opacity-60">Gemini 正在重绘视觉画布...</p>
        </div>
      </div>
    );
  }

  const isCyber = style.id === 'cyber-dark';
  const isVibrant = style.id === 'vibrant-lime';

  return (
    <div className="flex flex-col xl:flex-row w-full h-full min-h-[700px] overflow-hidden">
      {/* Main Dashboard Preview */}
      <div className={`flex-1 p-0 lg:p-0 ${visualSpecs.backgroundClass} transition-all duration-1000 relative overflow-y-auto custom-scrollbar flex flex-col`}>
        
        {isCyber && <CyberHUDDecoration />}
        {isVibrant && <VibrantDecoration />}

        {/* Navigation */}
        <nav className={`flex items-center justify-between px-10 py-7 ${visualSpecs.containerClass} ${isVibrant ? 'bg-black text-white' : ''}`}>
          <div className="flex items-center gap-5">
            <div className={`w-10 h-10 flex items-center justify-center text-white font-black transition-all ${isCyber ? 'rounded-none border border-emerald-400 hud-glow' : isVibrant ? 'rounded-none bg-[#bef264] text-black' : 'rounded-[14px] shadow-2xl'}`} style={isCyber || isVibrant ? {} : { backgroundColor: visualSpecs.accentColor }}>
              {isCyber ? <Cpu size={18} /> : 'S'}
            </div>
            <span className={`text-2xl tracking-tighter ${visualSpecs.textTitleClass} ${isVibrant ? 'text-white' : ''}`}>
              {isCyber ? '[ DASH_STUDIO ]' : 'Chain360'}
            </span>
          </div>
          
          <div className="hidden lg:flex items-center gap-10">
            {['Dashboard', 'Market', 'Swap', 'Security'].map((item, idx) => (
              <span key={item} className={`text-[11px] font-black uppercase tracking-[0.15em] cursor-pointer transition-all hover:opacity-100 ${idx === 2 ? 'opacity-100 border-b-2 border-current' : 'opacity-40'} ${visualSpecs.textContentClass} ${isVibrant ? 'text-white' : ''}`}>
                {item}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-6">
            <div className={`p-2 transition-colors ${isVibrant ? 'text-white' : 'opacity-60'}`}>
              <Search size={20} />
            </div>
            <div className={`w-10 h-10 overflow-hidden ${isCyber ? 'rounded-none border border-emerald-900' : isVibrant ? 'rounded-none border border-white/20' : 'rounded-full'}`}>
              <img src="https://picsum.photos/40/40?random=1" alt="Avatar" />
            </div>
          </div>
        </nav>

        <div className={`flex-1 flex flex-col lg:flex-row ${isVibrant ? 'bg-white' : ''}`}>
          {/* Left Column - Intro/Hero */}
          <div className={`flex-1 p-16 flex flex-col justify-center relative ${isVibrant ? 'lg:border-r border-gray-100 overflow-hidden' : ''}`}>
             <h1 className={`text-6xl lg:text-8xl mb-12 ${visualSpecs.textTitleClass}`}>
                {isVibrant ? <>Chain360°<br/>Swap</> : '智能引擎'}
             </h1>
             <p className={`text-sm max-w-sm leading-relaxed mb-10 ${visualSpecs.textContentClass}`}>
                {isVibrant ? '极速代币兑换，享受最优汇率与零感滑点，构建您的 Web3 资产矩阵。' : '正在分析视觉 DNA，构建您的重构空间。'}
             </p>
             {isVibrant && <div className="text-[10px] font-mono text-gray-300 mt-20 uppercase tracking-[0.2em] font-black">Secure • Efficient • Fluid</div>}
          </div>

          {/* Right Column - Swap Widget */}
          <div className={`flex-1 p-16 flex flex-col justify-center gap-1 ${isVibrant ? 'bg-white' : 'p-0'}`}>
            <div className={`p-10 ${isVibrant ? 'border border-gray-50' : visualSpecs.containerClass}`}>
               <div className="flex items-center justify-between mb-8">
                  <span className={`text-[11px] font-black uppercase tracking-widest opacity-40 ${visualSpecs.textContentClass}`}>Swap From</span>
                  <div className={`px-4 py-2 text-xs font-black bg-gray-50 flex items-center gap-2 ${isVibrant ? 'rounded-none' : 'rounded-xl'}`}>
                    ETH <ArrowDownUp size={12} />
                  </div>
               </div>
               <div className="flex items-end justify-between mb-12">
                  <span className={`text-7xl font-black ${visualSpecs.textTitleClass}`}>2.500</span>
                  <span className={`text-sm opacity-40 font-bold ${visualSpecs.textContentClass}`}>~$ 7,761.94</span>
               </div>
               
               <div className="relative h-px bg-gray-100 my-10 flex justify-center items-center">
                  <div className={`absolute w-12 h-12 bg-black text-white flex items-center justify-center transform hover:rotate-180 transition-transform cursor-pointer ${isVibrant ? 'rounded-none' : 'rounded-full'}`}>
                    <ArrowDownUp size={16} />
                  </div>
               </div>

               <div className="flex items-center justify-between mb-8">
                  <span className={`text-[11px] font-black uppercase tracking-widest opacity-40 ${visualSpecs.textContentClass}`}>Swap To</span>
                  <div className={`px-4 py-2 text-xs font-black bg-gray-50 flex items-center gap-2 ${isVibrant ? 'rounded-none' : 'rounded-xl'}`}>
                    SOL <ArrowDownUp size={12} />
                  </div>
               </div>
               <div className="flex items-end justify-between mb-16">
                  <span className={`text-7xl font-black opacity-20 ${visualSpecs.textTitleClass}`}>56.87</span>
                  <span className={`text-sm opacity-40 font-bold ${visualSpecs.textContentClass}`}>~$ 7,761.94</span>
               </div>

               <button className={`w-full ${visualSpecs.buttonClass}`} style={isCyber || isVibrant ? {} : { backgroundColor: visualSpecs.accentColor }}>
                  {isVibrant ? 'Confirm Swap' : '立即开始'}
               </button>
               
               {isVibrant && <p className="text-[10px] text-center mt-6 text-gray-300 font-bold uppercase tracking-widest">* Points earned are non-monetary</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Style DNA Sidebar */}
      <div className={`w-full xl:w-96 border-l p-12 lg:p-16 flex flex-col gap-12 shrink-0 ${isCyber ? 'bg-black/80 backdrop-blur-3xl border-emerald-900' : isVibrant ? 'bg-white border-gray-100' : 'bg-white/40 backdrop-blur-[60px] border-slate-100'}`}>
        <div>
          <h4 className={`text-[11px] font-black uppercase tracking-[0.4em] mb-10 flex items-center gap-4 ${isCyber ? 'text-emerald-500' : isVibrant ? 'text-black' : 'text-slate-400'}`}>
            <Target size={16} /> {isCyber ? 'HUD_ANALYSIS' : '视觉基因 / Style DNA'}
          </h4>
          
          <div className="space-y-10">
            <div className="space-y-5">
              <div className={`flex justify-between text-[11px] font-black uppercase tracking-[0.2em] ${isCyber ? 'text-emerald-700' : 'text-slate-500'}`}>
                <span>核心主色</span>
                <span className={`font-mono px-2 py-0.5 rounded ${isCyber ? 'text-emerald-400 bg-emerald-900/30' : isVibrant ? 'text-black bg-[#bef264]/20' : 'text-slate-900 bg-slate-100'}`}>{visualSpecs.accentColor}</span>
              </div>
              <div className={`h-6 w-full overflow-hidden p-1.5 shadow-inner ${isCyber ? 'bg-black rounded-none border border-emerald-900' : isVibrant ? 'bg-gray-50 rounded-none' : 'bg-slate-100 rounded-full'}`}>
                <div className={`h-full transition-all duration-1000 shadow-lg ${isCyber ? 'rounded-none hud-glow' : isVibrant ? 'rounded-none shadow-none' : 'rounded-full'}`} style={{ backgroundColor: visualSpecs.accentColor, width: '100%' }} />
              </div>
            </div>

            <div className="space-y-8">
              <DNAItem icon={<CornerUpRight size={20} />} label="圆角规格 / Radius" value={isCyber || isVibrant ? 'SHARP (0px)' : visualSpecs.containerClass.includes('rounded-[3rem]') ? 'Extreme (48px)' : 'Modern (12px)'} isCyber={isCyber} isVibrant={isVibrant} />
              <DNAItem icon={<Droplets size={20} />} label="表面材质 / Surface" value={isCyber ? 'NEON_GLAZED' : isVibrant ? 'HIGH_FLAT' : '毛玻璃 (Glassmorphism)'} isCyber={isCyber} isVibrant={isVibrant} />
              <DNAItem icon={<Maximize size={20} />} label="光影层级 / Elevation" value={isCyber ? 'HIGH_GLOW' : isVibrant ? 'ZERO_SHADOW' : '现代感 (Medium)'} isCyber={isCyber} isVibrant={isVibrant} />
            </div>
          </div>
        </div>

        <div className={`mt-auto p-8 transform hover:scale-[1.02] transition-transform ${isCyber ? 'bg-emerald-950/20 border border-emerald-500/30 text-emerald-400' : isVibrant ? 'bg-[#bef264]/10 border border-[#bef264]/40 text-black' : 'bg-slate-900 text-white shadow-3xl'}`}>
          <div className="flex items-center gap-3 mb-4">
            <Zap size={18} className={`${isCyber ? 'text-emerald-400 fill-emerald-400' : isVibrant ? 'text-black fill-black' : 'text-indigo-400 fill-indigo-400'}`} />
            <p className={`text-[11px] font-black uppercase tracking-[0.2em] ${isCyber ? 'text-emerald-500' : isVibrant ? 'text-black' : 'text-indigo-400'}`}>AI 设计建议</p>
          </div>
          <p className={`text-sm leading-relaxed font-medium ${isCyber ? 'text-emerald-200' : isVibrant ? 'text-black/80' : 'text-slate-300'}`}>
            {isVibrant ? '建议在此风格下使用极具冲击力的字体大小。将标题字体提升至 96px 以上可显著增强视觉动能。' : isCyber ? '检测到战术视觉冲突。建议将按钮背景设置为透明，通过 2px 的发光描边增强层级感。' : `识别到${visualSpecs.accentColor.toUpperCase()}为核心色。建议使用该色值作为行动点标识。`}
          </p>
        </div>
      </div>
    </div>
  );
};

const DNAItem: React.FC<{ icon: React.ReactNode, label: string, value: string, isCyber?: boolean, isVibrant?: boolean }> = ({ icon, label, value, isCyber, isVibrant }) => (
  <div className="flex items-center gap-6 group">
    <div className={`p-4 transition-all duration-300 ${isCyber ? 'bg-emerald-950/40 border border-emerald-900 text-emerald-500 rounded-none' : isVibrant ? 'bg-gray-50 border border-gray-100 text-black rounded-none' : 'bg-white shadow-md text-slate-400 border border-slate-100 rounded-[22px] group-hover:text-indigo-600 group-hover:scale-110'}`}>
      {icon}
    </div>
    <div>
      <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-1 ${isCyber ? 'text-emerald-900' : isVibrant ? 'text-gray-400' : 'text-slate-400'}`}>{label}</p>
      <p className={`text-sm font-black leading-none ${isCyber ? 'text-emerald-400 font-mono' : isVibrant ? 'text-black' : 'text-slate-900'}`}>{value}</p>
    </div>
  </div>
);

export default PreviewDashboard;
