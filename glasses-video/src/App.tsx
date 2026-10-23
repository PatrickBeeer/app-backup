import React, { useState } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import ImageStudio from './components/ImageStudio';
import { VideoGenerationPanel } from './components/VideoGenerationPanel';
import type { AppProps } from './types';

interface VideoSeedAsset {
  name: string;
  url: string;
  dataUrl: string;
  kind?: string;
}

const App: React.FC<Partial<AppProps>> = ({ platform, costs }) => {
  const [studioMode, setStudioMode] = useState<'image' | 'video'>('image');
  const [videoSeedAssets, setVideoSeedAssets] = useState<VideoSeedAsset[]>([]);

  const handleUseForVideo = (asset: VideoSeedAsset) => {
    setVideoSeedAssets([asset]);
    setStudioMode('video');
  };

  return (
    <div className="flex flex-col min-h-screen text-zinc-100 antialiased selection:bg-amber-500/30 selection:text-amber-200">
      <Header />
      <main
        className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6"
        data-studio-mode={studioMode}
      >
        <div className="studio-workbench">
          <aside className="studio-workbench-sidebar" aria-label="创作工作台">
            <div className="studio-workbench-title">工作台</div>
            <div className="studio-mode-pills" role="tablist" aria-label="生成模式">
              <button
                type="button"
                className={studioMode === 'image' ? 'active' : ''}
                onClick={() => setStudioMode('image')}
                role="tab"
                aria-selected={studioMode === 'image'}
              >
                图片生成
              </button>
              <button
                type="button"
                className={studioMode === 'video' ? 'active' : ''}
                onClick={() => setStudioMode('video')}
                role="tab"
                aria-selected={studioMode === 'video'}
              >
                视频生成
              </button>
            </div>
          </aside>
          <div className="studio-workbench-content">
            <ImageStudio onUseForVideo={handleUseForVideo} platform={platform} costs={costs} />
            <VideoGenerationPanel seedAssets={videoSeedAssets} platform={platform} costs={costs} />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default App;
