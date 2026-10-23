import { useEffect, useState, type DragEvent } from 'react';
import { Upload, Image as ImageIcon, Loader2, RefreshCw, LayoutGrid, Download, Maximize2, X } from 'lucide-react';
import { AppProps } from '../../../types';

const APP_ID = 's_product-texture-replacement';
const IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const DEFAULT_LLM_EXECUTE_ENDPOINT = '/api_manager/api/v1/execute/llm-generate';
const MAX_INLINE_IMAGE_BYTES = 1200 * 1024;
const MIN_INLINE_IMAGE_BYTES = 260 * 1024;
const MAX_REQUEST_BODY_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2048;
const MIN_IMAGE_DIMENSION = 768;
const AUTH_TOKEN_KEYS = [
  'unityshop-main-frontend-token',
  'user_manager_token',
  'auth_token',
  'admin_token',
] as const;

interface AngleSpec {
  label: string;
  prompt: string;
}

interface InlineImagePart {
  inlineData: {
    data: string;
    mimeType?: string;
  };
}

interface TextPart {
  text: string;
}

type GenerationPart = InlineImagePart | TextPart;

const ANGLE_SPECS: AngleSpec[] = [
  {
    label: '正面',
    prompt:
      'Generate the FRONT view of the exact product shown in the image. Keep the same texture, shape, and lighting style. Single product only.',
  },
  {
    label: '背面',
    prompt:
      'Generate the BACK view of the exact product shown in the image. Keep the same texture, shape, and lighting style. Single product only.',
  },
  {
    label: '左侧',
    prompt:
      'Generate the LEFT SIDE view of the exact product shown in the image. Keep the same texture, shape, and lighting style. Single product only.',
  },
  {
    label: '右侧',
    prompt:
      'Generate the RIGHT SIDE view of the exact product shown in the image. Keep the same texture, shape, and lighting style. Single product only.',
  },
];

const TEXTURE_REPLACEMENT_PROMPT =
  'The first image is the original product. The second image is the new texture/pattern/packaging design. Please seamlessly apply the new texture/pattern from the second image onto the product in the first image. Keep the lighting, shadows, and background of the original product intact. Make it look highly realistic.';

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: {
          mimeType?: string;
          data?: string;
        };
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

const getAuthHeaders = (): Record<string, string> => {
  const token =
    AUTH_TOKEN_KEYS
      .map((key) => (localStorage.getItem(key) || '').trim())
      .find(Boolean) || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const stripBase64 = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stripBase64);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const output: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (key === 'data' && typeof val === 'string') {
      output[key] = '[base64 omitted]';
      continue;
    }
    output[key] = stripBase64(val);
  }
  return output;
};

const estimateBase64Bytes = (base64Data: string): number => {
  const padding = (base64Data.match(/=+$/)?.[0]?.length || 0);
  return Math.floor((base64Data.length * 3) / 4) - padding;
};

const isPayloadTooLargeMessage = (message: string): boolean => {
  const lower = message.toLowerCase();
  return lower.includes('413') || lower.includes('request entity too large') || lower.includes('payload too large');
};

const payloadTooLargeErrorMessage = (): string =>
  '图片请求体过大（HTTP 413）。系统已自动压缩并重试，请进一步降低原图分辨率或裁剪后重试。';

const loadImageFromDataUrl = (dataUrl: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片解析失败'));
    img.src = dataUrl;
  });

