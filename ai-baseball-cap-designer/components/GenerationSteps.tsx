
import React from 'react';
import { SparklesIcon } from './icons/SparklesIcon';

export interface Step {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'completed';
}

interface GenerationStepsProps {
  steps: Step[];
  currentMessage: string;
}

export const GenerationSteps: React.FC<GenerationStepsProps> = ({ steps, currentMessage }) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 w-full max-w-lg animate-fade-in bg-white/60 backdrop-blur-md rounded-[2rem] border border-white/40 shadow-xl">
      <div className="relative mb-8">
        <div className="w-20 h-20 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin"></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <SparklesIcon className="w-8 h-8 text-cyan-500 animate-pulse" />
        </div>
      </div>
      
      <h3 className="text-xl font-black text-black mb-2">{currentMessage}</h3>
      <p className="text-gray-500 text-sm mb-8 italic">AI 正在深度思考并执行设计流程...</p>

      <div className="w-full space-y-4">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center gap-4">
            <div className="relative flex flex-col items-center">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-500 ${
                step.status === 'completed' ? 'bg-green-500 text-white' : 
                step.status === 'active' ? 'bg-cyan-500 text-white animate-pulse ring-4 ring-cyan-500/20' : 
                'bg-gray-200 text-gray-500'
              }`}>
                {step.status === 'completed' ? '✓' : index + 1}
              </div>
              {index < steps.length - 1 && (
                <div className={`w-0.5 h-6 transition-colors duration-500 ${
                  step.status === 'completed' ? 'bg-green-500/50' : 'bg-gray-200'
                }`} />
              )}
            </div>
            <span className={`text-sm font-medium transition-colors duration-500 ${
              step.status === 'completed' ? 'text-gray-500' : 
              step.status === 'active' ? 'text-cyan-600' : 
              'text-gray-400'
            }`}>
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
