// Browser-side image resize helper.
// If the longer side of an image exceeds `maxDimension`, it is scaled down
// (preserving aspect ratio) so the longer side equals `maxDimension` before
// being sent upstream. Images already within the limit are returned unchanged.

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

export async function resizeImageToMaxDimension(
  dataUrl: string,
  maxDimension = 1024,
): Promise<string> {
  const img = await loadImage(dataUrl);
  const longest = Math.max(img.width, img.height);
  if (longest <= maxDimension) return dataUrl;

  const scale = maxDimension / longest;
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);

  const mimeType = dataUrl.match(/^data:([^;]+);base64,/)?.[1] || 'image/png';
  // Preserve original type; lightly compress raster formats.
  return canvas.toDataURL(mimeType, 0.92);
}
