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
  icon,
}) => {
  const percent = ((value + 1) / 2) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
          {icon}
          <span>{label}</span>
        </div>
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-500">
          {value.toFixed(2)}
        </span>
      </div>

      <div className="relative h-5 flex items-center">
        <div className="absolute h-1 w-full rounded-full bg-slate-100"></div>
        <div
          className="absolute h-1 rounded-full bg-indigo-500"
          style={{ left: `${Math.min(percent, 50)}%`, width: `${Math.abs(percent - 50)}%` }}
        ></div>
        <input
          type="range"
          min="-1"
          max="1"
          step="0.05"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="absolute z-10 h-5 w-full cursor-pointer opacity-0"
        />
        <div
          className="absolute w-4 h-4 rounded-full bg-white border-2 border-indigo-500 shadow-sm pointer-events-none"
          style={{ left: `calc(${percent}% - 8px)` }}
        ></div>
      </div>

      <div className="flex justify-between text-[10px] font-semibold text-slate-400">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
};
