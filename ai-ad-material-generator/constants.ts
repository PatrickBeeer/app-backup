export type SceneCategory = 'outdoor' | 'commercial' | 'office' | 'custom';

export interface Scene {
  id: string;
  name: string;
  prompt: string;
  category: SceneCategory;
}

export const SCENES: Scene[] = [
  { id: 'mall_atrium', name: '商场中庭', category: 'commercial', prompt: "Place this sign in the middle of a spacious, high-end shopping mall atrium. The floor is polished tile reflecting the sign. There are blurred shoppers and escalators in the background. The lighting is bright and evenly distributed from the skylight." },
  { id: 'exhibition', name: '展览中心', category: 'commercial', prompt: "Display this sign as part of an exhibition booth in a large convention center. The floor is carpeted. The lighting is high-contrast spot lighting typical of trade shows. The background shows other booths and a busy atmosphere." },
  { id: 'storefront', name: '店铺门头', category: 'outdoor', prompt: "Place this sign as the main storefront signage above the entrance of a stylish retail shop on a busy street. The lighting should be natural daylight with soft shadows. The architecture is modern commercial. The final image should be a high-quality, photorealistic photograph taken from street level." },
  { id: 'facade', name: '建筑外墙', category: 'outdoor', prompt: "Display this sign on the exterior facade of a modern commercial building or shopping mall. The view is looking up slightly. The building surface is composed of glass and steel. The sky is clear. The final image should be a high-quality, photorealistic architectural photograph." },
  { id: 'cafe', name: '咖啡馆', category: 'commercial', prompt: "Mount this sign on a textured rustic brick wall inside a cozy, trendy coffee shop. The lighting should be warm and ambient, possibly with some hanging filament bulbs nearby. The atmosphere is relaxed. The final image should be a high-quality, photorealistic photograph." },
  { id: 'glass', name: '玻璃橱窗', category: 'commercial', prompt: "Apply this sign as a decal or mounted element on a large clear glass window of a modern office or shop. Through the glass, you can vaguely see a blurred interior background. The lighting highlights the sign against the transparency of the glass. The final image should be a high-quality, photorealistic photograph." },
  { id: 'restaurant', name: '餐饮店', category: 'commercial', prompt: "Place this sign at the entrance of an upscale, contemporary Chinese restaurant. The wall should be textured, perhaps with dark wood or stone, and the lighting should be atmospheric. The sign should be the focal point. The final image should be a high-quality, photorealistic photograph." },
  { id: 'private_room', name: '会所包厢', category: 'commercial', prompt: "Place this sign next to the door of a private dining room (包厢) in a sophisticated Chinese restaurant. The door should be made of dark, elegant wood. The corridor lighting should subtly highlight the sign. The atmosphere should feel exclusive and private. The final image should be a high-quality, photorealistic photograph." },
  { id: 'hotel', name: '高端酒店', category: 'commercial', prompt: "Place this sign on the wall next to the door of a modern, luxurious hotel room. The lighting should be warm and inviting, matching the hotel corridor's ambiance. The sign should appear naturally mounted. The final image should be a high-quality, photorealistic photograph." },
  { id: 'reception', name: '企业前台', category: 'office', prompt: "Mount this sign on the wall behind a modern, sleek corporate reception desk. The wall should be made of clean white marble or matte paneling. The lighting should be professional, cool, and diffused. The atmosphere is business-like and high-end. The final image should be a high-quality, photorealistic photograph." },
  { id: 'office', name: '办公室', category: 'office', prompt: "Mount this sign on a sleek, modern office wall, beside the entrance to a conference room or an executive office. The background should be a professional office environment, possibly with glass walls or brushed metal finishes. The lighting should be professional and bright. The final image should be a high-quality, photorealistic photograph." },
  { id: 'restroom', name: '公共空间', category: 'office', prompt: "Mount this sign on the wall outside a high-end, clean public restroom, for example in a mall or a fine dining establishment. The wall should be tiled or have a clean, minimalist finish. The sign should clearly indicate the entrance. The final image should be a high-quality, photorealistic photograph." },
  { id: 'custom', name: '自定义场景', category: 'custom', prompt: '' },
];

// Keep empty to skip automatic remote/local fetch on startup.
// Users can upload source image manually, which avoids startup 404/CORS noise.
export const DEFAULT_SOURCE_IMAGE_URL = '';
