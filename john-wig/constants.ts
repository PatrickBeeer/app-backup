
import { GenerationStyle, ResolutionType, AspectRatioType, Ethnicity, Outfit } from './types';

export const ETHNICITIES: Ethnicity[] = [
  { id: 'east-asian', name: '东亚人', label: 'Chinese/Korean/Japanese' },
  { id: 'caucasian', name: '白种人', label: 'Caucasian/European' },
  { id: 'african', name: '非裔', label: 'African/Black' },
  { id: 'latino', name: '拉美裔', label: 'Latino/Hispanic' },
  { id: 'south-asian', name: '南亚人', label: 'Indian/South Asian' }
];

export const OUTFITS: Outfit[] = [
  { 
    id: 'casual-chic', 
    name: '简约休闲', 
    description: '白T恤配牛仔裤，清爽自然',
    prompt: '穿着一件简约的高品质白色棉质T恤和蓝色牛仔裤，看起来休闲且干净'
  },
  { 
    id: 'business-suit', 
    name: '职场西装', 
    description: '干练小西装，职业女性范',
    prompt: '穿着一套合身的现代西装外套，职业商务着装，显得成熟稳重'
  },
  { 
    id: 'silk-dress', 
    name: '富家千金丝绸裙', 
    description: '精致丝绸礼裙，年轻名媛范，皮肤白皙有光泽',
    prompt: '穿着一件精致的高级丝绸吊带礼裙，展现出年轻“富家千金”的高贵名媛气质。中景或全身照镜头，展现优雅的身姿与裙摆细节。皮肤白皙细腻，透出自然的健康光泽，妆容极其精致考究，整体形象年轻化且充满高级感。'
  },
  { 
    id: 'streetwear', 
    name: '潮酷街头', 
    description: '卫衣或夹克，个性十足',
    prompt: '穿着一件超大的设计师连帽衫和科技感元素，前卫的街头时尚风格'
  }
];

export const STYLES: GenerationStyle[] = [
  {
    id: 'korean-sweet',
    name: '韩系女团风',
    description: '韩国女团偶像视觉，精致妆容，舞台/画报级光影，充满表现力的甜美笑容与多样化动态姿势。',
    iconName: 'Sparkles',
    prompt: '一张写实的年轻韩国K-pop偶像肖像。K-pop女团审美，华丽的舞台妆容，闪亮的眼妆，亮泽的嘴唇。动态且多样的姿势，俏皮的歪头，手靠近脸部，可爱的互动手势，多变的相机角度，充满活力的动态感。非常可爱快乐的表情，灿烂的笑容，闪烁的眼睛。高端影棚灯光，带有柔和的彩色轮廓光，电影感的眼神光。专注于高度详细的皮肤纹理，可见的毛孔。自然的际线融合。专业的偶像宣传摄影。'
  },
  {
    id: 'elegant-office',
    name: '职场气质风',
    description: '高级职场女性，拒绝虚假，强调真实的皮肤毛孔与自然的办公室光影。',
    iconName: 'Briefcase',
    prompt: '一位在高端现代办公室里的成熟职业女性。自然日光散射，柔和的职业环境阴影。写实的皮肤纹理，带有微孔和细纹，真实的头发与皮肤过渡。避免任何“塑料感”或过度平滑的AI感。8k高保真摄影。'
  },
  {
    id: 'buyer-show',
    name: '真实买家秀/街拍风',
    description: '生活化自拍或时尚街拍感，亲和力强，适合社媒传播。',
    iconName: 'Camera',
    prompt: '唯美的卧室或时尚的城市街道背景，自拍或街拍风格，自然明亮的阳光或温暖的室内灯光，高品质的社交媒体网红感。写实的皮肤纹理，带有自然的高光，真实的头发动态，鲜艳的色彩。非常自然的皮肤外观，带有真实的灯光和柔焦效果，8k分辨率，自然的皮肤毛孔。'
  },
  {
    id: 'ins-minimalist',
    name: 'Ins 极简冷淡风',
    description: '高级感极简背景，冷色调，光影分明，强调质感。',
    iconName: 'Sun',
    prompt: '高端极简主义Instagram审美。干净的中性背景，冷色调，带有清晰阴影的精致灯光。专注于纹理和形式。写实的皮肤，带有自然的哑光效果，锐利的头发细节。奢侈品牌的专业社论摄影，8k分辨率，可见的皮肤纹理。'
  },
  {
    id: 'xiaohongshu-style',
    name: '小红书网红风',
    description: '小红书女博主精致感，高级餐厅或精品店背景，精心设计的摆拍姿势，中国女性面孔。',
    iconName: 'Heart',
    prompt: '一张写实的小红书年轻中国女博主照片。精致考究的妆容，高端生活方式背景，如豪华咖啡馆、精品店或极简艺术馆。精心设计的“随性”姿势，优雅时尚的穿搭。柔和动人的灯光，高品质的美妆摄影。专注于真实的皮肤纹理、可见的毛孔、自然的际线。高端社交媒体审美，8k分辨率。'
  },
  {
    id: 'custom',
    name: '自定义风格',
    description: '自由编辑提示词，打造专属视觉效果。',
    iconName: 'Edit3',
    prompt: ''
  }
];

export const RESOLUTIONS: ResolutionType[] = ['2K', '4K'];
export const ASPECT_RATIOS: AspectRatioType[] = ['1:1', '3:4', '9:16'];

export const LOADING_MESSAGES = [
  "正在识别发丝细节...",
  "正在为您匹配真实人脸建模...",
  "正在从云端调取高保真皮肤材质...",
  "正在优化皮肤肌理与毛孔真实感...",
  "正在模拟自然环境光线追踪...",
  "正在渲染 2K/4K 超清光影细节...",
  "正在进行最后的像素级色彩校正...",
  "正在生成最终高保真图片..."
];
