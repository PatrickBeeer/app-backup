import type { Project } from './types.js';

function assTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remaining = safe % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${remaining.toFixed(2).padStart(5, '0')}`;
}

function assText(text: string): string {
  return text
    .replaceAll('\\', '\\\\')
    .replaceAll('{', '\\{')
    .replaceAll('}', '\\}')
    .replace(/\r?\n/g, '\\N');
}

function assColor(hex: string): string {
  const value = hex.replace('#', '').padEnd(6, '0').slice(0, 6);
  const red = value.slice(0, 2);
  const green = value.slice(2, 4);
  const blue = value.slice(4, 6);
  return `&H00${blue}${green}${red}`.toUpperCase();
}

export function buildAss(project: Project): string {
  const width = project.ratio === '9:16' ? 720 : 1280;
  const height = project.ratio === '9:16' ? 1280 : 720;
  const subtitleFontSize = project.ratio === '9:16' ? 54 : 42;
  const subtitleMargin = project.ratio === '9:16' ? 116 : 64;
  const lines = project.analysis?.script ?? [];
  const overlays = project.analysis?.overlays ?? [];
  const events = [
    ...lines.map((line) =>
      `Dialogue: 0,${assTime(line.start)},${assTime(line.end)},Subtitle,,0,0,0,,${assText(line.text)}`
    ),
    ...overlays.map((overlay) => {
      const x = Math.round((overlay.xPercent / 100) * width);
      const y = Math.round((overlay.yPercent / 100) * height);
      const tags = [
        `\\pos(${x},${y})`,
        `\\fs${overlay.fontSize}`,
        `\\c${assColor(overlay.color)}`,
        `\\3c${assColor(overlay.outlineColor)}`
      ].join('');
      return `Dialogue: 1,${assTime(overlay.start)},${assTime(overlay.end)},Overlay,,0,0,0,,{${tags}}${assText(overlay.text)}`;
    })
  ];

  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Subtitle,Microsoft YaHei,${subtitleFontSize},&H00FFFFFF,&H00FFFFFF,&H00151515,&H40000000,-1,0,0,0,100,100,0,0,1,3,1,2,48,48,${subtitleMargin},1`,
    'Style: Overlay,Microsoft YaHei,46,&H00FFFFFF,&H00FFFFFF,&H00111111,&H30000000,-1,0,0,0,100,100,0,0,1,3,1,5,0,0,0,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events,
    ''
  ].join('\n');
}
