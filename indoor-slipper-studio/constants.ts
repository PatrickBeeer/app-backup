import type { Ethnicity, SceneStyle, ImageType, AspectRatio } from './types';

export const IMAGE_TYPE_OPTIONS: ImageType[] = [
  { label: '上脚图', value: 'on-foot' },
  { label: '模特图', value: 'full-body' },
];

export const ASPECT_RATIO_OPTIONS: AspectRatio[] = [
  { label: '竖图 (3:4)', value: '3:4' },
  { label: '竖图 (9:16)', value: '9:16' },
  { label: '横图 (4:3)', value: '4:3' },
  { label: '方图 (1:1)', value: '1:1' },
];

export const ETHNICITY_OPTIONS: Ethnicity[] = [
  { label: '亚洲人', value: 'Asian' },
  { label: '白种人', value: 'Caucasian' },
  { label: '非洲人后裔', value: 'African descent' },
  { label: '西班牙裔', value: 'Hispanic' },
  { label: '中东人', value: 'Middle Eastern' },
];

export const SCENE_OPTIONS: SceneStyle[] = [
  {
    label: '日式原木风',
    value: 'A Japanese-style minimalist interior, reminiscent of MUJI. The scene is filled with natural light, featuring light-colored wood floors and furniture, white walls, and simple green plants for decoration. The overall atmosphere is clean, tranquil, and warm.',
  },
  {
    label: '奶油风',
    value: 'A trendy "Cream Style" (奶油风) interior, popular on social media like Xiaohongshu. The color palette is dominated by warm whites, beige, and cream. Features soft, diffused lighting, curved furniture (like a bouclé sofa), and creates a gentle, cozy, and high-end atmosphere.',
  },
  {
    label: '侘寂风',
    value: 'A Wabi-sabi (侘寂风) style space. Emphasizes natural textures and imperfection. Use materials like micro-cement or textured plaster for walls/floors, with simple linen textiles and raw pottery. The color scheme is neutral and earthy. The mood is serene, artistic, and deeply calm.',
  },
  {
    label: '纯色背景风',
    value: 'A professional studio setting with a clean, solid-colored background. The background should be a neutral, elegant color like light grey or beige, possibly with a subtle texture. The lighting is soft and even, designed to highlight the product without harsh shadows. The focus is entirely on the product.',
  },
  { label: '自定义...', value: 'custom' },
];

