
import React from 'react';

interface SelectOptionProps<T extends string> {
  value: T;
  label: string;
  isSelected: boolean;
  onSelect: (value: T) => void;
  className?: string;
  disabled?: boolean;
}

// Refactor: Use React.PropsWithChildren to correctly type generic functional components.
// This ensures that React's intrinsic attributes like 'key' are handled by TypeScript.
const SelectOption = <T extends string>(props: React.PropsWithChildren<SelectOptionProps<T>>): React.JSX.Element => {
  const {
    value,
    label,
    isSelected,
    onSelect,
    className,
    disabled = false,
  } = props; // `children` is available through PropsWithChildren but not destructured as it's not used.

  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      disabled={disabled}
      className={`
        relative flex items-center justify-center p-4 rounded-xl border
        transition-all duration-200 text-gray-600
        ${isSelected
          ? 'bg-blue-500/20 border-blue-600 text-blue-800 font-semibold'
          : 'bg-white/40 border-white/60 hover:bg-white/50'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className || ''}
      `}
    >
      <span className="text-center">{label}</span>
      {isSelected && (
        <div className="absolute top-2 right-2 w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="white"
            className="w-3 h-3"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </div>
      )}
    </button>
  );
};

export default SelectOption;

