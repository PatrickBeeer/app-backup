export type WallSize = {
  widthMm: number;
  heightMm: number;
};

export type OpeningType = 'door' | 'window' | 'service';

export type Opening = {
  id: string;
  label: string;
  type: OpeningType;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  locked: boolean;
};

export type TextZone = {
  id: string;
  label: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  content: string;
};

export type WallProject = {
  name: string;
  title: string;
  designReference: string;
  requirement: string;
  wall: WallSize;
  style: 'blue-tech' | 'clean-government' | 'dark-command';
  openings: Opening[];
  textZones: TextZone[];
};

export type FitResult = {
  width: number;
  height: number;
  scale: number;
};

export type TextOpeningConflict = {
  textZoneId: string;
  openingId: string;
};

export type PromptSource = 'parametric-wall' | 'uploaded-structure' | 'approved-design';

export type PromptOptions = {
  source?: PromptSource;
  hasStyleReference?: boolean;
};

export function fitRect(wall: WallSize, maxWidth: number, maxHeight: number): FitResult {
  const scale = Math.min(maxWidth / wall.widthMm, maxHeight / wall.heightMm);
  return {
    width: wall.widthMm * scale,
    height: wall.heightMm * scale,
    scale
  };
}

export function mmToPx(valueMm: number, scale: number): number {
  return valueMm * scale;
}

export function getLockedOpenings(project: WallProject): Opening[] {
  return project.openings.filter((opening) => opening.locked);
}

export function findTextOpeningConflicts(project: WallProject): TextOpeningConflict[] {
  const lockedOpenings = getLockedOpenings(project);

  return project.textZones.flatMap((zone) =>
    lockedOpenings
      .filter((opening) => rectsIntersect(zone, opening))
      .map((opening) => ({ textZoneId: zone.id, openingId: opening.id }))
  );
}

function rectsIntersect(
  a: { xMm: number; yMm: number; widthMm: number; heightMm: number },
  b: { xMm: number; yMm: number; widthMm: number; heightMm: number }
): boolean {
  return (
    a.xMm < b.xMm + b.widthMm &&
    a.xMm + a.widthMm > b.xMm &&
    a.yMm < b.yMm + b.heightMm &&
    a.yMm + a.heightMm > b.yMm
  );
}

export function createDefaultProject(): WallProject {
  return {
    name: '伊金霍洛旗背景墙方案',
    title: '伊金霍洛旗全域视联态势感知项目',
    designReference:
      '参考蓝白科技展板风格：左侧地图说明，中间大面积蓝色斜切主视觉和正文区，右侧数据看板，底部蓝色波浪装饰；整体要像政府数字治理项目的平面设计稿。',
    requirement:
      '根据上传的墙面结构设计图生成背景墙平面设计图，必须保留门、窗、电箱、检修口等开孔区域，不要用图案或文字覆盖。整体风格专业、清晰，适合客户确认。',
    wall: {
      widthMm: 11400,
      heightMm: 5000
    },
    style: 'blue-tech',
    openings: [
      {
        id: 'center-door',
        label: '中央双开门',
        type: 'door',
        xMm: 5080,
        yMm: 2440,
        widthMm: 1280,
        heightMm: 2260,
        locked: true
      },
      {
        id: 'left-service',
        label: '左侧检修口',
        type: 'service',
        xMm: 3160,
        yMm: 2590,
        widthMm: 340,
        heightMm: 340,
        locked: true
      },
      {
        id: 'right-service',
        label: '右侧电箱',
        type: 'service',
        xMm: 8750,
        yMm: 2550,
        widthMm: 520,
        heightMm: 420,
        locked: true
      }
    ],
    textZones: [
      {
        id: 'left-copy',
        label: '左侧地图说明',
        xMm: 620,
        yMm: 2520,
        widthMm: 2380,
        heightMm: 1180,
        content:
          '通过高点通信资源上部署的259处高点监控视频图像采集摄像机，覆盖重点区域、林地、草场、湿地、耕地、重点文物等场景，通过24小时全天候巡查消除视频监控盲区。'
      },
      {
        id: 'main-copy',
        label: '中间主文案',
        xMm: 3920,
        yMm: 830,
        widthMm: 3400,
        heightMm: 1260,
        content:
          '通过“全域视联、一网统管”体系，创新基层社会治理模式，提升政府行政效能，打造共用、共享、共治的社会治理新格局。通过建设高点视频点位，对高清视频进行算法赋能，为重点应用场景监测和相关部门决策服务提供支撑。'
      }
    ]
  };
}

