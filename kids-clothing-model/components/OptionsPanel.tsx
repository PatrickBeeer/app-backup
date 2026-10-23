import React from 'react';
import { ClothingType, ImageStyle, ModelGender, AspectRatio } from '../types';

interface OptionsPanelProps {
  clothingType: ClothingType;
  onClothingTypeChange: (value: ClothingType) => void;
  modelGender: ModelGender;
  onModelGenderChange: (value: ModelGender) => void;
  imageStyle: ImageStyle;
  onImageStyleChange: (value: ImageStyle) => void;
  aspectRatio: AspectRatio;
  onAspectRatioChange: (value: AspectRatio) => void;
}

export const OptionsPanel: React.FC<OptionsPanelProps> = ({
  clothingType,
  onClothingTypeChange,
  modelGender,
  onModelGenderChange,
  imageStyle,
  onImageStyleChange,
  aspectRatio,
  onAspectRatioChange,
}) => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <label htmlFor="clothingType" className="block text-sm font-semibold text-slate-600 mb-1">
            服装类型
          </label>
          <select
            id="clothingType"
            value={clothingType}
            onChange={(e) => onClothingTypeChange(e.target.value as ClothingType)}
            className="block w-full pl-3 pr-10 py-2 text-base bg-white/50 border border-white/80 focus:outline-none focus:ring-purple-400 focus:border-purple-400 sm:text-sm rounded-xl backdrop-blur-sm"
          >
            {Object.values(ClothingType).map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="modelGender" className="block text-sm font-semibold text-slate-600 mb-1">
            模特设定
          </label>
          <select
            id="modelGender"
            value={modelGender}
            onChange={(e) => onModelGenderChange(e.target.value as ModelGender)}
            className="block w-full pl-3 pr-10 py-2 text-base bg-white/50 border border-white/80 focus:outline-none focus:ring-purple-400 focus:border-purple-400 sm:text-sm rounded-xl backdrop-blur-sm"
          >
            {Object.values(ModelGender).map((gender) => (
              <option key={gender} value={gender}>{gender}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="imageStyle" className="block text-sm font-semibold text-slate-600 mb-1">
            图片风格
          </label>
          <select
            id="imageStyle"
            value={imageStyle}
            onChange={(e) => onImageStyleChange(e.target.value as ImageStyle)}
            className="block w-full pl-3 pr-10 py-2 text-base bg-white/50 border border-white/80 focus:outline-none focus:ring-purple-400 focus:border-purple-400 sm:text-sm rounded-xl backdrop-blur-sm"
          >
            {Object.values(ImageStyle).map((style) => (
              <option key={style} value={style}>{style}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="aspectRatio" className="block text-sm font-semibold text-slate-600 mb-1">
            输出比例
          </label>
          <select
            id="aspectRatio"
            value={aspectRatio}
            onChange={(e) => onAspectRatioChange(e.target.value as AspectRatio)}
            className="block w-full pl-3 pr-10 py-2 text-base bg-white/50 border border-white/80 focus:outline-none focus:ring-purple-400 focus:border-purple-400 sm:text-sm rounded-xl backdrop-blur-sm"
          >
            {Object.values(AspectRatio).map((ratio) => (
              <option key={ratio} value={ratio}>{ratio}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

