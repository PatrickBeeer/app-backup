import { generateContent, extractImageFromResponse } from "../../../shared_services/geminiProxyService";

const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 1200;
const MAX_RETRY_DELAY_MS = 7000;
const MAX_REQUEST_IMAGE_BYTES = 1_500_000;
const MAX_REQUEST_IMAGE_EDGE = 1600;
const COMPRESSED_IMAGE_QUALITY = 0.84;

const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = (error) => reject(error);
  });
};

function decodeDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
  if (!match) {
    throw new Error('invalid image data url');
  }

  return {
    mimeType: match[1] || 'image/jpeg',
    data: match[2] || '',
  };
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image decode failed'));
    image.src = dataUrl;
  });
}

function estimateBase64Bytes(base64: string): number {
  const sanitized = base64.replace(/=+$/, '');
  return Math.floor((sanitized.length * 3) / 4);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isRetryableGenerationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return [
    '429',
    '500',
    '502',
    '503',
    '504',
    '524',
    'bad gateway',
    'timeout',
    'network',
    'all mapped keys failed',
    'temporarily',
    'fetch',
  ].some((needle) => message.includes(needle));
}

async function withRetry<T>(factory: () => Promise<T>, label: string): Promise<T> {
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
      const jitterMs = Math.floor(Math.random() * 300);
      console.warn(`[indoor-slipper-studio] ${label} retry ${attempt}/${MAX_RETRY_ATTEMPTS}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(exponentialMs + jitterMs);
    }
  }

  throw lastError;
}

async function prepareImageForRequest(file: File): Promise<{ data: string; mimeType: string }> {
  const dataUrl = await fileToDataUrl(file);
  const decoded = decodeDataUrl(dataUrl);
  const sourceMimeType = decoded.mimeType || file.type || 'image/jpeg';

  if (!decoded.data || estimateBase64Bytes(decoded.data) <= MAX_REQUEST_IMAGE_BYTES) {
    return {
      data: decoded.data,
      mimeType: sourceMimeType,
    };
  }

  try {
    const image = await loadImage(dataUrl);
    const maxEdge = Math.max(image.width, image.height);
    const scale = maxEdge > MAX_REQUEST_IMAGE_EDGE ? MAX_REQUEST_IMAGE_EDGE / maxEdge : 1;
    const targetWidth = Math.max(1, Math.round(image.width * scale));
    const targetHeight = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return {
        data: decoded.data,
        mimeType: sourceMimeType,
      };
    }

    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
    const compressedDataUrl = canvas.toDataURL('image/jpeg', COMPRESSED_IMAGE_QUALITY);
    const compressed = decodeDataUrl(compressedDataUrl);
    if (!compressed.data) {
      return {
        data: decoded.data,
        mimeType: sourceMimeType,
      };
    }

    return {
      data: compressed.data,
      mimeType: compressed.mimeType || 'image/jpeg',
    };
  } catch {
    return {
      data: decoded.data,
      mimeType: sourceMimeType,
    };
  }
}

export const generateModelImage = async (
  productImage: File,
  ethnicity: string,
  scene: string,
  imageType: string,
  aspectRatio: string,
  age: number,
  customPrompt: string,
): Promise<string[]> => {
  try {
    const preparedImage = await prepareImageForRequest(productImage);

    const basePrompt = `Create a photorealistic premium e-commerce image for indoor slippers suitable for Tmall/JD/Xiaohongshu.
- Keep the slippers exactly unchanged (shape, color, texture, logo, details).
- Scene: ${scene}
- Model: ${ethnicity}, around ${age} years old, relaxed and natural expression.
- Lighting: soft, warm, commercial studio quality.
- Visual quality: realistic camera photo, high-end lifestyle atmosphere.`;

    let compositionPrompt = '';
    if (imageType === 'on-foot') {
      compositionPrompt = `
  **COMPOSITION SPECIFICS:**
  - The photo should be a low-angle shot, focusing on the feet and shoes to create a compelling product lifestyle image.
  - Show from the ankles or calves down. Do not show the model's face.
  - The pose should be natural and relaxed (e.g., feet casually crossed, one foot slightly forward).`;
    } else { // 'full-body'
      compositionPrompt = `
      **COMPOSITION SPECIFICS:**
      - Capture a candid lifestyle moment. The model could be sitting comfortably on a sofa, curled up in an armchair by a window, or standing and stretching gracefully.
      - The model's face can be partially visible in a soft profile view, showing a gentle, relaxed smile, as if enjoying a quiet moment at home. The key is to create a natural, unposed feeling, not a direct portrait.
      - The outfit must be stylish and complementary loungewear (e.g., a chic knit set, elegant silk pajamas, minimalist linen dress) that enhances the shoes' appeal.
      - The shoes must be clearly visible and a key element of this cozy scene.`;
    }
    
    let finalPrompt = basePrompt + compositionPrompt;

    if (customPrompt.trim()) {
        finalPrompt += `\n\n**ADDITIONAL INSTRUCTIONS FROM USER:**\n- ${customPrompt.trim()}`;
    }

    const enhancedPrompt = `Output must strictly use aspect ratio ${aspectRatio}.\n\n${finalPrompt}`;

    // 生成两张图片，使用不同的 seed
    const seed1 = Math.floor(Math.random() * 1000000);
    const seed2 = seed1 + 1;

    const createRequest = (seedValue: number) => ({
      model: "gemini-3.1-flash-image-preview",
      task: "image_gen",
      tier: "lite" as const,
      retry_attempt: MAX_RETRY_ATTEMPTS,
      contents: {
        parts: [
          {
            inlineData: {
              data: preparedImage.data,
              mimeType: preparedImage.mimeType,
            },
          },
          { text: enhancedPrompt },
        ],
      },
      config: {
        seed: seedValue,
        imageConfig: {
          aspectRatio: aspectRatio,
        },
      },
    });

    const seeds = [seed1, seed2];
    const validUrls: string[] = [];

    for (let i = 0; i < seeds.length; i += 1) {
      const response = await withRetry(
        () => generateContent(createRequest(seeds[i])),
        `generate-image-${i + 1}`,
      );

      const imageUrl = extractImageFromResponse(response);
      if (!imageUrl) {
        throw new Error(`第 ${i + 1} 张图片未返回可用结果`);
      }

      validUrls.push(imageUrl);

      // Avoid bursting upstream with concurrent heavy image requests.
      if (i < seeds.length - 1) {
        await sleep(250);
      }
    }

    if (validUrls.length < 2) {
      throw new Error("未能成功生成两张图片，请重试。");
    }

    return validUrls;
  } catch (error: any) {
    console.error("Error generating image with Gemini:", error);
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("API key")) {
      throw new Error("API密钥无效或已过期。请检查您的API密钥设置。");
    }

    if (isRetryableGenerationError(error)) {
      throw new Error("图像服务暂时超时或繁忙（502/524），系统已自动重试。请稍后重试，或使用更小分辨率图片。");
    }

    throw new Error("生成图片失败。请稍后重试。");
  }
};

