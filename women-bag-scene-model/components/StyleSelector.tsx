import React, { useState } from 'react';
import { SCENES, MODEL_STYLES, ASPECT_RATIOS, ETHNICITIES, PHOTOGRAPHY_STYLES } from '../constants';
import type { PromptOption, SimpleOption, UploadedImage } from '../types';

interface StyleSelectorProps {
  photographyStyle: string;
  setPhotographyStyle: (id: string) => void;
  selectedScene: string;
  setSelectedScene: (id: string) => void;
  selectedModelStyle: string;
  setSelectedModelStyle: (id: string) => void;
  selectedAspectRatio: string;
  setSelectedAspectRatio: (id: string) => void;
  selectedEthnicity: string;
  setSelectedEthnicity: (id: string) => void;
  customPrompt: string;
  setCustomPrompt: (value: string) => void;
  styleReferenceImage: UploadedImage | null;
  setStyleReferenceImage: (image: UploadedImage | null) => void;
  seed: number;
  setSeed: (seed: number) => void;
  onNewSeed: () => void;
}

const SelectControl: React.FC<{
  labelId: string;
  options: (PromptOption | SimpleOption)[];
  selectedValue: string;
  onSelect: (id: string) => void;
}> = ({ labelId, options, selectedValue, onSelect }) => (
  <div className="relative">
    <select
      id={labelId}
      value={selectedValue}
      onChange={(e) => onSelect(e.target.value)}
      className="w-full appearance-none p-3 pr-10 border border-slate-300/70 rounded-xl bg-white/80 text-slate-800 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all shadow-sm"
    >
      {options.map(option => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </select>
    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
      </svg>
    </div>
  </div>
);

const TextAreaControl: React.FC<{
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}> = ({ placeholder, value, onChange }) => (
  <textarea
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    rows={3}
    className="w-full p-3 border border-slate-300/70 rounded-xl bg-white/80 text-slate-800 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all shadow-sm"
  />
);

const SimpleOptionButton: React.FC<{ option: SimpleOption; isSelected: boolean; onSelect: (id: string) => void; }> = ({ option, isSelected, onSelect }) => (
  <button
    onClick={() => onSelect(option.id)}
    type="button"
    className={`px-4 py-2 text-sm font-semibold border rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-400 ${isSelected ? 'bg-indigo-500 text-white border-indigo-500 shadow-md' : 'bg-white/80 text-slate-700 border-slate-300/70 hover:bg-white hover:border-slate-400'}`}
  >
    {option.name}
  </button>
);

const StyleReferenceUploader: React.FC<{
  styleReferenceImage: UploadedImage | null;
  setStyleReferenceImage: (image: UploadedImage | null) => void;
}> = ({ styleReferenceImage, setStyleReferenceImage }) => {
  const handleFileChange = (files: FileList | null) => {
    if (files && files[0]) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setStyleReferenceImage({
            base64: reader.result as string,
            mimeType: file.type,
          });
        };
        reader.readAsDataURL(file);
      } else {
        alert('请上传图片文件。');
      }
    }
  };

  return (
    <div>
      {!styleReferenceImage ? (
        <label className="w-full flex items-center justify-center px-4 py-3 border-2 border-slate-300/70 border-dashed rounded-xl cursor-pointer bg-white/80 hover:bg-slate-50 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-sm font-medium text-slate-600">上传风格参考图</span>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileChange(e.target.files)} />
        </label>
      ) : (
        <div className="relative w-24 h-24 overflow-hidden">
          <img src={styleReferenceImage.base64} alt="Style Reference" className="w-full h-full object-cover rounded-lg shadow-md" />
          <button
            onClick={() => setStyleReferenceImage(null)}
            className="absolute -top-2 -right-2 bg-slate-700 text-white rounded-full p-1 leading-none text-xs focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-700"
            aria-label="清除参考图"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

const ChevronIcon: React.FC<{ isOpen: boolean }> = ({ isOpen }) => (
  <svg className={`w-6 h-6 text-slate-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
  </svg>
);

export const StyleSelector: React.FC<StyleSelectorProps> = (props) => {
  const [isFineTuningOpen, setIsFineTuningOpen] = useState(false);
  
  const { 
    photographyStyle, setPhotographyStyle,
    selectedScene, setSelectedScene, 
    selectedModelStyle, setSelectedModelStyle,
    selectedAspectRatio, setSelectedAspectRatio,
    selectedEthnicity, setSelectedEthnicity,
    customPrompt, setCustomPrompt,
    styleReferenceImage, setStyleReferenceImage,
    seed, setSeed, onNewSeed
  } = props;
  
  return (
    <div className="w-full space-y-4">
      {/* Quick Settings */}
      <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-200/80">
        <h2 className="text-xl font-bold text-slate-700 mb-4">快速设置</h2>
        <div className="space-y-4">
          <OptionSection title="选择摄影类型">
            <div className="flex flex-wrap gap-2.5">
              {PHOTOGRAPHY_STYLES.map(style => (
                <SimpleOptionButton key={style.id} option={style} isSelected={photographyStyle === style.id} onSelect={setPhotographyStyle} />
              ))}
            </div>
          </OptionSection>

          <OptionSection title="选择场景">
            <SelectControl labelId="scene-select" options={SCENES} selectedValue={selectedScene} onSelect={setSelectedScene} />
          </OptionSection>

          {photographyStyle === 'model' && (
            <>
              <OptionSection title="选择模特风格">
                <SelectControl labelId="model-style-select" options={MODEL_STYLES} selectedValue={selectedModelStyle} onSelect={setSelectedModelStyle}/>
              </OptionSection>

              <OptionSection title="选择模特人种">
                <SelectControl labelId="ethnicity-select" options={ETHNICITIES} selectedValue={selectedEthnicity} onSelect={setSelectedEthnicity} />
              </OptionSection>
            </>
          )}

          <OptionSection title="选择图片比例">
            <div className="flex flex-wrap gap-2.5">
              {ASPECT_RATIOS.map(ratio => (
                <SimpleOptionButton key={ratio.id} option={ratio} isSelected={selectedAspectRatio === ratio.id} onSelect={setSelectedAspectRatio} />
              ))}
            </div>
          </OptionSection>
        </div>
      </div>
      
      {/* Fine-Tuning Section */}
      <div>
        <button
          onClick={() => setIsFineTuningOpen(!isFineTuningOpen)}
          className="w-full flex justify-between items-center text-left p-4 bg-slate-50/50 rounded-2xl border border-slate-200/80 hover:bg-slate-100/50 transition-colors"
        >
          <h2 className="text-xl font-bold text-slate-700">精准微调 (可选)</h2>
          <ChevronIcon isOpen={isFineTuningOpen} />
        </button>

        <div className={`grid transition-all duration-500 ease-in-out ${isFineTuningOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
          <div className="overflow-hidden">
            <div className="p-4 pt-4 space-y-5 border border-t-0 border-slate-200/80 rounded-b-2xl">
              <OptionSection title="风格参考图 (可选)">
                <StyleReferenceUploader styleReferenceImage={styleReferenceImage} setStyleReferenceImage={setStyleReferenceImage} />
                <p className="text-xs text-slate-500 mt-2">上传一张图片，AI将参考其风格、色调和构图进行创作。</p>
              </OptionSection>
              <OptionSection title="AI核心提示词 (高级)">
                <TextAreaControl placeholder="例如：胶片颗粒感，动态模糊效果" value={customPrompt} onChange={setCustomPrompt} />
              </OptionSection>
              <OptionSection title="随机种子">
                <div className="flex items-center space-x-2">
                  <input type="number" value={seed} onChange={(e) => setSeed(parseInt(e.target.value, 10) || 0)} className="w-full p-3 border border-slate-300/70 rounded-xl bg-white/80 text-slate-800 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all shadow-sm" placeholder="输入随机种子" />
                  <button onClick={onNewSeed} className="p-3 border border-slate-300/70 rounded-xl bg-white/80 hover:bg-white transition-colors shrink-0" aria-label="生成新种子" title="生成新种子">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h5M20 20v-5h-5m0 0l-5-5m5 5l5-5M4 4l5 5" />
                    </svg>
                  </button>
                </div>
                <div className="mt-3 flex items-start space-x-3 text-slate-600 text-xs p-3 bg-indigo-100/50 rounded-lg border-l-4 border-indigo-300">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <p><strong>小贴士:</strong> 相同的种子和提示词会生成相似的图片。点击刷新按钮更改种子以获得不同的结果。</p>
                </div>
              </OptionSection>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const OptionSection: React.FC<{title: string; children: React.ReactNode}> = ({ title, children }) => (
  <div>
    <h3 className="text-base font-bold text-slate-700 mb-2.5">{title}</h3>
    {children}
  </div>
);

