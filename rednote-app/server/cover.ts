// Sharp port of backend/app/services/media.py cover functions.
// crop_cover, add_cover_title, create_text_cover, _decorate_cover_title,
// _reference_cover_styles and the 12 palettes are ported faithfully.
// Text is rendered via SVG <text> composited/rasterized through Sharp, which
// requires a CJK bold font on the host (fonts-noto-cjk) — see relaunch script.

import sharp from 'sharp';
import { sha256Hex } from './media';

const WIDTH = 1024;
const HEIGHT = 1365;
const FONT_FAMILY = "'Noto Sans CJK SC','Noto Sans SC','Microsoft YaHei',sans-serif";

type RGB = [number, number, number];
const PALETTES: RGB[] = [
  [250, 245, 236, 29, 27, 24, 235, 52, 47],
  [255, 238, 160, 42, 35, 23, 235, 91, 52],
  [251, 222, 226, 73, 29, 40, 196, 43, 72],
  [210, 237, 218, 24, 56, 38, 34, 132, 91],
  [214, 230, 250, 24, 42, 70, 42, 100, 190],
  [38, 37, 34, 255, 247, 230, 239, 74, 65],
  [250, 249, 242, 31, 31, 29, 232, 77, 63],
  [246, 229, 184, 54, 43, 25, 210, 75, 43],
  [236, 225, 250, 49, 33, 68, 126, 72, 180],
  [233, 67, 58, 255, 249, 235, 255, 220, 87],
  [231, 241, 236, 30, 43, 36, 27, 127, 91],
  [255, 231, 205, 61, 35, 21, 230, 91, 43],
].map((p) => [p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8]] as unknown as RGB) as unknown as RGB[];
// Each entry is [bgR,bgG,bgB, inkR,inkG,inkB, redR,redG,redB] flattened; reshape below.

interface Palette {
  bg: RGB;
  ink: RGB;
  red: RGB;
}
const PALETTE: Palette[] = (PALETTES as unknown as number[][]).map((p) => ({
  bg: [p[0], p[1], p[2]] as RGB,
  ink: [p[3], p[4], p[5]] as RGB,
  red: [p[6], p[7], p[8]] as RGB,
}));

function css(rgb: RGB): string {
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Port of _decorate_cover_title.
function decorateCoverTitle(title: string, symbols: string[] | null | undefined): string {
  const description = (symbols || []).join(' ').toLowerCase();
  const clean = title.trim();
  if (['书名号', 'book title', '《'].some((v) => description.includes(v))) return `《${clean}》`;
  if (['方括号', 'square bracket', '【'].some((v) => description.includes(v))) return `【${clean}】`;
  if (['引号', 'quote', '“', '"'].some((v) => description.includes(v))) return `“${clean}”`;
  if (['井号', 'hashtag', '#'].some((v) => description.includes(v))) return `# ${clean}`;
  if (['对勾', 'check', '✓', '√'].some((v) => description.includes(v))) return `✓ ${clean}`;
  if (['星号', 'star', '★', '*'].some((v) => description.includes(v))) return `★ ${clean}`;
  if (['箭头', 'arrow', '→'].some((v) => description.includes(v))) return `${clean} →`;
  if (['短横线', 'dash', '—'].some((v) => description.includes(v))) return `— ${clean} —`;
  return clean;
}

// Port of _reference_cover_styles.
function referenceCoverStyles(visualReference: string): number[] {
  const hint = (visualReference || '').toLowerCase();
  const groups: [string[], number[]][] = [
    [['绿色', '薄荷', '清新', '自然'], [3, 10]],
    [['粉色', '粉红', '少女', '柔和', '浪漫'], [2, 6]],
    [['蓝色', '冷色', '理性', '科技'], [4]],
    [['黄色', '奶油', '暖色', '明亮'], [1, 7]],
    [['紫色', '薰衣草'], [8]],
    [['橙色', '米色', '复古', '温暖'], [0, 11]],
    [['黑色', '深色', '高对比', '酷'], [5, 9]],
    [['分栏', '分割', '左右', '对称'], [9, 10]],
    [['边框', '卡片', '极简', '留白', '干净'], [0, 2, 5, 11]],
    [['网格', '方格'], [8]],
  ];
  const matched: number[] = [];
  for (const [keywords, styles] of groups) {
    if (keywords.some((k) => hint.includes(k))) matched.push(...styles);
  }
  return Array.from(new Set(matched));
}

// ---- crop_cover ----
export async function cropCover(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'center' })
    .png()
    .toBuffer();
}