const compressInlineImageData = async (
  base64Data: string,
  mimeType: string,
  targetBytes = MAX_INLINE_IMAGE_BYTES,
): Promise<{ data: string; mimeType: string }> => {
  if (!base64Data || estimateBase64Bytes(base64Data) <= targetBytes) {
    return { data: base64Data, mimeType };
  }

  const dataUrl = `data:${mimeType || 'image/jpeg'};base64,${base64Data}`;
  const img = await loadImageFromDataUrl(dataUrl);
  const sourceBytes = estimateBase64Bytes(base64Data);
  const sizeRatio = Math.max(0.1, Math.min(1, Math.sqrt(targetBytes / Math.max(sourceBytes, 1))));
  const targetDimension = Math.round(
    Math.max(MIN_IMAGE_DIMENSION, Math.min(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION * sizeRatio)),
  );
  const scale = Math.min(1, targetDimension / Math.max(img.width, img.height));
  const targetW = Math.max(1, Math.round(img.width * scale));
  const targetH = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { data: base64Data, mimeType };
  }

  ctx.drawImage(img, 0, 0, targetW, targetH);
  const qualitySteps = [0.88, 0.76, 0.64, 0.52, 0.4, 0.32, 0.24];
  let bestData = base64Data;

  for (const quality of qualitySteps) {
    const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
    const compressedBase64 = compressedDataUrl.split(',')[1] || '';
    if (!compressedBase64) continue;
    bestData = compressedBase64;
    if (estimateBase64Bytes(compressedBase64) <= targetBytes) {
      return { data: compressedBase64, mimeType: 'image/jpeg' };
    }
  }

  return { data: bestData, mimeType: 'image/jpeg' };
};

const optimizePartsInlineImages = async (
  parts: GenerationPart[],
  targetInlineBytes = MAX_INLINE_IMAGE_BYTES,
): Promise<GenerationPart[]> => {
  const out: GenerationPart[] = [];
  for (const part of parts) {
    if (!('inlineData' in part) || !part.inlineData?.data || typeof part.inlineData.data !== 'string') {
      out.push(part);
      continue;
    }

    const optimized = await compressInlineImageData(
      part.inlineData.data,
      part.inlineData.mimeType || 'image/jpeg',
      targetInlineBytes,
    );
    out.push({
      inlineData: {
        ...part.inlineData,
        data: optimized.data,
        mimeType: optimized.mimeType,
      },
    });
  }
  return out;
};

const estimateUtf8Bytes = (value: string): number => new TextEncoder().encode(value).length;

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
};

const getLLMExecuteEndpoint = (): string => {
  if (typeof window === 'undefined') {
    return DEFAULT_LLM_EXECUTE_ENDPOINT;
  }

  const standalonePrefix = `/standalone/${APP_ID}`;
  const pathname = window.location.pathname || '';
  if (pathname === standalonePrefix || pathname.startsWith(`${standalonePrefix}/`)) {
    return `${standalonePrefix}/api/execute/llm-generate`;
  }

  return DEFAULT_LLM_EXECUTE_ENDPOINT;
};

const isInsufficientCreditsMessage = (message: string): boolean => {
  const lower = message.toLowerCase();
  return lower.includes('insufficient credits') || lower.includes('credit') && lower.includes('insufficient');
};

