import {
  analyzeSellingPoints as analyzeSellingPointsService,
  dataUrlToReference,
  dataUrlsToReferences,
  generateImageBatch,
  queryVideoTask,
  submitVideo,
} from './services/shuyangService';
import type { ImageRatio, ImageResolution, VideoRatio } from './types';

type Mode = 'model' | 'main' | 'selling';

const $ = <T extends Element = HTMLElement>(selector: string): T => document.querySelector(selector) as T;
const $$ = <T extends Element = HTMLElement>(selector: string): T[] => [...document.querySelectorAll(selector)] as T[];

const fileInput = $<HTMLInputElement>('#product-file');
const dropZone = $('#drop-zone');
const uploadContent = $('#upload-content');
const uploadPreview = $('#upload-preview');
const stageImage = $<HTMLImageElement>('#stage-image');
const previewEmpty = $('#preview-empty');
const errorMessage = $('#error-message');
const previewStatus = $('#preview-status');
const previewStage = $('#preview-stage');
const generateButton = $<HTMLButtonElement>('#generate-button');
const customPrompt = $<HTMLTextAreaElement>('#custom-prompt');
const mainSellingPoints = $<HTMLTextAreaElement>('#main-selling-points');
const imageLightbox = $<HTMLDialogElement>('#image-lightbox');
const lightboxImage = $<HTMLImageElement>('#lightbox-image');
const videoResult = $('#video-result');
const resultVideo = $<HTMLVideoElement>('#result-video');
const videoDownload = $<HTMLAnchorElement>('#video-download');
const videoTaskId = $('#video-task-id');
const downloadAllButton = $<HTMLButtonElement>('#download-all-button');
const refreshMainButton = $<HTMLButtonElement>('#refresh-main-button');

// 每个模式拥有独立的预览层，切换模式只显示/隐藏，不销毁记录。
const modelGallery = document.createElement('div');
modelGallery.className = 'generated-gallery';
modelGallery.style.display = 'none';
previewStage.append(modelGallery);
const mainGallery = document.createElement('div');
mainGallery.className = 'generated-gallery';
mainGallery.style.display = 'none';
previewStage.append(mainGallery);

const modeContent: Record<Mode, {
  description: string;
  setup: string;
  preview: string;
  upload: string;
  emptyTitle: string;
  emptyText: string;
  promptLabel: string;
  placeholder: string;
}> = {
  model: {
    description: '上传产品图，生成固定面孔、冷淡表情与自然舒展动作的舒氧模特摄影。',
    setup: '模特拍摄设置', preview: '模特画面预览', upload: '上传产品图',
    emptyTitle: '模特拍摄预览', emptyText: '产品决定服装，固定参考图决定模特身份。',
    promptLabel: '补充构图要求', placeholder: '例如：半身近景，完整展示肩带与罩杯；动作保持舒展自然',
  },
  main: {
    description: '依据舒氧现有主图语言，生成首屏、卖点、材质或版型结构主图。',
    setup: '主图生成设置', preview: '主图画面预览', upload: '上传产品图',
    emptyTitle: '主图生成预览', emptyText: '大主体、浅灰底、局部特写与简洁信息层级。',
    promptLabel: '整组画面补充要求', placeholder: '选填。例如：强化动态拉伸演示，保持高明度柔和光线；画面不要文字',
  },
  selling: {
    description: '上传产品图，自动分析核心卖点并一键生成卖点可视化成片视频。',
    setup: '卖点视频设置', preview: '视频画面预览', upload: '上传产品图',
    emptyTitle: '卖点视频预览', emptyText: '分析卖点后直接生成单条成片，不产出分镜图。',
    promptLabel: '核心卖点', placeholder: '选填。例如：轻薄无痕｜柔软亲肤｜高弹回弹',
  },
};

const MAX_PRODUCT_IMAGES = 4;

let mode: Mode = 'model';
let imageFile: File | null = null;
let imageFiles: File[] = [];
let imageUrls: string[] = [];
let resolution: ImageResolution = '1K';
let imageCount = 1;
let modelImageCount = 1;
let videoRatio: VideoRatio = '9:16';
let videoDuration = 10;
let pollToken = 0;
let sellingAnalyzed = false;
const imageRatios: Record<'model' | 'main', ImageRatio> = { model: '3:4', main: '1:1' };

