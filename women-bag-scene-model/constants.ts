import type { PromptOption, SimpleOption } from './types';

export const PHOTOGRAPHY_STYLES: SimpleOption[] = [
  { id: 'model', name: '模特摄影' },
  { id: 'still_life', name: '静物摄影' },
];

export const SCENES: PromptOption[] = [
  { id: 'city', name: '城市街道', prompt: 'on a bustling, stylish city street with blurred background architecture. Daytime, natural light.' },
  { id: 'cafe', name: '现代咖啡馆', prompt: 'in a bright, modern cafe with minimalist decor. Soft, indoor lighting.' },
  { id: 'beach', name: '海滩日落', prompt: 'on a beautiful sandy beach during sunset. Warm, golden hour light.' },
  { id: 'studio', name: '极简工作室', prompt: 'in a minimalist studio with a plain, neutral-colored background. Clean, professional studio lighting.' },
  { id: 'white-studio', name: '白色影棚', prompt: 'in a clean, brightly lit all-white photo studio. The background should be seamless and pure white. Professional, even studio lighting.' },
];

export const MODEL_STYLES: PromptOption[] = [
  { id: 'casual', name: '休闲时尚', prompt: 'a model with a casual chic style, wearing jeans and a stylish top.' },
  { id: 'elegant', name: '优雅晚装', prompt: 'a model dressed elegantly for an evening out, wearing a beautiful dress.' },
  { id: 'business', name: '职场精英', prompt: 'a model in a professional business suit, looking sharp and confident.' },
  { id: 'boho', name: '波西米亚', prompt: 'a model with a bohemian summer style, wearing a flowy maxi dress.' },
  { id: 'influencer', name: '博主街拍风', prompt: 'a model with a Scandinavian street style aesthetic, looking effortlessly chic. She is wearing a textured, cozy knit sweater paired with a sleek leather or mini skirt. The vibe is candid and sophisticated, like a fashion blogger captured in a moment on a city street. Accessorized with modern, minimalist items.' },
];

export const ASPECT_RATIOS: SimpleOption[] = [
  { id: '1:1', name: '1:1' },
  { id: '3:4', name: '3:4' },
  { id: '4:3', name: '4:3' },
  { id: '9:16', name: '9:16' },
  { id: '16:9', name: '16:9' },
];

export const ETHNICITIES: PromptOption[] = [
  { id: 'any', name: '任意', prompt: 'a model' },
  { id: 'asian', name: '亚洲人', prompt: 'an East Asian model' },
  { id: 'caucasian', name: '白种人', prompt: 'a Caucasian model' },
  { id: 'african', name: '非洲裔', prompt: 'an African descent model' },
  { id: 'hispanic', name: '拉丁裔', prompt: 'a Hispanic model' },
];

