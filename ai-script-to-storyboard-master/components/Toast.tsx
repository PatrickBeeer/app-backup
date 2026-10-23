import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

export type ToastType = 'success' | 'error';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastProps {
  toast: ToastMessage | null;
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast, onClose]);

  if (!toast) return null;

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-2 fade-in duration-300">
      <div className={`
        flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl border backdrop-blur-md
        ${toast.type === 'success' 
          ? 'bg-emerald-50 border-emerald-300 text-emerald-800' 
          : 'bg-red-50 border-red-300 text-red-800'}
      `}>
        {toast.type === 'success' ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
        ) : (
          <AlertCircle className="w-5 h-5 text-red-600" />
        )}
        <span className="text-sm font-medium">{toast.message}</span>
        <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100 text-gray-600 hover:text-gray-800">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default Toast;

