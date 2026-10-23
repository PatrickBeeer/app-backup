
import { AspectRatio, ImageQuantity, Gender } from './types';

export const ASPECT_RATIO_OPTIONS = [
  { label: '方形 (1:1)', value: AspectRatio.SQUARE },
  { label: '竖屏 (3:4)', value: AspectRatio.PORTRAIT_4_3 },
  { label: '横屏 (4:3)', value: AspectRatio.LANDSCAPE_3_4 },
  { label: '竖屏 (9:16)', value: AspectRatio.PORTRAIT_9_16 },
  { label: '横屏 (16:9)', value: AspectRatio.LANDSCAPE_16_9 },
];

export const IMAGE_QUANTITY_OPTIONS = [
  { label: '1 张', value: ImageQuantity.ONE },
  { label: '2 张', value: ImageQuantity.TWO },
  { label: '4 张', value: ImageQuantity.FOUR },
];

export const GENDER_OPTIONS = [
  { label: '不限', value: Gender.UNSPECIFIED },
  { label: '女性', value: Gender.FEMALE },
  { label: '男性', value: Gender.MALE },
];

export const MAX_FILE_SIZE_MB = 10; // Max file size for image upload
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const DEFAULT_WEARING_PROMPT = '在日常场景中展示这些商品，呈现时尚、自然的效果。';

// New: Camera angle descriptions for varied outputs when generating multiple images
export const CAMERA_ANGLE_DESCRIPTIONS = [
  '正面视角',
  '侧面视角',
  '背面视角',
  '高角度拍摄',
  '低角度拍摄',
  '特写镜头',
  '全身镜头',
  '近距离观察',
];