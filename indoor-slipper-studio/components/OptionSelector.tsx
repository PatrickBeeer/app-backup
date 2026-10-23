import React from 'react';
import type { Option } from '../types';

interface OptionSelectorProps {
  title?: string;
  options: Option[];
  selectedValue: string;
  onChange: (value: string) => void;
  name: string;
}

const OptionSelector: React.FC<OptionSelectorProps> = ({ title, options, selectedValue, onChange, name }) => {
  return (
    <div className="space-y-4">
      {title && <h2 className="text-xl font-semibold text-black tracking-tight">{title}</h2>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {options.map((option) => (
          <div key={option.value}>
            <input
              type="radio"
              id={`${name}-${option.value}`}
              name={name}
              value={option.value}
              checked={selectedValue === option.value}
              onChange={(e) => onChange(e.target.value)}
              className="sr-only"
            />
            <label
              htmlFor={`${name}-${option.value}`}
              className={`block w-full text-center py-3 px-2 rounded-xl cursor-pointer transition-all duration-200 text-sm font-medium border-0
                ${selectedValue === option.value
                  ? 'bg-black text-white shadow-md'
                  : 'bg-white/40 text-slate-700 hover:bg-white/60'
                }`}
            >
              {option.label}
            </label>
          </div>
        ))}
      </div>
    </div>
  );
};

export default OptionSelector;

