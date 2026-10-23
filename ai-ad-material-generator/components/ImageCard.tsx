import React from 'react';

export const ImageCard: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className }) => (
  <div className={`border border-black bg-white p-1 shadow-hard-sm ${className}`}>
    <div className="bg-gray-50 border-b border-gray-100 p-2 flex justify-between items-center mb-1">
      <h3 className="text-xs font-bold font-mono text-gray-500 uppercase">{title}</h3>
      <div className="flex gap-1">
        <div className="w-2 h-2 rounded-full bg-gray-300"></div>
        <div className="w-2 h-2 rounded-full bg-gray-300"></div>
      </div>
    </div>
    <div className="w-full h-full min-h-[10rem] bg-white flex items-center justify-center overflow-hidden">
      {children}
    </div>
  </div>
);

export const Placeholder: React.FC = () => (
  <div className="w-full h-full min-h-[200px] bg-gray-50 flex flex-col items-center justify-center text-gray-300">
    <div className="w-16 h-1 bg-gray-200 mb-2"></div>
    <div className="w-8 h-1 bg-gray-200"></div>
  </div>
);
