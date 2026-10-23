import { editImage, generateImage } from './openaiImageService';
import { buildDielinePrompt, getPackagingReferenceAsset } from './packagingReferenceAssets';

export interface GenerationResult {
  imageUrl: string;
  prompt: string;
}

export async function generatePackagingDesign(
  prompt: string,
  referenceImage?: string,
): Promise<GenerationResult[]> {
  const promptWithReference = referenceImage
    ? `${prompt}. Use the uploaded reference image as a strong visual and product reference. Keep the generated packaging clearly connected to the uploaded structure, style, and product direction unless the prompt explicitly asks for changes.`
    : prompt;
  const referenceImages = referenceImage ? [referenceImage] : [];

  const [standardImage, industryImage] = await Promise.all([
    generateImage(promptWithReference, 'standard', referenceImages),
    generateImage(promptWithReference, 'industry', referenceImages),
  ]);

  return [
    {
      imageUrl: standardImage,
      prompt: '标准现代风格 (Standard Modern)',
    },
    {
      imageUrl: industryImage,
      prompt: '行业头部视觉风格 (Industry Leader)',
    },
  ];
}

export async function generateUnfoldedView(
  baseImageUrl: string,
  description: string,
  boxType: string = '通用包装盒',
): Promise<string | null> {
  const referenceAsset = getPackagingReferenceAsset(boxType);
  const referenceImage = referenceAsset ? await loadImageAsDataUrl(referenceAsset.url) : null;
  const prompt = buildDielinePrompt(description, boxType);

  try {
    return await editImage(baseImageUrl, prompt, referenceImage ? [referenceImage] : []);
  } catch (error) {
    console.warn('147 image edit failed, falling back to text-to-image die-line generation.', error);
    return generateImage(prompt, 'dieline');
  }
}

export async function editPackagingDesign(
  baseImageUrl: string,
  modificationPrompt: string,
): Promise<GenerationResult | null> {
  const imageUrl = await editImage(baseImageUrl, modificationPrompt);
  return {
    imageUrl,
    prompt: `修改方案: ${modificationPrompt}`,
  };
}

export async function identifyBoxType(_imageUrl?: string): Promise<string> {
  return '插口盒 (Tuck End)';
}

export async function generateAIAnnotations(
  _imageUrl?: string,
  _designPrompt?: string,
): Promise<
  { text: string; type: 'material' | 'process'; targetX: number; targetY: number; labelX: number; labelY: number }[]
> {
  return [
    { text: '350g白卡纸', type: 'material', targetX: 28, targetY: 50, labelX: 8, labelY: 22 },
    { text: '哑光覆膜', type: 'process', targetX: 48, targetY: 42, labelX: 68, labelY: 18 },
    { text: '局部UV', type: 'process', targetX: 58, targetY: 54, labelX: 73, labelY: 48 },
    { text: '烫金工艺', type: 'process', targetX: 42, targetY: 62, labelX: 12, labelY: 72 },
  ];
}

async function loadImageAsDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load packaging reference image: ${url}`);
  }
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Failed to read packaging reference image: ${url}`));
    reader.readAsDataURL(blob);
  });
}
