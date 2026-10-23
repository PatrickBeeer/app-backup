import type { ProductColorHint } from '../types';

// 浏览器版主色调提取：等价于原服务端 product-color.mjs 的量化分桶算法，
// 解码改用 Canvas（上传图均为 data URL，不会污染画布）。
// 保持与服务端一致：仅处理 PNG / JPEG；WebP 等其它格式优雅跳过返回 null。

const MAX_DECODE_DIMENSION = 1024;

function isNeutral(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  if (max >= 244 && min >= 244) return true; // 近白
  if (max <= 14 && min <= 14) return true; // 近黑
  if (chroma < 14) return true; // 近中性灰
  return false;
}

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('product-image-decode-failed'));
    img.src = dataUrl;
  });
}

async function decodePixels(dataUrl: string): Promise<{ data: Uint8ClampedArray; width: number; height: number } | null> {
  const match = String(dataUrl || '').match(/^data:(image\/(?:png|jpeg));base64,/i);
  if (!match) return null;
  const img = await loadImage(dataUrl);
  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;
  if (!naturalW || !naturalH) return null;

  const scale = Math.min(1, MAX_DECODE_DIMENSION / Math.max(naturalW, naturalH));
  const width = Math.max(1, Math.round(naturalW * scale));
  const height = Math.max(1, Math.round(naturalH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  return { data: imageData.data, width, height };
}

interface Bucket {
  r: number;
  g: number;
  b: number;
  count: number;
}

export async function detectProductColor(dataUrl: string): Promise<ProductColorHint | null> {
  const decoded = await decodePixels(dataUrl);
  if (!decoded) return null;
  const { data, width, height } = decoded;
  const total = width * height;
  if (!total) return null;

  // 采样步长：最多约 6 万个采样点，足够估计主色且开销可控。
  const step = Math.max(1, Math.floor(Math.sqrt(total / 60000)));
  const buckets = new Map<string, Bucket>();
  const all = { r: 0, g: 0, b: 0, count: 0 };
  let productPixels = 0;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      all.r += r;
      all.g += g;
      all.b += b;
      all.count += 1;
      if (isNeutral(r, g, b)) continue;
      productPixels += 1;
      const key = `${r >> 4}${g >> 4}${b >> 4}`;
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.r += r;
        bucket.g += g;
        bucket.b += b;
        bucket.count += 1;
      } else {
        buckets.set(key, { r, g, b, count: 1 });
      }
    }
  }

  // 产品像素过少（可能本就是浅色/白色产品），回退到全图平均色。
  if (productPixels < all.count * 0.01 || buckets.size === 0) {
    if (all.count === 0) return null;
    const r = all.r / all.count;
    const g = all.g / all.count;
    const b = all.b / all.count;
    return { hex: toHex(r, g, b), rgb: [Math.round(r), Math.round(g), Math.round(b)] };
  }

  let best: Bucket | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) best = bucket;
  }
  if (!best) return null;
  const r = best.r / best.count;
  const g = best.g / best.count;
  const b = best.b / best.count;
  return { hex: toHex(r, g, b), rgb: [Math.round(r), Math.round(g), Math.round(b)] };
}
