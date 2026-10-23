import React, { useRef, useState, useEffect } from 'react';

interface VectorControlProps {
  x: number;
  y: number;
  onChange: (x: number, y: number) => void;
  label: string;
}

export const VectorControl: React.FC<VectorControlProps> = ({ x, y, onChange, label }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // Store start position and initial values for relative dragging
  const dragStartRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);

  // x ranges from -1 to 1. Map this to -180 to 180 degrees.
  const yawDegrees = Math.round(x * 180);
  // y ranges from -1 to 1. Map this to -90 to 90 degrees (Pitch).
  const pitchDegrees = Math.round(y * 90);

  // Cube Rotation Logic for Visual Feedback
  // X-Axis (Yaw)
  const cubeRotateY = -yawDegrees;
  
  // Y-Axis (Pitch)
  const cubeRotateX = -pitchDegrees;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent default drag behavior
    setIsDragging(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: x,
      initialY: y
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !dragStartRef.current || !containerRef.current) return;
      e.preventDefault();

      const { startX, startY, initialX, initialY } = dragStartRef.current;
      const rect = containerRef.current.getBoundingClientRect();
      
      const pxDeltaX = e.clientX - startX;
      const pxDeltaY = e.clientY - startY;

      // Normalize based on half-dimensions
      // X-Axis: Inverted (Drag Right -> Negative change)
      const valDeltaX = -(pxDeltaX / (rect.width / 2));
      
      // Y-Axis: Normal (Drag Down -> Positive change)
      const valDeltaY = pxDeltaY / (rect.height / 2);

      let nextX = initialX + valDeltaX;
      let nextY = initialY + valDeltaY;

      // Clamp
      nextX = Math.max(-1, Math.min(1, nextX));
      nextY = Math.max(-1, Math.min(1, nextY));

      onChange(parseFloat(nextX.toFixed(2)), parseFloat(nextY.toFixed(2)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onChange]); 

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex justify-between items-center text-xs text-slate-600">
        <span>{label}</span>
        <div className="flex gap-3 text-xs font-mono text-blue-500">
           <span>偏航: {yawDegrees}°</span>
           <span>俯仰: {pitchDegrees}°</span>
        </div>
      </div>
      
      {/* 3D Scene Container */}
      <div 
        ref={containerRef}
        className="scene w-full aspect-square bg-white rounded-xl border border-slate-300 shadow-inner cursor-move overflow-hidden relative group hover:border-blue-500/50 transition-colors"
        onMouseDown={handleMouseDown}
      >
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
            <div className="w-full h-[1px] bg-slate-500 absolute top-1/2"></div>
            <div className="h-full w-[1px] bg-slate-500 absolute left-1/2"></div>
        </div>

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {/* The Cube */}
            <div 
                className="cube"
                style={{
                    transform: `rotateX(${cubeRotateX}deg) rotateY(${cubeRotateY}deg)`
                }}
            >
                <div className="cube-face cube-face-front border-blue-500/50">前 (Front)</div>
                <div className="cube-face cube-face-back">后 (Back)</div>
                <div className="cube-face cube-face-right">右 (Right)</div>
                <div className="cube-face cube-face-left">左 (Left)</div>
                <div className="cube-face cube-face-top">顶 (Top)</div>
                <div className="cube-face cube-face-bottom">底 (Bottom)</div>
            </div>
        </div>

        {/* Interaction hint */}
        <div className="absolute bottom-2 right-2 text-[10px] text-slate-500 pointer-events-none select-none text-right leading-tight">
            拖拽旋转<br/>
            左右=旋转 (反向)<br/>
            上下=俯仰
        </div>
      </div>

      {/* Shortcut Buttons */}
      <div className="grid grid-cols-4 gap-2">
        <button 
            onClick={() => onChange(0, 0)}
            className="py-1.5 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 text-[10px] text-slate-600 font-medium rounded border border-slate-300 transition-colors min-h-[44px]"
        >
            正视图
        </button>
        <button 
            onClick={() => onChange(1, 0)}
            className="py-1.5 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 text-[10px] text-slate-600 font-medium rounded border border-slate-300 transition-colors min-h-[44px]"
        >
            后视图
        </button>
        <button 
            onClick={() => onChange(-0.5, 0)}
            className="py-1.5 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 text-[10px] text-slate-600 font-medium rounded border border-slate-300 transition-colors min-h-[44px]"
        >
            左视图
        </button>
        <button 
            onClick={() => onChange(0.5, 0)}
            className="py-1.5 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 text-[10px] text-slate-600 font-medium rounded border border-slate-300 transition-colors min-h-[44px]"
        >
            右视图
        </button>
      </div>
    </div>
  );
};