const generateViaProxy = async (parts: GenerationPart[], billingTask: string): Promise<string> => {
  const inlineBudgetAttempts = [
    MAX_INLINE_IMAGE_BYTES,
    Math.floor(MAX_INLINE_IMAGE_BYTES * 0.72),
    Math.floor(MAX_INLINE_IMAGE_BYTES * 0.55),
    MIN_INLINE_IMAGE_BYTES,
  ];

  let lastTooLargeError: Error | null = null;

  for (const attemptBudget of inlineBudgetAttempts) {
    let inlineBudget = attemptBudget;
    let optimizedParts = await optimizePartsInlineImages(parts, inlineBudget);
    let requestBody = {
      model: IMAGE_MODEL,
      billing_task: billingTask,
      contents: { parts: optimizedParts },
      config: {
        imageConfig: {
          aspectRatio: '1:1',
          imageSize: '2K',
        },
      },
    };
    let requestBodyJSON = JSON.stringify(requestBody);
    let requestBytes = estimateUtf8Bytes(requestBodyJSON);

    // Keep request body under a conservative threshold before sending.
    while (requestBytes > MAX_REQUEST_BODY_BYTES && inlineBudget > MIN_INLINE_IMAGE_BYTES) {
      const nextBudget = Math.max(MIN_INLINE_IMAGE_BYTES, Math.floor(inlineBudget * 0.78));
      if (nextBudget === inlineBudget) {
        break;
      }
      inlineBudget = nextBudget;
      optimizedParts = await optimizePartsInlineImages(parts, inlineBudget);
      requestBody = {
        model: IMAGE_MODEL,
        billing_task: billingTask,
        contents: { parts: optimizedParts },
        config: {
          imageConfig: {
            aspectRatio: '1:1',
            imageSize: '2K',
          },
        },
      };
      requestBodyJSON = JSON.stringify(requestBody);
      requestBytes = estimateUtf8Bytes(requestBodyJSON);
    }

    console.log(
      '[s_product-texture-replacement] Gemini request:',
      stripBase64({
        ...requestBody,
        _requestMeta: {
          inlineBudgetBytes: inlineBudget,
          requestBytes,
        },
      }),
    );

    const response = await fetch(getLLMExecuteEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: requestBodyJSON,
    });

    const raw = await response.text();
    let payload: any = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      if (response.status === 413 || isPayloadTooLargeMessage(raw)) {
        lastTooLargeError = new Error(payloadTooLargeErrorMessage());
        continue;
      }
      throw new Error(`生成响应不可解析 (HTTP ${response.status})`);
    }
    console.log('[s_product-texture-replacement] Gemini response:', stripBase64(payload));

    const data: GeminiResponse = payload?.data || payload;
    if (!response.ok || payload?.success === false || data?.error) {
      const errorMessage = String(data?.error?.message || payload?.message || `生成失败 (HTTP ${response.status})`);
      if (response.status === 413 || isPayloadTooLargeMessage(errorMessage)) {
        lastTooLargeError = new Error(payloadTooLargeErrorMessage());
        continue;
      }
      throw new Error(errorMessage);
    }

    const imagePart = (data?.candidates?.[0]?.content?.parts || []).find(part => part?.inlineData?.data);
    if (!imagePart?.inlineData?.data) {
      throw new Error('未收到图片结果，请重试');
    }

    return `data:${imagePart.inlineData.mimeType || 'image/png'};base64,${imagePart.inlineData.data}`;
  }

  throw lastTooLargeError || new Error(payloadTooLargeErrorMessage());
};

