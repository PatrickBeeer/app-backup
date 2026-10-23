import type { ReferenceImage } from '../types';

// 随包发布的两张品牌参考图（放在 public/assets，构建后位于 base 之下）。
const IDENTITY_REF_PATH = 'assets/shuyang-signature-model-reference.png';
const UNDERWEAR_REF_PATH = 'assets/shuyang-underwear-shape-reference.png';

const cache = new Map<string, ReferenceImage>();

function assetURL(relativePath: string): string {
  const base = String(import.meta.env.BASE_URL || '/');
  return `${base.endsWith('/') ? base : `${base}/`}${relativePath}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('reference-read-failed'));
    reader.readAsDataURL(blob);
  });
}

async function loadReference(relativePath: string): Promise<ReferenceImage> {
  const cached = cache.get(relativePath);
  if (cached) return cached;

  const response = await fetch(assetURL(relativePath), { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(`reference-asset-unavailable: ${relativePath} (HTTP ${response.status})`);
  }
  const blob = await response.blob();
  const mimeType = blob.type || 'image/png';
  const data = await blobToBase64(blob);
  const reference: ReferenceImage = { mimeType, data };
  cache.set(relativePath, reference);
  return reference;
}

/** 固定模特身份与面部参考（模特模式 + 主图模式）。 */
export function loadIdentityReference(): Promise<ReferenceImage> {
  return loadReference(IDENTITY_REF_PATH);
}

/** 内裤姿态 / 臀型 / 布光视觉参考（仅主图模式）。 */
export function loadUnderwearReference(): Promise<ReferenceImage> {
  return loadReference(UNDERWEAR_REF_PATH);
}