// 各模式的生成结果，跨模式切换保留。
const modeState: Record<'model' | 'main', { images: string[] }> & Record<'selling', { videoUrl: string | null; taskId: string | null }> = {
  model: { images: [] },
  main: { images: [] },
  selling: { videoUrl: null, taskId: null },
};

function currentGallery(): HTMLDivElement {
  return mode === 'model' ? modelGallery : mainGallery;
}

function currentImageState(): { images: string[] } {
  return mode === 'model' ? modeState.model : modeState.main;
}

// 彻底清空所有模式的结果（换产品图、重置时使用）。
function clearAllResults(): void {
  pollToken += 1;
  if (imageLightbox.open) imageLightbox.close();
  [modelGallery, mainGallery].forEach((gallery) => { gallery.replaceChildren(); gallery.style.display = 'none'; });
  modeState.model.images = [];
  modeState.main.images = [];
  resultVideo.pause();
  resultVideo.removeAttribute('src');
  resultVideo.load();
  videoResult.classList.remove('show');
  videoDownload.removeAttribute('href');
  videoTaskId.textContent = '';
  modeState.selling.videoUrl = null;
  modeState.selling.taskId = null;
  downloadAllButton.hidden = true;
  refreshMainButton.hidden = true;
  sellingAnalyzed = false;
  const sellingResult = $('#selling-result');
  if (sellingResult) sellingResult.hidden = true;
  const sellingList = $('#selling-points-list');
  if (sellingList) sellingList.replaceChildren();
  const sellingPrompt = $<HTMLTextAreaElement>('#selling-video-prompt');
  if (sellingPrompt) sellingPrompt.value = '';
  const sellingCategory = $('#selling-category');
  if (sellingCategory) sellingCategory.textContent = '';
}

// 仅清空当前模式的结果（点生成/刷新当前模式时，保留其它模式的记录）。
function clearCurrentModePreview(): void {
  pollToken += 1;
  if (imageLightbox.open) imageLightbox.close();
  if (mode === 'selling') {
    modeState.selling.videoUrl = null;
    modeState.selling.taskId = null;
    resultVideo.pause();
    resultVideo.removeAttribute('src');
    resultVideo.load();
    videoResult.classList.remove('show');
    videoDownload.removeAttribute('href');
    videoTaskId.textContent = '';
  } else {
    const gallery = currentGallery();
    gallery.replaceChildren();
    gallery.style.display = 'none';
    currentImageState().images = [];
    downloadAllButton.hidden = true;
    refreshMainButton.hidden = true;
  }
}

// 根据当前模式与已保存结果，显示正确的预览层。
function applyPreviewLayers(): void {
  const hasModel = modeState.model.images.length > 0;
  const hasMain = modeState.main.images.length > 0;
  const hasVideo = !!modeState.selling.videoUrl;
  modelGallery.style.display = (mode === 'model' && hasModel) ? 'grid' : 'none';
  mainGallery.style.display = (mode === 'main' && hasMain) ? 'grid' : 'none';
  videoResult.classList.toggle('show', mode === 'selling' && hasVideo);
  downloadAllButton.hidden = mode !== 'main' || !hasMain;
  refreshMainButton.hidden = mode !== 'main' || !hasMain;
  const sellingResult = $('#selling-result');
  if (sellingResult) sellingResult.hidden = !(mode === 'selling' && sellingAnalyzed);
  if (mode === 'selling') {
    stageImage.style.display = 'none';
    previewEmpty.style.display = hasVideo ? 'none' : 'block';
  } else {
    const hasCurrent = mode === 'model' ? hasModel : hasMain;
    stageImage.style.display = (imageFile && !hasCurrent) ? 'block' : 'none';
    previewEmpty.style.display = hasCurrent ? 'none' : 'block';
  }
}

function updateGenerateAvailability(): void {
  generateButton.disabled = false;
}

