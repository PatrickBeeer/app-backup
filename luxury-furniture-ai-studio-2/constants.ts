
import { SceneStyle, StyleOption, AspectRatio } from './types';

export const STYLE_OPTIONS: StyleOption[] = [
  {
    id: SceneStyle.CREAMY,
    name: '奶油风',
    description: '柔和温馨',
    icon: 'Coffee',
    prompt: 'professional e-commerce interior photography, warm creamy minimalist style living room, soft warm lighting, high-end texture, elegant atmosphere, gentle color palette',
    chinesePrompt: '高端奶油风室内摄影，柔和温馨的极简主义客厅，暖调软光灯，细腻材质纹理，高雅氛围，马卡龙色系'
  },
  {
    id: SceneStyle.NATURAL_WOOD,
    name: '原木风',
    description: '自然清爽',
    icon: 'TreePine',
    prompt: 'natural wood Japandi style interior, bright sunlight coming through windows, clean wooden textures, zen atmosphere, minimalist furniture arrangement',
    chinesePrompt: '自然原木日系风格，清晨阳光洒进窗户，洁净的木质纹理，禅意氛围，简约家具摆放'
  },
  {
    id: SceneStyle.ITALIAN_MINIMALIST,
    name: '意式极简',
    description: '奢华大气',
    icon: 'Gem',
    prompt: 'luxury Italian minimalist penthouse, marble floors, sophisticated lighting, deep shadows, high-end architectural photography, cinematic quality',
    chinesePrompt: '奢华意式极简大平层，大理石地面，考究的线型灯光，深色调光影，高端建筑摄影感，电影质感'
  },
  {
    id: SceneStyle.NEW_CHINESE,
    name: '新中式',
    description: '东方美学',
    icon: 'Compass',
    prompt: 'Modern New Chinese style interior, elegant landscape paintings, bamboo elements, dark wood accents, artistic lighting, sophisticated Eastern aesthetic',
    chinesePrompt: '现代新中式室内设计，优雅的水墨背景，竹影元素，深木色点缀，艺术化灯光，高级东方美学'
  },
  {
    id: SceneStyle.NORDIC_BRIGHT,
    name: '北欧风',
    description: '通透干净',
    icon: 'Sun',
    prompt: 'Bright Nordic style apartment, white walls, colorful accents, airy atmosphere, flat lighting, youthful and modern look',
    chinesePrompt: '明亮北欧风格公寓，纯白墙面，亮色软装点缀，通透空气感，均匀柔光，时尚年轻化'
  },
  {
    id: SceneStyle.INDUSTRIAL_LOFT,
    name: '工业风',
    description: '复古摩登',
    icon: 'Warehouse',
    prompt: 'Industrial loft style, exposed brick walls, concrete floors, large factory windows, edgy and modern furniture context, dramatic lighting',
    chinesePrompt: '复古工业Loft风格，红砖墙面，水泥地面，超大工厂落地窗，硬朗时尚，戏剧化光影'
  }
];

export const ASPECT_RATIOS = [
  { label: '1:1', value: AspectRatio.SQUARE },
  { label: '3:4', value: AspectRatio.PORTRAIT_3_4 },
  { label: '9:16', value: AspectRatio.TALL },
  { label: '16:9', value: AspectRatio.WIDE }
];

export const SUGGESTED_KEYWORDS = [
  "丁达尔效应", "莫兰迪色系", "景深效果", "电影感", "清冷感", "复古电影感", "室内日光", "落日余晖", "高级灰", "法式复古"
];
