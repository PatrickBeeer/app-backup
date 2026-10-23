import React from 'react';
import { Template } from '../types';
import { CLOTHING_TYPES, TEMPLATES } from '../constants';
import { UploadIcon, ImageIcon, CheckCircleIcon, ChevronDownIcon } from '../constants';

interface ControlPanelProps {
  onImageUpload: (file: File) => void;
  uploadedImage: string | null;
  clothingType: string;
  setClothingType: (type: string) => void;
  selectedTemplate: Template;
  setSelectedTemplate: (template: Template) => void;
  customPrompt: string;
  setCustomPrompt: (prompt: string) => void;
}

const ControlSection: React.FC<{ title?: string, children: React.ReactNode, noPadding?: boolean }> = ({ title, children, noPadding }) => (
  <div className={`bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-300 shadow-sm ${noPadding ? '' : 'p-6'}`}>
    {title && <h3 className="font-semibold text-slate-800 mb-4">{title}</h3>}
    <div>
      {children}
    </div>
  </div>
);

export const ControlPanel: React.FC<ControlPanelProps> = ({
  onImageUpload,
  uploadedImage,
  clothingType,
  setClothingType,
  selectedTemplate,
  setSelectedTemplate,
  customPrompt,
  setCustomPrompt
}) => {
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImageUpload(file);
    }
  };

  return (
    <div className="space-y-6">
      <ControlSection noPadding>
        <div className="p-6">
          <div className="relative border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-indigo-500 transition-colors">
            {uploadedImage ? (
              <img src={uploadedImage} alt="Uploaded preview" className="mx-auto max-h-48 object-contain rounded-lg"/>
            ) : (
              <div className="flex flex-col items-center space-y-3 text-slate-600">
                <div className="p-3 bg-slate-200 rounded-full">
                  <ImageIcon className="w-8 h-8 text-slate-600" />
                </div>
                <p className="font-semibold">上传单件衣服平铺图</p>
              </div>
            )}
          </div>
          <div className="mt-6">
            <input type="file" id="image-upload" onChange={handleFileChange} className="hidden" accept="image/png, image/jpeg, image/webp" />
            <label htmlFor="image-upload" className="w-full cursor-pointer inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors">
              <UploadIcon className="w-5 h-5"/>
              从本地上传
            </label>
          </div>
          <p className="mt-4 text-xs text-center text-slate-600">图片大小20K~15M, 分辨率大于400*400</p>
        </div>
      </ControlSection>

      <ControlSection title="服装类型">
        <div className="relative">
          <select
            value={clothingType}
            onChange={(e) => setClothingType(e.target.value)}
            className="w-full appearance-none bg-slate-200 border border-slate-300 text-slate-800 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-3.5 pr-10"
          >
            <option value="" disabled>请选择</option>
            {CLOTHING_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <ChevronDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 pointer-events-none"/>
        </div>
      </ControlSection>

      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-300 shadow-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-slate-800">模板</h3>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {TEMPLATES.map((template) => {
            const IconComponent = template.icon;
            return (
              <div
                key={template.id}
                onClick={() => setSelectedTemplate(template)}
                className={`relative cursor-pointer group text-center rounded-lg transition-all p-0.5 ${selectedTemplate.id === template.id ? 'bg-gradient-to-br from-indigo-500 to-blue-600' : 'bg-slate-200 group-hover:bg-indigo-100/50'}`}
              >
                <div className="bg-white rounded-[7px] p-1 h-full w-full flex flex-col justify-between">
                  <div className="w-full aspect-square bg-slate-100 rounded-md flex flex-col items-center justify-center">
                    <div className={`p-1.5 rounded-full ${template.id === 'custom' ? 'bg-indigo-900/50' : 'bg-slate-200/60'}`}>
                      <IconComponent className={`w-6 h-6 ${template.id === 'custom' ? 'text-indigo-400' : 'text-slate-700'}`} />
                    </div>
                  </div>
                  <p className="text-xs font-medium text-slate-700 group-hover:text-indigo-400 pt-1.5">{template.name}</p>
                </div>
                {selectedTemplate.id === template.id && (
                  <div className="absolute top-1 right-1">
                    <CheckCircleIcon className="w-5 h-5" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {selectedTemplate.id === 'custom' && (
          <div className="mt-4">
            <h4 className="font-semibold text-slate-800 text-sm mb-2">自定义提示词</h4>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="例如: 穿在隐形模特上，悬浮效果，工作室灯光"
              className="w-full bg-slate-200 border border-slate-300 text-slate-800 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-3.5 resize-none placeholder-slate-500"
              rows={3}
            />
          </div>
        )}
      </div>
    </div>
  );
};

