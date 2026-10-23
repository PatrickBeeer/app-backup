import React from 'react';

interface OptionSelectorProps {
  label: string;
  options: readonly string[];
  selected: string;
  onChange: (value: string) => void;
}

export const OptionSelector: React.FC<OptionSelectorProps> = ({ label, options, selected, onChange }) => {
  return (
    <div>
      <label className="block font-semibold mb-3 text-slate-600 text-sm">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onChange(option)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              selected === option
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
};
