import React from 'react';
import { GenerationType, GeneratedImage } from '../types';
import LoadingSpinner from './LoadingSpinner';

const typeToTitleMap: Record<GenerationType, string> = {
  [GenerationType.OnFoot]: '上脚图',
  [GenerationType.Scene]: '场景图',
  [GenerationType.Model]: '模特图',
  [GenerationType.Custom]: '自定义图',
};

interface GeneratedImageViewerProps {
  images: GeneratedImage[];
  isLoadingTypes: GenerationType[];
  showPlaceholder: boolean;
  onRegenerate: (type: GenerationType) => void;
  onViewImage: (image: GeneratedImage) => void;
}

const ActionButton: React.FC<{
  onClick: () => void;
  'aria-label': string;
  title: string;
  children: React.ReactNode;
}> = (props) => (
  <button {...props} className="p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-all duration-200">
    {props.children}
  </button>
);

const ImageCard: React.FC<{
  type: GenerationType;
  image?: GeneratedImage;
  isLoading: boolean;
  onRegenerate: (type: GenerationType) => void;
  onViewImage: (image: GeneratedImage) => void;
}> = ({ type, image, isLoading, onRegenerate, onViewImage }) => {
  const title = typeToTitleMap[type];

  const handleDownload = () => {
    if (!image) return;
    const link = document.createElement('a');
    link.href = image.url;
    link.download = `${title}_${new Date().getTime()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white/60 backdrop-blur-xl rounded-2xl border border-white/30 shadow-lg hover:shadow-xl hover:shadow-blue-500/10 overflow-hidden transition-all duration-300 flex flex-col group">
      <div className="p-4 border-b border-white/40">
        <h3 className="font-bold text-lg text-slate-700">{title}</h3>
      </div>
      <div className="aspect-square bg-slate-100 flex items-center justify-center relative flex-grow">
        {isLoading && (
          <div className="absolute inset-0 bg-white/70 flex flex-col items-center justify-center z-20">
            <LoadingSpinner />
            <p className="mt-2 text-sm text-slate-500">生成中...</p>
          </div>
        )}
        {image ? (
          <>
            <img src={image.url} alt={title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-4 z-10">
              <ActionButton onClick={() => onViewImage(image)} aria-label={`查看大图 ${title}`} title="查看大图">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                </svg>
              </ActionButton>
              <ActionButton onClick={() => onRegenerate(type)} aria-label={`重新生成 ${title}`} title="重新生成">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm10 8a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 111.885-.666A5.002 5.002 0 0014.001 13H11a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
              </ActionButton>
              <ActionButton onClick={handleDownload} aria-label={`下载 ${title}`} title="下载">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </ActionButton>
            </div>
          </>
        ) : (
          !isLoading && <p className="text-slate-400 text-sm p-4 text-center">点击左侧<br/>"{title}"<br/>按钮生成</p>
        )}
      </div>
    </div>
  );
};

const GeneratedImageViewer: React.FC<GeneratedImageViewerProps> = ({ images, isLoadingTypes, showPlaceholder, onRegenerate, onViewImage }) => {
  if (showPlaceholder) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[500px] bg-white/60 backdrop-blur-xl rounded-2xl border border-white/30 shadow-xl shadow-blue-500/10 p-8 text-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-slate-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <h2 className="text-2xl font-bold text-slate-600">AI生成的图片将显示在这里</h2>
        <p className="text-slate-500 mt-2 max-w-md">请先上传您的袜子产品图，然后选择一个场景类型即可开始生成。</p>
      </div>
    );
  }

  const generatedCards = images.map(image => (
    <ImageCard
      key={image.id}
      type={image.type}
      image={image}
      isLoading={false}
      onRegenerate={onRegenerate}
      onViewImage={onViewImage}
    />
  ));

  const currentlyLoadingTypes = isLoadingTypes.filter(loadingType =>
    !images.some(img => img.type === loadingType)
  );

  const loadingCards = currentlyLoadingTypes.flatMap(type =>
    Array.from({ length: 2 }).map((_, index) => (
      <ImageCard
        key={`${type}-loading-${index + 1}`}
        type={type}
        isLoading={true}
        onRegenerate={onRegenerate}
        onViewImage={() => {}}
      />
    ))
  );

  const hasContent = generatedCards.length > 0 || loadingCards.length > 0;
  const initialEmpty = !hasContent;

  return (
    <div>
      {initialEmpty && (
        <div className="flex flex-col items-center justify-center h-full min-h-[500px] bg-white/60 backdrop-blur-xl rounded-2xl border border-white/30 shadow-xl shadow-blue-500/10 p-8 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-slate-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <h2 className="text-2xl font-bold text-slate-600">一切就绪，开始创作吧！</h2>
          <p className="text-slate-500 mt-2 max-w-md">您已上传产品图，现在请点击左侧的任一按钮（如"上脚图"）开始生成您的第一张AI图片。</p>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-6">
        {generatedCards}
        {loadingCards}
      </div>
    </div>
  );
};

export default GeneratedImageViewer;
