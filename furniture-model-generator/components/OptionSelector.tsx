import React from 'react';
import type { Option } from '../types';

interface OptionSelectorProps {
  label: string;
  options: Option[];
  selectedValue: string;
  onChange: (value: string) => void;
  name: string;
}

export const OptionSelector: React.FC<OptionSelectorProps> = ({ label, options, selectedValue, onChange, name }) => {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <div key={option.value}>
            <input
              type="radio"
              id={`${name}-${option.value}`}
              name={name}
              value={option.value}
              checked={selectedValue === option.value}
              onChange={() => onChange(option.value)}
              className="hidden"
            />
            <label
              htmlFor={`${name}-${option.value}`}
              className={`block cursor-pointer px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 border
              ${selectedValue === option.value
                ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/30 transform scale-105'
                : 'bg-slate-200 text-slate-700 border-slate-300 hover:border-blue-500 hover:bg-slate-300'
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

