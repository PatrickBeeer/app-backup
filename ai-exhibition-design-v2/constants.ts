
import { SceneType } from './types';

export const SCENE_TYPES: SceneType[] = [
  {
    id: 'office-lobby',
    name: '写字楼大堂 (现代商务)',
    description: '现代办公楼大堂，高挑空空间，极简商务风格。',
    promptHint: 'A modern corporate office building lobby. PLACEMENT: The installation must be placed strictly on the SIDES of the lobby, near walls or architectural columns. It must NOT block the main entrance, the path to the elevators, or any walking aisles. ENVIRONMENT: High ceilings, floor-to-ceiling glass windows, minimalist reception area, polished granite or marble floors. VIBE: Professional and spacious.',
    imageUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=1000&auto=format&fit=crop',
  },
  {
    id: 'mall-atrium',
    name: '商场中庭 (巨型空间)',
    description: '宏大的商业中庭，适合体量巨大的主题美陈装置。',
    promptHint: 'a colossal, multi-story modern shopping mall atrium. PLACEMENT: The installation must be placed on the SIDE of the atrium floor, near the storefronts or structural pillars. It must NOT block the central pedestrian flow or the main walking path. High-angle wide shot. Features glass ceilings, white futuristic architecture, and highly reflective marble floors. The installation must appear massive, at least 10 meters tall.',
    imageUrl: 'https://images.unsplash.com/photo-1519567241046-7f570eee3ce6?q=80&w=1000&auto=format&fit=crop',
  },
  {
    id: 'luxury-hotel-lobby',
    name: '高端酒店大堂 (奢华空间)',
    description: '挑高奢华大堂，大理石地面，水晶吊灯，适合高端美陈。',
    promptHint: 'A grand luxury hotel lobby with monumental scale. PLACEMENT: The installation must be positioned on the SIDE of the lobby area, away from the central axis and main walking paths to the reception or elevators. ENVIRONMENT: High ceilings, crystal chandeliers, elegant architectural columns, and inlaid marble floor patterns. INTERACTION: The installation must be grounded firmly on the polished marble, with realistic contact shadows and clear reflections.',
    imageUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?q=80&w=1000&auto=format&fit=crop',
  },
  {
    id: 'exhibition-hall',
    name: '展会现场 (专业展厅)',
    description: '室内大型展厅，专业灯光，适合各类商业展览装置。',
    promptHint: 'A professional indoor exhibition hall or trade show floor. PLACEMENT: The installation must be placed strictly on the SIDE of the main aisle, integrated with a booth structure or near the hall walls. It must NOT block the central pedestrian path or any emergency exits. ENVIRONMENT: Large open space, professional overhead truss lighting, modular booth structures in the background, grey carpet or polished concrete floor.',
    imageUrl: 'https://images.unsplash.com/photo-1540575861501-7cf05a4b125a?q=80&w=1000&auto=format&fit=crop',
  },
  {
    id: 'pop-up-store',
    name: '潮流快闪店 (店外广场)',
    description: '充满活力的快闪店店外空间，水泥地面，霓虹灯效，适合年轻化装置。',
    promptHint: 'A trendy minimalist industrial pop-up store EXTERIOR. PLACEMENT: The installation must be placed OUTSIDE the store, on the SIDEWALK or the EDGE of the outdoor plaza area, ensuring it does NOT block the store entrance or the main sidewalk walking path. ENVIRONMENT: Storefront with large glass windows, outdoor concrete paving, neon light accents visible from inside, urban street context.',
    imageUrl: 'https://images.unsplash.com/photo-1534452283882-75889ff68656?q=80&w=1000&auto=format&fit=crop',
  },
  {
    id: 'school-entrance',
    name: '校园广场 (青春活力)',
    description: '现代校园主入口或广场，明亮的户外光线，适合开学季或校园活动。',
    promptHint: 'A bright, modern university campus plaza or main entrance. PLACEMENT: The installation must be placed on the FAR SIDES of the main plaza, near the edge of the grass or architectural walls. It must be strictly AWAY from the central walkway or main traffic flow. ENVIRONMENT: Matte stone paving or concrete ground, contemporary architectural buildings, natural daylight. GROUND: The ground must be non-reflective, matte texture, with NO marble-like reflections. VIBE: Academic and welcoming.',
    imageUrl: 'https://images.unsplash.com/photo-1541339907198-e08756ebafe3?q=80&w=1000&auto=format&fit=crop',
  },
  {
    id: 'outdoor-park',
    name: '户外草坪 (自然融合)',
    description: '开阔的户外草坪或公园绿地，自然光影，适合艺术装置。',
    promptHint: 'A vast, open green park lawn under bright natural daylight. PLACEMENT: The installation must be placed on the SIDE of the lawn area, away from any walking paths or trails. ENVIRONMENT: Lush green grass, distant trees, and a clear blue sky. VIBE: Natural, serene, and artistic. The installation must be placed firmly on the grass, with soft contact shadows.',
    imageUrl: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=1000&auto=format&fit=crop',
  },
  {
    id: 'custom-scene',
    name: '自定义场景',
    description: '输入您想要的任何场景描述，AI将根据您的描述进行融合。',
    promptHint: 'PLACEMENT: The installation must be placed on the SIDE of the space, ensuring it does NOT block any main walking paths, entrances, or traffic flows.', 
    imageUrl: 'https://images.unsplash.com/photo-1483736762161-1d107f3c78e1?q=80&w=1000&auto=format&fit=crop',
  }
];
