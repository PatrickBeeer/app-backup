import { ImageData } from '../types';

/**
 * 清理 base64 数据，移除 data URL 前缀
 */
export const cleanBase64 = (base64: string): string => {
  // 如果包含 data URL 前缀，提取纯 base64
  if (base64.includes(',')) {
    return base64.split(',')[1];
  }
  return base64;
};

/**
 * 从 ImageData 提取纯 base64 字符串
 */
export const extractCleanBase64 = (imageData: ImageData): string => {
  return cleanBase64(imageData.base64);
};

