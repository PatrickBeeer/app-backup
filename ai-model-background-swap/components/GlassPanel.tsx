
import React from 'react';

interface GlassPanelProps {
  children: React.ReactNode;
  className?: string;
}

const GlassPanel: React.FC<GlassPanelProps> = ({ children, className }) => {
  return (
    <div
      className={`
        bg-white/60 backdrop-blur-xl border border-white/40
        rounded-[2rem] p-8 shadow-lg custom-shadow-blueish
        ${className || ''}
      `}
    >
      {children}
    </div>
  );
};

export default GlassPanel;

