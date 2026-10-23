import React from 'react';
import { AppStatus } from '../types';
import { Layers, Image, Video, CheckCircle2 } from 'lucide-react';

interface ProcessStepsProps {
  status: AppStatus;
}

export const ProcessSteps: React.FC<ProcessStepsProps> = ({ status }) => {
  const steps = [
    { id: 'upload', icon: Layers, label: '上传素材' },
    { id: 'image', icon: Image, label: '合成预览' },
    { id: 'video', icon: Video, label: '生成视频' },
    { id: 'done', icon: CheckCircle2, label: '完成' },
  ];

  const getCurrentStepIndex = () => {
    switch (status) {
      case AppStatus.IDLE: return 0;
      case AppStatus.GENERATING_IMAGE: return 1;
      case AppStatus.IMAGE_REVIEW: return 1;
      case AppStatus.GENERATING_VIDEO: return 2;
      case AppStatus.COMPLETED: return 3;
      case AppStatus.ERROR: return -1; // Handle error visually elsewhere usually
      default: return 0;
    }
  };

  const currentIndex = getCurrentStepIndex();

  return (
    <div className="w-full max-w-2xl mx-auto mb-8">
      <div className="flex justify-between items-center relative">
        {/* Connector Line */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-300 -z-10 rounded-full"></div>
        <div 
          className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-emerald-500 transition-all duration-500 -z-10 rounded-full"
          style={{ width: `${(currentIndex / (steps.length - 1)) * 100}%` }}
        ></div>

        {steps.map((step, index) => {
          const isActive = index <= currentIndex;
          const isCurrent = index === currentIndex;
          const Icon = step.icon;

          return (
            <div key={step.id} className="flex flex-col items-center gap-2 bg-transparent px-2">
              <div 
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 border-2
                  ${isActive 
                    ? 'bg-emerald-500 border-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]' 
                    : 'bg-slate-200 border-slate-300 text-slate-600'
                  }
                  ${isCurrent ? 'scale-110' : ''}
                `}
              >
                <Icon size={18} />
              </div>
              <span className={`text-xs font-medium transition-colors ${isActive ? 'text-emerald-600' : 'text-slate-600'}`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};