import { ImageAsset } from '../types';

export const fileToToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

export const processFile = async (file: File): Promise<ImageAsset> => {
  const base64 = await fileToToBase64(file);
  const previewUrl = URL.createObjectURL(file);
  
  return {
    file,
    previewUrl,
    base64,
    mimeType: file.type,
  };
};

export const urlToImageAsset = async (url: string, filename: string): Promise<ImageAsset> => {
  try {
    const response = await fetch(url, { mode: 'cors', cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`图片服务器响应失败，状态: ${response.status}`);
    }
    const blob = await response.blob();
    if (blob.size === 0) {
        throw new Error("加载到的图片文件为空");
    }
    const file = new File([blob], filename, { type: blob.type });
    return processFile(file);
  } catch (error) {
    console.error(`从 URL (${url}) 加载图片时出错:`, error);
    throw error;
  }
};

