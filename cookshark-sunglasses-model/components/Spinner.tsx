import React from 'react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap: Record<NonNullable<SpinnerProps['size']>, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-4',
};

export const Spinner: React.FC<SpinnerProps> = ({ size = 'md' }) => (
  <span
    className={`inline-block animate-spin rounded-full border-white/30 border-t-white ${sizeMap[size]}`}
    aria-label="loading"
  />
);
