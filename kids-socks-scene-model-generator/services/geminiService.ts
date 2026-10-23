import { generateContent, extractImageFromResponse } from '../../../shared_services/geminiProxyService';
import type { GeminiGenerateRequest } from '../../../shared_services/geminiProxyService';

export const generateStyledImage = async (
  images: { base64: string; mimeType: string }[],
  prompt: string,
  seed: number,
): Promise<string[]> => {
  console.log('[童袜应用-服务层] 开始生成图片', {
    imagesCount: images.length,
    promptLength: prompt.length,
    seed: seed,
    imageMimeTypes: images.map(img => img.mimeType),
    firstImageBase64Length: images[0]?.base64?.length || 0,
    firstImageBase64Preview: images[0]?.base64?.substring(0, 50) || 'N/A',
  });

  // 检查 base64 数据格式
  images.forEach((image, index) => {
    if (image.base64.includes('data:image')) {
      console.error(`[童袜应用-服务层] ⚠️ 错误：图片 ${index + 1} 的 base64 包含 data URL 前缀，应该只包含纯 base64 数据`);
    }
    if (!image.mimeType) {
      console.error(`[童袜应用-服务层] ⚠️ 错误：图片 ${index + 1} 缺少 mimeType`);
    }
  });

  const imageParts = images.map((image, index) => {
    const part = {
      inlineData: {
        data: image.base64,
        mimeType: image.mimeType,
      },
    };
    console.log(`[童袜应用-服务层] 图片 ${index + 1} part 结构:`, {
      hasData: !!part.inlineData.data,
      dataLength: part.inlineData.data?.length || 0,
      mimeType: part.inlineData.mimeType,
    });
    return part;
  });

  const textPart = {
    text: prompt,
  };

  console.log('[童袜应用-服务层] 文本部分:', {
    promptLength: prompt.length,
    promptPreview: prompt.substring(0, 100) + '...',
  });

  const generate = async (attempt: number): Promise<string> => {
    console.log(`[童袜应用-服务层] 开始生成第 ${attempt} 张图片`);
    
    // INT32 范围：-2,147,483,648 到 2,147,483,647
    // Gemini API 的 seed 必须是 INT32 类型，需要确保在有效范围内
    const INT32_MAX = 2147483647;
    const INT32_MIN = -2147483648;
    const validSeed = Math.max(INT32_MIN, Math.min(INT32_MAX, seed));
    
    if (seed !== validSeed) {
      console.warn(`[童袜应用-服务层] seed 值 ${seed} 超出 INT32 范围，已调整为 ${validSeed}`);
    }
    
    // 注意：原代码没有 imageConfig，但其他应用都有。先尝试移除看看
    const config: any = {
      seed: validSeed,
      // 暂时移除 imageConfig，看看是否是问题所在
      // imageConfig: {
      //   aspectRatio: '1:1',
      // },
    };
    
    console.log(`[童袜应用-服务层] 使用 seed: ${validSeed} (原始值: ${seed})`);

    const requestPayload: GeminiGenerateRequest = {
      model: 'gemini-3.1-flash-image-preview',
      task: 'image_gen',
      contents: {
        parts: [...imageParts, textPart],
      },
      config: config,
    };

    console.log('[童袜应用-服务层] 请求配置:', {
      model: requestPayload.model,
      partsCount: requestPayload.contents.parts.length,
      imagePartsCount: imageParts.length,
      hasTextPart: true,
      config: JSON.stringify(config, null, 2),
      partsStructure: requestPayload.contents.parts.map((p: any, i: number) => ({
        index: i,
        type: p.inlineData ? 'image' : 'text',
        mimeType: p.inlineData?.mimeType,
        dataLength: p.inlineData?.data?.length || p.text?.length || 0,
      })),
    });

    try {
      const response = await generateContent(requestPayload);
      
      console.log(`[童袜应用-服务层] 第 ${attempt} 张图片 API 响应:`, {
        hasCandidates: !!response.candidates,
        candidatesCount: response.candidates?.length || 0,
      });

      const imageUrl = extractImageFromResponse(response);
      if (!imageUrl) {
        console.error(`[童袜应用-服务层] 第 ${attempt} 张图片：响应中没有图片数据`, {
          response: JSON.stringify(response, null, 2).substring(0, 500),
        });
        throw new Error('No image data found in the API response.');
      }

      console.log(`[童袜应用-服务层] 第 ${attempt} 张图片生成成功:`, {
        imageUrlLength: imageUrl.length,
        imageUrlPreview: imageUrl.substring(0, 50) + '...',
        isDataUrl: imageUrl.startsWith('data:'),
      });

      return imageUrl;
    } catch (error: any) {
      console.error(`[童袜应用-服务层] 第 ${attempt} 张图片生成失败:`, {
        error: error.message,
        errorStack: error.stack,
        errorDetails: error,
      });
      throw error;
    }
  };

  try {
    console.log('[童袜应用-服务层] 开始并行生成 2 张图片');
    const results = await Promise.all([generate(1), generate(2)]);
    console.log('[童袜应用-服务层] 所有图片生成完成:', {
      resultsCount: results.length,
      resultsLengths: results.map(r => r?.length || 0),
    });
    return results;
  } catch (error: any) {
    console.error('[童袜应用-服务层] Gemini API 调用失败:', {
      error: error.message,
      errorStack: error.stack,
      errorDetails: error,
    });
    throw new Error('Failed to generate images with Gemini API.');
  }
};
