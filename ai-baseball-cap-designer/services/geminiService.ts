/**
 * Gemini 服务 - 通过后端代理调用
 * 使用平台的 geminiProxyService 进行 API 调用
 */

import { generateContent, extractImageFromResponse, extractJsonTextFromResponse } from '../../../shared_services/geminiProxyService';
import { cacheGeneratedAsset } from '../../../shared_services/localGeneratedAssetCache';
import type { GeneratedDesign, Material } from '../types';

const TEXT_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const MAX_RETRY_ATTEMPTS = 4;
const BASE_RETRY_DELAY_MS = 1200;
const MAX_RETRY_DELAY_MS = 10000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isRetryableGenerationError(error: unknown): boolean {
  const message = String((error as any)?.message || '').toLowerCase();
  if (!message) {
    return false;
  }

  return [
    '408',
    '429',
    '500',
    '502',
    '503',
    '504',
    '520',
    '522',
    '523',
    '524',
    'timeout',
    'gateway',
    'bad gateway',
    'upstream',
    'cloudflare',
    'all mapped keys failed',
    'network',
    'fetch',
    'temporarily',
    'service unavailable',
  ].some((needle) => message.includes(needle));
}

async function withRetry<T>(factory: () => Promise<T>): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < MAX_RETRY_ATTEMPTS) {
    try {
      return await factory();
    } catch (error) {
      lastError = error;
      attempt += 1;

      if (attempt >= MAX_RETRY_ATTEMPTS || !isRetryableGenerationError(error)) {
        break;
      }

      const exponentialMs = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * (2 ** (attempt - 1)));
      const jitterFactor = 0.85 + Math.random() * 0.3;
      const waitMs = Math.round(exponentialMs * jitterFactor);
      await sleep(waitMs);
    }
  }

  throw lastError;
}


/**
 * 将 base64 图片数据转换为 API 格式
 */
const prepareImagePart = (base64Data: string, mimeType: string = 'image/png') => {
  // 移除 data:image/xxx;base64, 前缀
  const cleanBase64 = base64Data.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
  return {
    inlineData: {
      data: cleanBase64,
      mimeType,
    },
  };
};

/**
 * 核心设计生成流程：
 * 1. 分析原始设计
 * 2. 根据强度参数生成新设计描述
 * 3. 生成高清静物效果图 (Master)
 * 4. 以静物图为参考，生成模特图 (Reference-based)
 */