// Build SVG <text> with <tspan> lines. baseline of first line ≈ top + fontSize*0.82.
function multilineText(
  x: number,
  top: number,
  lines: string[],
  fontSize: number,
  spacing: number,
  fill: string,
  weight: 'bold' | 'normal' = 'bold',
): string {
  const lineHeight = fontSize + spacing;
  const baseline0 = top + fontSize * 0.82;
  const tspans = lines
    .map((line, i) => `<tspan x="${x}" dy="${i === 0 ? baseline0 : lineHeight}">${escapeXml(line)}</tspan>`)
    .join('');
  return `<text font-family="${FONT_FAMILY}" font-size="${fontSize}" font-weight="${weight}" fill="${fill}">${tspans}</text>`;
}

// ---- add_cover_title (photo_text overlay) ----
export async function addCoverTitle(
  buffer: Buffer,
  title: string,
  typography: {
    typography_symbols?: string[];
    emphasis_method?: string;
    line_break_pattern?: string;
    title_position?: string;
  } = {},
): Promise<Buffer> {
  const fontPx = 76;
  const decorated = decorateCoverTitle(title, typography.typography_symbols);
  const pattern = String(typography.line_break_pattern || '');
  const maxChars = /两行|2行|two lines/i.test(pattern) ? 8 : 10;
  const chars = Array.from(decorated);
  const lines: string[] = [];
  while (chars.length && lines.length < 3) {
    lines.push(chars.splice(0, maxChars).join(''));
  }
  const longestLine = Math.max(...lines.map((l) => Array.from(l).length));
  const width = longestLine * fontPx;
  const height = lines.length * fontPx + (lines.length - 1) * 16;

  const position = String(typography.title_position || '');
  let x = 72;
  if (/右|right/i.test(position)) x = Math.max(72, WIDTH - width - 72);
  let y = Math.max(100, Math.floor((HEIGHT - height) / 2));
  if (/上|top/i.test(position)) y = 120;
  else if (/下|bottom/i.test(position)) y = HEIGHT - height - 140;

  const rectRight = Math.min(WIDTH - 45, x + width + 28);
  const rectBottom = y + height + 30;
  const parts: string[] = [
    `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">`,
    `<rect x="${x - 28}" y="${y - 26}" width="${rectRight - (x - 28)}" height="${rectBottom - (y - 26)}" fill="rgb(255,253,248)"/>`,
    multilineText(x, y, lines, fontPx, 16, 'rgb(27,26,24)'),
  ];

  const emphasis = String(typography.emphasis_method || '').toLowerCase();
  const symbols = (typography.typography_symbols || []).join(' ').toLowerCase();
  if (/下划线|underline|底线/i.test(`${emphasis} ${symbols}`)) {
    parts.push(`<rect x="${x}" y="${y + height + 8}" width="${Math.min(WIDTH - 72, x + width) - x}" height="10" fill="rgb(235,52,47)"/>`);
  }
  parts.push('</svg>');

  const overlay = Buffer.from(parts.join(''));
  return sharp(buffer).composite([{ input: overlay, top: 0, left: 0 }]).png().toBuffer();
}

// ---- create_text_cover (12 styles) ----
function styleDecorations(style: number, ink: RGB, red: RGB): string[] {
  const W = WIDTH;
  const H = HEIGHT;
  const parts: string[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, width: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}"/>`;
  const rect = (x: number, y: number, w: number, h: number, fill: string, stroke?: string, sw?: number) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}"${stroke ? ` fill="${fill}" stroke="${stroke}" stroke-width="${sw}"` : ` fill="${fill}"`}/>`;
  switch (style) {
    case 1:
      for (let y = -W; y < H; y += 90) parts.push(line(0, y, W, y + W, 'rgb(248,215,125)', 18));
      break;
    case 2:
      parts.push(rect(70, 72, W - 140, H - 144, 'none', 'rgb(235,179,190)', 3));
      break;
    case 3:
      parts.push(rect(W - 250, 0, 250, H, 'rgb(190,225,201)'));
      break;
    case 4:
      for (let y = 250; y < H; y += 120) parts.push(line(60, y, W - 60, y, 'rgb(188,211,240)', 3));
      break;
    case 5:
      parts.push(rect(54, 54, W - 108, H - 108, 'none', 'rgb(91,87,80)', 3));
      break;
    case 6:
      parts.push(rect(0, 0, 28, H, css(red)));
      parts.push(rect(72, H - 150, 228, 12, css(red)));
      break;
    case 7:
      parts.push(`<polygon points="0,0 ${W},0 ${W},330 0,500" fill="rgb(240,207,133)"/>`);
      parts.push(rect(70, 300, W - 140, H - 420, 'rgb(255,247,218)', 'rgb(187,149,77)', 4));
      break;
    case 8:
      for (let x = 0; x < W; x += 72) parts.push(line(x, 0, x, H, 'rgb(218,200,238)', 2));
      for (let y = 0; y < H; y += 72) parts.push(line(0, y, W, y, 'rgb(218,200,238)', 2));
      parts.push(rect(W - 210, 0, 210, H, 'rgb(229,217,242)'));
      break;
    case 9:
      parts.push(rect(48, 48, W - 96, H - 96, 'none', 'rgb(255,187,82)', 5));
      parts.push(rect(W - 210, 0, 210, H, 'rgb(205,47,43)'));
      break;
    case 10:
      parts.push(rect(0, 0, Math.floor(W / 2), H, 'rgb(215,235,224)'));
      parts.push(rect(Math.floor(W / 2), 0, W - Math.floor(W / 2), H, 'rgb(243,248,240)'));
      parts.push(line(Math.floor(W / 2), 0, Math.floor(W / 2), H, css(red), 8));
      break;
    case 11:
      parts.push(rect(45, 245, W - 90, H - 375, 'rgb(255,244,224)', 'rgb(230,190,150)', 3));
      break;
  }
  return parts;
}