function syncChoice(selector: string, attribute: string, value: string | number): void {
  $$(selector).forEach((button) => button.setAttribute('aria-pressed', String((button as HTMLElement).dataset[attribute] === String(value))));
}

function activeUserPrompt(): string {
  return mode === 'main' ? mainSellingPoints.value.trim() : customPrompt.value.trim();
}

function setMode(nextMode: Mode): void {
  if (!modeContent[nextMode]) return;
  mode = nextMode;
  const copy = modeContent[mode];
  $$('.nav-button').forEach((button) => button.setAttribute('aria-current', (button as HTMLElement).dataset.mode === mode ? 'page' : 'false'));
  $('#page-description').textContent = copy.description;
  $('#setup-mode-label').textContent = copy.setup;
  $('#preview-mode-label').textContent = copy.preview;
  $('#upload-label').textContent = copy.upload;
  $('#empty-title').textContent = copy.emptyTitle;
  $('#empty-text').textContent = copy.emptyText;
  $('#custom-prompt-label').textContent = copy.promptLabel;
  customPrompt.placeholder = copy.placeholder;
  $('#image-settings').hidden = mode === 'selling';
  $('#selling-settings').hidden = mode !== 'selling';
  $('#model-hint').hidden = mode !== 'model';
  $('#main-rules').hidden = mode !== 'main';
  $('#custom-prompt-field').hidden = mode === 'main' || mode === 'selling';
  $('#main-selling-points-field').hidden = mode !== 'main';
  $('#selling-points-field').hidden = mode !== 'selling';
  const isMainMode = mode === 'main';
  $('#count-field').hidden = isMainMode || mode === 'selling';
  imageCount = isMainMode ? 5 : mode === 'model' ? modelImageCount : imageCount;
  syncChoice('.count-button', 'count', imageCount);
  $('#mode-badge').textContent = mode === 'model' ? '固定模特身份' : mode === 'main' ? '5 类主图结构轮换' : '卖点分析 · 直接成片';
  generateButton.innerHTML = mode === 'main' ? '生成主图 <span aria-hidden="true">↗</span>' : mode === 'selling' ? (sellingAnalyzed ? '重新分析卖点 <span aria-hidden="true">↗</span>' : '分析卖点 <span aria-hidden="true">↗</span>') : '生成模特图 <span aria-hidden="true">↗</span>';
  if (mode === 'model' || mode === 'main') syncChoice('.ratio-button', 'ratio', imageRatios[mode]);
  const restored = mode === 'selling'
    ? (modeState.selling.videoUrl ? '视频已生成 · 记录保留' : null)
    : (currentImageState().images.length ? `已生成 ${currentImageState().images.length} 张 · 记录保留` : null);
  previewStatus.textContent = restored || (imageFile ? '产品图已载入' : '等待产品图');
  applyPreviewLayers();
  updateGenerateAvailability();
}

// 追加式上传：保留已选图片，点击空白区 / ＋ 磁贴只会继续添加，总数上限 4 张。
function addFiles(fileList: FileList | null): void {
  const incoming = [...(fileList || [])];
  if (!incoming.length) return;
  errorMessage.textContent = '';
  const accepted: File[] = [];
  for (const file of incoming) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      errorMessage.textContent = '请选择 PNG、JPG 或 WebP 图片。';
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      errorMessage.textContent = '图片超过 15 MB，请换一张较小的图片。';
      return;
    }
    accepted.push(file);
  }
  const isDuplicate = (file: File): boolean =>
    imageFiles.some((existing) => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified);
  const fresh = accepted.filter((file) => !isDuplicate(file));
  const remaining = MAX_PRODUCT_IMAGES - imageFiles.length;
  if (remaining <= 0) {
    errorMessage.textContent = `最多上传 ${MAX_PRODUCT_IMAGES} 张产品图，请先移除已有图片。`;
    return;
  }
  if (fresh.length > remaining) {
    errorMessage.textContent = `最多上传 ${MAX_PRODUCT_IMAGES} 张产品图：当前已有 ${imageFiles.length} 张，还能添加 ${remaining} 张。`;
    return;
  }
  if (!fresh.length) return;
  imageFiles.push(...fresh);
  imageUrls.push(...fresh.map((file) => URL.createObjectURL(file)));
  imageFile = imageFiles[0] || null;
  renderThumbs();
  stageImage.src = imageUrls[0] || '';
  dropZone.classList.add('has-file');
  uploadContent.style.display = 'none';
  uploadPreview.style.display = 'flex';
  previewEmpty.style.display = 'none';
  stageImage.style.display = 'block';
  previewStatus.textContent = `产品图已载入 · ${imageFiles.length} 张`;
  clearAllResults();
}

