import React from 'react';

interface SpinnerProps {
    message: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ message }) => {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 animate-fade-in">
      <div className="w-16 h-16 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
      <p className="mt-6 text-xl font-semibold text-gray-300">{message}</p>
      <p className="mt-2 text-sm text-gray-500">AI 正在发挥它的魔力。请稍候...</p>
    </div>
  );
};