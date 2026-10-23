
import React, { useState } from 'react';
import type { ImageStyle, TextStyle } from '../types';
import { SparkleIcon } from './icons/SparkleIcon';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { ImageUploader } from './ImageUploader';

interface ControlsPanelProps {
    onImageUpload: (file: File | null) => void;
    onGenerate: () => void;
    onReset: () => void;
    uploadedFile: File | null;
    preview: string | null;
    selectedImageStyle: ImageStyle;
    onImageStyleChange: (style: ImageStyle) => void;
    selectedTextStyle: TextStyle;
    onTextStyleChange: (style: TextStyle) => void;
    prompts: string[];
    onPromptsChange: (prompts: string[]) => void;
    isLoading: boolean;
    useRandomInspiration: boolean;
    onRandomInspirationChange: (value: boolean) => void;
}

export const ControlsPanel: React.FC<ControlsPanelProps> = ({ 
    onImageUpload, 
    onGenerate, 
    onReset,
    uploadedFile, 
    preview, 
    selectedImageStyle, 
    onImageStyleChange,
    selectedTextStyle,
    onTextStyleChange,
    prompts,
    onPromptsChange,
    isLoading,
    useRandomInspiration,
    onRandomInspirationChange,
}) => {
    const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
    
    const handlePromptChange = (index: number, value: string) => {
        const newPrompts = [...prompts];
        newPrompts[index] = value;
        onPromptsChange(newPrompts);
    };

    const StyleButton: React.FC<{
        onClick: () => void;
        isActive: boolean;
        label: string;
    }> = ({ onClick, isActive, label }) => (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={isActive}
            className={`style-option w-full transition-colors duration-200 ${isActive ? 'is-active' : ''}`}
        >
            <span className="style-option-copy">
                <strong>{label}</strong>
            </span>
        </button>
    );

    return (
        <div className="controls-stack w-full">
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 text-left">创作设置</h2>

            <section className="control-step">
                <div className="step-heading">
                    <span>STEP 01</span>
                    <strong>上传产品图片</strong>
                </div>
                <ImageUploader onImageUpload={onImageUpload} preview={preview} onReset={onReset} fileName={uploadedFile?.name} />
            </section>
            
            <div className="animate-fade-in">
                    <section className="control-step">
                        <div className="step-heading">
                            <span>STEP 02</span>
                            <strong>选择文案气质</strong>
                        </div>
                             <div className="style-options-grid text-style-options">
                                <StyleButton onClick={() => onTextStyleChange('lively')} isActive={selectedTextStyle === 'lively'} label="活泼种草" />
                                <StyleButton onClick={() => onTextStyleChange('healing')} isActive={selectedTextStyle === 'healing'} label="疗愈能量" />
                             </div>
                    </section>

                    <section className="control-step">
                            <div className="step-heading">
                                <span>STEP 03</span>
                                <strong>选择图片风格</strong>
                            </div>
                            <div className="style-options-grid">
                                <StyleButton onClick={() => onImageStyleChange('scene')} isActive={selectedImageStyle === 'scene'} label="场景化" />
                                <StyleButton onClick={() => onImageStyleChange('ootd')} isActive={selectedImageStyle === 'ootd'} label="辣妹风" />
                                <StyleButton onClick={() => onImageStyleChange('natural')} isActive={selectedImageStyle === 'natural'} label="自然感" />
                                <StyleButton onClick={() => onImageStyleChange('minimalist')} isActive={selectedImageStyle === 'minimalist'} label="极简风" />
                                <StyleButton onClick={() => onImageStyleChange('old_money')} isActive={selectedImageStyle === 'old_money'} label="老钱风" />
                                <StyleButton onClick={() => onImageStyleChange('cream_jewelry')} isActive={selectedImageStyle === 'cream_jewelry'} label="奶油珠宝" />
                            </div>
                    </section>

                    <section className="control-step advanced-step">
                        <button 
                            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                            className="advanced-trigger w-full flex justify-between items-center text-sm font-medium text-gray-600 dark:text-gray-300"
                        >
                            <span>高级设置：自定义图片提示词</span>
                            <ChevronDownIcon className={`w-5 h-5 transition-transform ${isSettingsOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isSettingsOpen && (
                            <div className="space-y-2 text-left animate-fade-in pt-2">
                                {prompts.map((prompt, index) => (
                                    <textarea key={index} value={prompt} onChange={(e) => handlePromptChange(index, e.target.value)} className="w-full p-2 border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-red-500 focus:border-red-500 transition" rows={4}/>
                                ))}
                            </div>
                        )}
                    </section>
                    
                    <section className="control-step action-step">
                        <div className="random-inspiration-row">
                            <div>
                                <strong>随机灵感</strong>
                                <p>为画面加入一份意外惊喜</p>
                            </div>
                            <button
                                onClick={() => onRandomInspirationChange(!useRandomInspiration)}
                                className={`inspiration-switch ${useRandomInspiration ? 'is-on' : ''}`}
                                title="随机灵感"
                                role="switch"
                                aria-checked={useRandomInspiration}
                            >
                                <span></span>
                            </button>
                        </div>

                        <button 
                            onClick={onGenerate}
                            disabled={!uploadedFile || isLoading}
                            className="generate-button w-full flex items-center justify-center px-8 py-3 bg-red-500 text-white font-bold text-lg shadow-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transform transition-all duration-300"
                        >
                           <SparkleIcon className="w-5 h-5 mr-3"/>
                           {isLoading ? '生成中...' : '生成我的爆款图文'}
                        </button>
                    </section>

            </div>
        </div>
    );
};
