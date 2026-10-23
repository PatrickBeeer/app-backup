import { GenerationScenario } from './types';

export const PROMPTS: Record<GenerationScenario, string> = {
  [GenerationScenario.PRODUCT]: `生成一条围巾的专业电商产品图。请使用亚洲模特，展现网红风格。将其置于极简背景中，光线充足，突出围巾的质地和细节，适合在线商店使用。围巾应显得时尚且高质量。`,
  [GenerationScenario.COUPLE]: `生成一张年轻亚洲情侣（中学生/大学生年龄）佩戴或共享这条围巾的浪漫照片，体现甜蜜和亲昵的网红风格瞬间。场景应自然、温馨，并传达亲密感，非常适合作为情侣间的礼物。`,
  [GenerationScenario.CUSTOM]: `根据以下用户提供的提示词生成图片。请保持专业和创造性。`,
};

export const DEFAULT_ASPECT_RATIO = '1:1';
export const DEFAULT_IMAGE_SIZE = '1K';
export const NUM_IMAGES_TO_GENERATE = 2;