export async function createTextCover(title: string, variant: string, visualReference: string): Promise<Buffer> {
  const seed = parseInt(sha256Hex(`${title}:${variant}`).slice(0, 4), 16);
  const referenceStyles = referenceCoverStyles(visualReference);
  const style = referenceStyles.length ? referenceStyles[seed % referenceStyles.length] : seed % PALETTE.length;
  const { bg, ink, red } = PALETTE[style];

  const parts: string[] = [`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">`];
  parts.push(`<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="${css(bg)}"/>`);
  parts.push(...styleDecorations(style, ink, red));

  // common elements
  parts.push(`<rect x="0" y="0" width="24" height="${HEIGHT}" fill="${css(red)}"/>`); // left red bar
  parts.push(`<rect x="74" y="88" width="208" height="60" fill="${css(red)}"/>`); // label bg
  parts.push(multilineText(105, 100 - 30 + 30, ['今日分享'], 30, 0, 'rgb(255,255,255)'));
  const muted = style === 5 || style === 9 ? css(ink) : 'rgb(115,106,96)';
  parts.push(multilineText(78, 194 - 24 + 24, ['XIAOHONGSHU NOTES'], 24, 0, muted));

  // title
  const clean = title.trim() || '我的小红书笔记';
  const maxChars = Array.from(clean).length > 16 ? 8 : 7;
  const allChars = Array.from(clean);
  const titleLines: string[] = [];
  for (let i = 0; i < allChars.length && titleLines.length < 4; i += maxChars) {
    titleLines.push(allChars.slice(i, i + maxChars).join(''));
  }
  const titleFont = 92;
  const titleSpacing = 28;
  const textHeight = titleLines.length * titleFont + (titleLines.length - 1) * titleSpacing;
  const textY = Math.max(350, Math.floor((HEIGHT - textHeight) / 2) - 20);
  let textX = [6, 7, 11].includes(style) ? 110 : 78;
  if (style === 9) textX = 70;
  parts.push(multilineText(textX, textY, titleLines, titleFont, titleSpacing, css(ink)));

  const accentY = Math.min(HEIGHT - 210, textY + textHeight + 65);
  parts.push(`<rect x="${textX}" y="${accentY}" width="272" height="14" fill="${css(red)}"/>`);
  parts.push(multilineText(78, HEIGHT - 112 - 24 + 24, ['真实分享  ·  原创表达'], 24, 0, muted));
  parts.push(`<rect x="${WIDTH - 176}" y="${HEIGHT - 116}" width="100" height="12" fill="${css(red)}"/>`);
  parts.push('</svg>');

  return sharp(Buffer.from(parts.join(''))).png().toBuffer();
}

export interface ComposeCoverInput {
  coverType: 'text_only' | 'photo_text';
  baseImageB64?: string;
  title: string;
  typography?: {
    typography_symbols: string[];
    emphasis_method: string;
    line_break_pattern: string;
    title_position: string;
  };
  visualReference?: string;
  variant?: string;
}

export async function composeCover(input: ComposeCoverInput): Promise<string> {
  let buffer: Buffer;
  if (input.coverType === 'text_only') {
    buffer = await createTextCover(input.title, input.variant || '', input.visualReference || '');
  } else {
    if (!input.baseImageB64) throw new Error('photo_text 封面缺少生成底图');
    const raw = input.baseImageB64.includes(',') ? input.baseImageB64.split(',').slice(1).join(',') : input.baseImageB64;
    const cropped = await cropCover(Buffer.from(raw, 'base64'));
    buffer = await addCoverTitle(cropped, input.title, input.typography);
  }
  return `data:image/png;base64,${buffer.toString('base64')}`;
}
