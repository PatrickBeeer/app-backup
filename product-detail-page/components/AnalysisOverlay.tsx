import React, { useEffect, useState } from 'react';

const ANALYSIS_STEPS = [
  { id: 1, label: '正在初始化图像识别引擎...', duration: 1200 },
  { id: 2, label: '识别产品类目与核心属性...', duration: 1500 },
  { id: 3, label: '分析视觉特征与材质纹理...', duration: 1800 },
  { id: 4, label: '对标类目头部品牌美学逻辑...', duration: 2000 },
  { id: 5, label: '提取品牌情绪与受众共鸣点...', duration: 1500 },
  { id: 6, label: '正在生成针对性视觉策略...', duration: 1000 },
];

interface AnalysisOverlayProps {
  isVisible: boolean;
}

export const AnalysisOverlay: React.FC<AnalysisOverlayProps> = ({ isVisible }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (isVisible) {
      let step = 0;
      let totalTime = ANALYSIS_STEPS.reduce((acc, s) => acc + s.duration, 0);
      let elapsed = 0;

      const interval = setInterval(() => {
        elapsed += 100;
        const newProgress = Math.min((elapsed / totalTime) * 100, 99);
        setProgress(newProgress);

        let currentStepSum = 0;
        for (let i = 0; i < ANALYSIS_STEPS.length; i++) {
          currentStepSum += ANALYSIS_STEPS[i].duration;
          if (elapsed < currentStepSum) {
            setCurrentStep(i);
            break;
          }
        }
      }, 100);

      return () => clearInterval(interval);
    } else {
      setCurrentStep(0);
      setProgress(0);
    }
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-8 bg-white/20 backdrop-blur-xl rounded-[2rem] animate-in fade-in duration-500">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-black text-white text-[10px] font-bold uppercase tracking-widest rounded-full mb-4 animate-pulse">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span>
                Neural Processing
            </div>
            <h3 className="text-2xl font-bold text-black tracking-tight">AI 深度洞察策划中</h3>
            <p className="text-sm text-gray-500 font-medium">正在解析产品基因，构建转化逻辑</p>
        </div>

        <div className="space-y-6">
            <div className="h-1.5 w-full bg-black/5 rounded-full overflow-hidden">
                <div 
                    className="h-full bg-black transition-all duration-300 ease-out" 
                    style={{ width: `${progress}%` }}
                ></div>
            </div>

            <div className="space-y-3">
                {ANALYSIS_STEPS.map((step, idx) => (
                    <div 
                        key={step.id} 
                        className={`flex items-center gap-4 transition-all duration-500 ${
                            idx === currentStep ? 'opacity-100 translate-x-2' : 
                            idx < currentStep ? 'opacity-40 scale-95' : 'opacity-20'
                        }`}
                    >
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                            idx <= currentStep ? 'border-black bg-black text-white' : 'border-gray-300'
                        }`}>
                            {idx < currentStep ? (
                                <i className="ph-bold ph-check text-[10px]"></i>
                            ) : (
                                <span className="text-[10px] font-bold">{idx + 1}</span>
                            )}
                        </div>
                        <span className={`text-xs font-bold ${idx === currentStep ? 'text-black' : 'text-gray-400'}`}>
                            {step.label}
                        </span>
                        {idx === currentStep && (
                            <div className="ml-auto flex gap-1">
                                <span className="w-1 h-1 bg-black rounded-full animate-bounce"></span>
                                <span className="w-1 h-1 bg-black rounded-full animate-bounce [animation-delay:0.2s]"></span>
                                <span className="w-1 h-1 bg-black rounded-full animate-bounce [animation-delay:0.4s]"></span>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
      </div>
    </div>
  );
};