export default function App({ platform, costs }: AppProps) {
  const textureCost = costs.GENERATE_TEXTURE_REPLACEMENT ?? 10;
  const angleCost = costs.GENERATE_MULTI_ANGLE_VIEWS ?? 10;

  const [productImage, setProductImage] = useState<File | null>(null);
  const [textureImage, setTextureImage] = useState<File | null>(null);
  const [productPreview, setProductPreview] = useState<string | null>(null);
  const [texturePreview, setTexturePreview] = useState<string | null>(null);
  
  const [isGeneratingTexture, setIsGeneratingTexture] = useState(false);
  const [generatedTextureImage, setGeneratedTextureImage] = useState<string | null>(null);
  
  const [isGeneratingAngles, setIsGeneratingAngles] = useState(false);
  const [generatedAngleImages, setGeneratedAngleImages] = useState<Record<string, string>>({});
  const [activeAngleLabel, setActiveAngleLabel] = useState<string | null>(null);
  
  const [error, setError] = useState<string | null>(null);
  const [previewModalImage, setPreviewModalImage] = useState<string | null>(null);

  const handleDownload = (dataUrl: string, filename: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    void platform.refreshCredits();
  }, [platform]);

  const [isDraggingProduct, setIsDraggingProduct] = useState(false);
  const [isDraggingTexture, setIsDraggingTexture] = useState(false);

  const processFile = (file: File | undefined | null, type: 'product' | 'texture') => {
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      if (type === 'product') {
        setProductImage(file);
        setProductPreview(reader.result as string);
        setGeneratedTextureImage(null);
        setGeneratedAngleImages({});
      } else {
        setTextureImage(file);
        setTexturePreview(reader.result as string);
        setGeneratedTextureImage(null);
        setGeneratedAngleImages({});
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: DragEvent, type: 'product' | 'texture') => {
    e.preventDefault();
    if (type === 'product') setIsDraggingProduct(true);
    else setIsDraggingTexture(true);
  };

  const handleDragLeave = (e: DragEvent, type: 'product' | 'texture') => {
    e.preventDefault();
    if (type === 'product') setIsDraggingProduct(false);
    else setIsDraggingTexture(false);
  };

  const handleDrop = (e: DragEvent, type: 'product' | 'texture') => {
    e.preventDefault();
    if (type === 'product') setIsDraggingProduct(false);
    else setIsDraggingTexture(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      processFile(file, type);
    }
  };

  const handleReplaceTexture = async () => {
    if (!productImage || !textureImage) return;

    if (!platform.checkBalance(textureCost)) {
      platform.showRecharge();
      return;
    }

    setIsGeneratingTexture(true);
    setError(null);
    try {
      const productBase64 = productPreview?.split(',')[1] || '';
      const textureBase64 = texturePreview?.split(',')[1] || '';
      const imageUrl = await generateViaProxy([
        {
          inlineData: {
            data: productBase64,
            mimeType: productImage.type,
          },
        },
        {
          inlineData: {
            data: textureBase64,
            mimeType: textureImage.type,
          },
        },
        {
          text: TEXTURE_REPLACEMENT_PROMPT,
        },
      ], 'generate_texture_replacement');

      if (imageUrl) {
        setGeneratedTextureImage(imageUrl);
        setGeneratedAngleImages({});
        await platform.refreshCredits();
      } else {
        setError('未能生成图像，请重试。');
      }
    } catch (err: unknown) {
      console.error(err);
      const message = getErrorMessage(err, '生成过程中发生错误');
      if (isInsufficientCreditsMessage(message)) {
        platform.showRecharge();
      }
      setError(message);
    } finally {
      setIsGeneratingTexture(false);
    }
  };

  const handleGenerateAngles = async () => {
    if (!generatedTextureImage) return;

    const maxAngleCount = ANGLE_SPECS.length;
    const requiredBudget = angleCost * maxAngleCount;
    if (!platform.checkBalance(requiredBudget)) {
      platform.showRecharge();
      return;
    }

    setIsGeneratingAngles(true);
    setError(null);
    setGeneratedAngleImages({});
    setActiveAngleLabel(null);
    try {
      const base64Data = generatedTextureImage.split(',')[1] || '';
      const mimeType = generatedTextureImage.split(';')[0].split(':')[1] || 'image/jpeg';
      const optimizedSeed = await compressInlineImageData(base64Data, mimeType, Math.floor(MAX_INLINE_IMAGE_BYTES * 0.72));

      let successCount = 0;
      let payloadTooLargeFailures = 0;
      for (const spec of ANGLE_SPECS) {
        setActiveAngleLabel(spec.label);
        try {
          const imageUrl = await generateViaProxy([
            {
              inlineData: {
                data: optimizedSeed.data,
                mimeType: optimizedSeed.mimeType,
              },
            },
            {
              text: `${spec.prompt} High quality commercial product photography.`,
            },
          ], 'generate_multi_angle_views');

          if (imageUrl) {
            successCount++;
            setGeneratedAngleImages((prev) => ({
              ...prev,
              [spec.label]: imageUrl,
            }));
          }
        } catch (singleErr: unknown) {
          const message = getErrorMessage(singleErr, String(singleErr));
          if (isPayloadTooLargeMessage(message)) {
            payloadTooLargeFailures++;
          }
          if (isInsufficientCreditsMessage(message)) {
            throw new Error(message);
          }
          console.error(`生成${spec.label}视图失败:`, singleErr);
        }
      }

      if (successCount === 0) {
        if (payloadTooLargeFailures === ANGLE_SPECS.length) {
          throw new Error(payloadTooLargeErrorMessage());
        }
        throw new Error('未能生成多角度视图，请重试。');
      }

      await platform.refreshCredits();
    } catch (err: unknown) {
      console.error(err);
      const message = getErrorMessage(err, '生成多角度视图时发生错误');
      if (isInsufficientCreditsMessage(message)) {
        platform.showRecharge();
      }
      setError(message);
    } finally {
      setIsGeneratingAngles(false);
      setActiveAngleLabel(null);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans">
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">AI 包装与纹理替换</h1>
          </div>
          <button
            onClick={platform.onBack}
            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-3 py-1 rounded-full transition-colors"
          >
            返回
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Inputs */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200">
              <h2 className="text-lg font-medium mb-4 flex items-center">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold mr-2">1</span>
                上传原产品图
              </h2>
              <label 
                className={`block w-full aspect-square rounded-xl border-2 border-dashed transition-colors cursor-pointer relative overflow-hidden group ${isDraggingProduct ? 'border-blue-500 bg-blue-50' : 'border-neutral-300 hover:border-blue-500 hover:bg-blue-50'}`}
                onDragOver={(e) => handleDragOver(e, 'product')}
                onDragLeave={(e) => handleDragLeave(e, 'product')}
                onDrop={(e) => handleDrop(e, 'product')}
              >
                <input type="file" className="hidden" accept="image/*" onChange={(e) => processFile(e.target.files?.[0], 'product')} />
                {productPreview ? (
                  <img src={productPreview} alt="Product" className="w-full h-full object-contain p-2" />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 group-hover:text-blue-600">
                    <Upload className="w-8 h-8 mb-2" />
                    <span className="text-sm font-medium">点击或拖拽上传</span>
                  </div>
                )}
              </label>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200">
              <h2 className="text-lg font-medium mb-4 flex items-center">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold mr-2">2</span>
                上传新纹理/包装
              </h2>
              <label 
                className={`block w-full aspect-square rounded-xl border-2 border-dashed transition-colors cursor-pointer relative overflow-hidden group ${isDraggingTexture ? 'border-blue-500 bg-blue-50' : 'border-neutral-300 hover:border-blue-500 hover:bg-blue-50'}`}
                onDragOver={(e) => handleDragOver(e, 'texture')}
                onDragLeave={(e) => handleDragLeave(e, 'texture')}
                onDrop={(e) => handleDrop(e, 'texture')}
              >
                <input type="file" className="hidden" accept="image/*" onChange={(e) => processFile(e.target.files?.[0], 'texture')} />
                {texturePreview ? (
                  <img src={texturePreview} alt="Texture" className="w-full h-full object-contain p-2" />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 group-hover:text-blue-600">
                    <ImageIcon className="w-8 h-8 mb-2" />
                    <span className="text-sm font-medium">点击或拖拽上传</span>
                  </div>
                )}
              </label>
            </div>

            <button
              onClick={handleReplaceTexture}
              disabled={!productImage || !textureImage || isGeneratingTexture}
              className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white rounded-xl font-medium text-lg transition-colors flex items-center justify-center shadow-sm"
            >
              {isGeneratingTexture ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  正在替换纹理...
                </>
              ) : (
                <>
                  <RefreshCw className="w-5 h-5 mr-2" />
                  生成替换结果 ({textureCost}积分)
                </>
              )}
            </button>
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 min-h-[400px] flex flex-col">
              <h2 className="text-lg font-medium mb-4 flex items-center">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold mr-2">3</span>
                替换结果
              </h2>
              
              <div className="flex-1 bg-neutral-100 rounded-xl flex items-center justify-center overflow-hidden relative border border-neutral-200 group">
                {generatedTextureImage ? (
                  <>
                    <img src={generatedTextureImage} alt="Replaced Texture" className="w-full h-full object-contain" />
                    <div className="absolute top-3 right-3 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setPreviewModalImage(generatedTextureImage)} className="p-2 bg-white/90 hover:bg-white text-neutral-700 rounded-lg shadow-sm backdrop-blur-sm transition-colors" title="放大预览">
                        <Maximize2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDownload(generatedTextureImage, 'replaced-texture.png')} className="p-2 bg-white/90 hover:bg-white text-neutral-700 rounded-lg shadow-sm backdrop-blur-sm transition-colors" title="下载图片">
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-neutral-400 flex flex-col items-center">
                    <ImageIcon className="w-12 h-12 mb-3 opacity-50" />
                    <p>等待生成结果...</p>
                  </div>
                )}
              </div>

              {generatedTextureImage && (
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={handleGenerateAngles}
                    disabled={isGeneratingAngles}
                    className="py-3 px-6 bg-neutral-900 hover:bg-black disabled:bg-neutral-400 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors flex items-center shadow-sm"
                  >
                    {isGeneratingAngles ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        正在生成多角度...
                      </>
                    ) : (
                      <>
                        <LayoutGrid className="w-5 h-5 mr-2" />
                        生成多角度视图 ({angleCost}积分/张)
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Multi-angle Results */}
            {(Object.keys(generatedAngleImages).length > 0 || isGeneratingAngles) && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 min-h-[400px] flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className="text-lg font-medium mb-4 flex items-center">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold mr-2">4</span>
                  多角度视图
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {ANGLE_SPECS.map((spec) => {
                    const imageSrc = generatedAngleImages[spec.label];
                    return (
                      <div key={spec.label} className="bg-neutral-100 rounded-xl border border-neutral-200 overflow-hidden min-h-[220px] relative group">
                        <div className="px-3 py-2 text-xs font-semibold text-neutral-600 border-b border-neutral-200 bg-white/70">
                          {spec.label}视图
                        </div>
                        {imageSrc ? (
                          <>
                            <img src={imageSrc} alt={`${spec.label}视图`} className="w-full h-[240px] object-contain" />
                            <div className="absolute top-11 right-3 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => setPreviewModalImage(imageSrc)} className="p-2 bg-white/90 hover:bg-white text-neutral-700 rounded-lg shadow-sm backdrop-blur-sm transition-colors" title="放大预览">
                                <Maximize2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDownload(imageSrc, `multi-angle-${spec.label}.png`)} className="p-2 bg-white/90 hover:bg-white text-neutral-700 rounded-lg shadow-sm backdrop-blur-sm transition-colors" title="下载图片">
                                <Download className="w-4 h-4" />
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="h-[240px] flex flex-col items-center justify-center text-neutral-400">
                            {isGeneratingAngles && activeAngleLabel === spec.label ? (
                              <>
                                <Loader2 className="w-8 h-8 mb-2 animate-spin text-blue-500" />
                                <p className="text-xs">正在生成{spec.label}视图...</p>
                              </>
                            ) : (
                              <p className="text-xs">等待生成...</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Fullscreen Preview Modal */}
      {previewModalImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewModalImage(null)}
        >
          <button 
            className="absolute top-6 right-6 p-2 text-white/70 hover:text-white bg-black/50 hover:bg-black/70 rounded-full transition-colors"
            onClick={() => setPreviewModalImage(null)}
          >
            <X className="w-6 h-6" />
          </button>
          <img 
            src={previewModalImage} 
            alt="Preview Fullscreen" 
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" 
            onClick={(e) => e.stopPropagation()} 
          />
          <button 
            className="absolute bottom-8 right-8 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium shadow-lg flex items-center transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              handleDownload(previewModalImage, 'download.png');
            }}
          >
            <Download className="w-5 h-5 mr-2" />
            下载大图
          </button>
        </div>
      )}
    </div>
  );
}
