// Per-image download — mirrors the bc-style-mother-baby GeneratedImageGallery
// pattern. No ZIP (per the approved plan).

export function downloadDataUrl(dataUrl: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function downloadBase64AsPng(base64: string, fileName: string): void {
  const clean = base64.startsWith('data:image/') ? base64 : `data:image/png;base64,${base64}`;
  downloadDataUrl(clean, fileName);
}

export function downloadObjectUrl(url: string, fileName: string): void {
  downloadDataUrl(url, fileName);
}
