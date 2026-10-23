import React from 'react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASS: Record<NonNullable<SpinnerProps['size']>, string> = {
  sm: 'h-5 w-5 border-2',
  md: 'h-8 w-8 border-2',
  lg: 'h-12 w-12 border-4',
};

export const Spinner: React.FC<SpinnerProps> = ({ size = 'md' }) => {
  return (
    <span
      className={`inline-block rounded-full border-white/30 border-t-white animate-spin ${SIZE_CLASS[size]}`}
      role="status"
      aria-label="loading"
    />
  );
};
