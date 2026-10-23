import React from 'react';

interface GlassPanelProps {
  children: React.ReactNode;
  className?: string;
}

export const GlassPanel: React.FC<GlassPanelProps> = ({ children, className = '' }) => {
  return (
    <div className={`bg-white/60 backdrop-blur-[20px] border border-white/40 shadow-xl rounded-[2rem] overflow-hidden ${className}`}>
      {children}
    </div>
  );
};