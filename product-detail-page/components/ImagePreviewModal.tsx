import React, { useState } from 'react';
import { editStoryboardImage } from '../services/geminiService';
import { PlatformService } from '../../../types';

interface ImagePreviewModalProps {
  previewTarget: { sectionId: string; imageUrl: string } | null;
  onClose: () => void;
  onEditSuccess: (sectionId: string, newImageUrl: string) => void;
  appId: string;
  platform: PlatformService;
  generateImageCost: number;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  previewTarget,
  onClose,
  onEditSuccess,
  appId,
  platform,
  generateImageCost,
}) => {
  const [editPrompt, setEditPrompt] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  if (!previewTarget) return null;

  const handleEdit = async () => {
    if (!editPrompt.trim()) return;
    if (!platform.checkBalance(generateImageCost)) {
      platform.showRecharge();
      return;
    }

    setIsEditing(true);
    try {
      const newUrl = await editStoryboardImage(previewTarget.imageUrl, editPrompt);

      onEditSuccess(previewTarget.sectionId, newUrl);
      await platform.refreshCredits?.();
      setEditPrompt('');
    } catch (e: any) {
      alert(e?.message || "编辑失败，请重试");
    } finally {
      setIsEditing(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[100] bg-white/40 backdrop-blur-2xl flex flex-col items-center justify-center p-8 animate-in fade-in duration-300" 
      onClick={onClose}
    >
      {/* Close Button */}
      <button 
        onClick={onClose}
        className="absolute top-10 right-10 text-black/20 hover:text-black transition rounded-full p-3 hover:bg-black/5 z-50"
      >
        <i className="ph ph-x text-4xl"></i>
      </button>

      {/* Main Image */}
      <div className="flex-1 flex items-center justify-center w-full h-full overflow-hidden relative p-4">
          <img 
            src={previewTarget.imageUrl} 
            alt="Full Preview" 
            className="max-w-full max-h-full object-contain rounded-[2rem] shadow-2xl animate-in zoom-in-95 duration-500"
            onClick={(e) => e.stopPropagation()} 
          />
          
          {isEditing && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-md z-10 rounded-[2rem]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-gray-100 border-t-black rounded-full animate-spin"></div>
                    <span className="text-black font-bold text-sm tracking-tight">AI 正在更新设计...</span>
                </div>
            </div>
          )}
      </div>

      {/* Edit Toolbar */}
      <div 
        className="w-full max-w-3xl mt-8 bg-white/80 backdrop-blur-xl border border-white shadow-2xl rounded-3xl p-3 flex gap-4 transition-all"
        onClick={(e) => e.stopPropagation()}
      >
          <div className="flex items-center justify-center w-12 h-12 bg-black text-white rounded-2xl flex-shrink-0">
             <i className="ph-fill ph-magic-wand text-xl"></i>
          </div>
          <input 
            type="text" 
            className="flex-1 bg-transparent border-none text-black placeholder-gray-400 focus:ring-0 font-medium text-sm px-2"
            placeholder="输入 AI 局部修改指令 (例如: 改变背景颜色，增加装饰物...)"
            value={editPrompt}
            onChange={(e) => setEditPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleEdit()}
          />
          <button 
            onClick={handleEdit}
            disabled={!editPrompt.trim() || isEditing}
            className="bg-black text-white px-8 py-3 rounded-2xl text-sm font-bold hover:scale-105 transition disabled:opacity-50 whitespace-nowrap"
          >
            {isEditing ? '渲染中...' : '提交修改'}
          </button>
      </div>
    </div>
  );
};