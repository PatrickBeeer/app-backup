import React from 'react';

interface LinearControlProps {
  value: number;
  onChange: (val: number) => void;
  label: string;
  minLabel: string;
  maxLabel: string;
  icon?: React.ReactNode;
}

export const LinearControl: React.FC<LinearControlProps> = ({ 
  value, 
  onChange, 
  label, 
  minLabel, 
  maxLabel,
  icon
}) => {
  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex justify-between items-center text-xs text-slate-600 mb-1">
        <div className="flex items-center gap-2">
          {icon}
          <span>{label}</span>
        </div>
        <span className="font-mono text-[10px] text-blue-500 bg-blue-900/20 px-1.5 py-0.5 rounded">{value.toFixed(2)}</span>
      </div>

      <div className="relative w-full h-4 flex items-center">
        {/* Track */}
        <div className="absolute w-full h-1 bg-slate-100 rounded-full overflow-hidden">
           <div className="h-full bg-slate-200 w-full"></div>
        </div>
        
        {/* Input */}
        <input
            type="range"
            min="-1"
            max="1"
            step="0.05"
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="absolute w-full h-4 opacity-0 cursor-pointer z-10"
        />

        {/* Custom Thumb Visual */}
        <div 
            className="absolute w-3 h-3 bg-blue-500 rounded-full shadow-lg pointer-events-none transition-transform duration-75"
            style={{ left: `calc(${(value + 1) / 2 * 100}% - 6px)` }}
        ></div>
      </div>

      <div className="flex justify-between text-[9px] text-slate-600 uppercase tracking-wider font-semibold mt-1">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
};