function renderThumbs(): void {
  const container = $('#upload-thumbs');
  if (!container) return;
  container.replaceChildren();
  imageUrls.forEach((url, index) => {
    const card = document.createElement('div');
    card.className = 'thumb-card';
    const thumb = document.createElement('img');
    thumb.src = url;
    thumb.alt = `产品图 ${index + 1}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'thumb-remove';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `移除第 ${index + 1} 张产品图`);
    remove.addEventListener('click', (event) => { event.stopPropagation(); removeImageAt(index); });
    card.append(thumb, remove);
    container.append(card);
  });
  if (imageFiles.length < MAX_PRODUCT_IMAGES) {
    const addTile = document.createElement('button');
    addTile.type = 'button';
    addTile.className = 'thumb-add';
    addTile.title = '继续添加产品图';
    addTile.setAttribute('aria-label', `继续添加产品图（还可添加 ${MAX_PRODUCT_IMAGES - imageFiles.length} 张）`);
    addTile.innerHTML = '<span class="thumb-add-plus" aria-hidden="true">+</span>';
    addTile.addEventListener('click', (event) => { event.stopPropagation(); fileInput.click(); });
    container.append(addTile);
  }
}

function removeImageAt(index: number): void {
  if (index < 0 || index >= imageFiles.length) return;
  URL.revokeObjectURL(imageUrls[index]);
  imageFiles.splice(index, 1);
  imageUrls.splice(index, 1);
  if (!imageFiles.length) { clearImage(); return; }
  imageFile = imageFiles[0];
  stageImage.src = imageUrls[0];
  renderThumbs();
  previewStatus.textContent = `产品图已载入 · ${imageFiles.length} 张`;
  clearAllResults();
}

function clearImage(): void {
  imageUrls.forEach((url) => URL.revokeObjectURL(url));
  imageUrls = [];
  imageFiles = [];
  imageFile = null;
  fileInput.value = '';
  stageImage.removeAttribute('src');
  renderThumbs();
  clearAllResults();
  dropZone.classList.remove('has-file');
  uploadContent.style.display = 'block';
  uploadPreview.style.display = 'none';
  previewEmpty.style.display = 'block';
  stageImage.style.display = 'none';
  previewStatus.textContent = '等待产品图';
  errorMessage.textContent = '';
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('无法读取图片。'));
    reader.readAsDataURL(file);
  });
}

async function productDataUrls(): Promise<string[]> {
  return Promise.all(imageFiles.map((file) => fileToDataUrl(file)));
}

function showLargeImage(image: HTMLImageElement): void {
  lightboxImage.src = image.src;
  lightboxImage.alt = `大图预览：${image.alt}`;
  imageLightbox.showModal();
}

function renderImages(images: string[]): void {
  const gallery = currentGallery();
  currentImageState().images = [...images];
  gallery.className = `generated-gallery count-${images.length}`;
  images.forEach((image, index) => {
    const card = document.createElement('div');
    card.className = 'generated-card';
    const resultImage = document.createElement('img');
    resultImage.src = image;
    resultImage.alt = `舒氧${mode === 'main' ? '主图' : '模特图'}结果 ${index + 1}`;
    resultImage.tabIndex = 0;
    resultImage.setAttribute('role', 'button');
    const download = document.createElement('a');
    download.href = image;
    download.download = `shuyang-${mode}-${Date.now()}-${index + 1}.${(image.match(/^data:image\/([^;]+)/)?.[1] || 'png').replace('jpeg', 'jpg')}`;
    download.textContent = `下载 ${index + 1}`;
    card.append(resultImage, download);
    if (mode === 'main') {
      const refineField = document.createElement('div');
      refineField.className = 'image-refine-field';
      const refinePrompt = document.createElement('textarea');
      refinePrompt.className = 'image-refine-prompt';
      refinePrompt.maxLength = 1000;
      refinePrompt.placeholder = '输入这张图的修改要求，例如：动作改为轻拉腰头，保持产品结构不变';
      refinePrompt.setAttribute('aria-label', `第 ${index + 1} 张主图修改提示`);
      const refineButton = document.createElement('button');
      refineButton.className = 'image-refine-button';
      refineButton.type = 'button';
      refineButton.dataset.index = String(index);
      refineButton.textContent = '按提示修改这张';
      refineField.append(refinePrompt, refineButton);
      card.append(refineField);
      const regenerateButton = document.createElement('button');
      regenerateButton.className = 'image-regenerate-button';
      regenerateButton.type = 'button';
      regenerateButton.dataset.index = String(index);
      regenerateButton.textContent = '重新生成这张';
      card.append(regenerateButton);
    }
    gallery.append(card);
  });
  gallery.style.display = 'grid';
  previewEmpty.style.display = 'none';
  stageImage.style.display = 'none';
  downloadAllButton.hidden = mode !== 'main' || images.length === 0;
  refreshMainButton.hidden = mode !== 'main' || images.length === 0;
}

async function refreshMainImages(): Promise<void> {
  if (mode !== 'main' || !imageFile) return;
  refreshMainButton.disabled = true;
  clearCurrentModePreview();
  previewStatus.textContent = '正在刷新 5 张主图';
  try {
    await generateImage();
  } catch (error) {
    previewStatus.textContent = '刷新失败';
    errorMessage.textContent = (error as Error).message || '主图刷新失败，请重试。';
    if (imageFile) stageImage.style.display = 'block';
  } finally {
    refreshMainButton.disabled = false;
  }
}

async function runSingleMainRewrite(index: number, refinePrompt: string, statusPrefix: string): Promise<void> {
  const dataUrls = await productDataUrls();
  const [image] = await generateImageBatch({
    taskType: 'ecommerce',
    ratio: imageRatios.main,
    resolution,
    count: 1,
    productReferences: dataUrlsToReferences(dataUrls),
    userPrompt: activeUserPrompt(),
    refineIndex: index,
    refinePrompt,
  });
  if (!image) throw new Error('没有收到修改后的图片。');
  modeState.main.images[index] = image;
  const card = mainGallery.querySelector(`.generated-card:nth-child(${index + 1})`);
  card?.querySelector('img')?.setAttribute('src', image);
  const download = card?.querySelector<HTMLAnchorElement>('a');
  if (download) download.href = image;
  previewStatus.textContent = statusPrefix;
}

async function refineMainImage(index: number): Promise<void> {
  if (mode !== 'main' || !imageFile) return;
  const card = mainGallery.querySelector(`.generated-card:nth-child(${index + 1})`);
  const promptInput = card?.querySelector<HTMLTextAreaElement>('.image-refine-prompt');
  const refineButton = card?.querySelector<HTMLButtonElement>('.image-refine-button');
  const refinePrompt = promptInput?.value.trim() || '';
  if (!refinePrompt) { errorMessage.textContent = '请先填写这张主图的修改要求。'; promptInput?.focus(); return; }
  refineButton && (refineButton.disabled = true);
  if (refineButton) refineButton.textContent = '修改中…';
  errorMessage.textContent = '';
  previewStatus.textContent = `正在修改第 ${index + 1} 张主图`;
  try {
    await runSingleMainRewrite(
      index,
      refinePrompt,
      `第 ${index + 1} 张主图修改完成`,
    );
    if (promptInput) promptInput.value = '';
  } catch (error) {
    previewStatus.textContent = '修改失败';
    errorMessage.textContent = (error as Error).message || '主图修改失败，请重试。';
  } finally {
    if (refineButton) {
      refineButton.disabled = false;
      refineButton.textContent = '按提示修改这张';
    }
  }
}

async function regenerateMainImage(index: number): Promise<void> {
  if (mode !== 'main' || !imageFile) return;
  const card = mainGallery.querySelector(`.generated-card:nth-child(${index + 1})`);
  const regenerateButton = card?.querySelector<HTMLButtonElement>('.image-regenerate-button');
  if (!regenerateButton) return;
  regenerateButton.disabled = true;
  regenerateButton.textContent = '重新生成中…';
  errorMessage.textContent = '';
  previewStatus.textContent = `正在重新生成第 ${index + 1} 张主图`;
  try {
    await runSingleMainRewrite(
      index,
      '重新生成本张主图，保持产品颜色、版型、结构、材质和比例；更换本张构图，同时遵守该编号主图的内置规则、固定模特和禁止文字规则。',
      `第 ${index + 1} 张主图重新生成完成`,
    );
  } catch (error) {
    previewStatus.textContent = '重新生成失败';
    errorMessage.textContent = (error as Error).message || '主图重新生成失败，请重试。';
  } finally {
    regenerateButton.disabled = false;
    regenerateButton.textContent = '重新生成这张';
  }
}

function downloadAllImages(): void {
  if (mode !== 'main' || !modeState.main.images.length) return;
  const stamp = Date.now();
  modeState.main.images.forEach((image, index) => {
    const link = document.createElement('a');
    link.href = image;
    link.download = `shuyang-main-${stamp}-${index + 1}.${(image.match(/^data:image\/([^;]+)/)?.[1] || 'png').replace('jpeg', 'jpg')}`;
    document.body.append(link);
    link.click();
    link.remove();
  });
}

async function generateImage(): Promise<void> {
  const dataUrls = await productDataUrls();
  const isMain = mode === 'main';
  // 模特模式仅以第一张作为产品参考；主图模式综合多张同产品视图。
  const productReferences = isMain
    ? dataUrlsToReferences(dataUrls)
    : [dataUrlToReference(dataUrls[0])];
  const images = await generateImageBatch({
    taskType: isMain ? 'ecommerce' : 'model',
    ratio: imageRatios[isMain ? 'main' : 'model'],
    resolution,
    count: imageCount,
    productReferences,
    userPrompt: activeUserPrompt(),
  });
  if (!images.length) throw new Error('没有收到生成图片，请重试。');
  renderImages(images);
  previewStatus.textContent = `生成完成 · ${images.length} 张 · ${resolution}`;
}

function showVideo(url: string, taskId: string | null): void {
  modeState.selling.videoUrl = url;
  modeState.selling.taskId = taskId;
  resultVideo.src = url;
  videoDownload.href = url;
  videoDownload.target = '_blank';
  videoTaskId.textContent = taskId ? `任务 ${taskId}` : '';
  videoResult.classList.add('show');
  previewEmpty.style.display = 'none';
  stageImage.style.display = 'none';
  previewStatus.textContent = '视频生成完成';
}

async function pollVideo(taskId: string, token: number): Promise<void> {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 4000 : 8000));
    if (token !== pollToken) return;
    const result = await queryVideoTask(taskId);
    if (result.videoUrl) return showVideo(result.videoUrl, taskId);
    if (/fail|error|cancel/i.test(String(result.status))) throw new Error(`视频任务失败：${result.status}`);
    previewStatus.textContent = `视频生成中 · ${String(result.status || 'queued')}`;
  }
  throw new Error('视频生成等待超过 20 分钟，请稍后重试。');
}

async function generateVideo(userPromptOverride?: string): Promise<void> {
  const prompt = userPromptOverride !== undefined ? userPromptOverride : customPrompt.value.trim();
  if (!imageFile) throw new Error('先上传至少一张产品图。');
  const firstFrame = await fileToDataUrl(imageFile);
  const result = await submitVideo(firstFrame, videoRatio, videoDuration, prompt);
  if (result.videoUrl) return showVideo(result.videoUrl, result.taskId);
  if (!result.taskId) throw new Error('视频服务未返回任务编号。');
  videoTaskId.textContent = `任务 ${result.taskId}`;
  previewStatus.textContent = `视频生成中 · ${result.status || 'queued'}`;
  const token = ++pollToken;
  await pollVideo(result.taskId, token);
}

async function analyzeSellingPoints(): Promise<void> {
  if (!imageFile) throw new Error('先上传至少一张产品图。');
  const result = await analyzeSellingPointsService(
    [dataUrlToReference(await fileToDataUrl(imageFile))],
    $<HTMLTextAreaElement>('#selling-points').value.trim(),
  );
  if (!result.videoPrompt) throw new Error('没有收到成片脚本，请重试。');
  $('#selling-category').textContent = result.category ? ` · ${result.category}` : '';
  const list = $('#selling-points-list');
  list.replaceChildren();
  result.sellingPoints.forEach((point) => {
    const item = document.createElement('li');
    item.textContent = point;
    list.append(item);
  });
  $<HTMLTextAreaElement>('#selling-video-prompt').value = result.videoPrompt;
  $('#selling-result').hidden = false;
  sellingAnalyzed = true;
  previewStatus.textContent = '卖点分析完成，可编辑脚本后生成视频';
}

$$('.nav-button').forEach((button) => button.addEventListener('click', () => setMode((button as HTMLElement).dataset.mode as Mode)));
fileInput.addEventListener('change', () => {
  addFiles(fileInput.files);
  // 清空已选记录，保证下次仍可继续追加（甚至重复选同一张图）。
  fileInput.value = '';
});
dropZone.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  if (target.closest('.thumb-remove') || target.closest('.thumb-add')) return;
  fileInput.click();
});
dropZone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); } });
dropZone.addEventListener('dragover', (event) => { event.preventDefault(); dropZone.classList.add('drag'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag'));
dropZone.addEventListener('drop', (event) => { event.preventDefault(); dropZone.classList.remove('drag'); if (event.dataTransfer) addFiles(event.dataTransfer.files); });
$$('.ratio-button').forEach((button) => button.addEventListener('click', () => {
  if (mode !== 'model' && mode !== 'main') return;
  imageRatios[mode] = (button as HTMLElement).dataset.ratio as ImageRatio;
  syncChoice('.ratio-button', 'ratio', imageRatios[mode]);
}));
$$('.resolution-button').forEach((button) => button.addEventListener('click', () => { resolution = (button as HTMLElement).dataset.resolution as ImageResolution; syncChoice('.resolution-button', 'resolution', resolution); }));
$$('.count-button').forEach((button) => button.addEventListener('click', () => { modelImageCount = Number((button as HTMLElement).dataset.count); imageCount = modelImageCount; syncChoice('.count-button', 'count', imageCount); }));
$$('.video-ratio-button').forEach((button) => button.addEventListener('click', () => { videoRatio = (button as HTMLElement).dataset.videoRatio as VideoRatio; syncChoice('.video-ratio-button', 'videoRatio', videoRatio); }));
const durationSlider = $<HTMLInputElement>('#duration-slider');
const durationValue = $('#duration-value');
if (durationSlider) durationSlider.addEventListener('input', () => { videoDuration = Number(durationSlider.value); if (durationValue) durationValue.textContent = `${videoDuration} 秒`; });
modelGallery.addEventListener('click', (event) => { const image = (event.target as HTMLElement).closest<HTMLImageElement>('.generated-card img'); if (image) showLargeImage(image); });
mainGallery.addEventListener('click', (event) => { const image = (event.target as HTMLElement).closest<HTMLImageElement>('.generated-card img'); if (image) showLargeImage(image); });
mainGallery.addEventListener('click', (event) => {
  const refineButton = (event.target as HTMLElement).closest<HTMLButtonElement>('.image-refine-button');
  if (refineButton) { refineMainImage(Number(refineButton.dataset.index)); return; }
  const regenerateButton = (event.target as HTMLElement).closest<HTMLButtonElement>('.image-regenerate-button');
  if (regenerateButton) regenerateMainImage(Number(regenerateButton.dataset.index));
});
modelGallery.addEventListener('keydown', (event) => { const image = (event.target as HTMLElement).closest<HTMLImageElement>('.generated-card img'); if (image && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); showLargeImage(image); } });
mainGallery.addEventListener('keydown', (event) => { const image = (event.target as HTMLElement).closest<HTMLImageElement>('.generated-card img'); if (image && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); showLargeImage(image); } });
imageLightbox.addEventListener('click', (event) => { if (event.target === imageLightbox) imageLightbox.close(); });
$('#close-image-lightbox').addEventListener('click', () => imageLightbox.close());
downloadAllButton.addEventListener('click', downloadAllImages);
refreshMainButton.addEventListener('click', refreshMainImages);
generateButton.addEventListener('click', async () => {
  if (!imageFile) { errorMessage.textContent = '先上传至少一张产品图。'; fileInput.focus(); return; }
  errorMessage.textContent = '';
  if (mode !== 'selling') clearCurrentModePreview();
  generateButton.disabled = true;
  generateButton.textContent = mode === 'selling' ? '正在分析卖点…' : '生成中…';
  previewStatus.textContent = mode === 'selling' ? '正在分析卖点…' : `正在生成 ${imageCount} 张 · ${resolution}`;
  try {
    if (mode === 'selling') await analyzeSellingPoints();
    else await generateImage();
  } catch (error) {
    previewStatus.textContent = '生成失败';
    errorMessage.textContent = (error as Error).message || '生成失败，请重试。';
    if (imageFile) stageImage.style.display = 'block';
  } finally {
    generateButton.disabled = false;
    generateButton.innerHTML = mode === 'main' ? '生成主图 <span aria-hidden="true">↗</span>' : mode === 'selling' ? (sellingAnalyzed ? '重新分析卖点 <span aria-hidden="true">↗</span>' : '分析卖点 <span aria-hidden="true">↗</span>') : '生成模特图 <span aria-hidden="true">↗</span>';
    updateGenerateAvailability();
  }
});
$('#reset-button').addEventListener('click', () => {
  clearImage();
  customPrompt.value = '';
  mainSellingPoints.value = '';
  $<HTMLTextAreaElement>('#selling-points').value = '';
  $<HTMLTextAreaElement>('#selling-video-prompt').value = '';
  $('#selling-category').textContent = '';
  $('#selling-points-list').replaceChildren();
  $('#selling-result').hidden = true;
  sellingAnalyzed = false;
  resolution = '1K';
  imageCount = 1;
  modelImageCount = 1;
  videoRatio = '9:16';
  videoDuration = 10;
  if (durationSlider) durationSlider.value = '10';
  if (durationValue) durationValue.textContent = '10 秒';
  imageRatios.model = '3:4';
  imageRatios.main = '1:1';
  syncChoice('.resolution-button', 'resolution', resolution);
  syncChoice('.count-button', 'count', modelImageCount);
  syncChoice('.video-ratio-button', 'videoRatio', videoRatio);
  setMode(mode);
});

$<HTMLButtonElement>('#selling-generate-video').addEventListener('click', async () => {
  if (!imageFile) { errorMessage.textContent = '先上传至少一张产品图。'; fileInput.focus(); return; }
  errorMessage.textContent = '';
  clearCurrentModePreview();
  const button = $<HTMLButtonElement>('#selling-generate-video');
  button.disabled = true;
  generateButton.disabled = true;
  button.textContent = '正在生成视频…';
  previewStatus.textContent = `正在提交 · ${videoRatio} · ${videoDuration}秒`;
  try {
    await generateVideo($<HTMLTextAreaElement>('#selling-video-prompt').value.trim());
  } catch (error) {
    previewStatus.textContent = '生成失败';
    errorMessage.textContent = (error as Error).message || '视频生成失败，请重试。';
    if (imageFile) stageImage.style.display = 'block';
  } finally {
    button.disabled = false;
    button.innerHTML = '生成视频 <span aria-hidden="true">↗</span>';
    generateButton.disabled = false;
  }
});

setMode('model');
