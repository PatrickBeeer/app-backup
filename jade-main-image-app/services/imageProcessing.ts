/// <reference types="vite/client" />
// Canvas-based image helpers — replaces the Node-only `sharp` pipeline from
// the original Express server. All operations run in the browser.

import { AspectRatio, ImageInput, Quality, RATIO_PAIRS, QUALITY_TARGETS } from '../types';

export function cleanBase64(value: string): string {
  return value.startsWith('data:image/') ? value.split(',', 2)[1] : value;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(cleanBase64(result));
    };
    reader.onerror = () => reject(new Error('blob 读取失败'));
    reader.readAsDataURL(blob);
  });
}

export function base64ToBlob(base64: string, mime: string): Blob {
  const clean = cleanBase64(base64);
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function imageBitmapFromBase64(base64: string): Promise<ImageBitmap> {
  const blob = base64ToBlob(base64, 'image/png');
  // `imageOrientation: 'from-image'` mirrors sharp's `.rotate()` — applies EXIF
  // orientation so portrait photos display upright. Fall back to a plain bitmap
  // if the browser rejects the option (older engines / non-standard values).
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    return createImageBitmap(blob);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob 失败'))),
      type,
      quality
    );
  });
}

/**
 * Crop-to-aspect + resize, mirroring the original `fitRatio` in server.ts.
 * - Auto-rotates EXIF.
 * - Center-crops to the target aspect ratio. When `preserveWhitespace` is set
 *   (scene 01), crops from the top instead of the vertical center.
 * - Upscales if the longer side is below `target`.
 * - Returns base64 PNG (no data URL prefix).
 */
export async function fitRatio(
  image: string,
  ratio: AspectRatio,
  quality: Quality,
  preserveWhitespace: boolean
): Promise<string> {
  const target = QUALITY_TARGETS[quality] || 1024;
  const bitmap = await imageBitmapFromBase64(image);
  let width = bitmap.width || target;
  let height = bitmap.height || target;

  const [n, d] = RATIO_PAIRS[ratio] || [1, 1];
  const wanted = n / d;
  const current = width / height;

  let sx = 0;
  let sy = 0;
  let sw = width;
  let sh = height;

  if (Math.abs(current - wanted) > 0.01) {
    if (current > wanted) {
      // Too wide → crop width (center horizontally).
      sw = Math.round(height * wanted);
      sx = Math.max(0, Math.floor((width - sw) / 2));
    } else {
      // Too tall → crop height. Scene 01 keeps the top (preserveWhitespace),
      // otherwise center vertically.
      sh = Math.round(width / wanted);
      sy = preserveWhitespace ? 0 : Math.max(0, Math.floor((height - sh) / 2));
    }
  }

  const longSide = Math.max(sw, sh);
  const scale = longSide < target ? target / longSide : 1;
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context 不可用');
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, dw, dh);

  const blob = await canvasToBlob(canvas, 'image/png');
  return blobToBase64(blob);
}

/** Resize an image so the longer side equals `target`. JPEG output. */
async function resizeToLongSide(image: string, target: number, jpegQuality: number): Promise<ImageInput> {
  const bitmap = await imageBitmapFromBase64(image);
  const width = bitmap.width || target;
  const height = bitmap.height || target;
  const longSide = Math.max(width, height);
  const scale = longSide > 0 ? target / longSide : 1;
  const dw = Math.max(1, Math.round(width * scale));
  const dh = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context 不可用');
  ctx.drawImage(bitmap, 0, 0, width, height, 0, 0, dw, dh);

  const blob = await canvasToBlob(canvas, 'image/jpeg', jpegQuality);
  return { image: await blobToBase64(blob), mime: 'image/jpeg' };
}

/**
 * Crop the top 48% of the product image (the clasp + connection region) and
 * resize to a 1536px-long JPEG. Mirrors `makeClaspReference` in server.ts.
 */
export async function makeClaspReference(image: string): Promise<ImageInput | null> {
  try {
    const bitmap = await imageBitmapFromBase64(image);
    const width = bitmap.width || 1;
    const height = bitmap.height || 1;
    const sh = Math.max(1, Math.round(height * 0.48));
    const longSide = Math.max(width, sh);
    const target = 1536;
    const scale = longSide > 0 ? target / longSide : 1;
    const dw = Math.max(1, Math.round(width * scale));
    const dh = Math.max(1, Math.round(sh * scale));

    const canvas = document.createElement('canvas');
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context 不可用');
    ctx.drawImage(bitmap, 0, 0, width, sh, 0, 0, dw, dh);

    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.95);
    return { image: await blobToBase64(blob), mime: 'image/jpeg' };
  } catch {
    return null;
  }
}

/** Resize a previously generated PNG to a 1536px-long JPEG for re-use as input. */
export async function loadGeneratedReference(image: string): Promise<ImageInput | null> {
  try {
    return await resizeToLongSide(image, 1536, 0.94);
  } catch {
    return null;
  }
}

// The style reference shipped at /standalone/jade-main-image-app/style_ref.png
// (served from public/style_ref.png by Vite). Cached after first load.
let styleReferenceCache: ImageInput | null = null;

export async function loadStyleReference(): Promise<ImageInput | null> {
  if (styleReferenceCache) return styleReferenceCache;
  try {
    const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    const url = `${base}/style_ref.png`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`style_ref 下载失败：${response.status}`);
    const blob = await response.blob();
    const base64 = await blobToBase64(blob);
    const resized = await resizeToLongSide(base64, 1024, 0.9);
    styleReferenceCache = resized;
    return resized;
  } catch {
    return null;
  }
}

/** Read dimensions of an uploaded image (used by the identity-lock step). */
export async function readImageDimensions(image: string): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await imageBitmapFromBase64(image);
    return { width: bitmap.width || 0, height: bitmap.height || 0 };
  } catch {
    return null;
  }
}

/** Read a File into an ImageInput (base64 + mime). */
export function fileToImageInput(file: File): Promise<ImageInput> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('请只上传图片文件'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve({
        image: cleanBase64(result),
        mime: file.type || 'image/png',
        name: file.name || '翡翠产品图',
      });
    };
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

/** Build an object URL for display from a base64 PNG. */
export function base64ToObjectUrl(base64: string, mime = 'image/png'): string {
  return URL.createObjectURL(base64ToBlob(base64, mime));
}