export const generateDesigns = async (
  base64Image: string,
  intensity: number,
  onProgress: (stepId: string, status: 'active' | 'completed') => void,
  onDesignUpdate?: (designIndex: number, design: GeneratedDesign) => void
): Promise<GeneratedDesign[]> => {
  const imagePart = prepareImagePart(base64Image);

  // 步骤 1: 深度分析
  onProgress('analyze', 'active');
  const analysisPrompt = `
    请作为一名资深的潮流棒球帽设计师，对提供的参考图进行以下操作：
    
    1. 深度分析：识别风格、配色、面料及爆款潜在元素（如缝线、扣具、帽檐）。
    2. 迭代生成：生成两个新方案。
    - 严格限制变化幅度为原设计的 ${intensity}%。
    - 描述必须详细且具象，涵盖面料纹理、缝线颜色、扣具材质。
    - 不要输出 Markdown、代码块或额外说明，只输出合法 JSON。
    
    请输出 JSON 格式，包含分析结果和两个设计方案的描述。
    格式：{"designs": [{"logic": "设计逻辑说明", "description": "详细的设计描述，用于后续图片生成"}, ...]}
  `;

  const analysisResponse = await withRetry(() => generateContent({
    model: TEXT_MODEL,
    task: 'text_gen',
    billing_task: 'text_gen',
    contents: {
      parts: [imagePart, { text: analysisPrompt }],
    },
    config: {
      responseMimeType: 'application/json',
    },
    retry_attempt: MAX_RETRY_ATTEMPTS,
  }));

  const parsedResponse = JSON.parse(extractJsonTextFromResponse(analysisResponse)) as {
    designs?: Array<{ logic?: string; description?: string }>;
  };
  
  const designDescriptions = parsedResponse.designs;
  if (!designDescriptions || designDescriptions.length === 0) {
    throw new Error('未能生成有效的设计方案。');
  }

  onProgress('analyze', 'completed');
  onProgress('iteration', 'active');
  onProgress('iteration', 'completed');

  const designResults: GeneratedDesign[] = [];

  // 串行生成以保证质量和一致性
  for (let i = 0; i < Math.min(designDescriptions.length, 2); i++) {
    const design = designDescriptions[i];
    const designIndex = i + 1;
    const stillLifeStep = `stillLife${designIndex}`;
    const modelStep = `model${designIndex}`;

    // 步骤：生成 Master 静物图
    onProgress(stillLifeStep, 'active');
    const stillLifePrompt = `Generate a photorealistic, high-end studio product shot of a baseball cap based on this description: ${design.description}. The cap must be perfectly centered on a pure white background with professional lighting. Zero logos, zero text. Focus on material texture.`;

    const stillLifeResponse = await withRetry(() => generateContent({
      model: IMAGE_MODEL,
      task: 'image_gen',
      billing_task: 'image_gen',
      contents: {
        parts: [{ text: stillLifePrompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: '1:1',
          imageSize: '1K',
        },
      },
      retry_attempt: MAX_RETRY_ATTEMPTS,
    }));

    const stillLifeUrl = extractImageFromResponse(stillLifeResponse);
    if (!stillLifeUrl) throw new Error(`方案${designIndex}静物图生成失败`);
    cacheGeneratedAsset({ appId: 'ai-baseball-cap-designer', source: stillLifeUrl, title: `方案${designIndex}静物图`, provider: IMAGE_MODEL });
    onDesignUpdate?.(i, {
      stillLifeUrl,
      modelUrl: '',
    });
    onProgress(stillLifeStep, 'completed');

    // 步骤：生成模特图
    onProgress(modelStep, 'active');
    const stillLifePart = prepareImagePart(stillLifeUrl);
    const modelPrompt = `Generate a high-fashion urban campaign photo. A stylish model is wearing the EXACT SAME baseball cap shown in the reference image. 
    The model should be either a chic European/American Caucasian or an Asian fashion influencer with a trendy, social-media-ready look (highly photogenic influencer style). 
    Do not change the colors, materials, or structural details of the cap. The lighting should be natural but professional. Zero logos, zero text.`;

    const modelResponse = await withRetry(() => generateContent({
      model: IMAGE_MODEL,
      task: 'image_gen',
      billing_task: 'image_gen',
      contents: {
        parts: [stillLifePart, { text: modelPrompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: '3:4',
          imageSize: '1K',
        },
      },
      retry_attempt: MAX_RETRY_ATTEMPTS,
    }));

    const modelUrl = extractImageFromResponse(modelResponse);
    if (!modelUrl) throw new Error(`方案${designIndex}模特图生成失败`);
    cacheGeneratedAsset({ appId: 'ai-baseball-cap-designer', source: modelUrl, title: `方案${designIndex}模特图`, provider: IMAGE_MODEL });
    onProgress(modelStep, 'completed');

    const completedDesign = {
      stillLifeUrl,
      modelUrl,
    };
    designResults.push(completedDesign);
    onDesignUpdate?.(i, completedDesign);
  }

  return designResults;
};

/**
 * 生成技术图纸
 */
export const generateTechPack = async (base64Image: string): Promise<string> => {
  const imagePart = prepareImagePart(base64Image);

  const techPackPrompt = `
    作为技术绘图师，分析提供的棒球帽图像。
    创建一个详细的"技术包图表（Tech Pack）"，用于工厂大货生产。
    输出必须是白色背景上的单个、干净、精准的黑白矢量风格线条图。
    必须包含正视图、侧视图、后视图和俯视图。所有标注使用中文。
  `;

  const response = await withRetry(() => generateContent({
    model: IMAGE_MODEL,
    task: 'image_gen',
    billing_task: 'image_gen',
    contents: {
      parts: [imagePart, { text: techPackPrompt }],
    },
    config: {
      imageConfig: {
        aspectRatio: '1:1',
        imageSize: '1K',
      },
    },
    retry_attempt: MAX_RETRY_ATTEMPTS,
  }));

  const imageUrl = extractImageFromResponse(response);
  if (!imageUrl) throw new Error('技术图纸生成失败');
  cacheGeneratedAsset({ appId: 'ai-baseball-cap-designer', source: imageUrl, title: '技术图纸', provider: IMAGE_MODEL });
  return imageUrl;
};

/**
 * 生成材料清单
 */
export const generateMaterialsList = async (base64Image: string): Promise<Material[]> => {
  const imagePart = prepareImagePart(base64Image);

  const materialsPrompt = `
    基于提供的棒球帽图像，拆解并生成一份精确的生产材料清单 (BOM)。
    JSON 格式输出，包含 "materials" 数组，字段：component, material, specification, quantity。
    全部使用中文描述。
    不要输出 Markdown、代码块或额外说明，只输出合法 JSON。
    格式：{"materials": [{"component": "组件名称", "material": "材料", "specification": "规格", "quantity": "数量"}, ...]}
  `;

  const response = await withRetry(() => generateContent({
    model: TEXT_MODEL,
    task: 'text_gen',
    billing_task: 'text_gen',
    contents: {
      parts: [imagePart, { text: materialsPrompt }],
    },
    config: {
      responseMimeType: 'application/json',
    },
    retry_attempt: MAX_RETRY_ATTEMPTS,
  }));

  const result = JSON.parse(extractJsonTextFromResponse(response)) as { materials?: Material[] };
  
  return result.materials || [];
};