export function buildRenderPrompt(project: WallProject, options: PromptOptions = {}): string {
  if (options.source === 'approved-design') {
    return [
      'Create a photorealistic showroom rendering from the first uploaded image, which is the user-approved flat wall design.',
      'The first uploaded image is the locked layout source of truth. Preserve its wall outline, openings, panel boundaries, graphic placement, title area, proportions, and relative positions.',
      'The first uploaded image is also the strict color source of truth. Preserve the exact dominant palette, accent colors, color balance, graphic color assignments, title color, panel colors, gradients, and decorative trim colors from the approved flat design.',
      'Do not recolor the design into generic blue, cyan, or any default technology palette. Do not change purple/gold or other approved colors into blue/cyan during rendering.',
      'Do not redesign the flat layout. Do not move, resize, add, remove, cover, crop, or perspective-warp doors, windows, service panels, electrical boxes, inspection openings, or other physical cutouts.',
      'Convert the approved flat design into a front-facing showroom effect image with realistic wall material, subtle depth, lighting, floor reflection, and clean exhibition atmosphere while keeping all original artwork colors unchanged.',
      `Title text: ${project.title}.`,
      'Ignore generic style presets at this stage. The approved flat design controls layout and color; rendering may add only lighting, depth, material, and perspective.',
      `User requirement: ${project.requirement}.`,
      'Keep the full wall visible. No people, no random logos, no watermark, no extra doors or windows.'
    ].join('\n');
  }

  const locked = getLockedOpenings(project)
    .map(
      (opening) =>
        `${opening.label}: ${opening.type}, x=${opening.xMm}mm, y=${opening.yMm}mm, w=${opening.widthMm}mm, h=${opening.heightMm}mm, do not cover`
    )
    .join('; ');

  const zones = project.textZones
    .map((zone) => `${zone.label}: ${zone.content}`)
    .join('\n');

  return [
    'Create a photorealistic showroom rendering after the approved flat design of a government digital governance background wall.',
    `The wall is ${project.wall.widthMm}mm wide and ${project.wall.heightMm}mm high.`,
    `Title text: ${project.title}.`,
    `Visual style: ${styleLabel(project.style)}.`,
    `User requirement: ${project.requirement}.`,
    'Programmatically typeset Chinese text zones in the final application; in image generation, show crisp wall-copy blocks without inventing extra copy.',
    `Locked physical openings that must remain blank and uncovered: ${locked}.`,
    `Text zones:\n${zones}`,
    'Composition: front perspective, full wall visible, dark reflective floor, white ceiling strip lights, blue-white technology panels, map area, dashboard area, wave trim lines, no people, no random logos, no watermark.'
  ].join('\n');
}

export function buildDesignPrompt(project: WallProject, options: PromptOptions = {}): string {
  if (options.source === 'uploaded-structure') {
    return [
      'Create a front-facing flat elevation graphic design by tracing the first uploaded image as the exact wall structure template.',
      'The first uploaded image is a measured wall elevation / structure drawing and is the only geometry source of truth.',
      'Preserve the original outer wall rectangle, baseline, proportions, all doors, windows, service panels, electrical boxes, inspection openings, dimension relationships, and all blank physical openings exactly.',
      'Do not move, resize, add, remove, crop, stylize, cover, or perspective-warp any structural outline or opening from the first uploaded image.',
      'Use the structure drawing as a locked underlay. Add only graphic design layers, color blocks, panels, maps, dashboards, trim lines, and text areas on valid wall surface areas.',
      'Keep the output as a clean front-facing flat design board for client approval, not a 3D render and not a new wall structure.',
      `Title text: ${project.title}.`,
      options.hasStyleReference
        ? 'Visual style priority: strongly follow the second uploaded image, not a generic template.'
        : `Visual style: ${styleLabel(project.style)}.`,
      `Design style reference: ${project.designReference}.`,
      options.hasStyleReference
        ? [
            'The second uploaded image is the visual style source of truth. Transfer its dominant color palette, accent colors, contrast level, graphic element shapes, panel language, line decorations, texture/material cues, spacing rhythm, and overall design mood into the flat wall design.',
            'Make the influence of the second uploaded image clearly visible in the generated flat design. Do not fall back to generic blue-white technology styling unless the second image itself uses that style.',
            'Use the second image for style only; it must not override, deform, crop, or replace the first image structure.'
          ].join(' ')
        : 'No separate style reference image was provided; follow the written style requirement.',
      `User requirement: ${project.requirement}.`,
      'Chinese text can be represented as clean title/body blocks if exact text rendering is uncertain. Never place text or graphics across physical openings.'
    ].join('\n');
  }

  const locked = getLockedOpenings(project)
    .map(
      (opening) =>
        `${opening.label}: ${opening.type}, x=${opening.xMm}mm, y=${opening.yMm}mm, w=${opening.widthMm}mm, h=${opening.heightMm}mm, do not cover`
    )
    .join('; ');

  const zones = project.textZones
    .map(
      (zone) =>
        `${zone.label}: x=${zone.xMm}mm, y=${zone.yMm}mm, w=${zone.widthMm}mm, h=${zone.heightMm}mm, copy="${zone.content}"`
    )
    .join('\n');

  return [
    'Create a flat elevation design drawing for client design approval before any 3D rendering.',
    `The wall is ${project.wall.widthMm}mm wide and ${project.wall.heightMm}mm high.`,
    `Title text: ${project.title}.`,
    `Visual style: ${styleLabel(project.style)}.`,
    `Design style reference: ${project.designReference}.`,
    `User requirement: ${project.requirement}.`,
    'Keep this output as a front-facing flat design board, not a perspective render.',
    `Locked physical openings that must remain blank and uncovered: ${locked}.`,
    `Programmatically typeset these Chinese text zones with clean hierarchy:\n${zones}`,
    'Use precise blue-white technology layout, map block, dashboard block, angular panels, wave trim lines, and clear empty masks. This is the design approval image.'
  ].join('\n');
}

export function styleLabel(style: WallProject['style']): string {
  if (style === 'clean-government') return 'clean white government exhibition style with restrained blue accents';
  if (style === 'dark-command') return 'dark command center style with cyan glow and dashboard panels';
  return 'blue and white technology style with cyan gradients, circuit lines, map and dashboard panels';
}
