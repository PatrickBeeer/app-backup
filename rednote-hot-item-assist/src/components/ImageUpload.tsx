/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useState } from 'react';
import { Upload, X, Image as ImageIcon, Camera } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ImageUploadProps {
  onUpload: (base64: string) => void;
  onClear: () => void;
  disabled?: boolean;
}

export default function ImageUpload({ onUpload, onClear, disabled }: ImageUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        setPreview(base64);
        onUpload(base64);
      };
      reader.readAsDataURL(file);
    }
  }, [onUpload]);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const onDragLeave = () => {
    setDragActive(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const clear = () => {
    setPreview(null);
    onClear();
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <AnimatePresence mode="wait">
        {!preview ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`
              relative group cursor-pointer
              glass-card p-6 sm:p-12 transition-all duration-300
              flex flex-col items-center justify-center gap-4
              border-dashed border-2
              ${dragActive ? 'border-brand-red bg-red-50/50' : 'border-white/60 hover:border-brand-red hover:bg-white/60'}
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <div className="flex flex-col sm:flex-row gap-4 w-full sm:px-8">
              <div className="flex-1 relative group">
                <input
                  ref={fileInputRef}
                  type="file"
                  id="image-upload"
                  className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  onChange={onFileChange}
                  accept="image/*"
                  disabled={disabled}
                />
                <div className={`
                  flex flex-col items-center justify-center gap-3 p-8 rounded-2xl border-2 border-dashed
                  ${dragActive ? 'border-brand-red bg-red-50/50' : 'border-white/60 group-hover:border-brand-red group-hover:bg-white'}
                  transition-all duration-300
                `}>
                  <div className="w-12 h-12 bg-red-100/50 rounded-full flex items-center justify-center text-brand-red group-hover:scale-110 transition-transform">
                    <Upload size={24} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-gray-800">本地上传</p>
                    <p className="text-[10px] text-gray-400 mt-1">支持 JPG, PNG</p>
                  </div>
                </div>
              </div>

              <div className="flex-1 relative group">
                <input
                  ref={cameraInputRef}
                  type="file"
                  id="camera-upload"
                  capture="environment"
                  className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  onChange={onFileChange}
                  accept="image/*"
                  disabled={disabled}
                />
                <div className="flex flex-col items-center justify-center gap-3 p-8 rounded-2xl border-2 border-dashed border-white/60 group-hover:border-brand-red group-hover:bg-white transition-all duration-300">
                  <div className="w-12 h-12 bg-orange-100/50 rounded-full flex items-center justify-center text-orange-500 group-hover:scale-110 transition-transform">
                    <Camera size={24} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-gray-800">拍照上传</p>
                    <p className="text-[10px] text-gray-400 mt-1">移动端直接拍摄</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="text-center mt-2">
              <p className="text-xs text-gray-400 font-medium">建议比例 3:4 或 1:1，还原最美画质</p>
            </div>
            <div className="flex gap-2">
              <span className="px-3 py-1 bg-gray-100 rounded-full text-xs text-gray-500 uppercase font-medium">美妆</span>
              <span className="px-3 py-1 bg-gray-100 rounded-full text-xs text-gray-500 uppercase font-medium">生活</span>
              <span className="px-3 py-1 bg-gray-100 rounded-full text-xs text-gray-500 uppercase font-medium">家居</span>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative rounded-3xl overflow-hidden shadow-2xl ring-1 ring-black/5"
          >
            <img src={preview} alt="Product preview" className="w-full aspect-[4/5] object-cover" />
            <div className="absolute top-4 right-4 flex gap-2">
              <button
                onClick={clear}
                className="p-2 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-md transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/60 to-transparent">
              <div className="flex items-center gap-2 text-white">
                <ImageIcon size={16} />
                <span className="text-sm font-medium">产品原图已就绪</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
