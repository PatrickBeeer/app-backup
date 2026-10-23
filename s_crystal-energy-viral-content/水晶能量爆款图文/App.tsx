
import React, { useState, useCallback, useEffect } from 'react';
import { ControlsPanel } from './components/ControlsPanel';
import { ContentDisplay } from './components/ContentDisplay';
import { Header } from './components/Header';
import { generateXiaohongshuPost, PROMPT_SETS } from './services/geminiService';
import type { XiaohongshuPost, ImageStyle, TextStyle } from './types';

const App: React.FC = () => {
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [generatedContent, setGeneratedContent] = useState<XiaohongshuPost | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [selectedImageStyle, setSelectedImageStyle] = useState<ImageStyle>('scene');
    const [selectedTextStyle, setSelectedTextStyle] = useState<TextStyle>('lively');
    const [prompts, setPrompts] = useState<string[]>(PROMPT_SETS[selectedImageStyle]);
    const [useRandomInspiration, setUseRandomInspiration] = useState<boolean>(false);


    useEffect(() => {
        setPrompts(PROMPT_SETS[selectedImageStyle]);
    }, [selectedImageStyle]);

    const handleImageUpload = (file: File | null) => {
        if (file) {
            setUploadedFile(file);
            setGeneratedContent(null);
            setError(null);
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        } else {
            // Handle file reset
            handleStartNew();
        }
    };

    const handleGenerate = useCallback(async () => {
        if (!uploadedFile) return;
        setIsLoading(true);
        setError(null);
        setGeneratedContent(null);
        try {
            const content = await generateXiaohongshuPost(uploadedFile, selectedTextStyle, prompts, useRandomInspiration);
            setGeneratedContent(content);
        } catch (err) {
            console.error(err);
            setError('内容生成失败，请稍后重试。可能是API密钥无效或网络问题。');
        } finally {
            setIsLoading(false);
        }
    }, [uploadedFile, selectedTextStyle, prompts, useRandomInspiration]);
    
    const handleStartNew = () => {
        setUploadedFile(null);
        setGeneratedContent(null);
        setError(null);
        setIsLoading(false);
        setPreview(null);
        setSelectedImageStyle('scene');
        setSelectedTextStyle('lively');
        setPrompts(PROMPT_SETS['scene']);
        setUseRandomInspiration(false);
    };

    return (
        <main className="app-workbench">
            <aside className="control-sidebar">
                <div className="control-panel">
                    <Header />
                    <ControlsPanel 
                        onImageUpload={handleImageUpload} 
                        onGenerate={handleGenerate} 
                        onReset={handleStartNew}
                        uploadedFile={uploadedFile}
                        preview={preview}
                        selectedImageStyle={selectedImageStyle}
                        onImageStyleChange={setSelectedImageStyle}
                        selectedTextStyle={selectedTextStyle}
                        onTextStyleChange={setSelectedTextStyle}
                        prompts={prompts}
                        onPromptsChange={setPrompts}
                        isLoading={isLoading}
                        useRandomInspiration={useRandomInspiration}
                        onRandomInspirationChange={setUseRandomInspiration}
                    />
                </div>
            </aside>

            <section className="preview-stage">
                <div className="preview-panel">
                    <div className="preview-header">
                        <div>
                            <h2>内容预览</h2>
                        </div>
                        <strong>{isLoading ? '生成中' : generatedContent ? '已完成' : '待生成'}</strong>
                    </div>
                    <div className={`preview-canvas ${generatedContent ? 'has-content' : ''}`}>
                        <ContentDisplay 
                            content={generatedContent}
                            isLoading={isLoading}
                            error={error}
                            onReset={handleStartNew}
                            onRetry={handleGenerate}
                        />
                    </div>
                </div>
            </section>
        </main>
    );
};

export default App;
