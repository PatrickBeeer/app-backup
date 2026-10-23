import {extractImageFromResponse, generateContent} from '../../../../shared_services/geminiProxyService';
import {cacheGeneratedAsset} from '../../../../shared_services/localGeneratedAssetCache';

type ImageVariant = 'standard' | 'industry' | 'edit' | 'dieline';

interface RequestOptions {
  model?: string;
}

const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';

function readEnv(name: string): string | undefined {
  const viteEnv =
    typeof import.meta !== 'undefined' ? (import.meta as ImportMeta & {env?: Record<string, string>}).env : undefined;
  const processEnv = typeof process !== 'undefined' ? process.env : undefined;
  return viteEnv?.[name] || processEnv?.[name];
}

function getConfig(options: RequestOptions = {}) {
  return {
    model: options.model || readEnv('VITE_IMAGE_MODEL') || DEFAULT_IMAGE_MODEL,
  };
}

function stripDataUrlPrefix(input: string): string {
  return String(input || '').replace(/^data:[^;]+;base64,/i, '');
}

function detectMimeType(input: string, fallback = 'image/png'): string {
  const match = String(input || '').match(/^data:([^;]+);base64,/i);
  return match?.[1] || fallback;
}

async function urlToDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load reference image: ${url}`);
  }
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Failed to read reference image: ${url}`));
    reader.readAsDataURL(blob);
  });
}

async function normalizeImageInput(image: string): Promise<string> {
  if (String(image || '').startsWith('data:')) {
    return image;
  }
  return urlToDataUrl(image);
}

async function toInlineDataPart(image: string): Promise<{inlineData: {mimeType: string; data: string}}> {
  const dataUrl = await normalizeImageInput(image);
  return {
    inlineData: {
      mimeType: detectMimeType(dataUrl),
      data: stripDataUrlPrefix(dataUrl),
    },
  };
}

function extractImageOrThrow(response: Awaited<ReturnType<typeof generateContent>>): string {
  const imageUrl = extractImageFromResponse(response);
  if (!imageUrl) {
    throw new Error('AI image generation returned no image.');
  }
  return imageUrl;
}

export async function generateImage(
  prompt: string,
  variant: ImageVariant = 'standard',
  referenceImages: string[] = [],
): Promise<string> {
  const config = getConfig();
  const imageParts = await Promise.all(referenceImages.map((image) => toInlineDataPart(image)));
  const response = await generateContent({
    model: config.model,
    task: 'image_gen',
    billing_task: 'image_gen',
    contents: {
      parts: [...imageParts, {text: buildPrompt(prompt, variant)}],
    },
    systemInstruction: {
      parts: [
        {
          text:
            'You generate commercially usable packaging visuals and dielines. When reference images are provided, preserve their product identity, structural cues, and visual direction unless the user explicitly asks for a change. Return only the generated image result.',
        },
      ],
    },
  });

  const imageUrl = extractImageOrThrow(response);
  cacheGeneratedAsset({appId: 'package-designer', source: imageUrl, provider: config.model, title: variant});
  return imageUrl;
}

export async function editImage(baseImageUrl: string, prompt: string, referenceImages: string[] = []): Promise<string> {
  const config = getConfig();
  const imageParts = await Promise.all([baseImageUrl, ...referenceImages].map((image) => toInlineDataPart(image)));
  const response = await generateContent({
    model: config.model,
    task: 'image_gen',
    billing_task: 'image_gen',
    contents: {
      parts: [...imageParts, {text: buildPrompt(prompt, 'edit')}],
    },
    systemInstruction: {
      parts: [
        {
          text: 'You edit packaging visuals while preserving product identity, structure, and commercial presentation quality.',
        },
      ],
    },
  });

  const imageUrl = extractImageOrThrow(response);
  cacheGeneratedAsset({appId: 'package-designer', source: imageUrl, provider: config.model, title: 'edit'});
  return imageUrl;
}

export function buildPrompt(prompt: string, variant: ImageVariant): string {
  if (variant === 'industry') {
    return `Create a professional 3D packaging design mockup for: ${prompt}. Design this strictly referencing the visual style, premium aesthetics, and design language of top-tier industry leaders in this specific product category. The design should be highly commercial, premium, visually striking, and ready for client presentation. If there is text on the packaging, use the appropriate language based on the prompt.`;
  }

  if (variant === 'dieline') {
    return `Create a precise 2D unfolded packaging die-line flat layout for: ${prompt}. Show all panels, glue flaps, cut lines, fold lines, and projected graphics on a clean white background. The layout should look like a professional packaging engineering specification.`;
  }

  if (variant === 'edit') {
    return `Use image 1 as the main packaging design reference and any additional images as structural references. Edit or transform the packaging according to this instruction: ${prompt}`;
  }

  return `Create a professional 3D packaging design mockup for: ${prompt}. The design should be modern, high-quality, commercially usable, and visually appealing. If there is text on the packaging, use the appropriate language based on the prompt.`;
}
