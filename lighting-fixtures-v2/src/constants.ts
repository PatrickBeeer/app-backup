import { StylePreset } from './types';

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'minimalist-ceiling',
    name: '极简吸顶',
    prompt: 'Professional studio product photography background. Clean, solid off-white or very light gray surface. Soft, realistic contact shadows cast by the lamp onto the mounting surface. High-end catalog aesthetic. Minimalist and elegant. The lighting is focused on the product details, creating a premium look. No furniture, no room context, just a pure architectural surface.',
    preview: 'https://picsum.photos/seed/minimalist/200/200'
  },
  {
    id: 'mid-century',
    name: '中古风',
    prompt: 'Creamy Mid-century modern style (奶油中古风). Features iconic vintage furniture (teak or walnut wood), brass accents, and geometric patterns. Warm cream and beige tones with soft textures. Arched doorways and domestic warmth. Fusion of 1950s modern lines and classical art elements. The space feels curated, sophisticated, and rich in design history.',
    preview: 'https://picsum.photos/seed/midcentury/200/200'
  },
  {
    id: 'luxury-crystal',
    name: '奢华水晶',
    prompt: 'Luxury crystal lamp in a sophisticated modern-classical interior. The room features a multi-level tray ceiling with warm hidden cove lighting. Creamy white and beige color palette. Elegant wall moldings, polished floors, and high-end furniture with gold accents. The lighting is bright, clear, and evenly distributed. STRICTOR ADHERENCE TO MOUNTING: If the reference lamp is a flush mount or has a short rod, DO NOT generate a hanging chain. Match the mounting hardware exactly as shown in the product image.',
    preview: 'https://picsum.photos/seed/crystal/200/200'
  },
  {
    id: 'wabi-sabi',
    name: '寂风',
    prompt: 'Wabi-sabi style (寂风). Emphasizes raw, unfinished textures and imperfection. Features micro-cement walls, rough-hewn wood, and natural stone. Muted earthy tones (clay, sand, stone). Minimalist organic shapes and a sense of "emptiness" (Ma). Tranquil, serene, and close to nature. No ornate decorations or polished surfaces.',
    preview: 'https://picsum.photos/seed/wabisabi/200/200'
  },
  {
    id: 'new-industrial',
    name: '新工业主义',
    prompt: 'New industrialism, exposed concrete, metal accents, raw textures, dramatic spotlighting, urban loft aesthetic, high contrast.',
    preview: 'https://picsum.photos/seed/industrial/200/200'
  },
  {
    id: 'cream-french',
    name: '奶油法式',
    prompt: 'Creamy French style, soft moldings, warm cream tones, elegant furniture, romantic lighting, sophisticated and cozy atmosphere.',
    preview: 'https://picsum.photos/seed/french/200/200'
  }
];

export const EMOTIONAL_LABELS = [
  { id: 'healing', name: '治愈' },
  { id: 'warm', name: '温馨' },
  { id: 'premium', name: '高级感' },
  { id: 'solitude', name: '独处时光' },
  { id: 'cinematic', name: '电影感' },
  { id: 'minimalist', name: '极简' },
  { id: 'retro', name: '复古' },
  { id: 'artistic', name: '艺术感' },
  { id: 'dreamy', name: '梦幻' }
];
