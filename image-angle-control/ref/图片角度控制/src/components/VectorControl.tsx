import React, { useEffect, useRef, useState } from 'react';

interface VectorControlProps {
  x: number;
  y: number;
  imageUrl?: string | null;
  onChange: (x: number, y: number) => void;
  label: string;
  subjectType?: 'auto' | 'person' | 'product';
}

type DragStart = {
  clientX: number;
  clientY: number;
  initialX: number;
  initialY: number;
};

const text = {
  yaw: '\u504f\u822a',
  pitch: '\u4fef\u4ef0',
  highAngle: '\u4fef\u89c6',
  lowAngle: '\u4ef0\u89c6',
  eyeLevel: '\u5e73\u89c6',
  front: '\u524d',
  back: '\u540e',
  left: '\u5de6',
  right: '\u53f3',
  top: '\u9876',
  bottom: '\u5e95',
  frontView: '\u6b63\u89c6',
  backView: '\u540e\u89c6',
  topView: '\u4fef\u89c6',
  bottomView: '\u4ef0\u89c6',
  leftView: '\u5de6\u4fa7\u62cd\u6444',
  rightView: '\u53f3\u4fa7\u62cd\u6444',
  current: '\u5f53\u524d\u89c6\u89d2',
  centerView: '\u6b63\u9762\u62cd\u6444',
  userLeftOrbit: '\u5411\u7528\u6237\u5de6\u4fa7\u73af\u7ed5',
  userRightOrbit: '\u5411\u7528\u6237\u53f3\u4fa7\u73af\u7ed5',
  modelLeft: '\u770b\u5230\u4eba\u7269\u8eab\u4f53\u5de6\u4fa7\u9762',
  modelRight: '\u770b\u5230\u4eba\u7269\u8eab\u4f53\u53f3\u4fa7\u9762',
  productLeft: '\u770b\u5230\u4ea7\u54c1\u5de6\u4fa7\u9762',
  productRight: '\u770b\u5230\u4ea7\u54c1\u53f3\u4fa7\u9762',
  dragHint: '\u62d6\u52a8\u7acb\u65b9\u4f53\u8c03\u6574\u89c6\u89d2',
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const round2 = (value: number) => Number(value.toFixed(2));

export const VectorControl: React.FC<VectorControlProps> = ({ x, y, onChange, label, subjectType }) => {
  const dragStartRef = useRef<DragStart | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const yawDegrees = Math.round(x * 180);
  const pitchDegrees = Math.round(y * 90);
  const sideLabel =
    subjectType === 'product'
      ? yawDegrees > 0
        ? text.productLeft
        : text.productRight
      : yawDegrees > 0
        ? text.modelLeft
        : text.modelRight;
  const cameraPosition =
    Math.abs(yawDegrees) < 8
      ? text.centerView
      : yawDegrees > 0
        ? `${text.rightView} / ${text.userRightOrbit} / ${sideLabel}`
        : `${text.leftView} / ${text.userLeftOrbit} / ${sideLabel}`;
  const pitchPosition = Math.abs(pitchDegrees) < 5 ? text.eyeLevel : pitchDegrees > 0 ? text.highAngle : text.lowAngle;

  const updateFromPointer = (clientX: number, clientY: number) => {
    if (!dragStartRef.current) return;

    const deltaX = clientX - dragStartRef.current.clientX;
    const deltaY = clientY - dragStartRef.current.clientY;
    const nextX = clamp(dragStartRef.current.initialX + deltaX / 180, -1, 1);
    const nextY = clamp(dragStartRef.current.initialY + deltaY / 150, -1, 1);

    onChange(round2(nextX), round2(nextY));
  };

  const beginDrag = (clientX: number, clientY: number) => {
    dragStartRef.current = {
      clientX,
      clientY,
      initialX: x,
      initialY: y,
    };
    setIsDragging(true);
  };

  const endDrag = () => {
    dragStartRef.current = null;
    setIsDragging(false);
  };

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      event.preventDefault();
      updateFromPointer(event.clientX, event.clientY);
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (!event.touches[0]) return;
      event.preventDefault();
      updateFromPointer(event.touches[0].clientX, event.touches[0].clientY);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', endDrag);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', endDrag);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', endDrag);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', endDrag);
    };
  }, [isDragging, onChange]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-bold text-slate-600">{label}</span>
        <span className="max-w-[210px] text-right text-[10px] leading-relaxed font-semibold text-indigo-500">
          {text.current}: {cameraPosition} / {pitchPosition} / {text.yaw} {yawDegrees}&deg; / {text.pitch} {pitchDegrees}&deg;
        </span>
      </div>

      <div className="relative h-48 rounded-[18px] border border-slate-200 bg-slate-50 overflow-hidden shadow-inner">
        <div className="absolute inset-0 opacity-70">
          <div className="absolute left-1/2 top-0 h-full w-px bg-slate-200"></div>
          <div className="absolute left-0 top-1/2 h-px w-full bg-slate-200"></div>
          <div className="absolute left-1/2 top-1/2 h-[142px] w-[142px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-indigo-100"></div>
        </div>

        <div
          className="scene absolute inset-0 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
          title={text.dragHint}
          onMouseDown={(event) => {
            event.preventDefault();
            beginDrag(event.clientX, event.clientY);
          }}
          onTouchStart={(event) => {
            if (!event.touches[0]) return;
            beginDrag(event.touches[0].clientX, event.touches[0].clientY);
          }}
        >
          <div
            className="cube"
            style={{
              width: 72,
              height: 72,
              transform: `rotateX(${-pitchDegrees}deg) rotateY(${yawDegrees}deg)`,
            }}
          >
            <div className="cube-face cube-face-front">{text.front}</div>
            <div className="cube-face cube-face-back">{text.back}</div>
            <div className="cube-face cube-face-right">{text.right}</div>
            <div className="cube-face cube-face-left">{text.left}</div>
            <div className="cube-face cube-face-top">{text.top}</div>
            <div className="cube-face cube-face-bottom">{text.bottom}</div>
          </div>
        </div>

        <div className="absolute left-3 top-3 text-[10px] font-bold text-slate-400">{text.back}</div>
        <div className="absolute left-3 bottom-3 text-[10px] font-bold text-slate-400">{text.front}</div>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">{text.right}</div>
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">{text.left}</div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          [text.frontView, 0, 0],
          [text.backView, 1, 0],
          [text.rightView, 0.5, y],
          [text.leftView, -0.5, y],
          [text.topView, x, 0.72],
          [text.bottomView, x, -0.72],
        ].map(([labelText, nextX, nextY]) => (
          <button
            key={labelText as string}
            onClick={() => onChange(nextX as number, nextY as number)}
            className="h-8 rounded-full border border-slate-200 bg-white text-[11px] font-bold text-slate-500 hover:border-indigo-200 hover:text-indigo-500 transition-colors"
          >
            {labelText}
          </button>
        ))}
      </div>
    </div>
  );
};
