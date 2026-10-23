import React, { useRef, useState } from 'react';
import JSZip from 'jszip';
import { AppProps } from '../../types';
import {
  IMAGE_STYLE_LABELS,
  TEXT_STYLE_LABELS,
  defaultPrompts,
  generateAiPost,
} from './services/geminiService';
import type { ImageStyle, TextStyle, XiaohongshuPost } from './types';

const imageStyles: ImageStyle[] = ['scene', 'ootd', 'natural', 'minimalist', 'oldMoney', 'creamJewelry'];
const textStyles: TextStyle[] = ['lively', 'healing'];
const historyKey = 'crystal-content-history';

// 每次生成固定产出 4 张系列组图，用于生成前的余额预估。
const PLANNED_IMAGE_COUNT = 4;

function compactHistoryItem(item: XiaohongshuPost): XiaohongshuPost {
  return {
    ...item,
    hashtags: [...new Set(
      (Array.isArray(item.hashtags) ? item.hashtags : [])
        .map((tag) => String(tag).trim().replace(/^#+/, ''))
        .filter(Boolean)
        .map((tag) => `#${tag}`),
    )],
    images: [],
    prompts: [],
  };
}

function readHistory(): XiaohongshuPost[] {
  try {
    const raw = localStorage.getItem(historyKey);
    if (!raw) return [];

    const compactHistory = (JSON.parse(raw) as XiaohongshuPost[])
      .slice(0, 12)
      .map(compactHistoryItem);
    localStorage.setItem(historyKey, JSON.stringify(compactHistory));
    return compactHistory;
  } catch {
    localStorage.removeItem(historyKey);
    return [];
  }
}

function saveHistory(items: XiaohongshuPost[]) {
  const compactHistory = items.slice(0, 12).map(compactHistoryItem);
  try {
    localStorage.setItem(historyKey, JSON.stringify(compactHistory));
  } catch {
    try {
      localStorage.removeItem(historyKey);
      localStorage.setItem(historyKey, JSON.stringify(compactHistory.slice(0, 6)));
    } catch {
      // 历史持久化不能阻断生成成功的主流程。
    }
  }
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function dataUrlToBlob(dataUrl: string) {
  const [header, encoded] = dataUrl.split(',');
  const mime = header.match(/data:(.*?);base64/)?.[1] || 'image/png';
  const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const CrystalEnergyViralContentApp: React.FC<AppProps> = ({ platform, costs }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [imageStyle, setImageStyle] = useState<ImageStyle>('scene');
  const [textStyle, setTextStyle] = useState<TextStyle>('lively');
  const [prompts, setPrompts] = useState<string[]>(defaultPrompts.scene);
  const [post, setPost] = useState<XiaohongshuPost | null>(null);
  const [history, setHistory] = useState<XiaohongshuPost[]>(readHistory);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [useRandomInspiration, setUseRandomInspiration] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canGenerate = Boolean(preview && uploadedFile && !isLoading);

  // 按计划产出图片张数预估扣费，同时用于按钮展示与余额校验。
  const perImageCost = Number(costs.GENERATE_IMAGE ?? costs.GENERATE_CONTENT ?? 10);
  const estimatedCost = perImageCost * PLANNED_IMAGE_COUNT;

  const handleFile = (file?: File) => {
    if (!file) return;
    setUploadedFile(file);
    setFileName(file.name);
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      setPreview(String(reader.result));
      setPost(null);
    };
    reader.readAsDataURL(file);
  };

  const handleStyleChange = (style: ImageStyle) => {
    setImageStyle(style);
    setPrompts(defaultPrompts[style]);
  };

  const handleGenerate = async () => {
    if (!uploadedFile) return;

    // 余额校验：不足会自动触发充值弹窗。
    await platform.refreshCredits();
    if (estimatedCost > 0 && !platform.checkBalance(estimatedCost)) {
      // 余额不足会自动触发充值弹窗。
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const nextPost = await generateAiPost({
        imageFile: uploadedFile,
        textStyle,
        prompts,
        useRandomInspiration,
        imageStyle,
      });
      const nextHistory = [nextPost, ...history].slice(0, 12);
      setPost(nextPost);
      setCurrentImageIndex(0);
      setHistory(nextHistory);
      saveHistory(nextHistory);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败，请稍后重试');
    } finally {
      setIsLoading(false);
      // 服务端按实际生成调用扣费，刷新前端点数展示。
      await platform.refreshCredits?.();
    }
  };

  const handleClearHistory = () => {
    setHistory([]);
    saveHistory([]);
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const fullPostText = post
    ? `${post.title}\n\n${post.body}\n\n${post.hashtags.join(' ')}`
    : '';

  const handleDownloadImage = (image: string, index: number) => {
    downloadBlob(`水晶能量爆款图-${index + 1}.png`, dataUrlToBlob(image));
  };

  const handleDownloadAllImages = async () => {
    if (!post?.images.length) return;
    const zip = new JSZip();
    post.images.forEach((image, index) => {
      zip.file(`水晶能量爆款图-${index + 1}.png`, dataUrlToBlob(image));
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob('水晶能量爆款图-全部图片.zip', blob);
  };

  return (
    <main className="app-shell">
      <section className="workbench">
        <aside className="panel control-panel">
          <div className="title-block">
            <h1>水晶能量爆款图文</h1>
            <p>小红书水晶手串博主专属 AI 创作助手</p>
          </div>

          <div className="upload-section">
            <div className="upload-heading">
              <span>产品素材</span>
              <small>必选</small>
            </div>
            <button
              className={`upload-card ${preview ? 'has-preview' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                handleFile(event.dataTransfer.files[0]);
              }}
            >
              {preview ? (
                <img src={preview} alt="已上传的水晶产品预览" />
              ) : (
                <span className="upload-placeholder">
                  <strong>＋</strong>
                  <b>上传产品图片</b>
                  <small>仅支持同款产品的正面、侧面和细节图</small>
                </span>
              )}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
          {fileName && <p className="file-name">{fileName}</p>}

          <div className="style-row">
            <span>文案风格</span>
            <div className="pill-row">
              {textStyles.map((style) => (
                <button
                  key={style}
                  className={textStyle === style ? 'active' : ''}
                  onClick={() => setTextStyle(style)}
                >
                  {TEXT_STYLE_LABELS[style]}
                </button>
              ))}
            </div>
          </div>

          <div className="style-row">
            <span>图片风格</span>
            <div className="style-grid">
              {imageStyles.map((style) => (
                <button
                  key={style}
                  className={imageStyle === style ? 'active' : ''}
                  onClick={() => handleStyleChange(style)}
                >
                  {IMAGE_STYLE_LABELS[style]}
                </button>
              ))}
            </div>
          </div>

          <div className="inspiration-row">
            <div className="inspiration-label">
              <strong>随机灵感</strong>
              <small>为画面加入一份意外惊喜</small>
            </div>
            <button
              type="button"
              className={`inspiration-switch ${useRandomInspiration ? 'is-on' : ''}`}
              onClick={() => setUseRandomInspiration((value) => !value)}
              role="switch"
              aria-checked={useRandomInspiration}
              aria-label="随机灵感"
            >
              <span />
            </button>
          </div>

          {error && <p className="error-text">{error}</p>}

          <button className="primary-button" disabled={!canGenerate} onClick={handleGenerate}>
            {isLoading ? '生成中...' : `✨ 生成爆款图文（${estimatedCost} 点）`}
          </button>

          <div className="history-panel">
            <div className="section-title">
              <strong>历史记录</strong>
              <button onClick={handleClearHistory} disabled={history.length === 0}>
                清空
              </button>
            </div>
            {history.length === 0 ? (
              <p className="history-empty">生成后会自动保存最近 12 条记录。</p>
            ) : (
              <div className="history-list">
                {history.map((item) => (
                  <button key={item.createdAt} onClick={() => setPost(item)}>
                    <span>{item.title}</span>
                    <small>
                      {new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false })}
                    </small>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        <section className="panel output-panel">
          {isLoading ? (
            <div className="empty-state">
              <div className="mock-screen loading-screen">
                <div />
                <div />
                <div />
              </div>
              <h2>正在生成图文素材</h2>
              <p>正在为你整理 4 张小红书种草素材。</p>
            </div>
          ) : !post ? (
            <div className="empty-state">
              <div className="mock-screen">
                <div />
                <div />
                <div />
              </div>
              <h2>准备好生成水晶爆款图文了吗？</h2>
              <p>上传图片并选择风格，生成一套小红书可发布素材。</p>
            </div>
          ) : (
            <article className="result">
              <div className="result-actions">
                <strong>生成图片</strong>
                <div className="actions">
                  <button onClick={() => handleCopy(fullPostText)}>复制全部</button>
                  <button onClick={() => downloadText('水晶能量爆款图文.txt', fullPostText)}>下载文案</button>
                  <button onClick={handleDownloadAllImages}>下载全部图片</button>
                </div>
              </div>

              <div className="preview-strip carousel">
                <figure>
                  <img src={post.images[currentImageIndex]} alt={`水晶产品图预览 ${currentImageIndex + 1}`} />
                  <figcaption>
                    <span>{currentImageIndex + 1} / {post.images.length}</span>
                    <button onClick={() => handleDownloadImage(post.images[currentImageIndex], currentImageIndex)} aria-label={`下载第 ${currentImageIndex + 1} 张图片`}>
                      下载
                    </button>
                  </figcaption>
                </figure>
                {post.images.length > 1 && (
                  <div className="carousel-controls">
                    <button
                      className="carousel-arrow prev"
                      onClick={() => setCurrentImageIndex((prev) => (prev - 1 + post.images.length) % post.images.length)}
                      aria-label="上一张"
                    >
                      ‹
                    </button>
                    <div className="carousel-dots">
                      {post.images.map((_, index) => (
                        <button
                          key={index}
                          className={index === currentImageIndex ? 'active' : ''}
                          onClick={() => setCurrentImageIndex(index)}
                          aria-label={`第 ${index + 1} 张`}
                        />
                      ))}
                    </div>
                    <button
                      className="carousel-arrow next"
                      onClick={() => setCurrentImageIndex((prev) => (prev + 1) % post.images.length)}
                      aria-label="下一张"
                    >
                      ›
                    </button>
                  </div>
                )}
              </div>

              <section className="copy-block">
                <button onClick={() => handleCopy(post.title)}>复制标题</button>
                <h3>标题</h3>
                <p>{post.title}</p>
              </section>
              <section className="copy-block">
                <button onClick={() => handleCopy(post.body)}>复制正文</button>
                <h3>正文</h3>
                <p className="body-text">{post.body}</p>
              </section>
              <section className="copy-block">
                <button onClick={() => handleCopy(post.hashtags.join(' '))}>复制标签</button>
                <h3>话题</h3>
                <div className="tags">
                  {post.hashtags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </section>
            </article>
          )}
        </section>
      </section>
    </main>
  );
};
